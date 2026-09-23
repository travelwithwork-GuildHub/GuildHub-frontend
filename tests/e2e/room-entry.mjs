// `FE-N08` 的瀏覽器驗收：真的走到門前按 E 開密碼視窗、真的送出、真的被拒／進房、真的重新輸入密碼。
// 規格 `openspec/changes/fe-n08-room-entry-gate/`；只驗 jsdom 驗不了的那幾句（`tasks.md` 6.1）：
//   S01 真的按 E 開視窗、Canvas 同一節點；S02 Esc 後 activeElement；S03 焦點在送出鈕上按 W／E 世界不動、關閉後會動；
//   S05 密碼不落地（網址軌跡＋storage；同一扇門再開是空的）；S06／S07 帶票的連線、網址沒票、回大廳再按 E 不問；
//   S08 403 留著；S09 一種 404；S10 401 與網路失敗；S11 被拒→同票再試→重新輸入；S13 後半 換身分；S14 setItem 拋；S15 第一段 延遲回應＋Esc＋重開。
//
// ⚠️ **即時層與 REST 都是這支腳本攔截並偽造的**（`routeWebSocket`／`page.route`），**不連任何團隊共用的位址**。
// `/enter` 的回應由每一段自己決定（`enter.current`）；每一次呼叫都記下來（「啟動之前沒有 /enter」要數）。
//
// 用法：pnpm run build && NEXT_PUBLIC_APP_ENV=local node node_modules/next/dist/bin/next start -p 3100，然後 node tests/e2e/room-entry.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT（截圖目錄）。**打 `next start`**（dev 的 HMR 會讓過場假紅，`FE-V01` 記著）。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, countOverlays, expectUrl, failureCount, fakeRealtime, fakeRest, guardLoopback, hold, ok, overlaysSeen, profile, promptText, traceUrls, uuid, waitForTransition, waitForWorld, walker, watchCanvas } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-n08'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const P = profile(31, '人才丙')
const Q = profile(32, '人才丁')
const ROOM = uuid(1)
const ROOM_TITLE = '星際導航'
const DECOY = uuid(2)
const DECOY_TITLE = '深海探勘'
const ROOMS = [
  { project_id: ROOM, title: ROOM_TITLE, online_count: 3 },
  { project_id: DECOY, title: DECOY_TITLE, online_count: 1 },
]
const TOKEN = 'e2e-ticket-N08-must-never-appear-in-url'
/** 兩個一眼認得出來的密碼：W 會被拒、C 會成功。S05 要的是它們從不出現在網址與 storage 裡。 */
const WRONG = 'wrong-pw-QX9v-never-persisted'
const CORRECT = 'right-pw-ZM4k-never-persisted'
const tokenKey = (profileId) => `guildhub.roomToken.${profileId}.${ROOM}`
const { approachDoor } = walker({ room: ROOM, decoy: DECOY, title: ROOM_TITLE, out: OUT })

