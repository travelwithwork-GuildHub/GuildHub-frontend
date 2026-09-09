// FE-R08 的瀏覽器驗收：遠端角色在真實瀏覽器裡到底順不順。
//
// 這是 tasks.md 第 5 節（design.md 的 V2）。**它不在 CI 裡，也不在 `npm test` 裡** ——
// 它需要一個本機自己起的後端、一個 dev server 和一顆真的瀏覽器，
// 而 CI 沒有服務可用（AGENTS.md〈測試環境隔離〉）。
//
// ─────────────────────────────────────────────────────────────────────
// 為什麼一定要有這一條
//
// 單元測試證明的是「`evaluate` 這個純函式算得對」。它證明不了
// **畫面真的每一幀都在動** —— 中間還隔著 R3F 的 render loop、
// 真實的 WebSocket、真實的 10 Hz 到達間隔，以及瀏覽器自己的排程。
// 把插值整段拿掉，單元測試會紅；但如果只有單元測試，
// 「接線接錯所以插值根本沒被呼叫」這種錯誤是**測不出來的**。
//
// ─────────────────────────────────────────────────────────────────────
// 怎麼看得到遠端角色的座標
//
// 用 three.js 自己的 devtools hook：`Scene` 與 `WebGLRenderer` 的建構子會對
// `window.__THREE_DEVTOOLS__` 送一個 `observe` 事件。在頁面腳本跑之前
// （`addInitScript`）先把它定義好，就能拿到 Scene 物件。
//
// **刻意不在正式碼開一個 debug 用的出口** —— 那種出口會一路活到正式站，
// 而且沒有人記得它為什麼在那裡。這個 hook 是 three.js 本來就有的。
//
// ─────────────────────────────────────────────────────────────────────
// 用法
//
//   1. 後端（**一定要是自己起的**，不可以連團隊共用位址）：
//        cd ../GuildHub-backend && bash run.sh
//   2. 前端：
//        npm run dev
//   3. 這支：
//        node tests/e2e/interpolation-smoothness.mjs
//
//   環境變數：FRONTEND（預設 http://localhost:3100）、LEG_MS（每一邊的毫秒數，預設 1500）

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const LEG_MS = Number(process.env.LEG_MS ?? 1500)

// **走一個正方形，不是一直往同一個方向走。**
// 世界有邊界：往右一直走 2.6 秒就會卡在 x ≈ 9.74，之後每一幀都是零位移 ——
// 那是撞牆，不是跳格，但統計出來一模一樣（實測過：6 秒的直線走法量到
// 60% 零位移幀，而其中真正在走的那 94 幀是 0%）。
// 正方形每邊 1500ms（約 6 個世界單位）距原點永遠不會超過 6，撞不到邊界，
// 而且轉角處方向改變但速度大小不變，不會產生靜止幀。
const LEGS = ['KeyD', 'KeyS', 'KeyA', 'KeyW']

// 兩個分頁**不能放在同一顆瀏覽器的兩個 tab 裡**：背景分頁的 rAF 會被節流到
// 每秒一兩幀，於是「走路的那個不動」「觀察的那個取不到樣本」，
// 而症狀看起來會像是插值壞掉。開兩顆瀏覽器，再加上這三個旗標。
const ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  // CI runner 與無頭環境沒有 GPU；SwiftShader 是軟體 WebGL2。
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
]

/** 在頁面腳本之前裝好 three 的 devtools hook，並提供取樣用的工具。 */
const INIT = () => {
  window.__scenes = []
  window.__THREE_DEVTOOLS__ = {
    dispatchEvent(e) {
      if (e?.detail?.isScene) window.__scenes.push(e.detail)
    },
  }
  window.__scene = () => window.__scenes[0] ?? null
  /** 場景頂層那些「角色」——`<group><ChibiPlayer/></group>` 的最外層。 */
  window.__avatars = () => {
    const s = window.__scene()
    if (!s) return []
    return s.children.filter((o) => o.type === 'Group').map((o) => o.uuid)
  }
}

