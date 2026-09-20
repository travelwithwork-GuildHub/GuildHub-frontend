// 規格 `openspec/changes/fe-x15-load-order`（首屏以固定次序載入；ADR 0014）。
// 真瀏覽器驗**拓撲次序與 chunk 有／無** —— jsdom 看不到跨 chunk 的網路請求，那一半在這裡驗。
//
//   S01 DOM 殼＋role=status 載入層先於 Canvas，Canvas ready 前不出現 <canvas>
//   S02 3D chunk 只在身分 settled 後才請求
//   S03 WebSocket 只在 Canvas ready 之後才連線
//   S07 房間清單 GET /api/rooms 只在 Canvas ready 之後才請求
//   S04 三個面板的 entry chunk 在開啟意圖前都不請求；開一個面板不順帶載另兩個
//
// ⚠️ **REST 與 WebSocket 全部偽造、只打本機 `next start`**（`AGENTS.md〈測試環境隔離〉`）。
// ⚠️ chunk 以「開啟前後的 `/_next/static/chunks/*.js` 差集」反解，**不硬編 build hash**。
// 執行：先 `pnpm run build`（帶 `NEXT_PUBLIC_REALTIME_ADAPTER=guildhub`），起 `next start`，再
//   `FRONTEND=http://127.0.0.1:<port> node tests/e2e/load-order.mjs`。

import { chromium } from 'playwright-core'
import {
  assertLoopback,
  guardLoopback,
  fakeRealtime,
  fakeRest,
  waitForWorld,
  traceResources,
  chunksIn,
  profile,
  ok,
  bad,
  failureCount,
} from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
assertLoopback(FRONTEND)
const VIEWPORT = { width: 1280, height: 720 }
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
const ME = profile(1, '我')
const ROOMS = []
/** Canvas ready 的訊號：`WorldBoundary` 的連續載入層在 Canvas `onCreated` 前 MUST NOT 卸載（S01），所以它消失＝ready。 */
const READY = '[data-testid="world-load-sequence"]'

const browser = await chromium.launch({ headless: process.env.HEADED !== '1', args: ARGS })

