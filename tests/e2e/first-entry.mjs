// `FE-A06` 的端到端驗證。tasks 第 3 節（`S11`）。
//
// ⚠️⚠️ **這一支存在的唯一理由是「剪貼簿裡真的是那把金鑰」這件事，
// 而它只能在真的瀏覽器上問。**
//
// 單元層的判準驗的是**閘門守不守得住**（寫入成功才放行、失敗不得假裝成功），
// 那些用注入的替身就夠了。但「按下複製之後，系統的剪貼簿裡真的有那串字」
// 用替身驗等於自問自答 —— 兩個審查者的說法一致：
//
//   > 如果為了圖方便去 mock `writeText` 讓它永遠 resolve，那這個測試就退化成了
//   > 無意義的恆真句 —— 你只是在驗證「當我假裝成功時，UI 確實顯示了成功」。
//
// 用法（要先起後端與前端）：
//
//   FRONTEND=http://127.0.0.1:3100 node tests/e2e/first-entry.mjs

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const SHOTS = process.env.SHOTS ?? '/tmp/guildhub-first-entry-shots'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

let failures = 0
const ok = (label) => console.log(`✅ ${label}`)
const bad = (label, detail) => {
  failures++
  console.log(`❌ ${label}\n   ${detail}`)
}
const check = (label, actual, wanted) =>
  actual === wanted ? ok(label) : bad(label, `想要 ${JSON.stringify(wanted)}，拿到 ${JSON.stringify(actual)}`)

const browser = await chromium.launch({ args: ARGS })

try {
  const context = await browser.newContext()
  // ⚠️ **權限要授在 origin 上，而且要在開頁之前。** 少了它，
  // `writeText()` 在 headless 下會 reject，而畫面會正確地走降級路徑
  // —— 那時候紅的是「沒有複製成功」，看起來像產品壞了。
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const page = await context.newPage()
  // **發表版的實際 viewport**，不是 Playwright 的預設 1280×720
  await page.setViewportSize({ width: 1440, height: 900 })

  // ── `S01`：根路徑就是首次進入流程，不是轉址 ──────────────────────
  const response = await page.goto(`${FRONTEND}/`)
  check('[S01] `/` 直接回一個頁面，不是轉址', response.status(), 200)
  check('[S01] 而且網址還停在 `/`', new URL(page.url()).pathname, '/')
  await page.waitForSelector('text=在世界裡顯示的名字', { timeout: 15_000 })
  ok('[S01] 上面有可以輸入名字的地方')

  // ── `S07`：還沒帶走金鑰之前，進不了世界 ─────────────────────────
  await page.fill('input >> nth=0', '第一次來的人')
  await page.click('button:has-text("建立我的身分")')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 15_000 })
  const key = (await page.textContent('[data-testid="recovery-key"]')).trim()
  check('[S07] 剛拿到金鑰時「進入世界」不能按', await page.isDisabled('button:has-text("進入世界")'), true)

  // ── `S11`：剪貼簿裡真的是那把金鑰 ───────────────────────────────
  await page.click('button:has-text("複製鑰匙")')
  await page.waitForSelector('text=已經複製了', { timeout: 15_000 })
  const fromClipboard = await page.evaluate(() => navigator.clipboard.readText())
  check('[S11] 剪貼簿裡的內容跟畫面上的金鑰逐字相同', fromClipboard, key)

  // ── 4.1：金鑰、警語、按鈕、回饋**同時看得見**，不用捲動 ─────────
  //
  // ⚠️ **這是 codex 那條要求機器答得出來的那一半。** 它逐字說
  // 「不能只靠 DOM 存在、文字查詢或元件 snapshot 判定完成」——
  // 而「在畫面上」跟「在 DOM 裡」是兩件事（`FE-W12` 的六扇門就在 DOM 裡）。
  //
  // ⚠️ **它答不出來的那一半是「讀起來清不清楚」** —— 那要人眼（tasks 4.2）。
  const visibility = await page.evaluate(() => {
    const inView = (el) => {
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth
    }
    const byText = (needle) =>
      [...document.querySelectorAll('p, span, label')].find((e) => e.textContent?.includes(needle)) ??
      null
    return {
      key: inView(document.querySelector('[data-testid="recovery-key"]')),
      warnBecome: inView(byText('就能成為你')),
      warnLost: inView(byText('回不來')),
      copyButton: inView(
        [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('複製鑰匙')) ??
          null,
      ),
      proof: inView(byText('填回來')),
      enter: inView(
        [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('進入世界')) ??
          null,
      ),
    }
  })
  for (const [name, ok_] of Object.entries(visibility)) {
    check(`[4.1] ${name} 在視窗裡（不用捲動）`, ok_, true)
  }
  await page.screenshot({ path: `${SHOTS}/first-entry-key.png` })

  // ── `S08`：複製成功之後放行 ─────────────────────────────────────
  check('[S08] 複製成功之後「進入世界」可以按了', await page.isDisabled('button:has-text("進入世界")'), false)

  // ── `S02`：走完之後，世界裡是自己取的名字 ───────────────────────
  await page.click('button:has-text("進入世界")')
  await page.waitForURL('**/world', { timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="identity"]')
      return el !== null && !el.textContent.includes('確認身分中')
    },
    null,
    { timeout: 15_000 },
  )
  check('[S02] 世界裡的名字是自己取的那個', (await page.textContent('[data-testid="identity"]')).trim(), '第一次來的人')
  check('[S06] 走完了，世界裡不再出現引導層', await page.$('[data-testid="first-entry-notice"]'), null)

  // ── `S03`：已經有身分的人打開 `/` 直接到世界 ────────────────────
  await page.goto(`${FRONTEND}/`)
  await page.waitForURL('**/world', { timeout: 15_000 })
  ok('[S03] 已經有身分的人打開 `/` 直接到世界')

  // ── `S04`／`S06`：全新的訪客直接進 `/world` ─────────────────────
  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await guestPage.goto(`${FRONTEND}/world`)
  await guestPage.waitForSelector('[data-testid="first-entry-notice"]', { timeout: 15_000 })
  ok('[S04] 直接進世界的訪客看得到引導層')

  await guestPage.click('button:has-text("先四處看看")')
  check('[S04] 關得掉', await guestPage.$('[data-testid="first-entry-notice"]'), null)

  await guestPage.reload()
  await guestPage.waitForSelector('[data-testid="first-entry-notice"]', { timeout: 15_000 })
  ok('[S06] 關掉不等於完成 —— 重新進來還會看到')
} finally {
  await browser.close()
}

if (failures > 0) {
  console.log(`\n${failures} 條沒過。`)
  process.exit(1)
}
console.log(`\n截圖在 ${SHOTS}`)
console.log('\n全部通過。')
