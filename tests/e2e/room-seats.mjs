// `FE-J13-S05` 的瀏覽器驗收：兩個人各自進房、都走到 0 號站位、A 按 E 坐 0 號、B 搶 0 號被拒、B 坐 1 號、A 30 秒內看到、A 重新整理仍在 0 號。
// 規格 `openspec/changes/fe-j13-sit-walk-in/specs/room-seats/spec.md`〈真瀏覽器裡兩個人各自進房、坐位、看到彼此〉。
//
// ⚠️ **入座是空間動作，不是按鈕**（`fe-j13-sit-walk-in`）：坐下 = 走到座位旁的**站位**、面對它、按 E。
// 這支腳本因此**走過去按 E**，不再點常駐按鈕（那顆按鈕已移除）。順帶驗 `FE-J13-S02` 的頭號防線：**走近不送 `POST`、只有按 E 才送**。
//
// 真的瀏覽器、真的 Route Handler、真的 Postgres（`internal`）：身分、發案、成軍、`enter`、`seats`、`profiles` 全部是真的。
// **只偽造兩樣**：WebSocket（`routeWebSocket`，協定沒有座位事件、跟座位無關）與 `GET /api/rooms`（只回這一間＋一扇誘餌門，
// 讓走廊的門位置固定，`walker` 才走得到；資料庫裡別的案子不進走廊）。**只打本機自己起的 `next start`**（`assertLoopback`／`guardLoopback`）。
//
// 房間裡沒有門標籤當尺 —— 走位改用**角色自己回報給（假）socket 的位置**（`lastReportedPosition`，move frame，換回世界單位）當里程計，
// 跟大廳的門標籤里程計是兩把尺、同一個道理（只設步數上限、不按固定毫秒）。站位座標對齊 `projectRoomLayout` 的 `STATION`（0／1 號都在西側）。
//
// 用法（跟 `form-team.mjs` 一樣）：pnpm run db:reset → NEXT_PUBLIC_REALTIME_ADAPTER=guildhub 的 build → next start 3101
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/room-seats.mjs
//
// ⚠️ 「A 30 秒內看到」等的是輪詢（`SEATS_POLL_MS`），上限 40 秒；不按固定毫秒判定，只設上限。

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, fakeRealtime, guardLoopback, lastReportedPosition, ok, promptText, waitForWorld, walker, walkLeg } from './lib/world.mjs'

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
const CLAIM = '入座'
const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))
const marker = (page, i) => page.locator(`[data-testid="seat-marker"][data-seat-index="${i}"]`)
const markerText = (page, i) => marker(page, i).textContent().catch(() => null)
const isMine = (page, i) => marker(page, i).getAttribute('data-mine').then((v) => v === 'true').catch(() => false)
const feedback = (page) => page.$eval('[data-testid="seat-feedback"]', (n) => ({ role: n.getAttribute('role'), kind: n.dataset.kind, text: n.textContent ?? '' })).catch(() => null)

// 站位座標，對齊 `projectRoomLayout` 的 `STATION`（`stanceX=2.5`、`firstZ=5`、`pitchZ=4`；0–3 在西側 x=-2.5）。這支只用得到 0／1 號、都在西。
const STANCE = { stanceX: 2.5, firstZ: 5, pitchZ: 4 }
const stanceOf = (i) => ({ x: -STANCE.stanceX, z: STANCE.firstZ - (i % 4) * STANCE.pitchZ })

await mkdir(OUT, { recursive: true })
// ⚠️ **兩個人各開一個瀏覽器（兩個 process）**，不是同一個瀏覽器兩個 context：同站的兩頁共用一個 renderer，後開的那頁拿走焦點、
// 前一頁的鍵盤送到了角色卻不動；兩頁一起畫 3D（swiftshader）時 rAF 掉到 8 fps、門標籤的投影根本沒寫進 DOM（實測三次）。
const launch = () => chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const browsers = []

/** 一個人：自己的 context、建身分、進世界。`rooms` 是一個盒子，成軍之後才知道 project id。 */
async function person(name, rooms) {
  const browser = await launch()
  browsers.push(browser)
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  guardLoopback(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const sockets = []
  fakeRealtime(context, sockets)
  await context.route('**/api/rooms', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rooms.current) }))
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', name)
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForURL('**/world', { timeout: 30_000 })
  await waitForWorld(page)
  return { context, page, name, sockets, posts: 0 }
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

