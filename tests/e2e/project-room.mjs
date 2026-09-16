// `FE-W16-S08` 的瀏覽器驗收：從門口出生、桌子有畫出來、遠端玩家在 seat 0 旁、沿通道走到北端、走到桌邊、撞桌子會停、繞到下一個站位。
// 規格 `openspec/changes/fe-w16-project-room/specs/project-room-layout/spec.md`。
//
// ⚠️ **這裡只驗 jsdom 驗不了的那幾句**：像素（桌面真的被畫出來、遠端玩家真的在那裡）、真的物理（撞桌子停在碰撞盒近側＋角色半徑）、
// 真的相機跟拍下的錨點投影。配置、錨點的接線、不互動都在 `tests/world-project-room-*.test.*`。
//
// **尺是工位錨點**（`data-seat-index`，`SeatAnchorProjector` 每幀寫進 DOM）：相機收斂後角色的地面點在 Canvas 中心，
// 錨點在桌面中心 `(桌子 x, DESK_TOP, 桌子 z)` 的投影 —— 所以「Canvas 中心到錨點的向量」就是角色相對桌子的位置：
// x 每單位 s px（用 0 與 4 的錨點量：世界 x 相距 7.2）、z 每單位 s/√2 px，反算 z 前先扣桌面高度 `s·h/√2`。
// **模板、桌面高度、桌子碰撞盒、角色半徑都從產品碼讀**（`tsx` 載入 TS），不抄數字 —— 抄的話搬桌子這支照樣綠。
//
// ⚠️ **即時層與 REST 都是偽造的**（`routeWebSocket`／`page.route`），**不連任何團隊共用的位址**；房間的 snapshot 多放一名遠端玩家在 seat 0 的站位。
// ⚠️ 走位不按固定毫秒：每一小步（按鍵 ≤ 80 ms）等相機收斂再量一次，只設步數上限（`lib/world.mjs` 的 `walkLeg`／`settle`）。
//
// 用法：pnpm run build && NEXT_PUBLIC_APP_ENV=local node node_modules/next/dist/bin/next start -p 3100，然後 node tests/e2e/project-room.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT（截圖目錄）。**打 `next start`**（dev 的 HMR 會讓過場假紅）。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { register as registerCjs } from 'tsx/cjs/api'
import { register as registerEsm } from 'tsx/esm/api'
import { decode, grab, stableDiffWhere } from './lib/pixels.mjs'
import { assertLoopback, bad, countOverlays, failureCount, fakeRealtime, fakeRest, guardLoopback, ok, overlaysSeen, profile, settle, uuid, waitForTransition, waitForWorld, walkLeg, walker, watchCanvas } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-w16'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

/** 產品碼裡的模板與尺寸。`tsx` 只在這一段註冊 —— 之後的 import 都是普通的 .mjs。 */
const T = await (async () => {
  const unEsm = registerEsm()
  const unCjs = registerCjs()
  try {
    const { DESK_TOP } = await import('../../src/world/seats/anchors.ts')
    const { ROOM_LAYOUT, ROOM_POINTS, ROOM_SPAWN, STATIONS } = await import('../../src/world/layout/projectRoomLayout.ts')
    const { staticBoxesFor } = await import('../../src/world/layout/geometry.ts')
    const { PHYSICS } = await import('../../src/world/physics/world.ts')
    const desks = STATIONS.map((st) => ROOM_LAYOUT.find((item) => item.id === st.deskId))
    /** 桌子的碰撞盒：從整份配置推導（`staticBoxesFor` 不帶 id，用位置對回去）。 */
    const boxOf = (desk) => staticBoxesFor(ROOM_LAYOUT).find((b) => b.x === desk.x && b.z === desk.z)
    return { h: DESK_TOP, stations: STATIONS, desks, spawn: ROOM_SPAWN, aisle: ROOM_POINTS.aisle, aisleNorth: ROOM_POINTS.aisleNorth, boxOf, radius: PHYSICS.playerRadius }
  } finally {
    await unEsm()
    unCjs()
  }
})()
/** 規格 S08 定下的三個像素常數（tasks 4.0 量出來的），與裸地板取樣點的 x。 */
const DESK_SAMPLE_SIDE = 0.4
const DESK_COLOR_DISTANCE = 40
const DESK_PIXEL_RATIO = 0.6
const FLOOR_X = 7.0
/** 遠端玩家像素的下限：實測 2224（1280×720），取一半以下。 */
const PEER_FLOOR = 1000

