// `FE-W19` 的像素驗證（design 的 V1）。
//
// ⚠️⚠️ **這一支存在的唯一理由是「畫面上真的看得出差別」，而它只能在真的 WebGL 上問。**
//
// `tests/avatar-look.test.ts` 驗映射、`tests/avatar-wiring.test.tsx` 驗接線 ——
// 兩者都在 jsdom 裡，**沒有一個像素被畫出來**。而這一項整個存在的理由，
// 就是 `FE-A05` 的角色選擇「沒有可觀察的結果」。
//
// ⚠️ **它同時補上一個突變測試揭出來的缺口**：把 `WorldCanvas` 傳給 `LocalPlayer`
// 的 `av` 整個拿掉之後，543 條單元測試裡沒有任何一條會紅。那一段接線
// 需要真的 Canvas 才驗得到 —— 就是這裡。
//
// 用法（要先起後端與前端）：
//
//   node tests/e2e/avatar-pixels.mjs

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

// ⚠️ **兩邊都攔 `/api/me`，只有 `avatar_id` 不同。**
// 「不攔 vs 攔」的比較會夾帶「訪客 vs 已登入」的差異（標題列的文字都不一樣），
// 那樣紅了也說不清是誰造成的。
const PROFILE = (avatar_id) => ({
  id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  display_name: '像素測試員',
  avatar_id,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
})

/** 差異像素的門檻：RGB 任一通道絕對差 `≥ 32/255`（design 的 D1）。 */
const CHANNEL = 32

/**
 * 訊號下限。實測 `av=0` vs `av=1` 是 1081／1189／1361（三次獨立執行），
 * 取最小值的一半 —— 2 倍餘裕留給真實場景的相機、遮擋與抗鋸齒。
 *
 * ⚠️ **這個數字跟 viewport 綁定**，所以底下固定 1440×900。
 */
const SIGNAL_FLOOR = 500

/**
 * 雜訊上限。實測同一個 `av` 兩次獨立載入的保守差異是 **0**（三次都是 0）。
 * 給 50 的容忍，是為了不讓某次偶然的相位差把整支腳本變成不穩定的測試。
 */
const NOISE_CEILING = 50

/** 鄰居出現在畫面上要佔多少像素。**待實測填入。** */
const PEER_FLOOR = 1
/** 遠端 `av=0` 與 `av=1` 的差異下限。**待實測填入。** */
const REMOTE_FLOOR = 1

const FRAMES = 3

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

/**
 * 讀 WebGL 的 back buffer。
 *
 * ⚠️ **一定要在 `requestAnimationFrame` 裡讀，不能用截圖或 `toDataURL()`。**
 * 畫布沒有開 `preserveDrawingBuffer`，截圖取到的是**全透明** ——
 * 這個坑在 `FE-A06` 踩過一次，症狀是「3D 世界一片空白」而產品其實好好的。
 */
const grab = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.querySelector('canvas')
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
        if (!gl) return resolve(null)
        requestAnimationFrame(() => {
          const w = gl.drawingBufferWidth
          const h = gl.drawingBufferHeight
          const px = new Uint8Array(w * h * 4)
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
          resolve({ w, h, px: Array.from(px) })
        })
      }),
  )

/**
 * **保守差異**：一個像素只有在「A 的每一幀 vs B 的每一幀都不同」時才算數。
 *
 * ⚠️ **這是為了 idle 動畫。** 規格的 design 說判準要在「固定姿勢」下量，
 * 而真實的 `/world` 沒有固定姿勢 —— 角色的手腳與起伏一直在動。
 * 單幀相減時那些動作也算差異（實測基線 496 像素，而訊號只有 1285，
 * 信噪比 2.6:1，太弱）。
 *
 * 取交集就把它濾掉了：**動畫造成的差異在不同幀的位置會變，換色造成的不會。**
 * 實測基線因此降到 **0**。
 */