/**
 * 角色吃不吃鍵盤，看**自己回報給（假）socket 的位置**有沒有變 —— 不看門標籤：門在畫面邊緣時標籤放不進畫面、投影根本不寫（`labelRectFor` 回 null），
 * 拿它當「沒動」的證據會誤判（實測）。沒動就點一下世界再試（最多 4 次）：後開的分頁會拿走焦點，鍵盤送到了角色卻不動。
 */
async function ensureKeyboardMoves(who) {
  const { page, sockets, name } = who
  const socket = () => sockets[sockets.length - 1]
  for (let i = 0; i < 4; i++) {
    const before = lastReportedPosition(socket())
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(250)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(600)
    const after = lastReportedPosition(socket())
    if (before !== null && after !== null && Math.abs(after.x - before.x) > 0.05) {
      if (i > 0) console.log(`   （${name} 點了 ${i} 次才吃到鍵盤）`)
      // 走回去（往西同樣久），讓 walker 從出生點附近開始
      await page.keyboard.down('ArrowLeft')
      await page.waitForTimeout(250)
      await page.keyboard.up('ArrowLeft')
      await page.waitForTimeout(300)
      return
    }
    await page.mouse.click(640, 300)
    await page.waitForTimeout(300)
  }
  throw new Error(`${name} 的角色不吃鍵盤（點了 4 次）：${JSON.stringify({ before: lastReportedPosition(socket()), frames: socket()?.sent.length })}`)
}

/** 從大廳走到門前、按 E、輸入密碼、等過場結束、等座位標籤。進門後開始數這個人送出的 `POST .../seats`（`S02` 走近不送的證據）。 */
async function enterRoom(who, room) {
  const { page } = who
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  // 兩個 context 同開時，後開的那頁拿走了瀏覽器的焦點：前一頁的 `keyboard.down` 送到了、視窗卻不算 focused，角色不動（實測：`hasFocus()` 仍是 true，點一下才會動）。
  await ensureKeyboardMoves(who)
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
  // 進門後才開始數（成軍那一段本來就沒有 seats POST；只想證明「進房走近座位」不會偷送）
  who.context.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith(`/api/projects/${room}/seats`)) who.posts += 1
  })
  ok(`[S05] ${who.name} 從門口輸入密碼進了房間`)
}

/**
 * 走到 `seatIndex` 號座位的站位、面對它，回**當下的互動提示文字**（沒有就 null）。
 * 里程計是角色回報給 socket 的位置；先對齊 z（南北），再往西對齊 x —— 最後那一步往西，角色面朝西（座位在西側），提示才選得到它。
 * 出現「入座」提示就停（走近不用貼死站位）；一路沒提示（例如自己已有座位、那格沒有互動目標）就走到站位停下。
 */
async function walkToStance(who, seatIndex) {
  const { page, sockets } = who
  const socket = () => sockets[sockets.length - 1]
  const target = stanceOf(seatIndex)
  const tol = 0.4
  const where = async () => lastReportedPosition(socket())
  await walkLeg(page, {
    label: `走到 ${seatIndex} 號座位的 z`,
    where,
    holdMs: 150,
    maxSteps: 50,
    out: OUT,
    steer: (p) => {
      if (p === null) return { code: 'ArrowUp', ms: 80 }
      if (p.z > target.z + tol) return 'ArrowUp'
      if (p.z < target.z - tol) return 'ArrowDown'
      return null
    },
  })
  await walkLeg(page, {
    label: `走近 ${seatIndex} 號座位`,
    where,
    holdMs: 150,
    maxSteps: 50,
    out: OUT,
    steer: async (p) => {
      const t = await promptText(page)
      if (t !== null && t.includes(CLAIM)) return null
      if (p === null) return { code: 'ArrowLeft', ms: 80 }
      if (p.x > target.x + tol) return 'ArrowLeft'
      if (p.x < target.x - tol) return 'ArrowRight'
      return null
    },
  })
  return promptText(page)
}

