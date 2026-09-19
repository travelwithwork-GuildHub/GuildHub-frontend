// `FE-J13-S05` 的瀏覽器驗收：兩個人各自進房、A 坐 0 號、B 搶 0 號被拒、B 坐 1 號、A 30 秒內看到、A 重新整理仍在 0 號。
// 規格 `openspec/changes/fe-j13-seats/specs/room-seats/spec.md`〈真瀏覽器裡兩個人各自進房、坐位、看到彼此〉。
//
// 真的瀏覽器、真的 Route Handler、真的 Postgres（`internal`）：身分、發案、成軍、`enter`、`seats`、`profiles` 全部是真的。
// **只偽造兩樣**：WebSocket（`routeWebSocket`，協定沒有座位事件、跟座位無關）與 `GET /api/rooms`（只回這一間＋一扇誘餌門，
// 讓走廊的門位置固定，`walker` 才走得到；資料庫裡別的案子不進走廊）。**只打本機自己起的 `next start`**（`assertLoopback`／`guardLoopback`）。
//
// 用法（跟 `form-team.mjs` 一樣）：pnpm run db:reset → NEXT_PUBLIC_REALTIME_ADAPTER=guildhub 的 build → next start 3101
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/room-seats.mjs
//
// ⚠️ 「A 30 秒內看到」等的是輪詢（`SEATS_POLL_MS`），上限 40 秒；不按固定毫秒判定，只設上限。

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, fakeRealtime, guardLoopback, ok, promptText, waitForWorld, walker } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-room-seats-shots'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const TITLE = `座位測試 ${new Date().toISOString().slice(11, 19)} ${randomUUID().slice(0, 8)}`
const PASSWORD = 'seat-1234'
// 走廊依 `project_id` 字典序排（`ordering.ts`）：誘餌要排在真房間**之後**（slot 1），字典序最大的 UUID
const DECOY = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const A_NAME = '座位甲'
const B_NAME = '座位乙'
const DIALOG = '[data-testid="room-password-dialog"]'
const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))
const marker = (page, i) => page.locator(`[data-testid="seat-marker"][data-seat-index="${i}"]`)
const markerText = (page, i) => marker(page, i).textContent().catch(() => null)
const isMine = (page, i) => marker(page, i).getAttribute('data-mine').then((v) => v === 'true').catch(() => false)
const claimButton = (page, i) => marker(page, i).locator('button', { hasText: '入座' })
const claimCount = (page) => page.locator('[data-testid="seat-marker"] button', { hasText: '入座' }).count()
const feedback = (page) => page.$eval('[data-testid="seat-feedback"]', (n) => ({ role: n.getAttribute('role'), kind: n.dataset.kind, text: n.textContent ?? '' })).catch(() => null)

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/**
 * 兩個人同時畫 3D（swiftshader）會讓走位的相機收斂不了（`settle` 20 輪不穩 —— 實測第二次起就紅）。
 * 一個人走的時候把另一個人的分頁**凍住**（CDP `Page.setWebLifecycleState`：rAF／timer 都停），走完再解凍；判準都在解凍之後量。
 */
async function frozen(who, value) {
  const cdp = await who.context.newCDPSession(who.page)
  await cdp.send('Page.setWebLifecycleState', { state: value ? 'frozen' : 'active' })
  await cdp.detach()
}

/** 一個人：自己的 context、建身分、進世界。`rooms` 是一個盒子，成軍之後才知道 project id。 */
async function person(name, rooms) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  guardLoopback(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  fakeRealtime(context, [])
  await context.route('**/api/rooms', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rooms.current) }))
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', name)
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  await page.click('button:has-text("複製鑰匙")')
  await page.waitForSelector('[role="status"]:has-text("已經複製")', { timeout: 15_000 })
  await page.click('button:has-text("進入世界")')
  await page.waitForURL('**/world', { timeout: 30_000 })
  await waitForWorld(page)
  return { context, page, name }
}

