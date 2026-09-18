// 對 `/world` 跑瀏覽器驗收的共用零件：偽造的 REST／即時層、走位（門標籤里程計）、過場計數、網址軌跡、Canvas 同一節點。
// 從 `scene-switch.mjs`（#416）抽出來 —— `room-entry.mjs`（`FE-N08`）要同一套走位與偽造，抄一份就會漂。
//
// ⚠️ **不連任何團隊共用的位址**：REST 與 WebSocket 全部由 `page.route`／`routeWebSocket` 偽造，只打本機自己起的 server。
// ⚠️ 走位不按固定毫秒（`e2e-main.sh` 記著那種尺在 runner 上會 flake）：角色的位置從門標籤的螢幕座標量出來，每一小步量一次、只設步數上限。

import path from 'node:path'

export const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
export const profile = (n, display_name) => ({ id: uuid(n), display_name, avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' })

/**
 * 只打本機。`FRONTEND` 不是 loopback 就不跑；context 裡任何一個請求打到別的主機都算紅 —— 「REST 全部偽造」是意圖，這個是機器上的保證。
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
export function assertLoopback(frontend) {
  const host = new URL(frontend).hostname
  if (!LOOPBACK.has(host)) throw new Error(`FRONTEND 必須是本機（localhost／127.0.0.1／::1），不是 ${host} —— 這些腳本不打任何共用位址`)
}
export function guardLoopback(context) {
  context.on('request', (request) => {
    const host = new URL(request.url()).hostname
    if (!LOOPBACK.has(host) && !request.url().startsWith('data:')) bad('打到了本機以外的位址', request.url())
  })
}

let failures = 0
export const ok = (l) => console.log(`✅ ${l}`)
export const bad = (l, d = '') => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}
export const failureCount = () => failures

/**
 * 假的即時後端。每一條連線記一筆 `{ scene, token }`（順序就是建立的順序），回 `hello` ＋ 只有自己的 `snapshot`，讓連線走到 `ready`。
 * `refuse(scene)` 回 true 的連線在 open 之前就關掉（握手被拒：客戶端看到 `opened=false`）。
 * `others(scene)` 回這個場景的 snapshot 裡除了自己以外的人（協定的 player：`x`／`y` 是像素）；預設沒有別人。
 * `holdSnapshot(scene)` 回 true 的連線只送 `hello`、不送 snapshot（連線開著、名單永遠不到）—— 驗「新場景的名單還沒到之前，舊場景的東西已經卸載」用。
 */
export function fakeRealtime(context, sockets, { refuse = () => false, others = () => [], holdSnapshot = () => false } = {}) {
  return context.routeWebSocket(/\/ws(\?|$)/, async (ws) => {
    const url = new URL(ws.url())
    const scene = url.searchParams.get('scene')
    // `ws`：之後要「伺服器主動送」的腳本（chat）從這裡拿；`sent`：頁面送給伺服器的 frame（`move` 就是角色自己回報的位置）。只讀 scene／token 的腳本不受影響。
    const record = { scene, token: url.searchParams.get('token'), ws, sent: [] }
    ws.onMessage((message) => record.sent.push(String(message)))
    sockets.push(record)
    if (refuse(scene)) {
      await ws.close({ code: 1006, reason: 'refused' })
      return
    }
    const you = `self-${sockets.length}`
    ws.send(JSON.stringify({ t: 'hello', you, hz: 10 }))
    if (holdSnapshot(scene)) return
    ws.send(JSON.stringify({ t: 'snapshot', players: [{ id: you, name: '訪客', av: 0, x: 0, y: 0, f: 0, st: 'idle' }, ...others(scene)] }))
  })
}

/** REST 全部偽造。`me` 是一個可以換人的盒子 —— 「同一個分頁換身分」的段落要它。 */
export async function fakeRest(page, me, rooms) {
  await page.route('**/api/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me.current) }))
  await page.route('**/api/rooms', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rooms) }))
  await page.route('**/api/profiles?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/projects?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
}

export async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
}
export const promptText = (page) => page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => null)

/**
 * 走到某塊看板前，直到互動提示指名它（`board-panel.mjs` 的走位，搬過來讓後面的腳本共用）。
 * `steps`：先按住的幾段 `[code, ms]`；之後一小步一小步往上，最多 8 步。每一步之後停 400 ms 讓相機收斂。
 * 走不到就把畫面上的提示說出來、截圖到 `out`。
 */
