// `FE-K05-S08` 的瀏覽器驗收：A 設狀態 B 看到、A 清除 B 看不到、兩人進房後 B 仍看到 A 的狀態（重送）。
// 規格 `openspec/changes/fe-k05-status/specs/player-status/spec.md`〈真瀏覽器裡兩個人互見狀態、清除、換場景後仍在〉。
//
// **兩個瀏覽器 process**（同一個瀏覽器兩個 context 會互搶焦點，`room-seats.mjs` 踩過）。REST 與 WS 全偽造（`page.route`／`routeWebSocket`），
// **只打本機自起的 `next start`**；「伺服器」是這支腳本：A 的假 socket 收到 `status` 就回聲給 A、轉成 `status` 廣播給 B；每條新連線的 snapshot
// 裡 A 的 `st` 是空的（模擬伺服器 `join` 清空），所以 B 在房間裡看得到 A 的狀態**只能**靠 A 重送。
// 進房是**站內的場景切換**（持票、走到門前按 E → 過場 → 新的一條 socket），不是整頁導覽 —— 重新整理會把狀態清掉（規格的 Non-goal），那不是這條要驗的。
// 走位用 `walker`（門標籤當里程計）；鍵盤吃不吃看角色回報給假 socket 的位置（`room-seats.mjs` 的教訓：後開的分頁會拿走焦點）。
//
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/player-status.mjs

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, countOverlays, failureCount, fakeRest, guardLoopback, ok, profile, uuid, waitForTransition, waitForWorld, walker } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-player-status-shots'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const A = profile(51, '狀態甲')
const B = profile(52, '狀態乙')
const ROOM = uuid(7)
const ROOM_TITLE = '狀態測試房'
// 走廊依 `project_id` 字典序：誘餌排在真房間後面（slot 1）
const DECOY = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const ROOMS = [
  { project_id: ROOM, title: ROOM_TITLE, online_count: 2 },
  { project_id: DECOY, title: '誘餌門', online_count: 0 },
]
const TOKEN = 'e2e-ticket-K05'
const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))
const px = (n) => n * 32

await mkdir(OUT, { recursive: true })
const browsers = []
const launch = async () => {
  const b = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  browsers.push(b)
  return b
}

/**
 * 假伺服器：每個人一條「目前連線」。`status` 從 A 來 → 回聲給 A、廣播給 B（B 在同一個 scene 才轉）；反之亦然。
 * snapshot：自己（st 空）＋另一個人（**st 空** —— join 清空）。
 */
function fakeServer() {
  const conns = new Map() // who → { ws, scene }
  const moves = new Map() // who → 最後一筆 move（鍵盤有沒有效的證據）
  const statusText = new Map() // who → 目前伺服器上的狀態（每次 join 清空）
  const wire = (who, other, context) =>
    context.routeWebSocket(/\/ws(\?|$)/, (ws) => {
      const scene = new URL(ws.url()).searchParams.get('scene') ?? 'lobby'
      conns.set(who.id, { ws, scene })
      statusText.set(who.id, '')
      ws.send(JSON.stringify({ t: 'hello', you: who.id, hz: 10 }))
      const at = who === A ? { x: px(0), y: px(0) } : { x: px(2), y: px(1) }
      const otherAt = who === A ? { x: px(2), y: px(1) } : { x: px(0), y: px(0) }
      ws.send(JSON.stringify({ t: 'snapshot', players: [{ id: who.id, name: who.display_name, av: 0, ...at, f: 0, st: '' }, { id: other.id, name: other.display_name, av: 1, ...otherAt, f: 0, st: statusText.get(other.id) ?? '' }] }))
      ws.onMessage((raw) => {
        let m
        try { m = JSON.parse(String(raw)) } catch { return }
        if (m.t === 'move') moves.set(who.id, m)
        if (m.t !== 'status') return
        if (typeof m.text !== 'string' || m.text.length > 12) return // 伺服器靜默丟棄
        statusText.set(who.id, m.text)
        const out = JSON.stringify({ t: 'status', id: who.id, text: m.text })
        ws.send(out) // 回聲
        const peer = conns.get(other.id)
        if (peer && peer.scene === scene) peer.ws.send(out)
      })
    })
  return { wire, sent: () => statusText, moves, scenes: conns }
}

