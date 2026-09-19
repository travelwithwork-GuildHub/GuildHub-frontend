// `FE-X16`〈同一時間只有一個阻斷式面板〉的真瀏覽器判準：`S13`（`focusin` 序列、網址退）、`S17`（真的按下一頁）、`S21`（關掉後人走得動：假 WS 收到的 `move`）、
// `S16`（聊天框收成一行、展開後的捲動位置是真的 `scrollTop`）、`S15`（訪客提示讓位、打到一半的名字沒丟）、`S14`（成軍送出中拒絕：看得到的 `role="status"`、焦點留在按鈕）。
// 看板真的走過去按 E 開（`lib/world.mjs` 的走位）；REST 全部 `page.route` 偽造、只打本機自己起的 `next start`。
//
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/dom-flow.mjs
//
// ⚠️ `focusin` 的序列在**按下之前**就開始記（同一個 document 裡裝 listener），事後查 `activeElement` 看不到中間經過哪裡。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { approach, assertLoopback, bad, fakeRealtime, failureCount, guardLoopback, hold, lastReportedPosition, ok, pathAndSearch, profile, uuid, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-x16'
assertLoopback(FRONTEND)

const ME = profile(1, '我自己')
const OTHER = profile(2, '對方')
const PROJECT = { id: uuid(100), owner_id: ME.id, title: '案件', body: '內容', needed_skills: [], status: 'recruiting', room_template: null, seat_count: 4, expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), updated_at: '2026-09-09T00:00:00Z' }
const MESSAGE = { id: uuid(31), sender_id: OTHER.id, recipient_id: ME.id, body: '嗨', created_at: '2026-09-12T10:00:00.000000Z', read_at: null }

async function fakeRest(page) {
  const json = (body, status = 200) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/me', json(ME))
  await page.route('**/api/rooms', json([]))
  await page.route('**/api/profiles?*', json([OTHER]))
  await page.route('**/api/projects?*', json([]))
  await page.route(`**/api/profiles/${OTHER.id}`, json(OTHER))
  await page.route('**/api/messages*', json([MESSAGE]))
}
const panels = (page) => page.evaluate(() => ['list-panel', 'inbox-panel', 'profile-panel'].filter((id) => document.querySelector(`[data-testid="${id}"]`) !== null))
/** 伺服器主動送一則場景 chat 給最後一條 socket。 */
const serverChat = (sockets, body) => sockets.at(-1).ws.send(JSON.stringify({ t: 'chat', id: 'u-other', name: '別人', body }))
const waitRows = (page, n) => page.waitForFunction((k) => document.querySelectorAll('[data-testid="chat-row"]').length >= k, n, { timeout: 5000 })
const CHAT_SCROLL = '[data-testid="scene-chat"] [data-testid="chat-scroll"]'
const lastRowVisible = (page) =>
  page.$eval(CHAT_SCROLL, (el) => {
    const last = el.querySelector('[data-testid="chat-row"]:last-child')
    if (!last) return false
    const a = last.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5
  })
const activeIn = (page, testId) => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.contains(document.activeElement) === true, testId)
/** 從現在開始記每一次 `focusin` 落在哪（testid 或 tag）。 */
const recordFocus = (page) =>
  page.evaluate(() => {
    window.__focusins = []
    document.addEventListener('focusin', (e) => window.__focusins.push(e.target.dataset?.testid ?? e.target.tagName), true)
  })
