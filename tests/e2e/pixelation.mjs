// `FE-W14-S05` 的像素化渲染驗證（web-facing 的可觀察成果，只能在真的 WebGL 上問）。
//
// jsdom 沒有 WebGL2：有效 DPR、`image-rendering`、antialias 這三件事都量不到
// （`WorldCanvas` 的單元測試把 `@react-three/fiber` 的 `Canvas` mock 掉，`onCreated`
//  的 DOM 副作用在那裡被防禦跳過）。這一支就是補那個缺口 —— 對 `next start` 起來的
// 建置產物，在真的 swiftshader WebGL2 上讀 canvas 的實際尺寸與樣式。
//
// 用法（先 `NEXT_PUBLIC_APP_ENV=local pnpm build` 再起 `next start`）：
//   FRONTEND=http://127.0.0.1:PORT SHOTS=/tmp/shots node tests/e2e/pixelation.mjs
//
// ⚠️ **只打本機。** REST（`/api/me`）與 WebSocket（`/ws`）全部由 `page.route` 偽造，
// 不連任何團隊共用位址（跟 `lib/world.mjs` 同一條規則）。

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const SHOTS = process.env.SHOTS ?? process.env.OUT ?? '.'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
if (!LOOPBACK.has(new URL(FRONTEND).hostname)) {
  console.error(`FRONTEND 必須是本機，不是 ${FRONTEND}`)
  process.exit(2)
}

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d = '') => {
  failures++
  console.log(`❌ ${l}${d ? `\n   ${d}` : ''}`)
}

// 已登入才進得了世界（`FE-A06` 取名門檻：訪客不 render 世界）。攔 `/api/me` 給一個 profile。
const PROFILE = {
  id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  display_name: '像素測試員',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
}

// 假的即時層：回 `hello` ＋ 只有自己的 `snapshot`，讓世界走到 ready，且不連任何共用位址。
const SELF = '11111111-1111-4111-8111-111111111111'
const fakeRealtime = (context) =>
  context.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    ws.send(JSON.stringify({ t: 'hello', you: SELF, hz: 10 }))
    ws.send(
      JSON.stringify({
        t: 'snapshot',
        players: [{ id: SELF, name: '像素測試員', av: 0, x: 0, y: -32, f: 0, st: 'idle' }],
      }),
    )
  })

const browser = await chromium.launch({ args: ARGS })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // 打到本機以外一律算紅（「REST／WS 全部偽造」的機器保證）。
  context.on('request', (req) => {
    const u = req.url()
    if (!u.startsWith('data:') && !LOOPBACK.has(new URL(u).hostname)) bad('打到了本機以外的位址', u)
  })
  await context.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE) }),
  )
  await context.route('**/api/rooms**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await fakeRealtime(context)

  const page = await context.newPage()
  await page.goto(`${FRONTEND}/world`)
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="world-loading"]') === null,
    null,
    { timeout: 30_000 },
  )
  // 等世界穩定（載入、物理、第一批 rAF）。
  await page.waitForTimeout(2500)

  const m = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const cs = getComputedStyle(c)
    return {
      backingW: c.width,
      backingH: c.height,
      cssW: Math.round(rect.width),
      cssH: Math.round(rect.height),
      imageRendering: cs.imageRendering,
      dpr: window.devicePixelRatio,
    }
  })

  if (!m || m.backingW === 0 || m.cssW === 0) {
    bad('拿不到 canvas 尺寸', '世界沒有畫出可量的 canvas —— 環境問題')
  } else {
    // 有效 DPR ≈ backing store / CSS 尺寸（headless 的 devicePixelRatio 是 1）。
    // 目標 0.25；給 [0.18, 0.32] 的容忍（整數捨入＋捲軸/邊框的零頭）。
    const ratioX = m.backingW / (m.cssW * m.dpr)
    const ratioY = m.backingH / (m.cssH * m.dpr)
    const inband = (r) => r >= 0.18 && r <= 0.32
    if (inband(ratioX) && inband(ratioY)) {
      ok(`有效 DPR ≈ ${ratioX.toFixed(3)}×${ratioY.toFixed(3)}（目標 0.25；backing ${m.backingW}×${m.backingH} / CSS ${m.cssW}×${m.cssH}）`)
    } else {
      bad('有效 DPR 不在 1/4 附近', `x=${ratioX.toFixed(3)} y=${ratioY.toFixed(3)}（backing ${m.backingW}×${m.backingH} / CSS ${m.cssW}×${m.cssH}）`)
    }
    // 上限 2 仍成立（`FE-W01-S02`）：0.25 遠低於 2。
    if (ratioX <= 2 && ratioY <= 2) ok('有效 DPR 未超過上限 2')
    else bad('有效 DPR 超過上限 2', `x=${ratioX} y=${ratioY}`)

    if (m.imageRendering === 'pixelated') ok('canvas 的 image-rendering 是 pixelated（最近鄰放大）')
    else bad('image-rendering 不是 pixelated', String(m.imageRendering))
  }

  // antialias 要在 renderer 建立時就關掉。
  const aa = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    try {
      const gl = c?.getContext('webgl2')
      return gl ? Boolean(gl.getContextAttributes()?.antialias) : null
    } catch {
      return null
    }
  })
  if (aa === false) ok('renderer 的 antialias 已關閉')
  else bad('antialias 沒有關閉', String(aa))

  // 截圖：整個像素世界（草地＋角色描邊／髮型＋硬邊點陣）—— 可讀性（`FE-W14-S01`）人眼判。
  await page.screenshot({ path: `${SHOTS}/world-pixel-after.png` })
  ok(`截圖存到 ${SHOTS}/world-pixel-after.png`)

  await context.close()
} finally {
  await browser.close()
}

if (failures > 0) {
  console.error(`\n${failures} 條判準紅`)
  process.exit(1)
}
console.log('\n全部通過')