/** 站在站位上按 E（可連按幾次驗「只送一次」），等 `POST .../seats` 的回應。回那個 response。 */
async function pressSit(who, room, { presses = 1 } = {}) {
  const posted = who.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/projects/${room}/seats`), { timeout: 15_000 })
  for (let i = 0; i < presses; i++) await who.page.keyboard.press('KeyE')
  return posted
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
  // A 走的時候 B 先停在空白頁（少一個 3D 畫面的負載）；B 進房時 A 已在房間裡（那就是要觀察的畫面，不能離開）
  await B.page.goto('about:blank')
  await enterRoom(A, room)
  await enterRoom(B, room)
  for (const who of [A, B]) {
    check(`[S05] ${who.name}：0 號是空位`, (await markerText(who.page, 0))?.includes('空位'), true)
    check(`[S05] ${who.name}：1 號是空位`, (await markerText(who.page, 1))?.includes('空位'), true)
    check(`[S05] ${who.name}：只有 2 個座位標籤（seat_count=2）`, await who.page.locator('[data-testid="seat-marker"]').count(), 2)
  }
  await B.page.screenshot({ path: path.join(OUT, '1-both-empty.png') })

  // 兩人都走到 0 號站位 → 都看到「入座」提示
  check('[S05] A 走到 0 號站位看到「入座」提示', (await walkToStance(A, 0))?.includes(CLAIM), true)
  check('[S02] A 只是走近、還沒按 E：沒有送出任何 POST seats', A.posts, 0)

  // A 連按兩次 E → 只送一個 POST、201、0 號變自己的
  const aPosted = await pressSit(A, room, { presses: 2 })
  const aRes = await aPosted
  check('[S05] A 按 E 送出的 POST seats 是 201', aRes.status(), 201)
  check('[S02] A 連按兩次 E 只送出一個 POST', A.posts, 1)
  await A.page.waitForSelector('[data-testid="seat-marker"][data-seat-index="0"][data-mine="true"]', { timeout: 10_000 })
  check('[S05] A 的 0 號標成自己的、有自己的名字', (await markerText(A.page, 0))?.includes(A_NAME) && (await isMine(A.page, 0)), true)
  await A.page.screenshot({ path: path.join(OUT, '2-a-seated.png') })

  // A 已有座位：走到 1 號空位不再有「入座」提示（一人一格，不換座）
  check('[S05] A 已有座位：走到 1 號空位沒有入座提示', (await walkToStance(A, 1))?.includes(CLAIM) ?? false, false)

  // B 的畫面還是舊的（沒等輪詢）：走到 0 號站位仍看到「入座」，按 E 搶 0 號 → 409 → 重取
  check('[S05] B 走到 0 號站位（畫面還是舊的）仍看到「入座」', (await walkToStance(B, 0))?.includes(CLAIM), true)
  check('[S05] B 還沒看到 A 坐下（0 號畫面是空位）', (await markerText(B.page, 0))?.includes('空位'), true)
  const bPosted0 = await pressSit(B, room)
  check('[S05] B 搶 0 號的 POST seats 是 409', (await bPosted0).status(), 409)
  await B.page.waitForSelector('[data-testid="seat-feedback"]', { timeout: 10_000 })
  const fb = await feedback(B.page)
  check('[S05] B 看到「被搶」的回饋（status／seat-taken）', fb?.role === 'status' && fb?.kind === 'seat-taken', true)
  await B.page.waitForFunction((n) => document.querySelector('[data-testid="seat-marker"][data-seat-index="0"]')?.textContent?.includes(n), A_NAME, { timeout: 10_000 })
  const b0 = await markerText(B.page, 0)
  check('[S05] B 的 0 號變成 A 的名字（不是空位、不是 id）', b0?.includes(A_NAME) && !b0.includes('空位') && !/[0-9a-f]{8}-/.test(b0), true)
  await B.page.screenshot({ path: path.join(OUT, '3-b-seat-taken.png') })

  // B 走到 1 號站位按 E → 201
  check('[S05] B 走到 1 號站位看到「入座」提示', (await walkToStance(B, 1))?.includes(CLAIM), true)
  const bPosted1 = await pressSit(B, room)
  check('[S05] B 坐 1 號的 POST seats 是 201', (await bPosted1).status(), 201)
  await B.page.waitForSelector('[data-testid="seat-marker"][data-seat-index="1"][data-mine="true"]', { timeout: 10_000 })
  check('[S05] B 的 1 號是自己的', (await markerText(B.page, 1))?.includes(B_NAME), true)

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
  check('[S05] 標籤不在 Canvas 裡', await A.page.evaluate(() => document.querySelector('canvas')?.contains(document.querySelector('[data-testid="seat-marker"]')) ?? true), false)
  await A.page.screenshot({ path: path.join(OUT, '5-a-reloaded.png') })
  // 提示：桌子不是互動物件（標籤不進互動系統）
  check('[S05] 房間裡沒有互動提示指著桌子', ((await promptText(A.page)) ?? '').includes('桌'), false)

  await A.context.close()
  await B.context.close()
} catch (err) {
  bad('腳本中途拋出', err instanceof Error ? (err.stack ?? err.message) : String(err))
} finally {
  for (const b of browsers) await b.close()
}
if (failureCount() > 0) {
  console.log(`\n${failureCount()} 條沒過`)
  process.exit(1)
}
console.log('\n全部通過')
