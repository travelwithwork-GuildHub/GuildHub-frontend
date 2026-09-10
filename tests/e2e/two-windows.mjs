// FE-A06 tasks 4.2 的**機器可測那一半**：金鑰帶得走嗎？
//
// ⚠️ 這一支不回答「陌生人會不會自己想到要存金鑰」—— 那是人因，機器答不出來。
// 它回答的是它的前提：**假設他真的帶走了，那把金鑰在另一台瀏覽器裡有沒有用。**
// 如果連這個都不成立，走查再怎麼做都沒有意義。
//
// 兩個獨立的 browser process，各自的 cookie jar 與 localStorage
// —— 等於兩台電腦，不是同一個瀏覽器的兩個分頁。
//
//   node two-windows.mjs

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const SLOW = Number(process.env.SLOW ?? 400)
const SHOTS = process.env.SHOTS ?? '/tmp/guildhub-two-windows'
const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:8000'

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => { failures++; console.log(`❌ ${l}\n   ${d}`) }
const check = (l, a, w) =>
  a === w ? ok(l) : bad(l, `想要 ${JSON.stringify(w)}，拿到 ${JSON.stringify(a)}`)

// `HEADED=1` 才開看得見的視窗。
//
// ⚠️ **看得見的那個模式只有在人的 GUI session 裡跑得起來。** 實測（2026-09-10）：
// 從 Claude Code 的 Bash 起的子程序連不上 WindowServer —— Chromium 會啟動、
// CDP 會回應、頁面會載入，但 `screen.width` 與 `innerWidth` 都是 **0**，
// 於是每個元素的 `getBoundingClientRect()` 都是零尺寸，Playwright 判定
// 「hidden」或「outside of the viewport」。**那兩個錯誤訊息看起來完全像產品壞了**
// （第一次讀到時我以為是按鈕被排到畫面外）。同一頁在 headless 860x700 下，
// 那顆按鈕在 `top=200`，好端端在畫面裡。
// `open -na "Google Chrome"` 也一樣被擋：`Domain does not support specified action`。
//
// 所以要看視窗，請在自己的終端機跑：`HEADED=1 node tests/e2e/two-windows.mjs`
//
// ⚠️ headed 時 **MUST NOT** 指定 `viewport` —— CDP 的 device metrics override
// 會跟實際視窗尺寸對不上，點擊座標算在視窗外。
const HEADED = process.env.HEADED === '1'
const open = (x) => chromium.launch({
  headless: !HEADED,
  slowMo: HEADED ? SLOW : 0,
  args: HEADED
    ? [`--window-position=${x},60`, '--window-size=900,860']
    : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const viewportFor = () => (HEADED ? null : { width: 1440, height: 900 })

const NAME = `走查${Date.now() % 10000}`
let A = null
let B = null

try {
  // ── 視窗 A（左）：第一次來的人 ────────────────────────────────
  A = await open(20)
  // ⚠️ **headed 模式一定要 `viewport: null`。** 指定 viewport 會讓 Playwright 用
  // CDP 覆寫 device metrics，那個尺寸跟 `--window-size` 開出來的實際視窗對不上，
  // 於是點擊座標算在視窗外 —— 錯誤訊息是 `element is outside of the viewport`，
  // 看起來完全像產品把按鈕排到畫面外了。實測：同一頁在 headless 860x700 下
  // 按鈕在 top=200，好端端在畫面裡。
  const ctxA = await A.newContext({ viewport: viewportFor() })
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const a = await ctxA.newPage()

  await a.goto(`${FRONTEND}/`)
  await a.waitForSelector('text=在世界裡顯示的名字', { timeout: 20_000 })
  ok('A 打開 `/` 看到首次進入流程')

  await a.fill('input >> nth=0', NAME)
  await a.click('button:has-text("建立我的身分")')
  await a.waitForSelector('[data-testid="recovery-key"]', { timeout: 20_000 })
  const key = (await a.textContent('[data-testid="recovery-key"]')).trim()
  ok(`A 拿到金鑰 ${key.slice(0, 8)}…${key.slice(-6)}`)

  await a.click('button:has-text("複製鑰匙")')
  await a.waitForSelector('text=已經複製了', { timeout: 20_000 })
  const clip = await a.evaluate(() => navigator.clipboard.readText())
  check('A 的剪貼簿裡真的是那把金鑰', clip, key)

  // ⚠️ **拿到金鑰之後表單整個被換掉了**，畫面上只剩證明框這一個 input。
  // 寫 `nth=1` 會 timeout —— 那是尺的錯，不是產品的。
  await a.fill('input', key.slice(-6))
  await a.waitForSelector('text=收到了', { timeout: 10_000 }).catch(() => {})
  await a.waitForFunction(
    () => [...document.querySelectorAll('button')]
      .some((b) => b.textContent?.includes('進入世界') && !b.disabled),
    { timeout: 20_000 },
  )
  await a.click('button:has-text("進入世界")')
  await a.waitForSelector('canvas', { timeout: 30_000 })
  const nameInA = await a.textContent('[data-testid="identity"]')
  check('A 進到世界，標題列是自己的名字', nameInA?.includes(NAME), true)
  await a.screenshot({ path: `${SHOTS}/1-A-in-world.png` })

  // ── 關掉 A ────────────────────────────────────────────────────
  //
  // ⚠️ **這一步是 codex 給的通過條件的核心。** 原頁還開著的話，
  // 「帶走」可以是從畫面上抄 —— 那等於沒帶走。
  await A.close()
  A = null
  ok('A 整個關掉了（不是換頁，是 browser process 結束）')

  // ── 視窗 B（右）：另一台瀏覽器，只有那串字 ───────────────────
  B = await open(920)
  const ctxB = await B.newContext({ viewport: viewportFor() })
  const b = await ctxB.newPage()

  await b.goto(`${FRONTEND}/`)
  await b.waitForSelector('text=在世界裡顯示的名字', { timeout: 20_000 })
  const fresh = await b.evaluate(() => localStorage.getItem('guildhub.recovery-key'))
  check('B 是全新的瀏覽器，本機沒有任何金鑰', fresh, null)

  await b.goto(`${FRONTEND}/login`)
  await b.waitForLoadState('networkidle')
  await b.screenshot({ path: `${SHOTS}/2-B-login.png` })

  // ── 這是整支腳本存在的理由 ────────────────────────────────────
  //
  // A 已經不存在了。B 手上只有那串字，沒有 cookie、沒有 localStorage。
  // 如果這裡恢復得了同一個身分，「把金鑰帶走」才是一件有意義的事。
  await b.fill('label:has-text("貼上你的恢復金鑰") input', key)
  await b.click('button:has-text("用金鑰回來")')
  // ⚠️ `/login` 成功後換成 `RecoveryKeyPanel`，**那一頁上沒有 IdentityBadge**
  // （badge 在 world 的 app-shell 裡）。等錯東西會 timeout 20 秒然後看起來像登入失敗。
  await b.waitForSelector('section[aria-labelledby="recovery-key-heading"]', { timeout: 20_000 })
  const panel = await b.textContent('section[aria-labelledby="recovery-key-heading"]')
  check('B 用金鑰恢復出同一個身分', panel?.includes(NAME), true)
  check('B 看到的金鑰跟 A 的是同一把', (await b.textContent('[data-testid="recovery-key"]')).trim(), key)
  await b.screenshot({ path: `${SHOTS}/3-B-recovered.png` })

  // ⚠️ **「畫面上有名字」還不夠。** 那可能只是前端把輸入回填上去。
  // 要問後端：這個 session 現在到底是誰。
  //
  // ⚠️ **用 `context.request` 而不是在頁面裡 `fetch`。** 它共用 B 的 cookie jar，
  // 所以問到的是同一個 session；而頁面裡的 `fetch` 會被 `no-restricted-globals`
  // 擋下來 —— 那條規則是對的（元件裡不准出現 fetch），這裡不該去 disable 它。
  const res = await ctxB.request.get(`${BACKEND}/api/me`)
  const me = { status: res.status(), body: res.ok() ? await res.json() : null }
  check('後端也認得 B 是誰（`GET /api/me` 不是 401）', me.status, 200)
  check('而且後端回的名字就是 A 建立的那個', me.body?.display_name, NAME)
  check('後端回的 id 就是那把金鑰', me.body?.id, key)
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  console.log(`\n名字=${NAME}`)
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  if (HEADED) {
    console.log('兩個視窗留著不關，你自己看。按 Ctrl+C 結束。')
    await new Promise(() => {})
  }
  if (B !== null) await B.close()
  if (A !== null) await A.close()
  process.exit(failures === 0 ? 0 : 1)
}