/** owner 在面板裡發案（座位 2）並成軍，回 project id。 */
async function createAndForm(page) {
  await page.goto(`${FRONTEND}/world?panel=projects`)
  await waitForWorld(page)
  const panel = page.getByTestId('list-panel')
  await panel.getByRole('button', { name: '發案', exact: true }).click()
  const form = page.getByTestId('create-project-form')
  await form.getByLabel('標題').fill(TITLE)
  await form.getByLabel('內容').fill('座位 e2e 用的案子。')
  await form.getByLabel('座位數').fill('2')
  await form.getByRole('button', { name: '送出' }).click()
  await page.waitForSelector('[data-testid="create-project-form"]', { state: 'detached', timeout: 15_000 })
  await page.waitForFunction((t) => document.querySelector('[data-testid="list-panel-list"] li [data-testid="project-card-title"]')?.textContent?.includes(t), TITLE, { timeout: 15_000 })
  const projectId = await page.$eval('[data-testid="list-panel-list"] li [data-testid="project-card"]', (n) => n.getAttribute('data-project-id'))
  await page.locator(`[data-testid="project-card"][data-project-id="${projectId}"]`).click()
  await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 10_000 })
  const detail = page.getByTestId('project-detail')
  await detail.getByRole('button', { name: '成軍', exact: true }).click()
  await detail.getByLabel('房間密碼').fill(PASSWORD)
  await detail.getByRole('button', { name: '確定成軍' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="project-detail"] [data-testid="project-status"]')?.textContent === '已成軍', null, { timeout: 15_000 })
  return projectId
}

/** 從大廳走到門前、按 E、輸入密碼、等過場結束、等座位標籤。 */
async function enterRoom(who, room) {
  const { page } = who
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  // 兩個 context 同開時，後開的那頁拿走了瀏覽器的焦點：前一頁的 `keyboard.down` 送到了、視窗卻不算 focused，角色不動（實測：`hasFocus()` 仍是 true，點一下才會動）。
  await page.bringToFront()
  await page.mouse.click(640, 300)
  await page.waitForTimeout(200)
  const { approachDoor } = walker({ room, decoy: DECOY, title: TITLE, out: OUT })
  const { prompt } = await approachDoor(page)
  if (prompt === null || !prompt.includes(TITLE)) throw new Error(`${who.name} 不在門前（提示是「${prompt}」）`)
  await page.keyboard.press('KeyE')
  await page.waitForSelector(DIALOG, { state: 'visible', timeout: 5_000 })
  await page.fill(`${DIALOG} input[name="password"]`, PASSWORD)
  await page.click(`${DIALOG} button[type="submit"]`)
  await page.waitForURL(`**/world?room=${room}`, { timeout: 15_000 })
  await page.waitForSelector('[data-testid="scene-transition"]', { state: 'detached', timeout: 15_000 })
  await page.waitForSelector('[data-testid="seat-marker"][data-seat-index="0"]', { timeout: 15_000 })
  await page.waitForTimeout(800)
  ok(`[S05] ${who.name} 從門口輸入密碼進了房間`)
}

