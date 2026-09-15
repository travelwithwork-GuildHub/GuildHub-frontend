// `FE-K04` 的瀏覽器驗收：不按 E 就看得到場景 chat、只看不鎖、打字才鎖、Escape 回錨；chat 區不遮互動提示；換場景／失敗退回／refresh 的畫面；
// 以及 `FE-R11-S05`（refresh 後沒有歷史；請求 allowlist）的可觀察形式。規格 `openspec/changes/fe-k04-scene-chat-ui/`、`fe-r11-realtime-chat`。
//
// ⚠️ **即時層與 REST 都是這支腳本攔截並偽造的**（`routeWebSocket`／`page.route`），**不連任何團隊共用的位址**（`assertLoopback`＋`guardLoopback`）。
// chat 由偽造的伺服器主動送（`sockets.at(-1).ws.send`）。走位用 `lib/world.mjs` 的里程計。
//
// 用法：pnpm run build && NEXT_PUBLIC_APP_ENV=local node node_modules/next/dist/bin/next start -p 3100，然後 node tests/e2e/scene-chat.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT。**打 `next start`**。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { HALL_SPAWN, assertLoopback, bad, countOverlays, expectUrl, failureCount, fakeRealtime, fakeRest, guardLoopback, hold, lastReportedPosition, ok, overlaysSeen, profile, promptText, uuid, waitForTransition, waitForWorld, walker } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-k04'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const P = profile(41, '人才戊')
const ROOM = uuid(1)
const ROOM_TITLE = '星際導航'
const DECOY = uuid(2)
const ROOMS = [
  { project_id: ROOM, title: ROOM_TITLE, online_count: 3 },
  { project_id: DECOY, title: '深海探勘', online_count: 1 },
]
const TOKEN = 'e2e-ticket-K04'
const tokenKey = (profileId) => `guildhub.roomToken.${profileId}.${ROOM}`
const { approachDoor, odometer } = walker({ room: ROOM, decoy: DECOY, title: ROOM_TITLE, out: OUT })

const HUD = '[data-testid="scene-chat"]'
const rowsText = (page) => page.$$eval('[data-testid="chat-row"]', (rows) => rows.map((r) => r.querySelector('[data-testid="chat-body"]')?.textContent ?? ''))
const emptyVisible = (page) => page.$(`${HUD} [data-testid="chat-empty"]`).then((n) => n !== null)
const field = (page) => page.$(`${HUD} textarea`)
const activeDescriptor = (page) =>
  page.evaluate(() => {
    const a = document.activeElement
    return a === null ? 'null' : `${a.tagName.toLowerCase()}${a.hasAttribute('data-focus-anchor') ? '[anchor]' : ''}`
  })