const P = profile(41, '人才戊')
const ROOM = uuid(1)
const ROOM_TITLE = '星際導航'
const DECOY = uuid(2)
const ROOMS = [
  { project_id: ROOM, title: ROOM_TITLE, online_count: 3 },
  { project_id: DECOY, title: '深海探勘', online_count: 1 },
]
const TOKEN = 'e2e-ticket-W16'
const PEER_ID = '22222222-2222-4222-8222-222222222222'
/** 線上座標是像素（`coords.ts`：`PIXELS_PER_UNIT = 32`、`y` 是世界的 z）。遠端玩家站在 seat 0 的站位。 */
const peerAt = (station) => ({ id: PEER_ID, name: '鄰座', av: 1, x: station.x * 32, y: station.z * 32, f: 0, st: '' })
const { approachDoor } = walker({ room: ROOM, decoy: DECOY, title: ROOM_TITLE, out: OUT })
const fmt = (n) => n.toFixed(2)

/**
 * 工位錨點當里程計。`canvas` 是大廳取得的同一個 handle —— 錨點的座標全部相對它量（Canvas 上方有頁首）。
 * `where()` 等收斂後回 `{ x, z }`（八個看得見的錨點各反算一次再平均）與 `dist(seat)`（離該錨點、扣掉桌面高度後的反算距離）。
 */
function seatOdometer(page, canvas) {
  const read = () =>
    canvas.evaluate((el) => {
      const c = el.getBoundingClientRect()
      const anchors = [...document.querySelectorAll('[data-testid="seat-anchor"]')].map((n) => {
        const r = n.getBoundingClientRect()
        return { seat: Number(n.dataset.seatIndex), x: r.left - c.left, y: r.top - c.top, visible: getComputedStyle(n).visibility === 'visible' }
      })
      return { w: c.width, h: c.height, anchors }
    })
  const same = (a, b) => a.anchors.length === b.anchors.length && a.anchors.every((p, k) => Math.hypot(p.x - b.anchors[k].x, p.y - b.anchors[k].y) <= 1)
  const settled = () => settle(page, read, same, { what: '錨點' })
  const inside = (r, a) => a.visible && a.x >= 0 && a.x <= r.w && a.y >= 0 && a.y <= r.h
  let s = NaN
  /** 用 0 與 4 的錨點量 s。**兩個都要在 Canvas 內且不 hidden**，否則整支尺不成立。 */
  const calibrate = (r) => {
    const [a0, a4] = [0, 4].map((i) => r.anchors.find((a) => a.seat === i))
    if (!a0 || !a4 || !inside(r, a0) || !inside(r, a4)) throw new Error(`seat 0／4 的錨點不在 Canvas 內：${JSON.stringify([a0, a4])}`)
    s = (a4.x - a0.x) / (T.desks[4].x - T.desks[0].x)
    return s
  }
  /** 從一個錨點反算角色的世界位置（相機收斂後角色在 Canvas 中心）。 */
  const relTo = (r, a) => ({ x: T.desks[a.seat].x + (r.w / 2 - a.x) / s, z: T.desks[a.seat].z + ((r.h / 2 - a.y) * Math.SQRT2) / s - T.h })
  const where = async () => {
    const r = await settled()
    const seen = r.anchors.filter((a) => inside(r, a)).map((a) => relTo(r, a))
    if (seen.length === 0) throw new Error('沒有任何錨點在畫面內，里程計失明')
    const x = seen.reduce((acc, p) => acc + p.x, 0) / seen.length
    const z = seen.reduce((acc, p) => acc + p.z, 0) / seen.length
    const dist = (seat) => {
      const a = r.anchors.find((q) => q.seat === seat)
      if (!a || !inside(r, a)) return NaN
      const p = relTo(r, a)
      return Math.hypot(p.x - T.desks[seat].x, p.z - T.desks[seat].z)
    }
    return { r, x, z, dist }
  }
  /** 畫面內的錨點 vs 模板：以 0／4 的中點與 seat 0 的 y 為基準，其餘每個差 ≤ 2 px。`all` 時八個都要在畫面內。 */
  const templateCheck = (r, label, all = false) => {
    const a0 = r.anchors.find((a) => a.seat === 0)
    const a4 = r.anchors.find((a) => a.seat === 4)
    const midX = (a0.x + a4.x) / 2
    const worst = []
    for (const a of r.anchors) {
      if (!inside(r, a)) {
        if (all) worst.push(`seat ${a.seat} 不在畫面內`)
        continue
      }
      const d = T.desks[a.seat]
      const want = { x: midX + d.x * s, y: a0.y + ((d.z - T.desks[0].z) * s) / Math.SQRT2 }
      const off = Math.hypot(a.x - want.x, a.y - want.y)
      if (off > 2) worst.push(`seat ${a.seat} 偏 ${off.toFixed(1)} px`)
    }
    if (worst.length === 0) ok(`[S08] ${label}：${all ? '八個' : '畫面內的'}錨點都在模板位置 ±2 px`)
    else bad(`[S08] ${label}：錨點對不上模板`, worst.join('；'))
  }
  return { settled, calibrate, where, templateCheck, inside, pxPerUnit: () => s }
}