/** 面板要用到的 REST 也一起偽造（訊息、依 id 取 profile）—— 面板殼掛載時會打，沒偽造會落到 next start 的 handler。 */
async function routeAll(page, me = { current: ME }) {
  await fakeRest(page, me, ROOMS)
  await page.route('**/api/messages*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/profiles/*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }))
}

async function newContext() {
  const requests = []
  const sockets = []
  const context = await browser.newContext({ viewport: VIEWPORT })
  guardLoopback(context)
  traceResources(context, requests)
  await fakeRealtime(context, sockets)
  return { context, requests, sockets }
}

// ───────────────────────────── S01/S02/S03/S07：拓撲次序 barrier ─────────────────────────────
async function barrier() {
  const { context, requests, sockets } = await newContext()

  // Canvas ready 的**即時**時刻：載入層一被移除（＝`onCreated`）就由注入的 MutationObserver 立刻回報，
  // 用 `performance.now()`（跟 socket／route 同一個 Node 時鐘）。⚠️ **不要事後 `waitForSelector(detached)` 再取時刻** ——
  // 那是輪詢、偏晚，會晚於 ready 後才發生的 ws／rooms，把次序量反（實測踩過）。MutationObserver 的 callback 是 commit
  // 後的 microtask，早於 `useEffect`（ws 連線／`useRooms` 都在 effect），所以 `tReady < tWs`、`tReady < tRooms` 成立。
  let tReady = 0
  await context.exposeBinding('__guildhubReady', () => {
    if (tReady === 0) tReady = performance.now()
  })
  await context.addInitScript(() => {
    window.__seenLoader = false
    new MutationObserver(() => {
      const present = document.querySelector('[data-testid="world-load-sequence"]') !== null
      if (present) window.__seenLoader = true
      else if (window.__seenLoader) window.__guildhubReady()
    }).observe(document, { childList: true, subtree: true })
  })

  const page = await context.newPage()

  // 身分先壓住（`/api/me` 不回），模擬「身分未 settled」那段窗。route 用 `performance.now()` 記時刻 —— 跟 socket 記錄同一個 Node 時鐘。
  let releaseIdentity = () => {}
  const held = new Promise((resolve) => {
    releaseIdentity = resolve
  })
  let tIdentity = 0
  let tRooms = 0
  await page.route('**/api/me', async (r) => {
    await held
    if (tIdentity === 0) tIdentity = performance.now()
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) })
  })
  await page.route('**/api/rooms', async (r) => {
    if (tRooms === 0) tRooms = performance.now()
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROOMS) })
  })
  await page.route('**/api/profiles?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/projects?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

  await page.goto(`${FRONTEND}/world`, { waitUntil: 'commit' })

  // S01：身分未 settled → DOM 殼（app-header）與 role=status 載入層都在，且沒有 <canvas>。
  await page.waitForSelector('[data-testid="app-header"]', { timeout: 10_000 })
  const loader = await page.$(`${READY}[role="status"]`)
  if (loader !== null) ok('[FE-X15-S01] 身分未 settled：DOM 殼（app-header）＋ role=status 載入層都在')
  else bad('[FE-X15-S01] 身分未 settled 時沒有 role=status 載入層（尺或殼壞了）')
  if ((await page.$('canvas')) === null) ok('[FE-X15-S01] 身分未 settled 時 DOM 中沒有 <canvas>')
  else bad('[FE-X15-S01] 身分未 settled 時就已經有 <canvas>')

  // S02（前半）／S03／S07：身分未 settled（Canvas 必未 ready）時，3D chunk／WS／房間清單都還沒發生。
  const chunksWhileUnknown = chunksIn(requests).size
  if (sockets.length === 0) ok('[FE-X15-S03] 身分未 settled 時沒有任何 WebSocket 連線')
  else bad('[FE-X15-S03] 身分未 settled 時就建立了 WebSocket', `sockets=${sockets.length}`)
  if (tRooms === 0) ok('[FE-X15-S07] 身分未 settled 時沒有請求 GET /api/rooms')
  else bad('[FE-X15-S07] 身分未 settled 時就請求了房間清單')

  // 放行身分 → 世界推進到 Canvas ready（載入層消失，MutationObserver 立刻記 `tReady`）。
  releaseIdentity()
  await page.waitForSelector(READY, { state: 'detached', timeout: 30_000 })
  await waitFor(() => tReady > 0, 5_000)
  if (tReady === 0) bad('[FE-X15] 量尺壞了：載入層移除了但沒收到 ready 回報')

  // S02（後半）：身分 settled 之後才多出 3D chunk，且 <canvas> 出現。
  if (chunksIn(requests).size > chunksWhileUnknown) ok('[FE-X15-S02] 3D chunk 只在身分 settled 之後才被請求')
  else bad('[FE-X15-S02] 身分 settled 前後 chunk 數沒變（3D chunk 沒有延後，或尺沒抓到）')
  if ((await page.$('canvas')) !== null) ok('[FE-X15-S02] Canvas ready 後 <canvas> 出現')
  else bad('[FE-X15-S02] Canvas ready 後仍然沒有 <canvas>')
  if (tIdentity > 0 && tIdentity < tReady) ok('[FE-X15-S02] 次序：身分回應早於 Canvas ready')
  else bad('[FE-X15-S02] 次序不對：身分回應不早於 Canvas ready', `tIdentity=${tIdentity.toFixed(1)} tReady=${tReady.toFixed(1)}`)

  // S03：WS 連線在 Canvas ready 之後。等 socket 出現（ready 後 RemoteWorld 才掛、才連）。
  await page.waitForFunction(() => true).catch(() => {})
  const gotSocket = await waitFor(() => sockets.length >= 1, 5_000)
  if (gotSocket && sockets[0].t >= tReady) ok('[FE-X15-S03] WebSocket 在 Canvas ready 之後才連線')
  else if (gotSocket) bad('[FE-X15-S03] WebSocket 早於 Canvas ready', `tWs=${sockets[0].t.toFixed(1)} tReady=${tReady.toFixed(1)}`)
  else bad('[FE-X15-S03] Canvas ready 後沒有建立 WebSocket 連線')

  if (process.env.LODEBUG) console.log(`DEBUG times: tIdentity=${tIdentity.toFixed(1)} tReady=${tReady.toFixed(1)} tWs=${(sockets[0]?.t ?? 0).toFixed(1)} tRooms=${tRooms.toFixed(1)}`)
  // S07：房間清單在 Canvas ready 之後。
  const gotRooms = await waitFor(() => tRooms > 0, 5_000)
  if (gotRooms && tRooms >= tReady) ok('[FE-X15-S07] GET /api/rooms 在 Canvas ready 之後才請求')
  else if (gotRooms) bad('[FE-X15-S07] 房間清單早於 Canvas ready', `tRooms=${tRooms.toFixed(1)} tReady=${tReady.toFixed(1)}`)
  else bad('[FE-X15-S07] Canvas ready 後沒有請求房間清單')

  await context.close()
}

// ───────────────────────────── S04：面板 entry chunk 按開啟意圖才載入，只載目標 ─────────────────────────────