function stableDiff(as, bs) {
  let count = 0
  outer: for (let i = 0; i < as[0].px.length; i += 4) {
    for (const a of as)
      for (const b of bs) {
        const d = Math.max(
          Math.abs(a.px[i] - b.px[i]),
          Math.abs(a.px[i + 1] - b.px[i + 1]),
          Math.abs(a.px[i + 2] - b.px[i + 2]),
        )
        if (d < CHANNEL) continue outer
      }
    count++
  }
  return count
}

/**
 * 遠端玩家要放在哪。
 *
 * ⚠️ **一定要在鏡頭裡，而這件事沒有任何東西會替你檢查。**
 * 放到視野外的話，差異是 0 —— 而那個紅燈跟「遠端角色沒有讀 `av`」
 * 長得一模一樣。底下 `V2a` 那條對照就是為了把這兩者分開。
 *
 * 本地角色出生在世界座標 `(0, -1)`（`guildHallLayout` 的 `SPAWN`），
 * 協定像素是世界座標 × 32（`coords.ts` 的 `PIXELS_PER_UNIT`）。
 * 鄰居放在它右邊兩個單位 —— 夠遠不會被本地角色遮住，夠近仍在鏡頭內。
 */
const PEER_AT = { x: 2 * 32, y: -1 * 32 }
const SELF_WS_ID = '11111111-1111-4111-8111-111111111111'
const PEER_WS_ID = '22222222-2222-4222-8222-222222222222'

/**
 * 假的即時層。**完全接管 `/ws`，不連真後端。**
 *
 * ⚠️ **後端送不出可用的測資** —— 遠端玩家的 `av` 來自那條連線背後的 session，
 * 而要讓後端送出 `av=1`，得先有第二個真的瀏覽器、真的登入、真的改過 `avatar_id`。
 * 那是 `FE-A05` 的功能，這一項還在它前面。
 *
 * `peers` 是名單上除了自己以外的人；`null` 表示只有自己。
 */
const fakeRealtime = (context, peers) =>
  context.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    const player = (id, av, at) => ({ id, name: '訪客', av, x: at.x, y: at.y, f: 0, st: 'idle' })
    // ⚠️ **`hello` 要先送，而且 `you` 要對得上 snapshot 裡的自己。**
    // 對不上的話畫面會多一個跟本地角色重疊、還跟著它走的分身
    // （`remotePlayers.ts` 的 `selfId` 就是在擋這個）。
    ws.send(JSON.stringify({ t: 'hello', you: SELF_WS_ID, hz: 10 }))
    ws.send(
      JSON.stringify({
        t: 'snapshot',
        players: [
          player(SELF_WS_ID, 0, { x: 0, y: -32 }),
          ...(peers === null ? [] : [player(PEER_WS_ID, peers, PEER_AT)]),
        ],
      }),
    )
  })

/**
 * @param avatar_id 本地角色的 `av`（走 `/api/me`）。
 * @param remote `undefined` 完全不攔即時層（V1 用，走真後端）；
 *               `null` 攔但名單上沒有別人；數字則是那個鄰居的 `av`（V2 用）。
 */
