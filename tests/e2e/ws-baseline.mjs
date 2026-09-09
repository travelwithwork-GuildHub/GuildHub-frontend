// FE-R09 的網路基準：**不開任何瀏覽器**，只用 WebSocket client。
// 規格 `openspec/specs/load-budget/`，Scenario S05／S06／S09。
//
// ─────────────────────────────────────────────────────────────────────
// 它跟渲染預算是兩件事，而且**處置完全不同**
//
//   伺服器／協定撐不住   →  改後端或協定
//   瀏覽器渲染撐不住     →  改渲染（FE-W13，W5）
//
// 混在一起量的話，一個壞掉的數字指不出要修哪一邊 ——
// 而這一項存在的理由就是「給出一個能做決定的數字」。
//
// ─────────────────────────────────────────────────────────────────────
// 用法
//
//   後端（**一定要是自己起的**，不可以連團隊共用位址）：
//     cd ../GuildHub-backend && .venv/bin/uvicorn app.main:app --port 8000
//
//   node tests/e2e/ws-baseline.mjs
//
//   環境變數：N（人數，預設 40）、SECONDS（量幾秒，預設 20）、
//            WS（預設 ws://localhost:8000/ws）

import { startFakeClient, waitReady } from './support/fake-client.mjs'

const N = Number(process.env.N ?? 40)
const SECONDS = Number(process.env.SECONDS ?? 20)
const WS = process.env.WS ?? 'ws://localhost:8000/ws'
const URL_WITH_SCENE = `${WS}?scene=lobby`

/** 靜止之後觀察多久，確認一則 `pos` 都不送（`S06`）。 */
const IDLE_SECONDS = 3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
  return sorted[i]
}

function fail(step, detail) {
  console.error(`\n❌ ${step}`)
  if (detail) console.error(String(detail))
  process.exitCode = 1
}

async function main() {
  console.log(`後端 ${WS}／${N} 個 client／量 ${SECONDS} 秒\n`)

  const clients = []
  for (let i = 0; i < N; i++) {
    clients.push(startFakeClient({ url: URL_WITH_SCENE }))
    // 一次全開會讓握手互相排隊，量到的是自己造成的擁塞
    await sleep(25)
  }

  const ready = await waitReady(clients)
  if (ready < N) {
    for (const c of clients) c.close()
    // ⚠️ **連不滿就失敗，不要用比較少的人數繼續量**（規格 `FE-R09-S09`）。
    // 繼續量的話輸出會是一個看起來正常、但人數不對的數字 —— 而它之後會被引用。
    return fail(
      `只有 ${ready} / ${N} 個 client 連得上（FE-R09-S09）`,
      '後端沒起來、位址不對，或它擋掉了一部分連線。' +
        '**不要拿這個人數的結果當基準** —— 少幾個人的數字之後會被當成 N 個人的。',
    )
  }
  console.log(`✅ ${ready} / ${N} 個都連上了`)

  // ── 量到達間隔 ──
  const before = clients.map((c) => c.state.receivedPos)
  const t0 = Date.now()
  await sleep(SECONDS * 1000)
  const elapsed = (Date.now() - t0) / 1000
  const deltas = clients.map((c, i) => c.state.receivedPos - before[i])

  const disconnected = clients.filter((c) => c.state.closed).length
  const sorted = [...deltas].sort((a, b) => a - b)
  const totalSent = clients.reduce((s, c) => s + c.state.sent, 0)

  console.log(`\n每個 client 在 ${elapsed.toFixed(1)} 秒內收到的 pos 則數：`)
  console.log(`  中位數 ${percentile(sorted, 0.5)}　p99 ${percentile(sorted, 0.99)}　最少 ${sorted[0]}`)
  console.log(`  平均每秒 ${(percentile(sorted, 0.5) / elapsed).toFixed(1)} 則（後端 HZ 是 10）`)
  console.log(`  全部 client 合計送出 ${totalSent} 則 move`)
  console.log(`  中途斷線：${disconnected}`)

  if (disconnected > 0) {
    for (const c of clients) c.close()
    return fail(`有 ${disconnected} 個 client 中途斷線`, '')
  }

  // ── S06：靜止時封包數為 0 ──
  //
  // 後端的 `broadcaster.tick()` 有 `if not moved: continue`。
  // 這一條同時是**工具的健康檢查**：收到封包代表工具或後端其中一個跟預期不符。
  for (const c of clients) c.freeze()
  await sleep(1000) // 讓最後一批廣播流完
  const idleBefore = clients.map((c) => c.state.receivedPos)
  await sleep(IDLE_SECONDS * 1000)
  const idleDeltas = clients.map((c, i) => c.state.receivedPos - idleBefore[i])
  const idleTotal = idleDeltas.reduce((a, b) => a + b, 0)

  console.log(`\n全部靜止 ${IDLE_SECONDS} 秒之後收到的 pos 則數合計：${idleTotal}`)

  for (const c of clients) c.close()

  if (idleTotal !== 0) {
    return fail(
      `靜止時仍然收到 ${idleTotal} 則 pos（FE-R09-S06）`,
      '後端的 broadcaster.tick() 應該有 `if not moved: continue`。' +
        '這也可能是量測工具的問題 —— **先查工具再查產品**。',
    )
  }
  console.log('✅ 靜止時封包數為 0')

  console.log(`
─────────────────────────────────────────────────────────
這把尺量不到什麼

  這裡沒有任何瀏覽器。它回答的是「伺服器與協定撐不撐得住 ${N} 條連線」，
  **不回答「一個瀏覽器渲染 ${N - 1} 個遠端角色會不會掉幀」** ——
  那是 tests/e2e/render-budget.mjs。

  也不回答「${N} 個完整前端在同一台機器上」：那需要 ${N} 個真實瀏覽器，
  而這台機器（8 GB）跑不動（FE-R09 design 的 D1）。
─────────────────────────────────────────────────────────`)
}

await main()