async function person(who, other, server) {
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  guardLoopback(context)
  await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [`guildhub.roomToken.${who.id}.${ROOM}`, TOKEN])
  const statusFrames = []
  await countOverlays(context)
  await server.wire(who, other, context)
  const page = await context.newPage()
  await fakeRest(page, { current: who }, ROOMS)
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  return { who, page, context, statusFrames }
}
const tagStatusOf = (page, id) => page.$eval(`[data-testid="name-tag"][data-player="${id}"]`, (n) => ({ status: n.querySelector('[data-testid="name-tag-status"]')?.textContent ?? null, h: n.querySelector('[data-testid="name-tag-name"]')?.getBoundingClientRect().height ?? null })).catch(() => null)
const waitTagStatus = (page, id, text) => page.waitForFunction(([i, t]) => (document.querySelector(`[data-testid="name-tag"][data-player="${i}"] [data-testid="name-tag-status"]`)?.textContent ?? null) === t, [id, text], { timeout: 8_000 }).then(() => true).catch(() => false)
/** 按一下方向鍵，角色回報的位置要動；沒動就點一下世界再試（最多 4 次）。 */
async function ensureKeyboardMoves(who, server) {
  const last = () => server.moves.get(who.who.id) ?? null
  for (let i = 0; i < 4; i++) {
    const before = last()
    await who.page.keyboard.down('ArrowRight')
    await who.page.waitForTimeout(250)
    await who.page.keyboard.up('ArrowRight')
    await who.page.waitForTimeout(600)
    const after = last()
    if (before !== null && after !== null && Math.abs(after.x - before.x) > 1) {
      if (i > 0) console.log(`   （${who.who.display_name} 點了 ${i} 次才吃到鍵盤）`)
      await who.page.keyboard.down('ArrowLeft')
      await who.page.waitForTimeout(250)
      await who.page.keyboard.up('ArrowLeft')
      await who.page.waitForTimeout(300)
      return
    }
    await who.page.mouse.click(640, 300)
    await who.page.waitForTimeout(300)
  }
  throw new Error(`${who.who.display_name} 的角色不吃鍵盤（點了 4 次）`)
}
/** 站內進房：走到門前、按 E（持票 → 直接過場）、等過場結束、等房間的名字牌。 */
async function enterRoom(who, server) {
  const { page } = who
  await ensureKeyboardMoves(who, server)
  const { approachDoor } = walker({ room: ROOM, decoy: DECOY, title: ROOM_TITLE, out: OUT })
  const { prompt } = await approachDoor(page)
  if (prompt === null || !prompt.includes(ROOM_TITLE)) throw new Error(`${who.who.display_name} 不在門前（提示是「${prompt}」）`)
  await page.keyboard.press('KeyE')
  await waitForTransition(page, `${who.who.display_name} 進房`, 0, 'S08')
  await page.waitForFunction(() => location.search.includes('room='), null, { timeout: 10_000 })
  ok(`[S08] ${who.who.display_name} 站內進了房間（${page.url().replace(/.*\?/, '?').replace(/[0-9a-f-]{36}/, '<id>')}）`)
}
const hud = (page) => page.$eval('[data-testid="status-hud"]', (n) => ({ current: n.dataset.current, pending: n.dataset.pending ?? null })).catch(() => null)

try {
  const server = fakeServer()
  const a = await person(A, B, server)
  const b = await person(B, A, server)
  // 名單是 snapshot 來的、牌子在 RemoteWorld 連上之後才長出來：等，不搶拍（第一版搶拍偶爾紅）
  const seeEachOther = await Promise.all([a.page.waitForSelector(`[data-testid="name-tag"][data-player="${B.id}"]`, { timeout: 10_000 }), b.page.waitForSelector(`[data-testid="name-tag"][data-player="${A.id}"]`, { timeout: 10_000 })]).then(() => true).catch(() => false)
  check('[S08] A、B 各自在大廳、互相在名單裡', seeEachOther, true)
  check('[S08] 一開始 B 看到的 A 沒有狀態', (await tagStatusOf(b.page, A.id))?.status, null)

  // A 設「趕工中」
  await a.page.click('[data-testid="status-hud"] button')
  await a.page.click('[data-testid="status-hud"] button:has-text("趕工中")')
  check('[S08] A 的 socket 收到 status 趕工中（伺服器上是這句）', server.sent().get(A.id), '趕工中')
  check('[S08] B 的畫面上 A 的牌子含「趕工中」', await waitTagStatus(b.page, A.id, '趕工中'), true)
  const t = await tagStatusOf(b.page, A.id)
  check('[S08] A 的名字盒仍是 28 px 高', t?.h, 28)
  await a.page.waitForFunction(() => document.querySelector('[data-testid="status-hud"]')?.dataset.current === '趕工中', null, { timeout: 5_000 }).catch(() => {})
  check('[S08] A 的控制在回聲後呈現目前狀態', (await hud(a.page))?.current, '趕工中')
  await b.page.screenshot({ path: path.join(OUT, '1-b-sees-a.png') })

  // A 清除
  await a.page.click('[data-testid="status-hud"] button:has-text("清除狀態")')
  check('[S08] 清除後 B 的畫面上 A 的牌子沒有狀態', await waitTagStatus(b.page, A.id, null), true)
  check('[S08] 伺服器上 A 的狀態是空的', server.sent().get(A.id), '')

  // A 再設「找人聊聊」，兩人各自進房（新連線；snapshot 裡 A 的 st 是空的 → 只能靠重送）
  await a.page.click('[data-testid="status-hud"] button:has-text("找人聊聊")')
  await a.page.waitForFunction(() => document.querySelector('[data-testid="status-hud"]')?.dataset.current === '找人聊聊', null, { timeout: 5_000 }).catch(() => {})
  // 一個人走的時候另一個先停在空白頁以外的低負載狀態不容易做（狀態在頁面記憶體裡），就讓兩個都活著、逐一走
  await enterRoom(a, server)
  await enterRoom(b, server)
  check('[S08] 進房後 A 的控制仍呈現「找人聊聊」（狀態是人的，不是場景的）', (await hud(a.page))?.current, '找人聊聊')
  check('[S08] 房間連線 ready 後 A 重送了「找人聊聊」（伺服器上又是這句）', server.sent().get(A.id), '找人聊聊')
  // B 進房時 snapshot 裡 A 的 st 已經是重送過的；不管誰先進，B 都要看到
  check('[S08] B 在房間裡看到 A 的牌子含「找人聊聊」', await waitTagStatus(b.page, A.id, '找人聊聊'), true)
  await b.page.screenshot({ path: path.join(OUT, '2-b-in-room-sees-a.png') })

  for (const who of [a, b]) await who.context.close()
} catch (err) {
  bad('腳本中途拋出', err instanceof Error ? (err.stack ?? err.message) : String(err))
} finally {
  for (const br of browsers) await br.close()
}
if (failureCount() > 0) {
  console.log(`\n${failureCount()} 條沒過`)
  process.exit(1)
}
console.log('\n全部通過')
