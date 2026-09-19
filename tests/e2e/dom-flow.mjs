// `FE-X16`〈同一時間只有一個阻斷式面板〉的真瀏覽器判準：`S13`（`focusin` 序列、網址退）、`S17`（真的按下一頁）、`S21`（關掉後人走得動：假 WS 收到的 `move`）。
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
  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