/** 邊長 `side` 的方塊（中心 `cx, cy`，Canvas 像素）裡每個像素的 RGB；有一個像素出界就回 null。`readPixels` 的原點在左下。 */
function square(f, cx, cy, side) {
  const out = []
  const half = side / 2
  for (let y = Math.floor(cy - half); y < Math.floor(cy - half) + side; y++) {
    for (let x = Math.floor(cx - half); x < Math.floor(cx - half) + side; x++) {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) return null
      const i = ((f.h - 1 - y) * f.w + x) * 4
      out.push([f.px[i], f.px[i + 1], f.px[i + 2]])
    }
  }
  return out
}
const mean = (ps) => [0, 1, 2].map((k) => ps.reduce((acc, p) => acc + p[k], 0) / ps.length)
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * 桌子有畫出來（S08 像素段）。基準是**同一畫面一份**裸地板：候選點 `(桌子 x 的同側 ±FLOOR_X, 0, 桌子 z)`，依 seat 0→7 取第一個方塊完整在 Canvas 內的；
 * 一個都沒有就紅、不略過。每個方塊完整在 Canvas 內的錨點都量；0 與 4 必須在其中。
 */
async function deskPixels(page, odo, r, label) {
  const s = odo.pxPerUnit()
  const side = Math.round(DESK_SAMPLE_SIDE * s)
  const f = decode(await grab(page))
  if (f === null || f.w !== r.w || f.h !== r.h) return bad(`[S08] ${label}：讀不到 WebGL 像素或尺寸對不上`, JSON.stringify({ f: f && [f.w, f.h], canvas: [r.w, r.h] }))
  let ref = null
  for (const a of r.anchors) {
    const d = T.desks[a.seat]
    const floor = square(f, a.x + Math.sign(d.x) * (FLOOR_X - Math.abs(d.x)) * s, a.y + (T.h * s) / Math.SQRT2, side)
    if (floor === null) continue
    const m = mean(floor)
    const spread = Math.max(...floor.map((p) => dist3(p, m)))
    if (spread > DESK_COLOR_DISTANCE) return bad(`[S08] ${label}：裸地板基準方塊不均勻（seat ${a.seat} 旁，離散 ${spread.toFixed(1)}）`, '基準落在陰影邊界或家具上；不放寬判準')
    ref = { seat: a.seat, color: m.map(Math.round), spread }
    break
  }
  if (ref === null) return bad(`[S08] ${label}：沒有任何裸地板基準方塊完整在 Canvas 內`, '像素判準不能略過')
  const results = []
  for (const a of r.anchors) {
    const desk = square(f, a.x, a.y, side)
    if (desk === null) continue
    const ratio = desk.filter((p) => dist3(p, ref.color) > DESK_COLOR_DISTANCE).length / desk.length
    results.push({ seat: a.seat, ratio })
  }
  const missing = [0, 4].filter((i) => !results.some((q) => q.seat === i))
  if (missing.length > 0) bad(`[S08] ${label}：seat ${missing.join('／')} 的桌面方塊沒有完整在 Canvas 內`, '')
  const low = results.filter((q) => q.ratio < DESK_PIXEL_RATIO)
  const summary = results.map((q) => `${q.seat}:${Math.round(q.ratio * 100)}%`).join(' ')
  if (results.length > 0 && low.length === 0) ok(`[S08] ${label}：${results.length} 張桌子的桌面方塊（${side} px）離裸地板 ${ref.color.join(',')} 的像素比例都 ≥ ${DESK_PIXEL_RATIO * 100}%（${summary}）`)
  else bad(`[S08] ${label}：桌面方塊的像素比例低於 ${DESK_PIXEL_RATIO * 100}%`, `${summary}；基準 seat ${ref.seat} 旁 ${ref.color.join(',')}`)
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  const sockets = []
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  guardLoopback(context)
  await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [`guildhub.roomToken.${P.id}.${ROOM}`, TOKEN])
  await countOverlays(context)
  await fakeRealtime(context, sockets, { others: (scene) => (scene === `room:${ROOM}` ? [peerAt(T.stations[0])] : []) })
  const page = await context.newPage()
  await fakeRest(page, { current: P }, ROOMS)

  // ── 大廳：取 Canvas handle、走到門前按 E 進房 ──
  const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
  if (response === null) throw new Error(`連不到 ${FRONTEND} —— next start 起了嗎？`)
  await waitForWorld(page)
  const canvas = await page.$('canvas')
  if (canvas === null) throw new Error('沒有 canvas —— 世界沒畫出來')
  const sameCanvas = await watchCanvas(page, canvas)
  const { prompt } = await approachDoor(page)
  const since = await overlaysSeen(page)
  await page.keyboard.press('KeyE')
  await waitForTransition(page, `按 E 進房（提示「${prompt}」）`, since, 'S08')
  await waitForWorld(page)
  const room = sockets.find((sk) => sk.scene === `room:${ROOM}`)
  if (room !== undefined) ok('[S08] 房間的 socket 建立了（snapshot 帶一名遠端玩家在 seat 0 的站位）')
  else bad('[S08] 沒有房間的 socket', JSON.stringify(sockets.map((sk) => sk.scene)))

  // ── 出生視角：近端錨點在 Canvas 內、量 s、模板比對、桌子有畫出來、遠端玩家在 seat 0 旁 ──
  const odo = seatOdometer(page, canvas)
  let r = await odo.settled()
  const s = odo.calibrate(r)
  ok(`[S08] 出生視角：seat 0／4 的錨點都在 Canvas 內且不 hidden；s = ${s.toFixed(2)} px／單位`)
  odo.templateCheck(r, '出生視角')
  const at = await odo.where()
  if (Math.hypot(at.x - T.spawn.x, at.z - T.spawn.z) <= 0.3) ok(`[S08] 反算的出生點 (${fmt(at.x)}, ${fmt(at.z)}) 對得上配置 (${T.spawn.x}, ${T.spawn.z})`)
  else bad('[S08] 反算的出生點對不上配置', `量到 (${fmt(at.x)}, ${fmt(at.z)})，配置 (${T.spawn.x}, ${T.spawn.z})`)
  await deskPixels(page, odo, r, '出生視角')
  await page.screenshot({ path: path.join(OUT, 'spawn.png') })
  {
    // 遠端玩家：有他 vs 他離開之後（同一個相機），差異像素要落在 seat 0 站位地面點上方的角色高度範圍裡。
    const withPeer = [decode(await grab(page)), decode(await grab(page)), decode(await grab(page))]
    room.ws.send(JSON.stringify({ t: 'presence', join: [], leave: [PEER_ID] }))
    await page.waitForTimeout(800)
    const without = [decode(await grab(page)), decode(await grab(page)), decode(await grab(page))]
    const a0 = r.anchors.find((a) => a.seat === 0)
    const ground = { x: a0.x + (T.stations[0].x - T.desks[0].x) * s, y: a0.y + (T.h * s) / Math.SQRT2 }
    const near = (col, row) => Math.abs(col - ground.x) <= 0.75 * s && row >= ground.y - (2.2 * s) / Math.SQRT2 && row <= ground.y + (0.4 * s) / Math.SQRT2
    const { total, inside } = stableDiffWhere(withPeer, without, near)
    if (total >= PEER_FLOOR && inside / total >= 0.8) ok(`[S08] 遠端玩家的像素在 seat 0 的站位上（${total} 個差異像素，${Math.round((inside / total) * 100)}% 在站位地面點上方 ±0.75 單位內）`)
    else bad('[S08] 遠端玩家的像素不在 seat 0 旁', `差異 ${total}（下限 ${PEER_FLOOR}），其中 ${inside} 個在站位附近`)
  }

  // ── 里程計往北：z 單調前進（≤ 1 px 回抖）到通道北端；經過通道中點時八個錨點都在 ──
  const pxZ = Math.SQRT2 / s
  let prevZ = at.z
  let regress = 0
  let midChecked = false
  const north = await walkLeg(page, {
    label: '沿通道往北',
    where: odo.where,
    holdMs: 80,
    maxSteps: 200,
    out: OUT,
    steer: (p) => {
      regress = Math.max(regress, p.z - prevZ)
      prevZ = p.z
      if (!midChecked && Math.abs(p.z - T.aisle.z) <= 0.6) {
        midChecked = true
        odo.templateCheck(p.r, `通道中點（z=${fmt(p.z)}）`, true)
      }
      return p.z <= T.aisleNorth.z + 0.5 ? null : 'KeyW'
    },
  })
  if (regress <= pxZ) ok(`[S08] 往北走到通道北端 z=${fmt(north.z)}，最大回抖 ${(regress / pxZ).toFixed(2)} px`)
  else bad('[S08] 往北的里程計有回抖', `最大 ${(regress / pxZ).toFixed(1)} px（允許 1 px）`)
  if (!midChecked) bad('[S08] 沒有在通道中點量到（步幅太大？）', '')

  // ── 走回 seat 1 的站位（先沿通道往南到它的 z，再往西），到站判準：離站位 ≤ 0.3 ──
  const st1 = T.stations[1]
  const aim = (p, target, tol) => {
    const dz = target.z - p.z
    const dx = target.x - p.x
    if (Math.abs(dz) > tol) return { code: dz > 0 ? 'KeyS' : 'KeyW', ms: Math.abs(dz) > 0.8 ? 80 : 30 }
    if (Math.abs(dx) > tol) return { code: dx > 0 ? 'KeyD' : 'KeyA', ms: Math.abs(dx) > 0.8 ? 80 : 30 }
    return null
  }
  const arrived = await walkLeg(page, { label: '走回 seat 1 的站位', where: odo.where, holdMs: 80, maxSteps: 200, out: OUT, steer: (p) => (Math.hypot(p.x - st1.x, p.z - st1.z) <= 0.3 ? null : aim(p, st1, 0.15)) })
  ok(`[S08] 走到 seat 1 的站位：反算 (${fmt(arrived.x)}, ${fmt(arrived.z)})，離站位 ${fmt(Math.hypot(arrived.x - st1.x, arrived.z - st1.z))}`)

  // ── 持續朝桌子送輸入：至少 1 步離錨點的距離**減少** ≥ 2 px、曾 < 1 單位，然後連續 5 次同方向輸入變化 ≤ 1 px（plateau）；plateau 距離＝碰撞盒近側＋角色半徑 ──
  const box = T.boxOf(T.desks[1])
  const expectPlateau = box.halfWidth + T.radius
  let prevD = arrived.dist(1)
  let moving = 0
  let flat = 0
  let closest = prevD
  const stopped = await walkLeg(page, {
    label: '朝 seat 1 的桌子走',
    where: odo.where,
    holdMs: 30,
    maxSteps: 60,
    out: OUT,
    steer: (p, step) => {
      const d = p.dist(1)
      const closer = (prevD - d) * s
      if (step > 0) {
        if (closer >= 2) moving += 1
        flat = Math.abs(closer) <= 1 ? flat + 1 : 0
      }
      prevD = d
      closest = Math.min(closest, d)
      return flat >= 5 ? null : 'KeyA'
    },
  })
  const plateau = stopped.dist(1)
  if (moving >= 1) ok(`[S08] 朝桌子走：${moving} 步離錨點的距離減少 ≥ 2 px（輸入生效、方向對、步幅高於容差）`)
  else bad('[S08] 朝桌子走：沒有任何一步讓離錨點的距離減少 ≥ 2 px', `最近到 ${fmt(closest)} 單位`)
  if (closest < 1) ok(`[S08] 曾接近到離桌面中心 < 1 單位（${fmt(closest)}）`)
  else bad('[S08] 沒有接近到 < 1 單位', `最近 ${fmt(closest)}`)
  if (Math.abs(plateau - expectPlateau) <= 0.15) ok(`[S08] 撞桌子停下：plateau 距離 ${fmt(plateau)} ＝ 碰撞盒近側 ${box.halfWidth} ＋ 角色半徑 ${T.radius}（±0.15）`)
  else bad('[S08] plateau 距離對不上桌子的碰撞盒', `量到 ${fmt(plateau)}，要 ${fmt(expectPlateau)} ± 0.15（比它小是穿過桌子；大很多是撞到別的東西）`)
  await page.screenshot({ path: path.join(OUT, 'at-desk.png') })

  // ── 繞回通道再到 seat 2 的站位：離它的錨點的反算距離收斂到模板距離 ± 0.15 ──
  const st2 = T.stations[2]
  const templateDist = Math.hypot(st2.x - T.desks[2].x, st2.z - T.desks[2].z)
  const back = await walkLeg(page, { label: '繞回通道', where: odo.where, holdMs: 80, maxSteps: 60, out: OUT, steer: (p) => (p.x >= T.aisle.x - 0.3 ? null : 'KeyD') })
  ok(`[S08] 繞回通道 x=${fmt(back.x)}`)
  const seat2 = await walkLeg(page, { label: '走到 seat 2 的站位', where: odo.where, holdMs: 80, maxSteps: 200, out: OUT, steer: (p) => aim(p, st2, 0.15) })
  const d2 = seat2.dist(2)
  if (Math.abs(d2 - templateDist) <= 0.15) ok(`[S08] seat 2 站位：離錨點 ${fmt(d2)} ＝ 模板距離 ${fmt(templateDist)} ± 0.15`)
  else bad('[S08] seat 2 站位離錨點的距離對不上模板', `量到 ${fmt(d2)}，要 ${fmt(templateDist)} ± 0.15`)
  await sameCanvas('S08', '走完全程')
  await page.screenshot({ path: path.join(OUT, 'seat-2.png') })
  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? String(e))
} finally {
  await browser.close()
}

if (failureCount() > 0) {
  console.log(`\n${failureCount()} 項不符。`)
  process.exit(1)
}
console.log('\n全部符合。')