/** 開啟前後的 chunk 差集 ＝ 這個面板的 entry chunk（含它專屬、平面世界頁不會載的分割）。同一個分頁量，最乾淨。 */
async function learnBySamePage(openFn, rootSel, label) {
  const { context, requests } = await newContext()
  const page = await context.newPage()
  await routeAll(page)
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  const before = chunksIn(requests)
  await openFn(page)
  await page.waitForSelector(rootSel, { timeout: 10_000 })
  await page.waitForTimeout(500)
  const added = [...chunksIn(requests)].filter((u) => !before.has(u))
  await context.close()
  if (added.length === 0) bad(`[FE-X15-S04] 開啟「${label}」沒有多載任何 chunk（面板碼沒被分割出去？）`)
  return new Set(added)
}

/** 看板沒有標題列按鈕：用深連結 `?panel=projects` 開啟。跨頁差集（同一個 build，chunk hash 穩定）。 */
async function learnBoard() {
  const plain = await newContext()
  let page = await plain.context.newPage()
  await routeAll(page)
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  const plainChunks = chunksIn(plain.requests)
  await plain.context.close()

  const deep = await newContext()
  page = await deep.context.newPage()
  await routeAll(page)
  await page.goto(`${FRONTEND}/world?panel=projects`)
  await waitForWorld(page)
  await page.waitForSelector('[data-testid="list-panel"]', { timeout: 10_000 })
  await page.waitForTimeout(500)
  const added = [...chunksIn(deep.requests)].filter((u) => !plainChunks.has(u))
  await deep.context.close()
  if (added.length === 0) bad('[FE-X15-S04] 深連結開看板沒有多載任何 chunk（看板碼沒被分割出去？）')
  return { boardAdded: new Set(added), plainChunks }
}

async function panels() {
  const inbox = await learnBySamePage((p) => p.click('[data-testid="inbox-button"]'), '[data-testid="inbox-panel"]', '收件匣')
  const prof = await learnBySamePage((p) => p.click('[data-testid="identity"] button'), '[data-testid="profile-panel"]', '名片')
  const { boardAdded, plainChunks } = await learnBoard()

  // S04（前半）＋效能：平面世界頁（開啟意圖前）不含任何面板的 entry chunk。
  const leaked = [...inbox, ...prof, ...boardAdded].filter((u) => plainChunks.has(u))
  if (inbox.size > 0 && prof.size > 0 && boardAdded.size > 0 && leaked.length === 0)
    ok('[FE-X15-S04] 開啟意圖前：三個面板各有專屬 lazy chunk，且平面世界頁一個都沒載（初始 bundle 不含面板碼）')
  else bad('[FE-X15-S04] 面板 entry chunk 在開啟意圖前就被載入了', `leaked=${leaked.length}`)

  // S04（後半）：只開收件匣，不順帶載看板／名片。比對「各面板專屬（不與收件匣共用）」的 chunk。
  const boardOnly = [...boardAdded].filter((u) => !inbox.has(u) && !prof.has(u))
  const profOnly = [...prof].filter((u) => !inbox.has(u) && !boardAdded.has(u))
  if (process.env.LODEBUG) console.log(`DEBUG sizes: inbox=${inbox.size} prof=${prof.size} board=${boardAdded.size} boardOnly=${boardOnly.length} profOnly=${profOnly.length}`)

  const { context, requests } = await newContext()
  const page = await context.newPage()
  await routeAll(page)
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  await page.click('[data-testid="inbox-button"]')
  await page.waitForSelector('[data-testid="inbox-panel"]', { timeout: 10_000 })
  await page.waitForTimeout(500)
  const now = chunksIn(requests)
  await context.close()

  const inboxLoaded = [...inbox].some((u) => now.has(u))
  const boardLeaked = boardOnly.filter((u) => now.has(u))
  const profLeaked = profOnly.filter((u) => now.has(u))
  if (inboxLoaded) ok('[FE-X15-S04] 開收件匣：收件匣自己的 entry chunk 有被請求')
  else bad('[FE-X15-S04] 開收件匣卻沒有請求收件匣的 chunk（尺壞了）')
  // 防呆：看板／名片都要有「不與收件匣共用」的專屬 chunk，否則「沒順帶載」是空集恆真 —— 尺失去鑑別力就當紅。
  if (boardOnly.length === 0 || profOnly.length === 0)
    bad('[FE-X15-S04] 尺失去鑑別力：看板或名片沒有專屬 chunk 可比', `boardOnly=${boardOnly.length} profOnly=${profOnly.length}`)
  else if (boardLeaked.length === 0 && profLeaked.length === 0)
    ok('[FE-X15-S04] 開收件匣不順帶載看板／名片的 entry chunk')
  else bad('[FE-X15-S04] 開收件匣卻順帶載了別的面板', `board=${boardLeaked.length} profile=${profLeaked.length}`)
}

async function waitFor(cond, timeout) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return cond()
}

try {
  await barrier()
  await panels()
} finally {
  await browser.close()
}

process.exit(failureCount() === 0 ? 0 : 1)