try {
  const rooms = { current: [] }
  const A = await person(A_NAME, rooms)
  const B = await person(B_NAME, rooms)
  ok('[S05] A、B 各自建立了身分')
  const room = await createAndForm(A.page)
  rooms.current = [
    { project_id: room, title: TITLE, online_count: 1 },
    { project_id: DECOY, title: '誘餌門（不存在的案子）', online_count: 0 },
  ]
  ok(`[S05] A 發案並成軍：${room}（座位 2、密碼已知）`)

  // 效能觀察（不是判準）：A 從進房到重新整理前打了哪些 /api/（design D6：進房 project＋seats 各一、每 30 秒 seats 一次、每個占用者一次 profile）
  const apiHits = []
  const onRequest = (r) => { if (r.url().includes('/api/')) apiHits.push(`${r.method()} ${new URL(r.url()).pathname.replace(room, '<room>').replace(/[0-9a-f-]{36}/, '<id>')}`) }
  A.context.on('request', onRequest)
  await frozen(B, true)
  await enterRoom(A, room)
  await frozen(B, false)
  await frozen(A, true)
  await enterRoom(B, room)
  await frozen(A, false)
  await A.page.waitForTimeout(1000)
  for (const who of [A, B]) {
    check(`[S05] ${who.name}：0 號是空位`, (await markerText(who.page, 0))?.includes('空位'), true)
    check(`[S05] ${who.name}：1 號是空位`, (await markerText(who.page, 1))?.includes('空位'), true)
    check(`[S05] ${who.name}：0 號與 1 號都有「入座」`, await claimCount(who.page), 2)
    check(`[S05] ${who.name}：2 號以外沒有標籤`, await who.page.locator('[data-testid="seat-marker"]').count(), 2)
  }
  await B.page.screenshot({ path: path.join(OUT, '1-both-empty.png') })

  // A 坐 0 號
  const posted = A.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/projects/${room}/seats`), { timeout: 10_000 })
  await claimButton(A.page, 0).click()
  const post = await posted
  check('[S05] A 的 POST seats 是 201', post.status(), 201)
  await A.page.waitForSelector('[data-testid="seat-marker"][data-seat-index="0"][data-mine="true"]', { timeout: 10_000 })
  check('[S05] A 的 0 號標成自己的、有自己的名字', (await markerText(A.page, 0))?.includes(A_NAME) && (await isMine(A.page, 0)), true)
  check('[S05] A 已有座位：畫面沒有任何「入座」', await claimCount(A.page), 0)
  await A.page.screenshot({ path: path.join(OUT, '2-a-seated.png') })

  // B 的畫面還是舊的（沒等輪詢）：立刻搶 0 號 → 409 → 重取
  check('[S05] B 還沒看到 A 坐下（畫面是舊的）', (await markerText(B.page, 0))?.includes('空位'), true)
  const postedB = B.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/projects/${room}/seats`), { timeout: 10_000 })
  await claimButton(B.page, 0).click()
  check('[S05] B 的 POST seats 是 409', (await postedB).status(), 409)
  await B.page.waitForSelector('[data-testid="seat-feedback"]', { timeout: 10_000 })
  const fb = await feedback(B.page)
  check('[S05] B 看到「被搶」的回饋（status／seat-taken）', fb?.role === 'status' && fb?.kind === 'seat-taken', true)
  await B.page.waitForFunction((n) => document.querySelector('[data-testid="seat-marker"][data-seat-index="0"]')?.textContent?.includes(n), A_NAME, { timeout: 10_000 })
  const b0 = await markerText(B.page, 0)
  check('[S05] B 的 0 號變成 A 的名字（不是空位、不是 id）', b0?.includes(A_NAME) && !b0.includes('空位') && !/[0-9a-f]{8}-/.test(b0), true)
  check('[S05] B 的 1 號「入座」可按', await claimButton(B.page, 1).isEnabled(), true)
  await B.page.screenshot({ path: path.join(OUT, '3-b-seat-taken.png') })

  // B 坐 1 號
  await claimButton(B.page, 1).click()
  await B.page.waitForSelector('[data-testid="seat-marker"][data-seat-index="1"][data-mine="true"]', { timeout: 10_000 })
  check('[S05] B 的 1 號是自己的', (await markerText(B.page, 1))?.includes(B_NAME), true)
  check('[S05] B 已有座位：沒有「入座」', await claimCount(B.page), 0)

  // A 在 30 秒內（輪詢）看到 1 號是 B
  const t0 = Date.now()
  const seen = await A.page.waitForFunction((n) => document.querySelector('[data-testid="seat-marker"][data-seat-index="1"]')?.textContent?.includes(n), B_NAME, { timeout: 40_000 }).then(() => true).catch(() => false)
  const waited = ((Date.now() - t0) / 1000).toFixed(1)
  check(`[S05] A 在 30 秒內看到 1 號是 B 的名字（等了 ${waited} 秒）`, seen && Date.now() - t0 <= 31_000, true)
  await A.page.screenshot({ path: path.join(OUT, '4-a-sees-b.png') })

  A.context.off('request', onRequest)
  const tally = [...apiHits.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map())].map(([k, n]) => `${k} ×${n}`)
  console.log(`   A 在房間裡的 /api/ 請求（${apiHits.length}）：${tally.join('、')}`)

  // A 重新整理：票在 sessionStorage、座位在後端
  await A.page.goto(`${FRONTEND}/world?room=${room}`)
  await waitForWorld(A.page)
  await A.page.waitForSelector('[data-testid="scene-transition"]', { state: 'detached', timeout: 15_000 }).catch(() => {})
  await A.page.waitForSelector('[data-testid="seat-marker"][data-seat-index="0"]', { timeout: 15_000 })
  await A.page.waitForTimeout(800)
  check('[S05] 重新整理後 0 號仍是 A 的', (await isMine(A.page, 0)) && (await markerText(A.page, 0))?.includes(A_NAME), true)
  check('[S05] 重新整理後 1 號是 B 的', (await markerText(A.page, 1))?.includes(B_NAME), true)
  check('[S05] 重新整理後沒有任何「入座」', await claimCount(A.page), 0)
  check('[S05] 標籤不在 Canvas 裡', await A.page.evaluate(() => document.querySelector('canvas')?.contains(document.querySelector('[data-testid="seat-marker"]')) ?? true), false)
  await A.page.screenshot({ path: path.join(OUT, '5-a-reloaded.png') })
  // 提示：桌子不是互動物件（標籤不進互動系統）
  check('[S05] 房間裡沒有互動提示指著桌子', ((await promptText(A.page)) ?? '').includes('桌'), false)

  await A.context.close()
  await B.context.close()
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
