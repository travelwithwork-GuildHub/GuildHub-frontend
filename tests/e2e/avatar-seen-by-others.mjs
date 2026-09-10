// `FE-A05` 的核心驗收（design 的 `V4`）：**別人也要看得到。**
//
// ⚠️⚠️ **這一支是整列存在的理由。**
//
// `docs/WBS.md` 上這一列的前置條件逐字寫著：
//
//   > 使用者選完之後自己的外觀不變、**別人看到的他也不變**，
//   > 那是製造錯誤期待不是 MVP
//
// 「自己看得到」由 `avatar-picker.mjs` 守著。**這一支守的是後半句**，
// 而那一半難得多：即時層每個人的 `av` 來自**那條連線背後的 session**，
// 後端是在**登入時**寫進去的 —— 所以 `PATCH` 成功之後，
// 已經在場的人看到的仍然是舊外觀，除非那條連線關掉重開。
//
// ⚠️ **這一支需要真的後端**，因為它問的正是「session 有沒有被重讀」。
// 攔 `/api/me` 的做法在這裡完全沒有意義。
//
// 用法（要先起後端與前端）：
//
//   cd ../GuildHub-backend && .venv/bin/python -m uvicorn app.main:app --port 8000
//   npm run dev
//   node tests/e2e/avatar-seen-by-others.mjs
//
// ⚠️ 後端的 `run.sh` 是 CRLF，在 macOS 上跑不起來（後端票 `BE-G29`）——
// 所以上面直接呼叫 uvicorn。

import { chromium } from 'playwright-core'
import { burst, stableDiff } from './lib/pixels.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

/**
 * 訊號下限。沿用 `FE-W19`／`FE-A05` 的 `SIGNAL_FLOOR`。
 *
 * ⚠️ **這裡的角色比較遠**（是別人，不是自己），所以佔的像素比較少。
 * 底下會先量「這個人到底佔了多少像素」再判斷，不是直接套這個數字。
 */
const SIGNAL_FLOOR = 500

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

/**
 * 走完首次進入流程，進到世界裡。
 *
 * ⚠️ **要填回金鑰尾碼才能按「進入世界」**（`FE-A06` 的設計：
 * 資訊在畫面上不等於資訊被帶走了）。
 */
async function enterWorld(context, name) {
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/`)
  await page.waitForSelector('input', { timeout: 30_000 })
  await page.fill('input', name)
  await page.click('button:has-text("建立我的身分")')

  const key = (await page.textContent('[data-testid="recovery-key"]', { timeout: 30_000 }))?.trim()
  if (!key) throw new Error(`${name} 沒有拿到恢復金鑰`)
  // ⚠️ **拿到金鑰之後表單整段被換掉，畫面上只剩證明框那一個 input。**
  // 用 `nth=1` 會 timeout —— 這個坑在 `two-windows.mjs` 踩過。
  await page.fill('input', key.slice(-6))
  await page.click('button:has-text("進入世界")')

  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="world-loading"]') === null,
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2500)
  return page
}

/** 按住某個方向走一段。 */
async function walk(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
  await page.waitForTimeout(600)
}

const browser = await chromium.launch({ args: ARGS })

try {
  const viewport = { width: 1440, height: 900 }
  // **兩個 context，不是兩個分頁** —— cookie 要分開，否則兩邊是同一個身分，
  // 而 `FE-R06` 的分頁協調會讓第二個根本不連線。
  const ctxB = await browser.newContext({ viewport })
  const ctxA = await browser.newContext({ viewport })

  // ── B 先進場，然後走開 ────────────────────────────────────
  //
  // ⚠️ **要走開的是 B，不是 A，而這一點很重要。**
  // 後端的 `presence.join()` 對既有的 `user_id` 會**把位置歸零**
  // （後端票 `BE-G31`）—— A 儲存之後會重連，如果 A 先走開過，
  // 重連會把他瞬移回原點，而那個位移造成的像素差**遠大於換色**，
  // 整條判準就量到了錯的東西。A 從頭到尾待在出生點就沒有這個問題。
  const pageB = await enterWorld(ctxB, 'B看戲的')
  await walk(pageB, 'KeyS', 1200)

  // ── 基準：B 的畫面上還沒有任何人 ──────────────────────────
  //
  // ⚠️ **這一組要在 A 進場之前拍。**
  // 少了它，下面「A 在畫面上佔了幾個像素」就沒有東西可以比 ——
  // 而「A 根本不在視野裡」（量測壞了）與「A 在但外觀沒變」（產品壞了）
  // 都會讓最後那條差異變成 0，紅燈長得一模一樣。
  const alone = await burst(pageB, 3)

  // ── A 進場，站著不動 ──────────────────────────────────────
  const pageA = await enterWorld(ctxA, 'A換裝的')
  await pageB.waitForTimeout(2000)
  const withA0 = await burst(pageB, 3)

  const presence = stableDiff(alone, withA0)
  if (presence >= SIGNAL_FLOOR) {
    ok(`A 進場之後，B 的畫面上多了 ${presence} 個像素`)
  } else {
    bad(
      `A 進場之後 B 的畫面只差了 ${presence} 個像素`,
      '**這是量測壞了，不是產品壞了** —— A 不在 B 的視野裡（B 走的方向或距離不對），' +
        '或者兩人根本沒連上同一個世界。在看下面那條之前先修這裡',
    )
  }

  // ── `S04`：A 換了角色，B 看到的 A 跟著變 ────────────────────
  await pageA.click('button:has-text("更換角色")')
  await pageA.click('button:has-text("角色 2")')
  await pageA.click('button:has-text("就用這個")')
  // 儲存 → 重連 → 後端重讀 session → 新的 snapshot 傳到 B。
  // ⚠️ 這中間 B 會看到 A 離開又進來（規格 `S05` 明寫的代價），所以要等久一點。
  await pageA.waitForTimeout(5000)
  await pageB.waitForTimeout(2000)
  const withA1 = await burst(pageB, 3)

  const changed = stableDiff(withA0, withA1)
  if (changed >= SIGNAL_FLOOR)
    ok(`A 換了角色之後，B 看到的畫面差了 ${changed} 個像素（下限 ${SIGNAL_FLOOR}）`)
  else
    bad(
      `A 換了角色，但 B 看到的畫面只差了 ${changed} 個像素`,
      `低於下限 ${SIGNAL_FLOOR}。A 在 B 的畫面上是有的（上一條 ${presence} 個像素），` +
        '所以問題在**那條連線背後的 session 沒有被重讀** —— ' +
        '規格 `S04`。第一嫌疑：儲存成功之後沒有重新建立連線',
    )

  await ctxA.close()
  await ctxB.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