const DIALOG = '[data-testid="room-password-dialog"]'
const dialog = (page) => page.$(DIALOG)
const dialogName = (page) =>
  page.$eval(DIALOG, (d) => (d.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ')).catch(() => null)
const fieldValue = (page) => page.$eval(`${DIALOG} input[name="password"]`, (i) => i.value).catch(() => null)
const submitError = (page) => page.$eval(`${DIALOG} [data-testid="submit-error"]`, (n) => n.textContent ?? '').catch(() => null)
const submitDisabled = (page) => page.$eval(`${DIALOG} button[type="submit"]`, (b) => b.disabled).catch(() => null)
const activeDescriptor = (page) => page.evaluate(() => {
  const a = document.activeElement
  if (a === null) return 'null'
  return `${a.tagName.toLowerCase()}${a.getAttribute('name') ? `[name=${a.getAttribute('name')}]` : ''}${a.getAttribute('type') ? `[type=${a.getAttribute('type')}]` : ''}${a.hasAttribute('data-focus-anchor') ? '[anchor]' : ''}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''}`
})
/** 我們的通知（不是 Next.js 的 `__next-route-announcer__`）。 */
const NOTICE = '[role="alert"]:not(#__next-route-announcer__):not(#__next-route-announcer__ *):not([data-testid="submit-error"])'
const waitDialog = (page, state) => page.waitForSelector(DIALOG, { state, timeout: 5_000 }).then(() => true).catch(() => false)
const waitSubmitError = (page) => page.waitForSelector(`${DIALOG} [data-testid="submit-error"]`, { timeout: 5_000 }).then(() => true).catch(() => false)
const storageDump = (page) => page.evaluate(() => JSON.stringify({ s: { ...sessionStorage }, l: { ...localStorage } }))
/**
 * storage 的**完整寫入軌跡**（不是快照）：快照看不到「403 之後先寫進去、成功時再刪掉」。每個 document 一開始就把 `setItem`／`removeItem` 包起來，
 * 每一次寫入的 key＋value 都記下來；判準是整條軌跡裡都沒有密碼。
 */
function traceStorage(context) {
  return context.addInitScript(() => {
    window.__guildhubStorageWrites = []
    for (const method of ['setItem', 'removeItem']) {
      const original = Storage.prototype[method]
      Storage.prototype[method] = function (key, value) {
        window.__guildhubStorageWrites.push(`${this === sessionStorage ? 'session' : 'local'}.${method}(${String(key)}=${value === undefined ? '' : String(value)})`)
        return original.apply(this, arguments)
      }
    }
  })
}
const storageWrites = (page) => page.evaluate(() => window.__guildhubStorageWrites ?? [])
/** 從 R 的門前往南走到 DECOY 的門前（相隔一格）。 */
async function walkToDecoy(page) {
  for (let i = 0; i < 30; i++) {
    const prompt = await promptText(page)
    if (prompt !== null && prompt.includes(DECOY_TITLE)) return
    await hold(page, 'KeyS', 120)
  }
  throw new Error('往南走了 30 步還沒到第二扇門前')
}
const heldToken = (page, key) => page.evaluate((k) => sessionStorage.getItem(k), key)

/** `/enter` 的偽造：`enter.current(route, body)` 決定每一次的回應；每一次都記進 `enter.calls`。 */
function fakeEnter(page) {
  const enter = { calls: [], current: (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'no handler' }) }
  page.route(/\/api\/projects\/[^/]+\/enter$/, (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    enter.calls.push(body)
    return enter.current(route, body)
  })
  return enter
}
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const typePassword = async (page, value) => {
  await page.fill(`${DIALOG} input[name="password"]`, value)
}
const clickSubmit = (page) => page.click(`${DIALOG} button[type="submit"]`)
/** 站在門前按 E。提示上要有這扇門的名字（不然按了也不是這扇門）。 */
async function pressE(page) {
  const prompt = await promptText(page)
  if (prompt === null || !prompt.includes(ROOM_TITLE)) throw new Error(`不在門前（提示是「${prompt}」）`)
  await page.keyboard.press('KeyE')
}
/** 往南／往北一小步一小步走回門前，直到提示回來。 */
async function backToDoor(page) {
  for (let i = 0; i < 20; i++) {
    const prompt = await promptText(page)
    if (prompt !== null && prompt.includes(ROOM_TITLE)) return
    await hold(page, 'KeyS', 120)
  }
  throw new Error('走了 20 步回不到門前')
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  // ── A：P 沒有票。S01／S02／S03／S08／S09／S10／S15／S05／S06／S07／S13 後半 ──
  {
    const sockets = []
    const urls = []
    const me = { current: P }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    await traceUrls(context, urls)
    await traceStorage(context)
    await countOverlays(context)
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, me, ROOMS)
    const enter = fakeEnter(page)

    const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
    if (response === null) throw new Error(`連不到 ${FRONTEND} —— server 起了嗎？（next start）`)
    await waitForWorld(page)
    const canvas = await page.$('canvas')
    if (canvas === null) throw new Error('沒有 canvas —— 世界沒畫出來')
    const sameCanvas = await watchCanvas(page, canvas)
    const { prompt, where } = await approachDoor(page)
    ok(`走到門前，提示是「${prompt}」`)

    // S01
    await pressE(page)
    if (await waitDialog(page, 'visible')) ok('[S01] 對著門按 E：出現密碼視窗')
    else bad('[S01] 按 E 沒有出現密碼視窗')
    const name = await dialogName(page)
    if (name !== null && name.includes(ROOM_TITLE)) ok(`[S01] 視窗的可及名稱含房名：「${name.trim()}」`)
    else bad('[S01] 視窗的可及名稱沒有房名', String(name))
    const inCanvas = await page.evaluate((sel) => document.querySelector('canvas')?.contains(document.querySelector(sel)) ?? true, DIALOG)
    if (!inCanvas && (await page.$(`${DIALOG} input[type="password"]`)) !== null) ok('[S01] 密碼欄是 DOM 的、不在 Canvas 裡')
    else bad('[S01] 密碼欄不對', `inCanvas=${inCanvas}`)
    if (enter.calls.length === 0 && sockets.length === 1) ok('[S01] 開視窗沒有請求、沒有新 socket')
    else bad('[S01] 開視窗就有請求或 socket', `enter=${enter.calls.length} sockets=${JSON.stringify(sockets)}`)
    const modal = await page.$eval(DIALOG, (d) => d.getAttribute('aria-modal'))
    if (modal === 'true') ok('[S01] aria-modal="true"')
    else bad('[S01] 沒有 aria-modal', String(modal))
    await expectUrl(page, '[S01] 開視窗網址不變', '/world')
    const gateText = await page.$('[role="status"][aria-label*="還沒開放"]')
    if (gateText === null) ok('[S01] 預設那句「還沒開放」的說明沒有出現（正式門禁接上了）')
    else bad('[S01] 預設說明還在', (await gateText.textContent()) ?? '')
    await sameCanvas('S01', '開視窗之後')
    await page.screenshot({ path: path.join(OUT, 'dialog-open.png') })

    // S02
    await typePassword(page, 'abc')
    const beforeEsc = { url: await page.evaluate(() => location.href), sockets: sockets.length, enter: enter.calls.length, overlays: await overlaysSeen(page) }
    await page.keyboard.press('Escape')
    if (await waitDialog(page, 'detached')) ok('[S02] Esc 關閉視窗')
    else bad('[S02] Esc 沒有關閉視窗')
    await page.waitForTimeout(300)
    const afterEsc = { url: await page.evaluate(() => location.href), sockets: sockets.length, enter: enter.calls.length, overlays: await overlaysSeen(page) }
    if (JSON.stringify(beforeEsc) === JSON.stringify(afterEsc)) ok('[S02] 同一次 Esc 沒有觸發門、沒有導覽、沒有請求、沒有過場')
    else bad('[S02] Esc 有副作用', `${JSON.stringify(beforeEsc)} → ${JSON.stringify(afterEsc)}`)
    let active = await activeDescriptor(page)
    if (active.includes('[anchor]')) ok(`[S02] 關閉後焦點在世界焦點錨（${active}）`)
    else bad('[S02] 關閉後焦點不在世界焦點錨', active)
    await pressE(page)
    await waitDialog(page, 'visible')
    if ((await fieldValue(page)) === '') ok('[S02] 再按 E：欄位是空的')
    else bad('[S02] 再按 E 欄位不是空的', String(await fieldValue(page)))
    active = await activeDescriptor(page)
    if (active.includes('[name=password]')) ok('[S02] 焦點在密碼欄')
    else bad('[S02] 焦點不在密碼欄', active)

    // S03：焦點移到送出鈕，按 W／E 世界不動；Tab 循環；關閉後 W 會動
    await page.keyboard.press('Tab')
    active = await activeDescriptor(page)
    if (active.includes('[type=submit]')) ok('[S03] Tab 到送出鈕')
    else bad('[S03] Tab 沒有到送出鈕', active)
    const before = await where()
    await hold(page, 'KeyW', 300)
    await page.keyboard.press('KeyE')
    const after = await where()
    const moved = Math.hypot(after.dx - before.dx, after.dz - before.dz)
    if (moved < 0.15 && (await page.$$(DIALOG)).length === 1 && enter.calls.length === 0) ok(`[S03] 焦點在送出鈕上按 W／E：世界不動（位移 ${moved.toFixed(2)}）、視窗還是一個、沒有請求`)
    else bad('[S03] 焦點在送出鈕上按 W／E 世界動了', `位移 ${moved.toFixed(2)}，視窗 ${(await page.$$(DIALOG)).length}，請求 ${enter.calls.length}`)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    active = await activeDescriptor(page)
    if (active.includes('[name=password]')) ok('[S03] Tab 從最後一個控制回到密碼欄（不出視窗）')
    else bad('[S03] Tab 出了視窗', active)
    await page.keyboard.press('Escape')
    await waitDialog(page, 'detached')
    await hold(page, 'KeyW', 300)
    const released = await where()
    const movedAfter = Math.hypot(released.dx - after.dx, released.dz - after.dz)
    if (movedAfter > 0.3) ok(`[S03] 關閉後按 W 會動（位移 ${movedAfter.toFixed(2)}）`)
    else bad('[S03] 關閉後按 W 不會動', `位移 ${movedAfter.toFixed(2)}`)
    await backToDoor(page)

    // S08：403
    await pressE(page)
    await waitDialog(page, 'visible')
    enter.current = (route) => json(route, 403, { detail: '房間密碼錯誤' })
    await typePassword(page, WRONG)
    await clickSubmit(page)
    if (await waitSubmitError(page)) ok('[S08] 403：出現 alert')
    else bad('[S08] 403 沒有 alert')
    let text = (await submitError(page)) ?? ''
    if (text.includes('密碼') && !text.includes('房間密碼錯誤')) ok(`[S08] alert 說的是密碼、不回顯後端字串：「${text}」`)
    else bad('[S08] alert 內容不對', text)
    if ((await fieldValue(page)) === WRONG && (await dialog(page)) !== null) ok('[S08] 視窗留著、欄位保留')
    else bad('[S08] 視窗或欄位不對', String(await fieldValue(page)))
    active = await activeDescriptor(page)
    if (active.includes('[role=alert]')) ok('[S08] 焦點在 alert 上')
    else bad('[S08] 焦點不在 alert 上', active)
    if (sockets.length === 1 && (await heldToken(page, tokenKey(P.id))) === null) ok('[S08] 沒有新 socket、沒有存票')
    else bad('[S08] 403 之後有 socket 或票', JSON.stringify(sockets))
    const writesAfter403 = (await storageWrites(page)).filter((w) => w.includes(WRONG))
    if (writesAfter403.length === 0) ok('[S05] 403 之後 storage 的寫入軌跡沒有那個密碼')
    else bad('[S05] 403 之後密碼被寫進 storage', writesAfter403.join('\n   '))
    // 改一個字再送出：是人發起的第二個請求，帶改過的密碼
    const callsBeforeEdit = enter.calls.length
    await typePassword(page, `${WRONG}2`)
    await clickSubmit(page)
    await page.waitForTimeout(400)
    if (enter.calls.length === callsBeforeEdit + 1 && enter.calls.at(-1)?.password === `${WRONG}2`) ok('[S08] 改一個字再送出：第二個請求、帶改過的密碼')
    else bad('[S08] 改一個字再送出不對', `calls=${enter.calls.length - callsBeforeEdit} last=${JSON.stringify(enter.calls.at(-1))}`)
    await page.waitForSelector(`${DIALOG} [data-testid="submit-error"]`, { timeout: 5_000 }).catch(() => {})
    text = (await submitError(page)) ?? ''

    // S09：一種 404
    enter.current = (route) => json(route, 404, { detail: '專案不存在' })
    await clickSubmit(page)
    await page.waitForFunction((sel, prev) => (document.querySelector(sel)?.textContent ?? '') !== prev, `${DIALOG} [data-testid="submit-error"]`, text).catch(() => {})
    text = (await submitError(page)) ?? ''
    const banned = ['不存在', '關閉', '成軍', '密碼', '專案不存在'].filter((w) => text.includes(w))
    if (text !== '' && banned.length === 0) ok(`[S09] 404：alert 不猜原因、不回顯 detail：「${text}」`)
    else bad('[S09] 404 的 alert 內容不對', `含 ${JSON.stringify(banned)}：「${text}」`)

    // S10：401、網路失敗
    enter.current = (route) => json(route, 401, { detail: '未登入' })
    await clickSubmit(page)
    await page.waitForFunction((sel, prev) => (document.querySelector(sel)?.textContent ?? '') !== prev, `${DIALOG} [data-testid="submit-error"]`, text).catch(() => {})
    text = (await submitError(page)) ?? ''
    if (text.includes('登入') && !text.includes('密碼') && !text.includes('未登入')) ok(`[S10] 401：語彙表那句、不說密碼：「${text}」`)
    else bad('[S10] 401 的 alert 內容不對', text)
    enter.current = (route) => route.abort('failed')
    await clickSubmit(page)
    await page.waitForFunction((sel, prev) => (document.querySelector(sel)?.textContent ?? '') !== prev, `${DIALOG} [data-testid="submit-error"]`, text).catch(() => {})
    text = (await submitError(page)) ?? ''
    if (text !== '' && !text.includes('密碼') && (await submitDisabled(page)) === false && (await fieldValue(page)) === `${WRONG}2`) ok(`[S10] 網路失敗：alert、送出鈕恢復可按、欄位保留：「${text}」`)
    else bad('[S10] 網路失敗之後的狀態不對', `alert=「${text}」 disabled=${await submitDisabled(page)} value=${await fieldValue(page)}`)

    // S15 第一段：延遲回應、Esc、重開同一扇門、晚到的 200 不採用
    let release = null
    enter.current = (route) => new Promise((resolve) => (release = () => resolve(json(route, 200, { room_token: 'stale-ticket-from-a-closed-round' }))))
    await clickSubmit(page)
    await page.waitForFunction(() => document.querySelector('[data-testid="room-password-dialog"] button[type="submit"]')?.disabled === true).catch(() => {})
    await page.keyboard.press('Escape')
    if (await waitDialog(page, 'detached')) ok('[S15] 送出中按 Esc 關得掉')
    else bad('[S15] 送出中按 Esc 關不掉')
    await pressE(page)
    await waitDialog(page, 'visible')
    if (release === null) throw new Error('S15：/enter 沒有被攔到')
    // 等的是「回應已經到頁面」這個可觀察的事（fulfill 的 route 也會發 response 事件），不是固定毫秒（runner 慢就假綠）；
    // 到達後的處理在同一個 task 的 microtask 裡跑完，下一個 Playwright 往返一定在它之後 —— 100 ms 只是保險。
    const staleArrived = page.waitForResponse((r) => /\/api\/projects\/[^/]+\/enter$/.test(r.url()), { timeout: 5_000 })
    release()
    await (await staleArrived).finished() // body 也送完了；接下來只剩頁面裡 json() 與 microtask
    // 「沒有被採用」是一個不會發生的事，量法是：body 送完之後連續一段時間每個時點都沒有發生（不是等一個固定毫秒再看一次）。
    let adopted = null
    for (let i = 0; i < 8 && adopted === null; i++) {
      await page.waitForTimeout(100)
      const state = { dialog: (await dialog(page)) !== null, value: await fieldValue(page), sockets: sockets.length, token: await heldToken(page, tokenKey(P.id)), alert: await submitError(page) }
      if (!(state.dialog && state.value === '' && state.sockets === 1 && state.token === null && state.alert === null)) adopted = state
    }
    if (adopted === null) ok('[S15] 晚到的 200（body 送完後 800 ms 內每 100 ms 看一次）：沒有存票、沒有房間連線、重開的視窗還開著且空白、沒有 alert')
    else bad('[S15] 晚到的 200 被採用了', JSON.stringify(adopted))

    // S06／S05：正確密碼 → 存票、過場、房間連線帶票；網址與 storage 都沒有密碼與票
    enter.current = (route, body) => (body.password === CORRECT ? json(route, 200, { room_token: TOKEN }) : json(route, 403, { detail: '房間密碼錯誤' }))
    let since = await overlaysSeen(page)
    await typePassword(page, CORRECT)
    await clickSubmit(page)
    if (await waitDialog(page, 'detached')) ok('[S06] 密碼對了：視窗關閉')
    else bad('[S06] 密碼對了視窗沒關')
    await waitForTransition(page, '進房間', since, 'S06')
    await expectUrl(page, '[S06] 進房間', `/world?room=${ROOM}`)
    if ((await heldToken(page, tokenKey(P.id))) === TOKEN) ok('[S06] sessionStorage 裡 P＋R 的票是 T')
    else bad('[S06] 票沒存對', String(await heldToken(page, tokenKey(P.id))))
    const roomSocket = sockets[1]
    if (sockets.length === 2 && roomSocket?.scene === `room:${ROOM}` && roomSocket.token === TOKEN) ok('[S06] 房間連線帶 scene=room:<id> 與票')
    else bad('[S06] 房間連線不對', JSON.stringify(sockets))
    await sameCanvas('S06', '進房間之後')
    const dump = await storageDump(page)
    const leaks = urls.filter((u) => u.includes(TOKEN) || u.includes(WRONG) || u.includes(CORRECT))
    if (leaks.length === 0 && !dump.includes(WRONG) && !dump.includes(CORRECT)) ok(`[S05] 到此 ${urls.length} 次網址寫入都沒有票與密碼；storage 沒有密碼`)
    else bad('[S05] 密碼或票落地了', `${leaks.join('\n   ')}\n   storage=${dump}`)
    await page.screenshot({ path: path.join(OUT, 'entered.png') })

    // S07：回大廳再按 E → 直接進、不問、沒有 /enter
    since = await overlaysSeen(page)
    const callsBefore = enter.calls.length
    await page.click('button[aria-label="回到 Guild Hall"]')
    await waitForTransition(page, '回到 Guild Hall', since, 'S07')
    await expectUrl(page, '[S07] 回到 Guild Hall', '/world')
    await approachDoor(page)
    since = await overlaysSeen(page)
    await pressE(page)
    await page.waitForTimeout(300)
    const askedAgain = (await dialog(page)) !== null
    await waitForTransition(page, '有票再按 E', since, 'S07')
    const again = sockets.at(-1)
    if (!askedAgain && enter.calls.length === callsBefore && again?.scene === `room:${ROOM}` && again.token === TOKEN) ok('[S07] 有票的人再按 E：直接進、沒有視窗、沒有 /enter')
    else bad('[S07] 有票的人再按 E 不對', `dialog=${askedAgain} enter=${enter.calls.length - callsBefore} last=${JSON.stringify(again)}`)
    await expectUrl(page, '[S07] 直接進房', `/world?room=${ROOM}`)

    // S05 尾：回大廳、拿掉票、同一扇門再開是空的
    since = await overlaysSeen(page)
    await page.click('button[aria-label="回到 Guild Hall"]')
    await waitForTransition(page, '再回到 Guild Hall', since, 'S05')
    await page.evaluate((k) => sessionStorage.removeItem(k), tokenKey(P.id))
    await approachDoor(page)
    await pressE(page)
    await waitDialog(page, 'visible')
    if ((await fieldValue(page)) === '') ok('[S05] 拿掉票、同一扇門再開：欄位是空的（成功那次的密碼沒留下）')
    else bad('[S05] 同一扇門再開欄位不是空的', String(await fieldValue(page)))
    await page.keyboard.press('Escape')
    await waitDialog(page, 'detached')
    await walkToDecoy(page)
    await page.keyboard.press('KeyE')
    await waitDialog(page, 'visible')
    const decoyName = await dialogName(page)
    if (decoyName?.includes(DECOY_TITLE) && (await fieldValue(page)) === '') ok('[S05] 另一扇沒票的門：視窗換成那間房、欄位是空的')
    else bad('[S05] 另一扇門的視窗不對', `name=${decoyName} value=${await fieldValue(page)}`)
    await page.keyboard.press('Escape')
    await waitDialog(page, 'detached')
    const leaksEnd = urls.filter((u) => u.includes(TOKEN) || u.includes(WRONG) || u.includes(CORRECT))
    const dumpEnd = await storageDump(page)
    const writesEnd = (await storageWrites(page)).filter((w) => w.includes(WRONG) || w.includes(CORRECT))
    if (leaksEnd.length === 0 && !dumpEnd.includes(WRONG) && !dumpEnd.includes(CORRECT) && writesEnd.length === 0) ok(`[S05] 整條軌跡 ${urls.length} 次網址寫入、${(await storageWrites(page)).length} 次 storage 寫入都沒有密碼與票`)
    else bad('[S05] 整條軌跡有密碼或票', [...leaksEnd, ...writesEnd].join('\n   '))

    // S13 後半：換成 Q（同一個分頁、同一個 sessionStorage、P 的票還躺在裡面），深連結直達 R：第一條 socket 不能帶 P 的票、要回落大廳。
    await page.evaluate(([k, t]) => sessionStorage.setItem(k, t), [tokenKey(P.id), TOKEN])
    me.current = Q
    sockets.length = 0
    const callsQ = enter.calls.length
    await page.goto(`${FRONTEND}/world?room=${ROOM}`)
    await waitForWorld(page)
    await expectUrl(page, '[S13] Q 沒有票：深連結回落 /world', '/world')
    if (sockets.length >= 1 && sockets[0].scene === 'lobby' && sockets[0].token === null && sockets.every((s) => s.scene === 'lobby')) ok('[S13] Q 的第一條 socket 是 lobby、沒有票（P 的票沒被讀到）')
    else bad('[S13] Q 的 socket 不對', JSON.stringify(sockets))
    await approachDoor(page)
    await pressE(page)
    if ((await waitDialog(page, 'visible')) && sockets.every((s) => s.scene === 'lobby') && enter.calls.length === callsQ) ok('[S13] 換成 Q：按 E 開的是視窗、沒有房間連線、沒有 /enter')
    else bad('[S13] 換成 Q 之後不對', `dialog=${(await dialog(page)) !== null} sockets=${JSON.stringify(sockets)}`)
    await page.screenshot({ path: path.join(OUT, 'q-asked.png') })
    await context.close()
  }

  // ── B：P 有票、房間握手一律被拒。S11 ──
  {
    const sockets = []
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await countOverlays(context)
    await fakeRealtime(context, sockets, { refuse: (scene) => scene?.startsWith('room:') ?? false })
    const page = await context.newPage()
    await fakeRest(page, { current: P }, ROOMS)
    const enter = fakeEnter(page)
    await page.goto(`${FRONTEND}/world`)
    await waitForWorld(page)
    await approachDoor(page)
    let since = await overlaysSeen(page)
    await pressE(page)
    await waitForTransition(page, '進房被拒', since, 'S11')
    const notice = await page.waitForSelector(NOTICE, { timeout: 5_000 }).catch(() => null)
    if (notice !== null && (await notice.textContent())?.includes('進不了這間房')) ok('[S11] 被拒：回大廳、有通知')
    else bad('[S11] 被拒之後沒有通知')
    if ((await heldToken(page, tokenKey(P.id))) === TOKEN) ok('[S11] 票還在（系統不丟）')
    else bad('[S11] 票被丟了', String(await heldToken(page, tokenKey(P.id))))
    const reenter = await page.$(`${NOTICE} button:has-text("重新輸入密碼")`)
    if (reenter !== null) ok('[S11] 通知裡有「重新輸入密碼」')
    else bad('[S11] 通知裡沒有「重新輸入密碼」')
    // 不按：再走到門前按 E，同一張票再試
    await approachDoor(page)
    since = await overlaysSeen(page)
    await pressE(page)
    await waitForTransition(page, '同票再試', since, 'S11')
    // 被拒之後客戶端自動回大廳（又一條 lobby socket），所以看的是**最後一條房間的** socket。
    const roomSockets = sockets.filter((s) => s.scene === `room:${ROOM}`)
    if (roomSockets.length === 2 && roomSockets.at(-1)?.token === TOKEN && enter.calls.length === 0) ok('[S11] 不按：同一張票再試、沒有 /enter')
    else bad('[S11] 不按的重試不對', `sockets=${JSON.stringify(sockets)} enter=${enter.calls.length}`)
    await page.waitForSelector(NOTICE, { timeout: 5_000 }).catch(() => null)
    // 按：丟票、關通知、開含房名的空視窗
    await page.click(`${NOTICE} button:has-text("重新輸入密碼")`)
    if (await waitDialog(page, 'visible')) ok('[S11] 按「重新輸入密碼」：出現視窗')
    else bad('[S11] 按了沒有視窗')
    const name = await dialogName(page)
    if ((await heldToken(page, tokenKey(P.id))) === null && (await page.$(NOTICE)) === null && name?.includes(ROOM_TITLE) && (await fieldValue(page)) === '' && enter.calls.length === 0)
      ok(`[S11] 票丟了、通知關了、視窗含房名且空白、之前沒有 /enter：「${name.trim()}」`)
    else bad('[S11] 按了之後的狀態不對', `token=${await heldToken(page, tokenKey(P.id))} notice=${(await page.$(NOTICE)) !== null} name=${name} value=${await fieldValue(page)} enter=${enter.calls.length}`)
    await page.screenshot({ path: path.join(OUT, 'reenter.png') })
    await context.close()
  }

  // ── C：P 沒有票、`sessionStorage.setItem` 拋。S14 ──
  {
    const sockets = []
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    // 只讓 sessionStorage 壞（票在那裡）；localStorage 照常 —— 免得框架自己的寫入變成無關的假紅。
    await context.addInitScript(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (this === sessionStorage) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        return original.call(this, key, value)
      }
    })
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, { current: P }, ROOMS)
    const enter = fakeEnter(page)
    enter.current = (route) => json(route, 200, { room_token: TOKEN })
    await page.goto(`${FRONTEND}/world`)
    await waitForWorld(page)
    await approachDoor(page)
    await pressE(page)
    await waitDialog(page, 'visible')
    await typePassword(page, CORRECT)
    await clickSubmit(page)
    if (await waitSubmitError(page)) ok('[S14] setItem 拋：出現 alert')
    else bad('[S14] setItem 拋之後沒有 alert')
    const text = (await submitError(page)) ?? ''
    await page.waitForTimeout(500)
    const tokenInDom = await page.evaluate((t) => document.body.textContent?.includes(t) ?? false, TOKEN)
    if (text !== '' && !text.includes('密碼') && (await dialog(page)) !== null && sockets.every((s) => s.scene === 'lobby') && !tokenInDom) ok(`[S14] 視窗留著、沒有房間連線、alert 不說密碼、票不在 DOM：「${text}」`)
    else bad('[S14] setItem 拋之後的狀態不對', `alert=「${text}」 dialog=${(await dialog(page)) !== null} sockets=${JSON.stringify(sockets)} tokenInDom=${tokenInDom}`)
    await expectUrl(page, '[S14] 網址不變', '/world')
    await page.screenshot({ path: path.join(OUT, 'ticket-not-held.png') })
    await context.close()
  }
} finally {
  await browser.close()
}

if (failureCount() > 0) {
  console.log(`\n${failureCount()} 項不符。`)
  process.exit(1)
}
console.log('\n全部符合。')