async function openWorld(label) {
  const browser = await chromium.launch({ headless: true, args: ARGS })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  const problems = []
  page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${label} console: ${m.text().slice(0, 200)}`)
  })
  await page.addInitScript(INIT)
  await page.goto(`${FRONTEND}/world`, { waitUntil: 'domcontentloaded' })
  // 場景建好（`WebGLRenderer` 起來、`Canvas` 的 onCreated 跑過）
  await page.waitForFunction(() => window.__scene() !== null, null, { timeout: 30_000 })
  return { browser, page, problems }
}

const quantile = (sorted, q) => {
  if (sorted.length === 0) return NaN
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[i]
}

async function main() {
  console.log(`前端 ${FRONTEND}／正方形每邊 ${LEG_MS}ms（共 ${LEG_MS * LEGS.length}ms）\n`)

  // ⚠️ **走路端先開。** 這樣它的場景裡只有自己一個角色，
  // 它自己那一個是誰就是確定的 —— 不必用「第幾個 child」去猜。
  // （猜過一次：`children.at(-1)` 在觀察端進來之後指到的是**對方**，
  //  於是「走路端 100% 的幀沒有移動」，而真正的原因是抓錯了物件。）
  const walker = await openWorld('walker')
  const walkerOwn = await walker.page.evaluate(() => window.__avatars())
  if (walkerOwn.length !== 1) {
    console.error(`走路端場景裡有 ${walkerOwn.length} 個角色，預期只有自己一個。是不是還有別的分頁連著？`)
    process.exit(1)
  }
  console.log(`走路端自己的角色 ${walkerOwn[0].slice(0, 8)}…`)

  const observer = await openWorld('observer')
  // 觀察端要看到兩個：自己，加上走路端。
  await observer.page.waitForFunction(() => window.__avatars().length >= 2, null, { timeout: 30_000 })
  console.log(`觀察端場景裡有 ${(await observer.page.evaluate(() => window.__avatars())).length} 個角色\n`)

  // 走路端開始走。`input.ts` 讀的是 `event.code`。
  await walker.page.keyboard.down(LEGS[0])

  // ⚠️ **要等他真的動起來才開始取樣。**
  //
  // 按下按鍵之後，畫面上這個人**應該**要靜止一小段時間：`join` 之後的頭
  // 250 毫秒游標比第一筆樣本還早（`FE-R08-S14`），再加上一趟網路來回。
  // 那段靜止是規格規定的行為，不是跳格。
  //
  // 第一版用「頭尾各切掉 15%」處理這件事，結果是 53% 的零位移幀、
  // 中位數 0 —— 看起來就像插值整個沒接上。實際的軌跡是前 500 毫秒完全沒動、
  // 之後每一幀都在動。**用固定比例去切一段長度會變的暖機期，量到的是暖機期。**
  await observer.page.waitForFunction(
    () =>
      window.__scene().children.some(
        (o) => o.type === 'Group' && Math.hypot(o.position.x, o.position.z) > 0.05,
      ),
    null,
    { timeout: 30_000 },
  )

  // **會動的那一個就是遠端角色。** 觀察端自己從頭到尾沒有按過任何鍵，
  // 所以它自己的角色停在原點 —— 這比「第幾個 child」可靠得多，
  // 而且如果哪天順序變了，這裡不會靜靜地量錯東西。
  const remoteUuid = await observer.page.evaluate(
    () =>
      window.__scene().children.find(
        (o) => o.type === 'Group' && Math.hypot(o.position.x, o.position.z) > 0.05,
      ).uuid,
  )
  console.log(`觀察端認出遠端角色 ${remoteUuid.slice(0, 8)}…（會動的那一個）\n`)

  // 逐幀取樣。**在頁面裡跑 rAF**，不是從 Node 輪詢 —— 從外面問一次要跨程序，
  // 頻率遠低於 60 FPS，量到的會是取樣器自己的節奏而不是畫面的。
  //
  // 走路端也取樣自己的位置：拿來分辨「插值不順」與「他根本沒在走」。
  // 少了這一份，撞牆會偽裝成跳格。
  const startSampling = (page, uuid) =>
    page.evaluate((u) => {
      window.__samples = []
      const target = window.__scene().children.find((o) => o.uuid === u)
      if (target === undefined) throw new Error('找不到要取樣的角色 ' + u)
      window.__stop = false
      const tick = () => {
        if (window.__stop) return
        window.__samples.push([performance.now(), target.position.x, target.position.z])
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, uuid)

  await startSampling(observer.page, remoteUuid)
  await startSampling(walker.page, walkerOwn[0])

  // 走完剩下的三邊。**先按下一個鍵再放開上一個** —— 反過來的話中間會有
  // 幾毫秒沒有任何鍵被按著，那會製造一個「他停下來了」的真實靜止段。
  for (let i = 1; i < LEGS.length; i++) {
    await new Promise((r) => setTimeout(r, LEG_MS))
    await walker.page.keyboard.down(LEGS[i])
    await walker.page.keyboard.up(LEGS[i - 1])
  }
  await new Promise((r) => setTimeout(r, LEG_MS))

  // **先停取樣再放開按鍵。** 反過來的話，最後 250 毫秒（畫面把 render delay
  // 裡剩下的樣本播完、然後夾在最後一筆上）會被算進去 —— 那一段本來就該停，
  // 算進去等於用不該動的幀去指控插值不動。
  const stop = (page) => page.evaluate(() => { window.__stop = true; return window.__samples })
  const samples = await stop(observer.page)
  const walkerSamples = await stop(walker.page)
  await walker.page.keyboard.up(LEGS.at(-1))

  // ── 統計 ───────────────────────────────────────────────────────────
  //
  // 取樣的區間已經整段落在「他在走」裡面（上面用的是條件等待，不是固定比例），
  // 所以這裡不再切頭尾 —— 每一幀都算。
  const deltas = (rows) => {
    const out = []
    for (let i = 1; i < rows.length; i++) {
      const [, x0, z0] = rows[i - 1]
      const [, x1, z1] = rows[i]
      out.push(Math.hypot(x1 - x0, z1 - z0))
    }
    return out
  }
  const walking = deltas(samples)
  if (walking.length < 60) {
    console.error(`只取到 ${walking.length} 幀，太少，統計沒有意義。是不是 dev server 或後端沒起來？`)
    process.exit(1)
  }

  // ⚠️ **先確認走路端真的一直在走。**
  // 撞到世界邊界之後他會停在原地，而遠端畫面當然也跟著停 ——
  // 統計上跟「插值完全沒接上」一模一樣。沒有這一關的話，
  // 這支腳本會用一個跟插值無關的理由變紅，而錯誤訊息會指向插值。
  const walkerZeroPct =
    (deltas(walkerSamples).filter((d) => d === 0).length / Math.max(1, deltas(walkerSamples).length)) * 100
  if (walkerZeroPct > 5) {
    console.error(
      `走路端自己有 ${walkerZeroPct.toFixed(1)}% 的幀沒有移動 —— 他被卡住了（多半是撞到世界邊界）。\n` +
        `這一輪量到的東西跟插值無關。把 LEG_MS 調小再跑。`,
    )
    process.exit(1)
  }

  const sorted = [...walking].sort((a, b) => a - b)

  const zero = walking.filter((d) => d === 0).length
  const zeroPct = (zero / walking.length) * 100
  const median = quantile(sorted, 0.5)
  const p99 = quantile(sorted, 0.99)

  const fps = (samples.length - 1) / ((samples.at(-1)[0] - samples[0][0]) / 1000)

  console.log(`取樣 ${samples.length} 幀（約 ${fps.toFixed(1)} FPS），統計 ${walking.length} 個幀間位移`)
  console.log(`走路端自己沒動的幀：${walkerZeroPct.toFixed(2)}%（用來確認他真的一直在走）`)
  console.log(`每幀位移：中位數 ${median.toFixed(5)}　p99 ${p99.toFixed(5)}　最大 ${sorted.at(-1).toFixed(5)}`)
  console.log(`零位移幀：${zero} / ${walking.length}　(${zeroPct.toFixed(2)}%)`)

  // ⚠️ **第三條判準量的是速度，不是每幀位移。**
  //
  //     每幀位移 = 速度 × 該幀的幀間隔
  //
  // 這支腳本跑在 SwiftShader（軟體 WebGL）上，約 38–42 FPS，而且**幀間隔本身
  // 很不平均**（p99 ÷ 中位數 就有 1.9–2.7）。用每幀位移當判準的話，
  // 量到的離散度裡有一大半是渲染器的抖動 —— 同一份正式碼連續跑五次會落在
  // 2.05 到 3.62，其中一次超過門檻 3。**一把會自己變形的尺量不出東西。**
  // 除掉幀間隔之後的速度比值穩定在 1.34–1.59。（design.md 的 V2 有完整數據。）
  const gaps = []
  for (let i = 1; i < samples.length; i++) gaps.push(samples[i][0] - samples[i - 1][0])
  const speeds = walking.map((d, i) => d / gaps[i]).filter((v) => Number.isFinite(v))
  const sp = [...speeds].sort((a, b) => a - b)
  const speedMedian = quantile(sp, 0.5)
  const speedRatio = quantile(sp, 0.99) / speedMedian

  const gs = [...gaps].sort((a, b) => a - b)
  console.log(
    `幀間隔：中位 ${quantile(gs, 0.5).toFixed(1)}ms　p99 ${quantile(gs, 0.99).toFixed(1)}ms` +
      `（比值 ${(quantile(gs, 0.99) / quantile(gs, 0.5)).toFixed(2)} —— 這就是不能用位移當判準的原因）`,
  )
  console.log(`速度（單位/ms）：中位 ${speedMedian.toFixed(5)}　p99 ${quantile(sp, 0.99).toFixed(5)}`)
  console.log(`速度 p99 ÷ 中位數：${speedRatio.toFixed(2)}\n`)

  // ── 三條判準（design.md〈驗證方式〉V2）────────────────────────────
  const checks = [
    ['零位移幀 < 5%', zeroPct < 5, `${zeroPct.toFixed(2)}%`],
    ['每幀位移的中位數 > 0', median > 0, median.toFixed(5)],
    ['速度的 p99 ÷ 中位數 ≤ 3', speedRatio <= 3, speedRatio.toFixed(2)],
  ]
  for (const [name, ok, got] of checks) console.log(`  ${ok ? '✅' : '❌'} ${name}　（實測 ${got}）`)

  const problems = [...observer.problems, ...walker.problems]
  if (problems.length > 0) {
    console.log('\n瀏覽器主控台的錯誤：')
    for (const p of problems.slice(0, 10)) console.log('  ' + p)
  }

  await observer.browser.close()
  await walker.browser.close()

  const failed = checks.filter(([, ok]) => !ok)
  if (failed.length > 0 || problems.length > 0) process.exit(1)
  console.log('\n三條判準全部通過。')
}

await main()