export async function approach(page, label, steps, out) {
  const step = async (code, ms) => {
    await hold(page, code, ms)
    await page.waitForTimeout(400)
  }
  for (const [code, ms] of steps) await step(code, ms)
  for (let i = 0; i < 8; i++) {
    const prompt = await promptText(page)
    if (prompt !== null && prompt.includes(label)) return prompt
    await step('ArrowUp', 120)
  }
  const prompt = (await promptText(page)) ?? '（沒有提示）'
  await page.screenshot({ path: path.join(out, 'lost.png') })
  throw new Error(`走不到「${label}」前面。畫面上的提示：${prompt}（截圖 ${out}/lost.png）`)
}
export const pathAndSearch = (page) => page.evaluate(() => `${location.pathname}${location.search}`)

export async function expectUrl(page, label, want) {
  await page.waitForFunction((w) => `${location.pathname}${location.search}` === w, want, { timeout: 3_000 }).catch(() => {})
  const got = await pathAndSearch(page)
  if (got === want) ok(`${label}：網址是 ${got}`)
  else bad(`${label}：網址不對`, `要 ${want}，是 ${got}`)
}
export async function waitForWorld(page) {
  await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(1500)
}

/**
 * 每個 document 從第一行就在數「覆蓋層出現過幾次」：`goto()` 回來的時候，快的機器上那場過場可能已經整個結束了
 * （ready ＋ 300 ms ＋ 淡出），事後再 `waitForSelector` 會假紅（審查抓到的競態）。
 */
export function countOverlays(context) {
  return context.addInitScript(() => {
    window.__guildhubOverlaysSeen = 0
    const isOverlay = (n) => n instanceof Element && n.matches('[data-testid="scene-transition"][role="status"]')
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (isOverlay(n) || (n instanceof Element && n.querySelector('[data-testid="scene-transition"][role="status"]'))) window.__guildhubOverlaysSeen += 1
        }
        if (r.type === 'attributes' && isOverlay(r.target)) window.__guildhubOverlaysSeen += 1
      }
      // 觀察 `document` 不是 `documentElement`：init script 跑的時候 `<html>` 還沒被解析出來，那是 null，整支 script 會靜默失敗。
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['role'] })
  })
}
export const overlaysSeen = (page) => page.evaluate(() => window.__guildhubOverlaysSeen ?? 0)

/** 過場覆蓋層出現再消失。每一場過場都至少顯示 300 ms（`FE-V01-S05`），所以「沒看到」就是紅，不是放行。`since`：這場之前已經數到幾次。 */
export async function waitForTransition(page, label, since, scenario = 'S05') {
  const seen = await page.waitForFunction((n) => (window.__guildhubOverlaysSeen ?? 0) > n, since, { timeout: 5_000 }).then(() => true).catch(() => false)
  if (seen) ok(`[${scenario}] ${label}：有過場覆蓋層`)
  else bad(`[${scenario}] ${label}：沒有看到過場覆蓋層`)
  const gone = await page.waitForSelector('[data-testid="scene-transition"]', { state: 'detached', timeout: 15_000 }).then(() => true).catch(() => false)
  if (!gone) bad(`[${scenario}] ${label}：覆蓋層 15 秒沒消失`)
  await page.waitForTimeout(300)
}

/**
 * 網址的**完整軌跡**，不是幾個快照：快照看不到「先 pushState 一個帶票的、下一個 tick 再 replace 掉」（審查抓到的）。
 * 每個 document 一開始就把 `pushState`／`replaceState` 包起來，每一次寫入的網址都送到 Node 這邊；document 自己的第一個網址與整頁導覽也記。
 */
export async function traceUrls(context, urls) {
  await context.exposeBinding('__guildhubRecordUrl', (_source, url) => {
    urls.push(String(url))
  })
  await context.addInitScript(() => {
    window.__guildhubRecordUrl(location.href)
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method]
      history[method] = function (state, title, url) {
        if (url !== undefined && url !== null) window.__guildhubRecordUrl(new URL(String(url), location.href).href)
        return original.call(this, state, title, url)
      }
    }
  })
  context.on('page', (page) => page.on('framenavigated', (frame) => urls.push(frame.url())))
}

/**
 * 「仍然連在 DOM 上」是**整段序列期間從沒斷開**，不只是每一步量的那一刻。MutationObserver 看 `removedNodes`；
 * 整頁重載之後舊 handle 連 evaluate 都做不了、掛載時放的記號也會不見 —— 那也是「不是同一個」。
 */