async function framesWith(browser, avatar_id, remote) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PROFILE(avatar_id)),
    }),
  )
  if (remote !== undefined) await fakeRealtime(context, remote)
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/world`)
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="world-loading"]') === null,
    null,
    { timeout: 30_000 },
  )
  const badge = (await page.textContent('[data-testid="identity"]'))?.trim()
  // 等世界穩定下來（載入、物理、第一批 rAF）。
  await page.waitForTimeout(2500)
  const frames = []
  for (let i = 0; i < FRAMES; i++) {
    frames.push(await grab(page))
    await page.waitForTimeout(220)
  }
  await context.close()
  return { frames, badge }
}

const browser = await chromium.launch({ args: ARGS })

try {
  const a = await framesWith(browser, 0)
  const b = await framesWith(browser, 1)
  const c = await framesWith(browser, 0)

  if (a.frames.some((f) => f === null)) {
    bad('拿不到 WebGL context', '世界沒有畫出 canvas —— 那是環境的問題，不是這條判準的')
  } else {
    // 兩邊的身分列必須一樣，否則比的就不只是 `av`。
    if (a.badge === b.badge) ok(`兩次載入的身分相同（${a.badge}），差異只可能來自 av`)
    else bad('兩次載入的身分不同', `${a.badge} vs ${b.badge}`)

    // ── 正向對照。**沒有這一條，底下那條說明不了什麼** ──────────
    //
    // 如果同一個 `av` 兩次載入就已經差了幾百個像素，那「換 `av` 差了
    // 一千個像素」證明不了任何事。這一條先把尺校準。
    const noise = stableDiff(a.frames, c.frames)
    if (noise <= NOISE_CEILING) ok(`同一個 av 兩次載入的保守差異 ${noise}（上限 ${NOISE_CEILING}）`)
    else
      bad(
        `同一個 av 兩次載入就差了 ${noise} 個像素`,
        '這條判準的尺壞了 —— 在修產品之前先修這裡（可能是動畫、相機或載入時機）',
      )

    // ── `S01`：畫面上真的看得出差別 ─────────────────────────────
    const signal = stableDiff(a.frames, b.frames)
    if (signal >= SIGNAL_FLOOR)
      ok(`av=0 與 av=1 的保守差異 ${signal} 個像素（下限 ${SIGNAL_FLOOR}，雜訊 ${noise}）`)
    else
      bad(
        `av=0 與 av=1 只差了 ${signal} 個像素`,
        `低於下限 ${SIGNAL_FLOOR}。可能是角色沒有讀 av，或是兩款外觀的色差不夠` +
          `（規格 S04：差異 SHALL 落在主要視覺部位，同色系微調不算）`,
      )

    // ── `S02`：**遠端玩家也要吃得到 `av`** ─────────────────────
    //
    // ⚠️ **這不是 V1 的重複。** 本地角色的 `av` 走 `/api/me`，
    // 遠端的走 WebSocket 的 `snapshot` —— 兩條完全不同的路。
    // 把 `RemotePlayers` 傳給子元件的 `av` 拿掉，上面每一條都還是綠的。
    const none = await framesWith(browser, 0, null)
    const peer0 = await framesWith(browser, 0, 0)
    const peer1 = await framesWith(browser, 0, 1)

    // ── V2a：鄰居真的被畫出來了 ────────────────────────────────
    //
    // ⚠️ **少了這一條，下面那條的紅燈說不出是哪一種壞。**
    // 「注入的 snapshot 根本沒有走到畫面上」（測試自己壞了）與
    // 「鄰居畫出來了但沒有讀 `av`」（產品壞了）都會讓差異變成 0。
    const appeared = stableDiff(none.frames, peer0.frames)
    if (appeared >= PEER_FLOOR)
      ok(`注入的鄰居在畫面上佔了 ${appeared} 個像素（下限 ${PEER_FLOOR}）`)
    else
      bad(
        `注入的鄰居只讓畫面差了 ${appeared} 個像素`,
        `低於下限 ${PEER_FLOOR}。**這是量測壞了，不是產品壞了** —— ` +
          `snapshot 沒有走到畫面上（或者鄰居被放到鏡頭外了，見 PEER_AT）。` +
          `在看下面那條之前先修這裡`,
      )

    // ── V2b：遠端的 av=0 與 av=1 看得出差別 ────────────────────
    const remoteSignal = stableDiff(peer0.frames, peer1.frames)
    if (remoteSignal >= REMOTE_FLOOR)
      ok(`遠端 av=0 與 av=1 的保守差異 ${remoteSignal} 個像素（下限 ${REMOTE_FLOOR}）`)
    else
      bad(
        `遠端玩家的 av=0 與 av=1 只差了 ${remoteSignal} 個像素`,
        `低於下限 ${REMOTE_FLOOR}。鄰居有被畫出來（上一條 ${appeared} 個像素），` +
          `所以問題在**遠端那條路沒有把 av 傳下去** —— 看 RemotePlayers.tsx`,
      )
  }
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
