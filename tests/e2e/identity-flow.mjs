// `FE-A01` 的端到端驗證。tasks 第 4 節。
//
// ⚠️⚠️ **為什麼要有這一支：`FE-W12` 的 444 條測試全綠，而畫面上六扇門是
// 10 像素的細縫。** jsdom 裡的判準驗得到「元件回傳了什麼」，驗不到
// **cookie 有沒有真的跟著請求走**、**localStorage 在真的瀏覽器裡留不留得住**、
// 以及**清掉 cookie 之後恢復金鑰到底救不救得回來**。
// 那三件事是這個 change 的全部重點，而它們只在真的瀏覽器裡成立或不成立。
//
// 用法（**要先起後端與前端**）：
//
//   FRONTEND=http://127.0.0.1:3100 node tests/e2e/identity-flow.mjs
//
// ⚠️ **位址預設是 127.0.0.1 而不是 localhost，兩者不能混用。**
// 瀏覽器把它們當成不同的 host：頁面在 `localhost:3100`、API 在 `127.0.0.1:8000`
// 就是跨站，`SameSite=Lax` 的 session cookie **不會被送出去** ——
// 而症狀是「登入回 200，接著每個請求都 401」。後端 `cd2929c` 的 commit 訊息
// 逐字寫著這個坑。

// ⚠️⚠️ **截圖裡的 3D 世界是空白的，而世界沒有壞。**
// 實測（three 的 devtools hook）：場景有 29 個物件、8 秒跑了 161 幀。
// 空白是**擷取**的問題 —— WebGL 畫布沒有開 `preserveDrawingBuffer`，
// 截圖與 `drawImage()` 取到的是全透明。
// **這一頁的截圖只能用來看 DOM 那一層**（標題列的身分、入口、金鑰面板）。
// 世界長得對不對要人眼在真的瀏覽器上看 —— 那一條沒有自動化。
//
// 這是這一支腳本第二次「紅燈是尺不是產品」。第一次是
// `[role="alert"]` 抓到 Next 開發覆蓋層的空字串（見下面那段註解）。

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const SHOTS = process.env.SHOTS ?? '/tmp/guildhub-identity-shots'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

let failures = 0
const ok = (label) => console.log(`✅ ${label}`)
const bad = (label, detail) => {
  failures++
  console.log(`❌ ${label}\n   ${detail}`)
}

function check(label, actual, wanted) {
  if (actual === wanted) ok(label)
  else bad(label, `想要 ${JSON.stringify(wanted)}，拿到 ${JSON.stringify(actual)}`)
}

function checkContains(label, actual, wanted) {
  if (typeof actual === 'string' && actual.includes(wanted)) ok(label)
  else bad(label, `想要含有「${wanted}」，拿到 ${JSON.stringify(actual)}`)
}

/** 世界標題列上那一塊身分。**等它不再是「確認身分中」** —— 那是未解析狀態。 */
async function badge(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="identity"]')
      return el !== null && !el.textContent.includes('確認身分中')
    },
    null,
    { timeout: 15_000 },
  )
  return (await page.textContent('[data-testid="identity"]')).trim()
}

/** 走完一次登入。回傳畫面上顯示的那把恢復金鑰。 */
async function signUp(page, nickname, remember) {
  await page.goto(`${FRONTEND}/login`)
  await page.fill('input >> nth=0', nickname)
  if (remember) await page.check('input[type="checkbox"]')
  await page.click('button:has-text("進入世界")')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 15_000 })
  return (await page.textContent('[data-testid="recovery-key"]')).trim()
}

const browser = await chromium.launch({ args: ARGS })