export async function watchCanvas(page, canvas) {
  await page.evaluate(() => {
    window.__guildhubMark = 'mounted-once'
  })
  await canvas.evaluate((el) => {
    window.__guildhubDetached = false
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.removedNodes) if (n === el || n.contains(el)) window.__guildhubDetached = true
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
  })
  return async (scenario, label) => {
    const connected = await canvas.evaluate((el) => el.isConnected).catch(() => false)
    const count = await page.evaluate(() => document.querySelectorAll('canvas').length)
    const mark = await page.evaluate(() => window.__guildhubMark)
    const detached = await page.evaluate(() => window.__guildhubDetached)
    if (connected && !detached && count === 1 && mark === 'mounted-once') ok(`[${scenario}] ${label}：Canvas 還是同一個節點，中途沒斷開（頁面沒重載）`)
    else bad(`[${scenario}] ${label}：Canvas 被重掛了`, `isConnected=${connected}，中途斷開過=${detached}，canvas 數=${count}，記號=${mark}（記號不見 = 整頁重載）`)
  }
}

/**
 * 等讀數收斂：連續兩次 `read()` 被 `same(prev, next)` 判成一樣才回傳。相機跟拍是阻尼的（半衰期 120 ms），
 * 剛放開鍵那一刻的讀數還在追 —— 任何拿螢幕座標當尺的判準都要先過這一步。`room`／`hall` 的里程計都用它。
 */
export async function settle(page, read, same, { gapMs = 150, rounds = 20, what = '讀數' } = {}) {
  let prev = await read()
  for (let i = 0; i < rounds; i++) {
    await page.waitForTimeout(gapMs)
    // 兩次讀數之間要真的畫過新的一幀：分頁沒出幀時兩次讀到同一個舊值，會把「沒更新」誤認成「收斂」。
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
    const next = await read()
    if (same(prev, next)) return next
    prev = next
  }
  throw new Error(`${what}一直在動 —— 相機沒收斂，或量尺沒畫出來`)
}

/**
 * 一段走位：每一步先量（`where()`）再決定往哪走（`steer(pos, step)` 回要按的鍵、或 `{ code, ms }` 自訂這一步的長度；回 `null` 就是到了）。
 * **只設步數上限、不按固定毫秒判定「走到了」**（`e2e-main.sh` 記著那種尺在 runner 上會 flake）。迷路就截圖再拋。
 */
export async function walkLeg(page, { label, where, steer, holdMs, maxSteps, out }) {
  for (let i = 0; i < maxSteps; i++) {
    const pos = await where()
    const next = await steer(pos, i)
    if (next === null) return pos
    const { code, ms } = typeof next === 'string' ? { code: next, ms: holdMs } : next
    await hold(page, code, ms)
  }
  await page.screenshot({ path: path.join(out, 'lost.png') })
  throw new Error(`${label}：走了 ${maxSteps} 步還沒到（截圖 ${out}/lost.png）`)
}

/**
 * 走位。`room`／`decoy`：走廊前兩格的門（相隔剛好一格：`CORRIDOR_SLOTS` z 差 `slotGap`，螢幕上的距離就是「每單位幾個像素」）；
 * `title`：目標門的名字（提示上出現它就是到了）；`out`：迷路時的截圖目錄。
 */
/** 出生點（`world-layout` 的 hall spawn），世界單位。 */
export const HALL_SPAWN = { x: 0, z: -1 }
/** 線上座標是像素（`src/world/coords.ts`：`PIXELS_PER_UNIT = 32`，`y` 是世界的 z）。 */
const PIXELS_PER_UNIT = 32
/** 最後一筆角色自己回報的位置（`move` frame），換回世界單位；沒有就 null。 */
export function lastReportedPosition(socket) {
  for (let i = socket.sent.length - 1; i >= 0; i -= 1) {
    try {
      const m = JSON.parse(socket.sent[i])
      if (m.t === 'move') return { x: m.x / PIXELS_PER_UNIT, z: m.y / PIXELS_PER_UNIT }
    } catch {
      /* 不是 JSON 的 frame 不算 */
    }
  }
  return null
}

