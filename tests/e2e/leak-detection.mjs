// FE-W07 的瀏覽器驗收：GPU 資源在反覆進出之後有沒有累積。
// 規格 `openspec/specs/world-resources/`，Scenario S01～S05。
//
// **它不在 CI 裡，也不在 `npm test` 裡** —— 它要起一顆真的瀏覽器。
// 但它**不需要後端也不需要 dev server**：量測台是這支自己起的一個
// vite server，當次建立當次銷毀，只服務 `tests/e2e/leak-harness/`。
//
// ─────────────────────────────────────────────────────────────────────
// 為什麼一定要真瀏覽器（design 的 D1）
//
// R3F 的釋放走 `unstable_scheduleCallback(unstable_IdlePriority, …)`，
// 是**延後的**。在 `@react-three/test-renderer` 裡量，卸載之後 dispose 計數是 0，
// 等 200 毫秒還是 0 —— 跟真瀏覽器**相反的答案**。
// 而且那裡根本沒有 `renderer.info.memory` 可以讀。
//
// ─────────────────────────────────────────────────────────────────────
// 這把尺量不到什麼（兩個外部審查者各自指出的，逐條確認過）
//
//   **只漏一次的東西。** 第一輪是暖機、不列入比較，所以「第一次掛載漏一份、
//   之後平坦」會被判成乾淨。那個形狀不會隨遊玩時間成長，不是這條規格要防的。
//
//   **`info.memory` 以外的資源。** 它只有 `geometries` 與 `textures` 兩個欄位 ——
//   material、shader program、renderbuffer 的一部分都不在裡面。
//   material 的釋放這裡靠不到數字，只能靠所有權規則。
//
//   **一漏一放剛好抵銷。** 判準是總數相等，同一輪多一份又少一份看起來是平的。
//
//   **要靠 props 或 context 才會建立的資源。** 受測清單用預設 props render，
//   一個只有在 `equipped` 為真時才長出武器的元件，在這裡是空殼。
//
//   **建立時間超過 SETTLE_MS 的非同步資源**（loader、`await import`）——
//   讀數的時候它還沒掛上去。
//
// 這些不是「之後補」，是**這把尺的解析度**。寫在這裡是為了讓看到綠燈的人
// 知道綠燈涵蓋到哪裡為止。
//
// ─────────────────────────────────────────────────────────────────────
// 用法
//
//   node tests/e2e/leak-detection.mjs
//
// 環境變數：LEAK_HEADED=1 開有頭模式看畫面。

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const CONFIG = path.join(HERE, 'leak-harness/vite.config.mts')

/** vite server 要在這個時間內印出網址，否則測試以「server 那一環」失敗（S04）。 */
const SERVER_READY_TIMEOUT_MS = 60_000
/** 量測台要在這個時間內把結果放上 `window`。十輪 × 4 個 subject × settle。 */
const RESULT_TIMEOUT_MS = 180_000

const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

function fail(step, detail) {
  console.error(`\n❌ ${step}`)
  console.error(String(detail))
  process.exitCode = 1
}

/** 起 vite，等它印出自己的網址。**起不來要明顯失敗，不是當成沒有洩漏**（S04）。 */
async function startServer() {
  const child = spawn('npx', ['vite', '--config', CONFIG], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`vite server ${SERVER_READY_TIMEOUT_MS}ms 內沒有就緒。輸出：\n${log}`)),
      SERVER_READY_TIMEOUT_MS,
    )
    const onData = (chunk) => {
      log += String(chunk)
      const m = log.match(/(http:\/\/127\.0\.0\.1:\d+)\//)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`vite server 直接結束了（exit ${code}）。輸出：\n${log}`))
    })
  })
  return { child, url }
}

/**
 * 一個 subject 的判定。
 *
 * **第一輪是暖機**（shader 編譯、shadow map render target 建立），從第二輪起比。
 * 判準是**兩兩完全相等**，不是百分比容差（design 的 D3）——
 * 容差會讓「每輪多 1 份」拖到第七輪才超標，而訊息只會說「成長 16%」。
 */
