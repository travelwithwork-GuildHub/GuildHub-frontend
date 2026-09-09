// FE-R09 的渲染預算：**一個真實的瀏覽器**渲染 N 個遠端角色時的 FPS。
// 規格 `openspec/specs/load-budget/`，Scenario S01～S04、S07、S08。
//
// ─────────────────────────────────────────────────────────────────────
// 被測端是真的，其他人是 WebSocket client
//
// 工作分解表寫著「不是 WebSocket fake client」。那句話是在防止把整項偷換成
// **伺服器 socket 壓測**。這裡被測的那一個瀏覽器仍然是真的 ——
// 它跑完整的前端，真的建立 N 個 RemotePlayer、真的每幀對每一個做插值、
// 真的產生 draw call 與 shadow map。被換掉的只有「其他人自己的前端」。
//
// 40 個真實瀏覽器跑不動：實測一個 headless Chromium 跑**空白的** WebGL 頁面
// 就要 225 MB，40 × 225 = 9 GB 超過整台機器的實體記憶體（design 的 D1）。
//
// ─────────────────────────────────────────────────────────────────────
// 用法
//
//   1. 後端（**一定要是自己起的**）：
//        cd ../GuildHub-backend && .venv/bin/uvicorn app.main:app --port 8000
//   2. 前端：npm run dev
//   3. node tests/e2e/render-budget.mjs
//
//   環境變數：N（其他玩家人數，預設 10）、SECONDS（量幾秒，預設 10）、
//            CLEAN=1（關掉抖動與突發 —— `S04` 的對照組）

import { chromium } from 'playwright-core'
import { startFakeClient, waitReady } from './support/fake-client.mjs'

const N = Number(process.env.N ?? 10)
const SECONDS = Number(process.env.SECONDS ?? 10)
const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const WS = process.env.WS ?? 'ws://localhost:8000/ws'
/** `S04` 的對照組：關掉抖動與突發，數字應該變好。 */
const CLEAN = process.env.CLEAN === '1'

const ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
]

/** 在頁面腳本之前裝好：three 的 devtools hook ＋ 一個 rAF 計時器。 */
const INIT = () => {
  window.__scenes = []
  window.__THREE_DEVTOOLS__ = {
    dispatchEvent(e) {
      if (e?.detail?.isScene) window.__scenes.push(e.detail)
    },
  }
  window.__scene = () => window.__scenes[0] ?? null
  // ⚠️ **用 rAF 量幀，不用 CDP 的 metrics**：後者給的是整個 renderer process
  // 的統計，而這裡要的是「這個頁面的 render loop 跑了幾次」。
  window.__frames = []
  const tick = (t) => {
    window.__frames.push(t)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]

function fail(step, detail) {
  console.error(`\n❌ ${step}`)
  if (detail) console.error(String(detail))
  printLimits()
  process.exitCode = 1
}

/** 規格 `FE-R09-S07`：**無論通過或失敗都要印**。 */
function printLimits() {
  console.log(`
─────────────────────────────────────────────────────────
這把尺量不到什麼

  · ${N + 1} 個完整前端在同一台機器上的 CPU／RAM／GPU／VRAM 競爭
  · 每個玩家自己的本地角色成本（輸入、物理、動畫、本地渲染）
  · 多個瀏覽器搶同一顆 GPU 時，單一玩家的 FPS 衰退
  · 真實客戶端的連線、重連、資源載入、WASM 初始化與 shader 編譯尖峰
  · 不同客戶端之間的時鐘漂移與背景分頁節流

  這裡只有**一個**真實瀏覽器。其他 ${N} 個是 WebSocket client ——
  被測端的渲染是真的，其他人的前端不是。
─────────────────────────────────────────────────────────`)
}

async function main() {
  console.log(`前端 ${FRONTEND}／其他玩家 ${N} 人／量 ${SECONDS} 秒`)
  console.log(CLEAN ? '流量：**乾淨**（S04 的對照組，關掉抖動與突發）\n' : '流量：有抖動、同幀突發、移動變化\n')

  const traffic = CLEAN ? { jitter: 0, burst: 0, wander: 0 } : {}
  const clients = []
  for (let i = 0; i < N; i++) {
    clients.push(startFakeClient({ url: `${WS}?scene=lobby`, ...traffic }))
    await sleep(25)
  }
  const ready = await waitReady(clients)
  if (ready < N) {
    for (const c of clients) c.close()
    return fail(`只有 ${ready} / ${N} 個 client 連得上（FE-R09-S09）`, '後端沒起來，或位址不對。')
  }
  console.log(`✅ ${ready} / ${N} 個假 client 都連上了`)

  const browser = await chromium.launch({ args: ARGS }).catch((e) => {
    fail('Chromium 起不來（FE-R09-S08）', e)
    return null
  })
  if (browser === null) {
    for (const c of clients) c.close()
    return
  }

  try {
    const page = await browser.newPage()
    await page.addInitScript(INIT)
    const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
    if (response === null || !response.ok()) {
      return fail('前端 dev server 沒起來（FE-R09-S08）', `${FRONTEND}/world 連不上`)
    }
    await page.waitForFunction(() => window.__scene() !== null, null, { timeout: 30_000 })

    // 等遠端角色掛上來。**Group 有一個是自己**，所以要 N + 1。
    await page
      .waitForFunction(
        (want) => window.__scene().children.filter((o) => o.type === 'Group').length >= want,
        N + 1,
        { timeout: 30_000 },
      )
      .catch(() => {})

    const groups = await page.evaluate(
      () => window.__scene().children.filter((o) => o.type === 'Group').length,
    )
    const remotes = groups - 1

    // ⚠️⚠️ **這是最容易產生假綠燈的地方**（規格 `FE-R09-S02`）。
    // 那些人沒有真的出現在畫面上時 FPS 當然漂亮 ——
    // 而那個數字會被當成「N 個人沒問題」。
    if (remotes !== N) {
      return fail(
        `畫面上只有 ${remotes} 個遠端角色，預期 ${N} 個（FE-R09-S02）`,
        '**不回報 FPS** —— 人數不對的 FPS 沒有意義，而它之後會被引用。',
      )
    }
    console.log(`✅ 畫面上真的有 ${remotes} 個遠端角色`)

    await page.evaluate(() => {
      window.__frames.length = 0
    })
    await sleep(SECONDS * 1000)
    const frames = await page.evaluate(() => window.__frames.slice())

    if (frames.length < 10) {
      return fail(`只取到 ${frames.length} 幀 —— render loop 沒有在跑`, '')
    }

    const gaps = []
    for (let i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1])
    const sorted = [...gaps].sort((a, b) => a - b)
    const seconds = (frames[frames.length - 1] - frames[0]) / 1000
    const fps = (frames.length - 1) / seconds

    console.log(`\n取樣 ${frames.length} 幀 / ${seconds.toFixed(1)} 秒`)
    console.log(`  平均 FPS      ${fps.toFixed(1)}`)
    console.log(`  幀間隔中位數  ${percentile(sorted, 0.5).toFixed(1)} ms`)
    console.log(`  幀間隔 p99    ${percentile(sorted, 0.99).toFixed(1)} ms`)
    console.log(`  最長一幀      ${sorted[sorted.length - 1].toFixed(1)} ms`)
    console.log(`\nRESULT ${JSON.stringify({ n: N, clean: CLEAN, remotes, fps: Number(fps.toFixed(2)), p50: percentile(sorted, 0.5), p99: percentile(sorted, 0.99) })}`)
  } finally {
    await browser.close()
    for (const c of clients) c.close()
  }

  printLimits()
}

await main()