/** 伺服器主動送一則 chat 給最後一條 socket。 */
const serverChat = (sockets, name, body, id = 'u-other') => sockets.at(-1).ws.send(JSON.stringify({ t: 'chat', id, name, body }))
const waitRows = (page, n) => page.waitForFunction((k) => document.querySelectorAll('[data-testid="chat-row"]').length >= k, n, { timeout: 5_000 }).then(() => true).catch(() => false)
/** 兩個矩形的交集面積。 */
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  // ── A：S01、S02、S15、S08、S09（有票；房間握手第二次才拒） ──
  {
    const sockets = []
    let refuseRoom = false
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await countOverlays(context)
    await fakeRealtime(context, sockets, { refuse: (scene) => refuseRoom && (scene?.startsWith('room:') ?? false) })
    const page = await context.newPage()
    await fakeRest(page, { current: P }, ROOMS)
    const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
    if (response === null) throw new Error(`連不到 ${FRONTEND} —— server 起了嗎？（next start）`)
    await waitForWorld(page)

    // S01：剛載入、**這支腳本到這裡還沒按過任何鍵**（里程計的校準會往西走幾小步，所以校準放在 S01 之後），別人講的話就出現；沒有 dialog、沒有提示
    if ((await page.$(HUD)) !== null && (await emptyVisible(page))) ok('[S01] 剛進大廳：chat 區在、空狀態在')
    else bad('[S01] chat 區或空狀態不在')
    serverChat(sockets, '阿福', '早安')
    if (await waitRows(page, 1)) ok('[S01] 伺服器送來一則就出現')
    else bad('[S01] 訊息沒有出現')
    const names = await page.$$eval('[data-testid="chat-name"]', (n) => n.map((x) => x.textContent))
    if (names[0] === '阿福' && (await rowsText(page))[0] === '早安') ok('[S01] 顯示發言者與 body')
    else bad('[S01] 名字或內容不對', JSON.stringify([names, await rowsText(page)]))
    if ((await page.$$('[role="dialog"]')).length === 0 && (await page.$('[data-testid="interaction-prompt"]')) === null) ok('[S01] 沒有 dialog、沒有互動提示；到此為止沒有按過任何鍵（沒走位、沒按 E）')
    else bad('[S01] 有 dialog 或提示')
    // 角色還在出生點：看角色**自己回報**的位置（`PositionSync` ready 之後送的 `move` frame），不用里程計（校準本身會走位）
    const reported = lastReportedPosition(sockets[0])
    if (reported !== null && Math.hypot(reported.x - HALL_SPAWN.x, reported.z - HALL_SPAWN.z) < 0.5) ok(`[S01] 角色回報的位置在出生點附近（${reported.x.toFixed(2)}, ${reported.z.toFixed(2)}）`)
    else bad('[S01] 角色不在出生點', JSON.stringify(reported))
    await page.screenshot({ path: path.join(OUT, 'hud-lobby.png') })
    const where = await odometer(page) // 校準：往西走到兩扇門的標籤都看得見（門標籤是量尺）；之後的位移相對它
    const pos0 = await where()

    // S02：只看不鎖；打字不走路；Escape 回錨；離開後會動
    await hold(page, 'KeyW', 300)
    const pos1 = await where()
    const moved1 = Math.hypot(pos1.dx - pos0.dx, pos1.dz - pos0.dz)
    if (moved1 > 0.3) ok(`[S02] 只看不鎖：按 W 會動（位移 ${moved1.toFixed(2)}）`)
    else bad('[S02] 只看也被鎖住了', `位移 ${moved1.toFixed(2)}`)
    await (await field(page)).focus()
    await page.keyboard.type('w')
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(300)
    await page.keyboard.up('KeyW')
    const pos2 = await where()
    const moved2 = Math.hypot(pos2.dx - pos1.dx, pos2.dz - pos1.dz)
    const typed = await page.$eval(`${HUD} textarea`, (t) => t.value)
    if (typed === 'ww' && moved2 < 0.15) ok(`[S02] 輸入框有焦點：字進欄位（「${typed}」）、角色不動（位移 ${moved2.toFixed(2)}）`)
    else bad('[S02] 打字時走路了或字沒進欄位', `value=${typed} 位移 ${moved2.toFixed(2)}`)
    const urlBefore = page.url()
    await page.keyboard.press('Escape')
    const active = await activeDescriptor(page)
    const valueAfter = await page.$eval(`${HUD} textarea`, (t) => t.value)
    if (active.includes('[anchor]') && (await page.$(HUD)) !== null && page.url() === urlBefore && valueAfter === 'ww') ok('[S02] Escape：焦點回世界錨、chat 區還在、網址不變、值保留')
    else bad('[S02] Escape 之後不對', `active=${active} hud=${(await page.$(HUD)) !== null} url=${page.url()} value=${valueAfter}`)
    await hold(page, 'KeyW', 300)
    const pos3 = await where()
    const moved3 = Math.hypot(pos3.dx - pos2.dx, pos3.dz - pos2.dz)
    if (moved3 > 0.3) ok(`[S02] 離開輸入框之後按 W 會動（位移 ${moved3.toFixed(2)}）`)
    else bad('[S02] 離開輸入框之後還是不動', `位移 ${moved3.toFixed(2)}`)

    // S15：撐滿 chat 區（30 則多行）、走到門前、提示出現：兩個 viewport 都不相交
    for (let i = 0; i < 30; i += 1) serverChat(sockets, `人${i}`, `第 ${i} 則\n第二行\n第三行 ${'很長的一段字'.repeat(6)}`)
    if (!(await waitRows(page, 31))) throw new Error('[S15] 31 列沒有全部畫出來 —— 撐不滿就量不到「撐滿也不遮」')
    const overflowing = await page.$eval(`${HUD} [data-testid="chat-scroll"]`, (el) => el.scrollHeight > el.clientHeight)
    if (overflowing) ok('[S15] 30 則多行把列表撐到會捲動（HUD 已到最大高度）')
    else throw new Error('[S15] 列表沒有溢出 —— HUD 沒被撐滿，交集 0 會是假綠')
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1024, height: 640 },
    ]) {
      await page.setViewportSize(viewport)
      await page.waitForTimeout(300)
      if (viewport.width === 1280) await approachDoor(page)
      const prompt = await page.$('[data-testid="interaction-prompt"]')
      const hudBox = await (await page.$(HUD)).boundingBox()
      const promptBox = prompt === null ? null : await prompt.boundingBox()
      if (promptBox === null) bad(`[S15] ${viewport.width}×${viewport.height}：提示沒出現（走位沒到？）`)
      else if (overlap(hudBox, promptBox) === 0) ok(`[S15] ${viewport.width}×${viewport.height}：chat 區（${Math.round(hudBox.width)}×${Math.round(hudBox.height)}）與提示不相交`)
      else bad(`[S15] ${viewport.width}×${viewport.height}：chat 區蓋住提示`, `交集 ${overlap(hudBox, promptBox)} px²`)
      await page.screenshot({ path: path.join(OUT, `hud-prompt-${viewport.width}.png`) })
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForTimeout(300)

    // S11／S12：列表已經會捲動（30 則）。在底部 → 新的一則可見；往上捲 → 位置不動、出現控制、按了最新可見且控制消失
    const SCROLL = `${HUD} [data-testid="chat-scroll"]`
    const lastVisible = () =>
      page.$eval(SCROLL, (el) => {
        const rows = el.querySelectorAll('[data-testid="chat-row"]')
        const last = rows[rows.length - 1]
        if (!last) return false
        const a = last.getBoundingClientRect()
        const b = el.getBoundingClientRect()
        return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5
      })
    const scrollable = await page.$eval(SCROLL, (el) => el.scrollHeight > el.clientHeight + 10)
    if (scrollable) ok('[S11] 列表已經長到會捲動')
    else bad('[S11] 列表沒有長到會捲動（判準的前提不成立）')
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      el.scrollTop = el.scrollHeight
    }, SCROLL)
    await page.waitForTimeout(100)
    serverChat(sockets, '新人', '在底部時來的')
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="chat-body"]')].some((n) => n.textContent === '在底部時來的'), null, { timeout: 5_000 })
    await page.waitForTimeout(100)
    if (await lastVisible()) ok('[S11] 在底部：新的一則在可見區')
    else bad('[S11] 在底部收到新訊息，最新的一則不在可見區')
    await page.evaluate((sel) => {
      document.querySelector(sel).scrollTop = 0
    }, SCROLL)
    await page.waitForTimeout(100)
    const topBefore = await page.$eval(SCROLL, (el) => el.scrollTop)
    if ((await page.$(`${HUD} [data-testid="chat-jump-latest"]`)) === null) ok('[S12] 往上捲、還沒有新訊息：沒有控制')
    else bad('[S12] 往上捲就出現控制（新訊息還沒來）')
    serverChat(sockets, '新人', '往上讀時來的')
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="chat-body"]')].some((n) => n.textContent === '往上讀時來的'), null, { timeout: 5_000 })
    await page.waitForTimeout(150)
    const topAfter = await page.$eval(SCROLL, (el) => el.scrollTop)
    const jump = await page.$(`${HUD} [data-testid="chat-jump-latest"]`)
    if (Math.abs(topAfter - topBefore) <= 1 && jump !== null && !(await lastVisible())) ok(`[S12] 往上讀：位置不動（${topBefore}→${topAfter}）、出現回到最新的控制、最新的一則不在可見區`)
    else bad('[S12] 往上讀時被搶走位置或沒有控制', `scrollTop ${topBefore}→${topAfter} jump=${jump !== null} lastVisible=${await lastVisible()}`)
    await page.screenshot({ path: path.join(OUT, 'hud-unseen.png') })
    await jump?.click()
    await page.waitForTimeout(150)
    if ((await lastVisible()) && (await page.$(`${HUD} [data-testid="chat-jump-latest"]`)) === null) ok('[S12] 啟動控制：最新的一則在可見區、控制消失')
    else bad('[S12] 啟動控制之後不對', `lastVisible=${await lastVisible()} jump=${(await page.$(`${HUD} [data-testid="chat-jump-latest"]`)) !== null}`)
    await (await field(page)).focus()
    await page.keyboard.press('Escape')

    // S08：進房（hello 之後 committed）→ 大廳的話不見；房間送一則 → 只剩它
    let since = await overlaysSeen(page)
    await page.keyboard.press('KeyE')
    await waitForTransition(page, '按 E 進房間', since, 'S08')
    await expectUrl(page, '[S08] 進房間', `/world?room=${ROOM}`)
    const inRoom = await rowsText(page)
    if (inRoom.length === 0 && (await emptyVisible(page))) ok('[S08] 房間 committed：大廳的訊息不見了、空狀態')
    else bad('[S08] 房間裡還看得到大廳的訊息', JSON.stringify(inRoom.slice(0, 3)))
    serverChat(sockets, '房裡的人', '房間訊息')
    await waitRows(page, 1)
    if (JSON.stringify(await rowsText(page)) === JSON.stringify(['房間訊息'])) ok('[S08] 房間送一則：只顯示它')
    else bad('[S08] 房間的列表不對', JSON.stringify(await rowsText(page)))

    // S09：回大廳（有一則）→ 再進房被拒 → 自動回大廳 → 那則還在
    since = await overlaysSeen(page)
    await page.click('button:has-text("回到 Guild Hall")')
    await waitForTransition(page, '回到 Guild Hall', since, 'S09')
    serverChat(sockets, '阿福', '回來啦')
    await waitRows(page, 1)
    refuseRoom = true
    await approachDoor(page)
    since = await overlaysSeen(page)
    await page.keyboard.press('KeyE')
    await waitForTransition(page, '進房被拒', since, 'S09')
    await page.waitForSelector('[role="alert"]:not(#__next-route-announcer__)', { timeout: 5_000 }).catch(() => null)
    await page.waitForTimeout(500)
    const afterRefused = await rowsText(page)
    if (JSON.stringify(afterRefused) === JSON.stringify(['回來啦']) && sockets.at(-1)?.scene === 'lobby') ok('[S09] 進房被拒、自動回大廳：大廳的那則還在')
    else bad('[S09] 退回大廳之後訊息不對', `${JSON.stringify(afterRefused)} last=${sockets.at(-1)?.scene}`)
    await page.screenshot({ path: path.join(OUT, 'hud-after-refused.png') })
    await context.close()
  }

  // ── B：S10 ＋ FE-R11-S05（refresh 後沒有歷史；請求 allowlist） ──
  {
    const sockets = []
    const requests = []
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    // 收集範圍：**應用程式發出的請求**。不算的三種都不是應用程式的程式碼發的：document 導覽本身（`page.goto`／`reload`）、
    // 瀏覽器自動抓的 `/favicon.ico`（repo 沒有這個檔，Next 回 404）、`data:` URL（沒有伺服器）。其餘一律要在 FE-R11-S05 的 allowlist 內。
    context.on('request', (r) => {
      const url = new URL(r.url())
      if (r.resourceType() === 'document') return
      if (url.protocol === 'data:') return
      if (url.pathname === '/favicon.ico' && r.resourceType() === 'other') return
      requests.push(r.url())
    })
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, { current: P }, ROOMS)
    await page.goto(`${FRONTEND}/world`)
    await waitForWorld(page)
    for (const body of ['一', '二', '三']) serverChat(sockets, '阿福', body)
    if ((await waitRows(page, 3)) && JSON.stringify(await rowsText(page)) === JSON.stringify(['一', '二', '三'])) ok('[S10] refresh 前：一、二、三在畫面上')
    else throw new Error(`[S10] refresh 前的三則沒有出現：${JSON.stringify(await rowsText(page))} —— 之後的「refresh 後是空的」會是假綠`)
    await page.reload()
    await waitForWorld(page)
    // 偽造的伺服器只回 hello＋snapshot（`fakeRealtime` 本來就只送這兩則），不重送 chat
    const after = await rowsText(page)
    if (after.length === 0 && (await emptyVisible(page))) ok('[S10][FE-R11-S05] refresh 後：空狀態、沒有任何舊訊息')
    else bad('[S10][FE-R11-S05] refresh 後還有東西', JSON.stringify(after))
    // FE-R11-S05 的 allowlist 照它原文：`/api/me`、`/api/rooms`、`/api/profiles/*`、Next 的靜態資源、`/ws`
    const allowed = (u) => {
      const url = new URL(u)
      const p = url.pathname
      // 照 R11 原文的封閉集合：`/api/me`、`/api/rooms`、`/api/profiles/*`、Next 的靜態資源（`/_next/`）、`/ws`。
      // 不放行整個 ws:／wss: 協定（那會讓 `/ws` 形同虛設）、不放行 `/api/profiles` 根路徑、不放行 document／favicon／data:（那些在收集範圍就排除了，理由在上面）。
      return p === '/api/me' || p === '/api/rooms' || p.startsWith('/api/profiles/') || p === '/ws' || p.startsWith('/_next/')
    }
    const outside = [...new Set(requests.filter((u) => !allowed(u)))]
    if (outside.length === 0) ok(`[FE-R11-S05] 整段期間 ${requests.length} 個請求都在 allowlist 內`)
    else bad('[FE-R11-S05] 有 allowlist 以外的請求', outside.join('\n   '))
    await page.screenshot({ path: path.join(OUT, 'hud-after-reload.png') })
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