export function walker({ room, decoy, title, out, slotGap = 2, doorZ = -2, spawn = HALL_SPAWN }) {
  /**
   * 角色走了多遠，用門標籤量出來。相機跟著角色、正交投影、沒有偏航（`camera.ts`：offset (0, 12, 12)），
   * 所以世界裡的門在螢幕上移動多少，就是角色反向走了多少：x 一單位 = s px，z 一單位 = s/√2 px（俯角 45°）。
   * 讀值等相機收斂（連續兩次讀數差 ≤1 px）：跟拍是阻尼的（半衰期 120 ms），剛放開鍵那一刻的讀數還在追。
   * 回傳的是**相對起點**的位移（起點是校準那一刻）；絕對位置只用得到 z：校準前只往西走過，z 還是出生點的。
   */
  async function odometer(page) {
    const read = () =>
      page.evaluate(
        ([a, b]) => {
          const rect = (id) => {
            const n = document.querySelector(`[data-testid="door-label"][data-target="door:${id}"]`)
            if (n === null || getComputedStyle(n).visibility !== 'visible') return null
            const r = n.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top }
          }
          return { target: rect(a), decoy: rect(b), cx: innerWidth / 2 }
        },
        [room, decoy],
      )
    const settled = () =>
      settle(page, read, (prev, next) => prev.target !== null && next.target !== null && Math.abs(prev.target.x - next.target.x) <= 1 && Math.abs(prev.target.y - next.target.y) <= 1, {
        what: '門標籤',
      })
    // 出生點看不到走廊（`rooms-fixture` 記著：門根本不在畫面裡）。先往西一小步一小步，直到兩個標籤都看得見再校準。
    let origin = null
    for (let i = 0; i < 15 && origin === null; i++) {
      const now = await read()
      if (now.target !== null && now.decoy !== null) origin = await settled()
      else await hold(page, 'ArrowLeft', 200)
    }
    if (origin === null || origin.decoy === null) throw new Error('往西走了 15 步還看不到兩扇門的標籤（標籤是量尺）')
    const pxPerZ = (origin.decoy.y - origin.target.y) / slotGap
    const pxPerX = pxPerZ * Math.SQRT2
    if (!(pxPerZ > 5)) throw new Error(`量尺不對：兩扇門在螢幕上只差 ${(pxPerZ * slotGap).toFixed(1)} px`)
    return async () => {
      const now = await settled()
      return {
        dx: -(now.target.x - origin.target.x) / pxPerX,
        dz: -(now.target.y - origin.target.y) / pxPerZ,
        doorWest: (now.cx - now.target.x) / pxPerX,
        z: spawn.z - (now.target.y - origin.target.y) / pxPerZ,
      }
    }
  }

  /**
   * 走到走廊第一扇門前。出生點 (0, -1)；走廊隔牆在 x=-6、z∈[-3, 9]：先往北繞過它的北端（z ≤ -4），
   * 再往西到門前（門在角色西邊不到 1.2 單位；互動距離 2），然後往南直到提示上出現這扇門的名字。
   * 每一段都是「量 → 走一小步 → 再量」，只設步數上限。回傳 `{ prompt, pos, where }`（`where` 可以之後再量）。
   */
  async function approachDoor(page, { where: known = null } = {}) {
    // 里程計的絕對 z 只在「校準那一刻角色在出生點的 z」時成立（上面的註解）。角色已經走過（不只往西）的話，
    // 要把先前那次校準的 `where` 傳進來，不能在這裡重新校準 —— 重校會把現在的位置硬定成出生點的 z（審查抓到的）。
    const where = known ?? (await odometer(page))
    /** **雙向**：跨過頭就走回來（審查：單向＋單邊不等式會越界）。 */
    const leg = (label, ms, steer, maxSteps) => walkLeg(page, { label, where, steer, holdMs: ms, maxSteps, out })
    await leg('往北繞過隔牆', 250, (p) => (p.z > -4 ? 'ArrowUp' : p.z < -6 ? 'ArrowDown' : null), 30)
    await leg('往西到門前', 300, (p) => (p.doorWest > 1.2 ? 'ArrowLeft' : p.doorWest < 0 ? 'ArrowRight' : null), 60)
    const arrived = await leg(
      '往南到門口',
      120,
      async (p) => {
        const prompt = await promptText(page)
        if (prompt !== null && prompt.includes(title)) return null
        // 門在 z=doorZ、互動距離 2：過了 doorZ+2.5 就是走過頭，往回
        return p.z > doorZ + 2.5 ? 'ArrowUp' : 'ArrowDown'
      },
      40,
    )
    const prompt = await promptText(page)
    return { prompt, pos: arrived, where }
  }
  return { odometer, approachDoor }
}