function verdict(rounds) {
  const compared = rounds.slice(1)
  const base = compared[0]
  const growth = []
  for (const r of compared) {
    if (r.geometries !== base.geometries) growth.push(`geometries ${base.geometries}→${r.geometries}（第 ${r.round} 輪）`)
    if (r.textures !== base.textures) growth.push(`textures ${base.textures}→${r.textures}（第 ${r.round} 輪）`)
  }
  const last = compared[compared.length - 1]
  const perRound = (last.geometries - base.geometries) / (compared.length - 1)
  return { leaks: growth.length > 0, growth, perRound }
}

async function main() {
  let server
  try {
    server = await startServer()
  } catch (e) {
    return fail('vite server 起不來 —— 這不是「沒有洩漏」，是量不到（FE-W07-S04）', e)
  }

  const browser = await chromium
    .launch({ args: ARGS, headless: process.env.LEAK_HEADED !== '1' })
    .catch((e) => {
      fail('Chromium 起不來 —— 這不是「沒有洩漏」，是量不到（FE-W07-S04）', e)
      return null
    })
  if (browser === null) {
    server.child.kill()
    return
  }

  const page = await browser.newPage()

  // FE-W07-S05：量測台不得對 127.0.0.1 以外的任何位址發出請求。
  // 量測台一旦 import 到會自己建立連線的模組（例如 `RemoteWorld`），
  // 它就會**安靜地**去連預設的後端位址。
  const foreign = []
  page.on('request', (req) => {
    const u = new URL(req.url())
    if (u.hostname !== '127.0.0.1' && u.protocol !== 'data:' && u.protocol !== 'blob:') {
      foreign.push(`${req.method()} ${req.url()}`)
    }
  })

  try {
    await page.goto(server.url)
    await page.waitForFunction(() => window.__LEAK_RESULT__ !== undefined, null, {
      timeout: RESULT_TIMEOUT_MS,
    })
    const result = await page.evaluate(() => window.__LEAK_RESULT__)
    const constants = await page.evaluate(() => window.__LEAK_CONSTANTS__)

    if (!result.ok) return fail('量測台自己失敗了', result.error)

    console.log(`每輪等待 ${constants.settleMs}ms，共 ${constants.rounds} 輪\n`)

    // ── FE-W07-S03：尺要先證明自己量得到 ──
    // 這一段**必須在其他判定之前**。校正砝碼沒被量到的話，
    // 後面每一個「乾淨」都沒有意義。
    const calib = result.subjects.find((s) => s.id === 'fixture:leaking')
    if (calib === undefined) return fail('校正砝碼不在受測清單裡（FE-W07-S03）', '')
    const calibVerdict = verdict(calib.rounds)
    if (!calibVerdict.leaks) {
      return fail(
        '這把尺量不到東西 —— 故意洩漏的 fixture 被判成乾淨（FE-W07-S03）',
        `這**不是**「沒有洩漏」。量測台本身壞了，所有其他結果都不算數。\n` +
          `最常見的原因：每輪開了一個新的 <Canvas>（新的 renderer），\n` +
          `於是 info.memory 每輪從零開始，洩漏與不洩漏量出一樣的數字。\n` +
          `十輪的數字：${JSON.stringify(calib.rounds)}`,
      )
    }
    console.log(`✅ 尺量得到：校正砝碼每輪多 ${calibVerdict.perRound} 份 geometry`)

    // ── 其餘 subject 逐一對照 expect ──
    let bad = 0
    for (const s of result.subjects) {
      const v = verdict(s.rounds)
      const got = v.leaks ? 'leaks' : 'clean'
      const mark = got === s.expect ? '✅' : '❌'
      console.log(`${mark} ${s.id}：判定 ${got}（預期 ${s.expect}）`)
      if (got !== s.expect) {
        bad++
        console.log(`   ${v.growth.join('\n   ')}`)
        console.log(`   十輪：${JSON.stringify(s.rounds)}`)
      }
    }
    if (bad > 0) return fail(`${bad} 個受測對象的判定與預期不符（FE-W07-S01／S02）`, '')

    if (foreign.length > 0) {
      return fail('量測台對外連線了（FE-W07-S05）', foreign.join('\n'))
    }
    console.log('\n✅ 全部通過')
  } catch (e) {
    fail('量測過程失敗', e)
  } finally {
    await browser.close()
    server.child.kill()
  }
}

await main()