const focusins = (page) => page.evaluate(() => window.__focusins)
async function assertFlowToInbox(page, tag) {
  const seq = await focusins(page)
  const open = await panels(page)
  open.length === 1 && open[0] === 'inbox-panel' ? ok(`[${tag}] 掛載中的阻斷式面板恰好一個：收件匣`) : bad(`[${tag}] 掛載中的面板是 ${JSON.stringify(open)}`)
  ;(await activeIn(page, 'inbox-panel')) ? ok(`[${tag}] 焦點在收件匣內`) : bad(`[${tag}] 焦點不在收件匣內`, await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)))
  !seq.includes('world-canvas-container') && !seq.includes('BODY') ? ok(`[${tag}] focusin 序列 ${JSON.stringify(seq)}：沒有世界錨、沒有 body`) : bad(`[${tag}] focusin 經過了開啟者或 body`, JSON.stringify(seq))
}
/** 走到人才看板前按 E（`pushState` 一層）。 */
async function openTalentBoardByE(page) {
  await approach(page, '看人才看板', [['ArrowRight', 700], ['ArrowUp', 1000]], OUT)
  await page.keyboard.press('KeyE')
  await page.waitForSelector('[data-testid="list-panel"][data-kind="profiles"]')
  await page.waitForFunction(() => location.search === '?panel=profiles')
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(context)
  const sockets = []
  await fakeRealtime(context, sockets)
  const page = await context.newPage()
  await fakeRest(page)
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)

  // ── S13：看板（按 E 開、網址有 panel）→ 按標題列的收件匣 ──
  await openTalentBoardByE(page)
  await recordFocus(page)
  await page.click('[data-testid="inbox-button"]')
  await page.waitForSelector('[data-testid="inbox-panel"]')
  await assertFlowToInbox(page, 'S13')
  await page.waitForFunction(() => location.search === '', null, { timeout: 3000 }).catch(() => {})
  ;(await pathAndSearch(page)) === '/world' ? ok('[S13] 看板讓位後網址退回 /world') : bad('[S13] 網址還有 panel', await pathAndSearch(page))
  await page.screenshot({ path: path.join(OUT, 'flow-yield-to-inbox.png') })

  // ── S17：下一頁要求重開看板 → 收件匣接受、看板重開 ──
  await page.goForward()
  const reopened = await page.waitForSelector('[data-testid="list-panel"][data-kind="profiles"]', { timeout: 5000 }).then(() => true).catch(() => false)
  reopened ? ok('[S17] 下一頁：看板重開') : bad('[S17] 下一頁沒有重開看板', await pathAndSearch(page))
  const afterForward = await panels(page)
  afterForward.length === 1 && afterForward[0] === 'list-panel' ? ok('[S17] 收件匣關了、只剩看板') : bad('[S17] 下一頁之後掛著的面板', JSON.stringify(afterForward))
  ;(await pathAndSearch(page)) === '/world?panel=profiles' ? ok('[S17] 網址回到 ?panel=profiles') : bad('[S17] 網址不對', await pathAndSearch(page))

  // ── S13（寄信那條路）：人才詳情裡按寄信 → 看板讓位、收件匣直接進對話 ──
  await page.click('[data-testid="talent-card"]')
  await page.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]')
  await recordFocus(page)
  await page.click('[data-testid="send-message"]')
  await page.waitForSelector('[data-testid="inbox-thread"]')
  await assertFlowToInbox(page, 'S13 寄信')
  await page.waitForFunction(() => location.search === '', null, { timeout: 3000 }).catch(() => {})
  ;(await pathAndSearch(page)) === '/world' ? ok('[S13 寄信] 網址退回 /world（兩層都退）') : bad('[S13 寄信] 網址還有 panel', await pathAndSearch(page))

  // ── S21：關掉收件匣 → 鎖放開、人走得動（角色回報給假 WS 的 `move`）──
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="inbox-panel"]', { state: 'detached' })
  const socket = sockets.at(-1)
  const from = lastReportedPosition(socket) ?? { x: 0, z: 0 }
  await hold(page, 'ArrowDown', 500)
  await page.waitForTimeout(400)
  const to = lastReportedPosition(socket) ?? from
  const moved = Math.hypot(to.x - from.x, to.z - from.z)
  moved > 0.3 ? ok(`[S21] 關掉後按方向鍵人走了 ${moved.toFixed(2)} 單位`) : bad('[S21] 關掉後人走不動', `位移 ${moved.toFixed(3)}`)
  ;(await panels(page)).length === 0 ? ok('[S21] 沒有面板掛著') : bad('[S21] 還有面板', JSON.stringify(await panels(page)))

  // ── S16：聊天框在底部時開看板 → 收成一行、顯示期間新到的數、沒有列表與輸入框；關了展開、都在、在底部 ──
  serverChat(sockets, '第 0 則')
  await waitRows(page, 1)
  await approach(page, '看人才看板', [], OUT)
  await page.keyboard.press('KeyE')
  await page.waitForSelector('[data-testid="list-panel"][data-kind="profiles"]')
  for (let i = 1; i <= 3; i += 1) serverChat(sockets, `第 ${i} 則`)
  await page.waitForFunction(() => document.querySelector('[data-testid="scene-chat"]')?.textContent?.includes('3') === true, null, { timeout: 3000 }).catch(() => {})
  const collapsed = await page.$eval('[data-testid="scene-chat"]', (el) => ({ text: el.textContent, feed: el.querySelector('[data-testid="chat-feed"]') !== null, box: el.querySelector('textarea, input') !== null, one: el.getBoundingClientRect().height }))
  !collapsed.feed && !collapsed.box && collapsed.text.includes('3') ? ok(`[S16] 面板開著：聊天框只剩一行（高 ${Math.round(collapsed.one)}px、寫著「${collapsed.text.trim()}」）`) : bad('[S16] 聊天框沒有收成一行', JSON.stringify(collapsed))
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="list-panel"]', { state: 'detached' })
  await waitRows(page, 4)
  await page.waitForTimeout(100)
  const expanded = await page.$eval('[data-testid="scene-chat"]', (el) => ({ rows: el.querySelectorAll('[data-testid="chat-row"]').length, box: el.querySelector('textarea, input') !== null }))
  expanded.rows === 4 && expanded.box && (await lastRowVisible(page)) ? ok('[S16] 關了展開：4 則都在、輸入框在、最後一列完整可見') : bad('[S16] 展開後不對', JSON.stringify({ ...expanded, lastVisible: await lastRowVisible(page) }))

  // 往上讀著時開看板、期間 2 則、關掉：scrollTop 差 ≤ 1px、有「回到最新」、2 則都在
  for (let i = 4; i < 40; i += 1) serverChat(sockets, `第 ${i} 則，撐高列表的一行字`)
  await waitRows(page, 40)
  const scrollable = await page.$eval(CHAT_SCROLL, (el) => el.scrollHeight > el.clientHeight + 10)
  if (!scrollable) throw new Error('[S16] 列表沒有長到會捲動 —— 判準的前提不成立')
  await page.$eval(CHAT_SCROLL, (el) => (el.scrollTop = 24))
  await page.waitForTimeout(100)
  const before = await page.$eval(CHAT_SCROLL, (el) => el.scrollTop)
  await page.keyboard.press('KeyE')
  await page.waitForSelector('[data-testid="list-panel"][data-kind="profiles"]')
  serverChat(sockets, '往上讀時來的 A')
  serverChat(sockets, '往上讀時來的 B')
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="list-panel"]', { state: 'detached' })
  await waitRows(page, 42)
  await page.waitForTimeout(150)
  const after = await page.$eval(CHAT_SCROLL, (el) => el.scrollTop)
  Math.abs(after - before) <= 1 ? ok(`[S16] 往上讀：展開後 scrollTop ${after}（收起前 ${before}）`) : bad('[S16] 展開後捲動位置跑了', `收起前 ${before}、展開後 ${after}`)
  ;(await page.$('[data-testid="scene-chat"] [data-testid="chat-jump-latest"]')) !== null ? ok('[S16] 有「回到最新」') : bad('[S16] 沒有「回到最新」')
  await context.close()

  // ── S15：訪客提示讓位（打到一半的名字沒丟）、關了回來；先關掉提示的不回來 ──
  const guest = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(guest)
  await fakeRealtime(guest, [])
  const gp = await guest.newPage()
  await fakeRest(gp)
  await gp.route('**/api/me', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"no"}' }))
  await gp.goto(`${FRONTEND}/world`)
  await waitForWorld(gp)
  const NOTICE = '[data-testid="first-entry-notice"]'
  const NAME = `${NOTICE} input[type="text"], ${NOTICE} input:not([type])`
  await gp.waitForSelector(NOTICE)
  await gp.fill(NAME, '打到一半')
  await gp.evaluate(() => document.querySelector('[data-focus-anchor="world"]')?.focus())
  await openTalentBoardByE(gp)
  ;(await gp.isVisible(NOTICE)) === false && (await gp.$(NOTICE)) !== null ? ok('[S15] 看板開著：提示不在畫面上（元素還在、沒卸載）') : bad('[S15] 看板開著提示還在畫面上', String(await gp.isVisible(NOTICE)))
  await gp.keyboard.press('Escape')
  await gp.waitForSelector('[data-testid="list-panel"]', { state: 'detached' })
  await gp.waitForSelector(NOTICE, { state: 'visible' })
  const kept = await gp.inputValue(NAME)
  kept === '打到一半' ? ok('[S15] 關掉看板：提示回來、打到一半的名字還在') : bad('[S15] 提示回來但名字丟了', kept)
  await gp.click(`${NOTICE} button:has-text("先四處看看")`)
  await gp.waitForSelector(NOTICE, { state: 'detached' })
  await gp.evaluate(() => document.querySelector('[data-focus-anchor="world"]')?.focus())
  await gp.keyboard.press('KeyE')
  await gp.waitForSelector('[data-testid="list-panel"]')
  await gp.keyboard.press('Escape')
  await gp.waitForSelector('[data-testid="list-panel"]', { state: 'detached' })
  await gp.waitForTimeout(300)
  ;(await gp.$(NOTICE)) === null ? ok('[S15] 先關掉提示再開關看板：提示不回來') : bad('[S15] 關掉了的提示又回來了')
  await guest.close()

  // ── S14：成軍送出中（回應壓著不回）按收件匣 → 不開、詳情留著、焦點留在按鈕、看得到 status；回來後再按 → 開 ──
  const owner = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(owner)
  await fakeRealtime(owner, [])
  const op = await owner.newPage()
  await fakeRest(op)
  const json = (body) => (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await op.route('**/api/projects?*', json([PROJECT]))
  await op.route(`**/api/projects/${PROJECT.id}`, json(PROJECT))
  await op.route(`**/api/profiles/${ME.id}`, json(ME))
  let releaseFormTeam = () => {}
  await op.route(`**/api/projects/${PROJECT.id}/form-team`, async (r) => {
    await new Promise((resolve) => (releaseFormTeam = resolve))
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...PROJECT, status: 'active' }) })
  })
  await op.goto(`${FRONTEND}/world?panel=projects&project=${PROJECT.id}`)
  await waitForWorld(op)
  const detail = op.locator('[data-testid="project-detail"]')
  await op.waitForSelector('[data-testid="project-detail"][data-phase="ready"]')
  await detail.getByRole('button', { name: '成軍', exact: true }).click()
  await detail.getByLabel('房間密碼').fill('demo-1234')
  await detail.getByRole('button', { name: '確定成軍' }).click()
  await op.waitForTimeout(300)
  // 按之前就有的 status（清單的空狀態、人數）不算：要的是按了之後**新出現、看得到**的那一則
  const statuses = () => op.$$eval('[role="status"]', (els) => els.filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.textContent?.trim() ?? '').filter((s) => s !== ''))
  const statusBefore = await statuses()
  await op.click('[data-testid="inbox-button"]')
  await op.waitForTimeout(300)
  const refused = await op.evaluate(() => ({
    inbox: document.querySelector('[data-testid="inbox-panel"]') !== null,
    detail: document.querySelector('[data-testid="project-detail"]') !== null,
    focus: document.activeElement?.getAttribute('data-testid'),
  }))
  const newStatus = (await statuses()).filter((s) => !statusBefore.includes(s))
  !refused.inbox && refused.detail && refused.focus === 'inbox-button' && newStatus.length > 0 ? ok(`[S14] 送出中按收件匣：不開、詳情留著、焦點在按鈕、新出現看得到的 status「${newStatus.join('／')}」`) : bad('[S14] 拒絕讓位的形狀不對', JSON.stringify({ ...refused, newStatus }))
  await op.screenshot({ path: path.join(OUT, 'flow-yield-refused.png') })
  releaseFormTeam()
  await op.waitForFunction(() => document.querySelector('[data-testid="project-detail"] [data-testid="project-status"]')?.textContent === '已成軍', null, { timeout: 5000 })
  await op.click('[data-testid="inbox-button"]')
  await op.waitForSelector('[data-testid="inbox-panel"]')
  ;(await op.$('[data-testid="list-panel"]')) === null ? ok('[S14] 回應回來後再按：看板關、收件匣開') : bad('[S14] 回來後看板還在')
  await owner.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