try {
  // ── 4.1 第一次來的人：世界 → 入口 → 取名字 → 世界裡有自己的名字 ──────
  const first = await browser.newContext()
  const page = await first.newPage()

  await page.goto(`${FRONTEND}/world`)
  checkContains('[4.1] 訪客進世界時看得出來自己是訪客', await badge(page), '訪客')

  const entry = page.getByRole('link', { name: '建立你的身分' })
  check('[4.4b] 入口在畫面上看得見', await entry.isVisible(), true)
  await page.screenshot({ path: `${SHOTS}/1-guest-world.png` })

  await entry.click()
  await page.waitForURL('**/login')
  ok('[4.4b] 按下入口之後到得了登入流程')

  const keyA = await signUp(page, '阿福', false)
  check(
    '[4.1] 金鑰看起來是一個 UUID',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(keyA),
    true,
  )
  const panel = await page.textContent('body')
  checkContains('[S09] 畫面說了「拿到金鑰的人就能成為你」', panel, '就能成為你')
  checkContains('[S09] 畫面說了「清掉資料就回不來」', panel, '回不來')
  await page.screenshot({ path: `${SHOTS}/2-recovery-key.png` })

  await page.goto(`${FRONTEND}/world`)
  check('[4.1] 世界裡的名字是自己輸入的那個（BE-G02 的第一次可見證明）', await badge(page), '阿福')
  await page.screenshot({ path: `${SHOTS}/3-signed-in-world.png` })

  // ── 4.3 重整之後名字還在 ─────────────────────────────────────────
  await page.reload()
  check('[4.3] 重整之後名字還在', await badge(page), '阿福')

  // ── 4.4 清掉 cookie（不清 localStorage）：沒勾記住的變訪客 ────────
  const storedBefore = await page.evaluate(() => localStorage.getItem('guildhub.recovery-key'))
  check('[S07] 沒勾記住 → localStorage 裡什麼都沒有', storedBefore, null)
  await first.clearCookies()
  await page.reload()
  checkContains('[4.4] 沒勾記住的人，清掉 cookie 之後變訪客', await badge(page), '訪客')

  // ── 4.4 另一半：勾了記住的人回得去 ────────────────────────────────
  const second = await browser.newContext()
  const page2 = await second.newPage()
  const keyB = await signUp(page2, '小美', true)
  await page2.goto(`${FRONTEND}/world`)
  check('[4.1] 第二個人的名字也是自己輸入的', await badge(page2), '小美')

  const storedAfter = await page2.evaluate(() => localStorage.getItem('guildhub.recovery-key'))
  check('[S07] 勾了記住 → localStorage 裡是那把金鑰', storedAfter, keyB)

  await second.clearCookies()
  await page2.reload()
  check('[4.4] 勾了記住的人，清掉 cookie 之後自動回得去', await badge(page2), '小美')

  // ── 4.4c 換裝置：全新環境，只貼金鑰 ───────────────────────────────
  const third = await browser.newContext()
  const page3 = await third.newPage()
  await page3.goto(`${FRONTEND}/login`)
  await page3.fill('input >> nth=2', keyA)
  await page3.click('button:has-text("用金鑰回來")')
  await page3.waitForSelector('[data-testid="recovery-key"]', { timeout: 15_000 })
  const keyBack = (await page3.textContent('[data-testid="recovery-key"]')).trim()
  check('[4.4c/S17] 換一個環境只貼金鑰，取回的是同一張名片', keyBack, keyA)

  await page3.goto(`${FRONTEND}/world`)
  check('[4.4c/S17] 而且世界裡是原本那個名字', await badge(page3), '阿福')
  await page3.screenshot({ path: `${SHOTS}/4-resumed-elsewhere.png` })

  // ── S10：無效的金鑰不得靜默放行 ──────────────────────────────────
  const fourth = await browser.newContext()
  const page4 = await fourth.newPage()
  await page4.goto(`${FRONTEND}/login`)
  await page4.fill('input >> nth=2', '00000000-0000-0000-0000-000000000000')
  await page4.click('button:has-text("用金鑰回來")')
  // ⚠️ **選擇器一定要收在 `main` 裡面。** Next 的開發覆蓋層自己也有一個
  // `[role="alert"]`，而且排在前面 —— 不收範圍的話讀到的是它的空字串，
  // 而失敗訊息長得像「產品沒有顯示錯誤」。**第一次跑就是這樣紅的。**
  await page4.waitForSelector('main [role="alert"]', { timeout: 15_000 })
  checkContains(
    '[S10] 無效的金鑰被擋下，而且說得出原因',
    await page4.textContent('main [role="alert"]'),
    '不存在',
  )
  check('[S10] 而且沒有靜默建一張新名片', await page4.$('[data-testid="recovery-key"]'), null)
} finally {
  await browser.close()
}

console.log(`\n截圖在 ${SHOTS}`)
if (failures > 0) {
  console.log(`\n${failures} 條沒過。`)
  process.exit(1)
}
console.log('\n全部通過。')
