// `FE-W20-S09` 的瀏覽器驗收：站在出生點、沒有按 E，就從看板的狀態訊號分得出「有內容／空的／讀不到」；
// 角色移動時摘要 overlay 釘在看板上（跟著相機走、不游移），走出畫面整塊移出（`visibility:hidden`）。
// 規格 `openspec/changes/fe-w20-board-summary/specs/world-board-summary/spec.md`〈真瀏覽器裡從出生點看得出有沒有東西〉。
//
// ⚠️ **回應由這支腳本攔截並偽造**（`page.route`）：證明「元件收到這份資料時會這樣畫」，不證明真 GuildHub 整合可用。
// **只打本機自己起的 server**（`assertLoopback`／`guardLoopback`）。WS 用 `fakeRealtime` 偽造，讓世界乾淨地到 ready。
//
// 用法：build（帶 `NEXT_PUBLIC_APP_ENV=local`）→ next start 3101 →
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/board-summary.mjs

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, fakeRealtime, guardLoopback, hold, ok, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-board-summary-shots'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const PROJECTS = ['植物照顧提醒小工具', '城市噪音地圖', '小型電商後台改寫', '共筆計時器', '第五個不該出現'].map((title, i) => ({
  id: uuid(i + 1),
  owner_id: uuid(99),
  title,
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  updated_at: '2026-09-09T00:00:00Z',
}))

const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))
const SEL = (id) => `[data-testid="board-summary-anchor"][data-board-id="${id}"]`
const info = (page, id) => page.$eval(SEL(id), (n) => ({ vis: n.style.visibility, transform: n.style.transform })).catch(() => null)
const state = (page, id) => page.$eval(`${SEL(id)} [data-testid="board-summary"]`, (n) => ({ state: n.getAttribute('data-state'), role: n.getAttribute('role'), retry: !!n.querySelector('button') })).catch(() => null)
const items = (page, id) => page.$$eval(`${SEL(id)} [data-testid="board-summary-item"]`, (ns) => ns.map((n) => n.textContent ?? ''))

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  guardLoopback(context)
  const sockets = []
  fakeRealtime(context, sockets)

  // 專案看板：有資料（可切成 500 驗「讀不到」）；人才看板：空的。兩塊各一種狀態，才驗得出「分得出來」。
  let projectsMode = 'data'
  await context.route('**/api/projects?*', (route) => {
    if (projectsMode === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"壞了"}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROJECTS) })
  })
  await context.route('**/api/profiles?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await context.route('**/api/rooms', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

  const page = await context.newPage()
  const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
  if (response === null) throw new Error(`連不到 ${FRONTEND} —— next start 起了嗎？`)
  await waitForWorld(page)
  await page.waitForSelector('[data-testid="board-summary"]', { timeout: 20_000 })
  await page.waitForTimeout(1500)

  // ── S09：出生點就分得出「有內容」vs「空的」──────────────────
  const projSpawn = await state(page, 'board-project')
  check('[FE-W20-S09] 出生點：專案看板是「有內容」（ready）', projSpawn?.state, 'ready')
  const projItems = await items(page, 'board-project')
  check('[FE-W20-S09] 專案看板畫了 4 筆（page 0 有 5 筆、只留前 4）', projItems.length, 4)
  check('[FE-W20-S09] 第一筆是植物照顧提醒（不是第 5 筆）', projItems[0]?.includes('植物照顧提醒') && !projItems.some((t) => t.includes('第五個')), true)
  check('[FE-W20-S09] 出生點：人才看板是「空的」（empty）', (await state(page, 'board-talent'))?.state, 'empty')
  // 兩塊都在畫面內（狀態訊號從 spawn 看得出來）
  check('[FE-W20-S09] 專案看板 overlay 在畫面內（visible）', (await info(page, 'board-project'))?.vis, 'visible')
  check('[FE-W20-S09] 人才看板 overlay 在畫面內（visible）', (await info(page, 'board-talent'))?.vis, 'visible')
  await page.screenshot({ path: path.join(OUT, '1-spawn-data-vs-empty.png') })

  // ── S09：移動時 overlay 釘在看板上（跟著相機走）──────────────
  const before = await info(page, 'board-project')
  await hold(page, 'ArrowUp', 900) // 往北走近看板
  await page.waitForTimeout(600)
  const after = await info(page, 'board-project')
  const moved = before && after && before.transform !== after.transform
  check('[FE-W20-S09] 往看板走近，overlay 的位置有跟著相機變（釘在世界、不是釘在螢幕）', moved, true)
  check('[FE-W20-S09] 走近後專案看板 overlay 仍在畫面內、內容沒有閃掉', (await info(page, 'board-project'))?.vis === 'visible' && (await items(page, 'board-project')).length === 4, true)
  await page.screenshot({ path: path.join(OUT, '2-walked-closer.png') })

  // ── S09：走到讓人才看板（東側）離開畫面 → 那塊 overlay 移出（visibility:hidden）──
  await hold(page, 'ArrowLeft', 2200) // 往西走，東側的人才看板漂出右緣
  await page.waitForTimeout(700)
  const talentVis = (await info(page, 'board-talent'))?.vis
  check('[FE-W20-S09] 往西走遠後，東側人才看板 overlay 移出畫面（hidden）', talentVis, 'hidden')
  await page.screenshot({ path: path.join(OUT, '3-talent-offscreen.png') })

  // ── S09：讀不到 —— role=status、沒有 retry（環境資訊不奪焦）──
  projectsMode = 'error'
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  await page.waitForSelector('[data-testid="board-summary"][data-state="failed"]', { timeout: 20_000 }).catch(() => {})
  const failed = await state(page, 'board-project')
  check('[FE-W20-S09] 讀不到：專案看板是 failed', failed?.state, 'failed')
  check('[FE-W20-S09] 讀不到：role=status（不奪焦）', failed?.role, 'status')
  check('[FE-W20-S09] 讀不到：看板上沒有 retry 按鈕（重試留給面板）', failed?.retry, false)
  await page.screenshot({ path: path.join(OUT, '4-error.png') })

  await context.close()
} catch (err) {
  bad('腳本中途拋出', err instanceof Error ? (err.stack ?? err.message) : String(err))
} finally {
  await browser.close()
}
if (failureCount() > 0) {
  console.log(`\n${failureCount()} 條沒過`)
  process.exit(1)
}
console.log('\n全部通過')
