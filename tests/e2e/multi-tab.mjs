// `FE-R06` 的端到端驗證：真的瀏覽器、真的兩個分頁。tasks 2.1 與 3.1／3.2。
//
// ⚠️⚠️ **jsdom 驗不到這件事的核心。** 單元判準裡的「另一個分頁」是同一個
// jsdom 裡另外開的一條 lease —— 形狀對，但它證明不了
// **`BroadcastChannel` 在真的兩個分頁之間送得到訊息**。
// 那正是這整套協調唯一的假設。
//
// 用法（要先起後端與前端）：
//
//   FRONTEND=http://127.0.0.1:3100 node tests/e2e/multi-tab.mjs

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

let failures = 0
const ok = (label) => console.log(`✅ ${label}`)
const bad = (label, detail) => {
  failures++
  console.log(`❌ ${label}\n   ${detail}`)
}
const check = (label, actual, wanted) =>
  actual === wanted ? ok(label) : bad(label, `想要 ${JSON.stringify(wanted)}，拿到 ${JSON.stringify(actual)}`)

/** 這個分頁看不看得到「你已經在另一個分頁裡」。 */
const blocked = async (page) => (await page.$('text=你已經在另一個分頁裡開著這個世界')) !== null

/** 等到條件成立，或逾時（回傳最後一次的值）。 */
async function until(fn, ms = 8000) {
  const deadline = Date.now() + ms
  let last = await fn()
  while (!last && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
    last = await fn()
  }
  return last
}

const browser = await chromium.launch({ args: ARGS })

try {
  // ── 匿名：兩個分頁都要進得去（`S01`）──────────────────────────────
  const anon = await browser.newContext()
  const a1 = await anon.newPage()
  const a2 = await anon.newPage()
  await a1.goto(`${FRONTEND}/world`)
  await a2.goto(`${FRONTEND}/world`)
  await a1.waitForTimeout(1500)
  check('[S01] 匿名分頁一沒有被擋', await blocked(a1), false)
  check('[S01] 匿名分頁二沒有被擋', await blocked(a2), false)

  // ── 登入之後：第二個分頁被擋（`S02`）─────────────────────────────
  const ctx = await browser.newContext()
  const t1 = await ctx.newPage()
  await t1.goto(`${FRONTEND}/login`)
  await t1.fill('input >> nth=0', '分頁守衛')
  await t1.click('button:has-text("進入世界")')
  await t1.waitForSelector('[data-testid="recovery-key"]')
  await t1.goto(`${FRONTEND}/world`)
  await t1.waitForTimeout(1500)
  check('[S02] 第一個分頁沒有被擋', await blocked(t1), false)

  const t2 = await ctx.newPage()
  await t2.goto(`${FRONTEND}/world`)
  check('[S02] 第二個分頁被擋住了', await until(() => blocked(t2)), true)
  check('[S02] 而且第一個分頁不受影響', await blocked(t1), false)

  // ── 「改用這個分頁」（`S02` 的動作）──────────────────────────────
  await t2.click('button:has-text("改用這個分頁")')
  check('[S02] 按下之後第二個分頁進得去', await until(async () => !(await blocked(t2))), true)
  check('[S02] 而第一個分頁換成被擋', await until(() => blocked(t1)), true)

  // ── 關掉持有者，另一個接手（`S03`）───────────────────────────────
  await t2.close()
  check('[S03] 持有者關掉之後，另一個分頁接手', await until(async () => !(await blocked(t1))), true)
} finally {
  await browser.close()
}

if (failures > 0) {
  console.log(`\n${failures} 條沒過。`)
  process.exit(1)
}
console.log('\n全部通過。')
