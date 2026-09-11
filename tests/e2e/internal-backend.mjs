// `FE-O03` tasks 5.2：`NEXT_PUBLIC_DATA_ADAPTER=internal` 的 dev server 上，人才看板真的從**本地資料庫**開出來。
// 不攔任何 `/api/*` —— 這支的重點就是資料是真的走過 Route Handlers 與 Postgres。
//
//   NEXT_PUBLIC_DATA_ADAPTER=internal NEXT_PUBLIC_REALTIME_ADAPTER=none INTERNAL_DATABASE_URL=… npx next dev -p 3103
//   node tests/e2e/internal-backend.mjs
//
// **只打本機自己起的 dev server 與可拋棄的資料庫。**

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3103'
const OUT = process.env.OUT ?? 'docs/evidence/fe-o03'
let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}
async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
  await page.waitForTimeout(400)
}
async function approach(page, label, steps) {
  for (const [code, ms] of steps) await hold(page, code, ms)
  for (let i = 0; i < 8; i++) {
    const prompt = await page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => null)
    if (prompt !== null && prompt.includes(label)) return prompt
    await hold(page, 'ArrowUp', 120)
  }
  throw new Error(`走不到「${label}」前面`)
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  const apiCalls = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/')) apiCalls.push(`${r.method()} ${u.pathname}${u.search} → ${u.host}`)
  })
  // 登入（暱稱）：打的是同源的 /api/login → 本地 Postgres。
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', '本地後端實測')
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  // 登入後停在恢復金鑰那一頁（FE-A01 的義務：金鑰要看得到）；帶著 cookie 進世界。
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  await page.goto(`${FRONTEND}/world`)
  await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(1500)
  const loginCall = apiCalls.find((c) => c.startsWith('POST /api/login'))
  if (loginCall && loginCall.includes(new URL(FRONTEND).host)) ok(`登入打的是同源的 Route Handler：${loginCall}`)
  else bad('登入沒有打同源的 /api/login', apiCalls.join('\n   '))

  await approach(page, '看人才看板', [['ArrowRight', 700], ['ArrowUp', 1000]])
  await page.keyboard.press('KeyE')
  await page.waitForSelector('[data-testid="talent-card"]', { timeout: 10_000 })
  const names = await page.$$eval('[data-testid="talent-card"]', (els) => els.map((e) => e.textContent ?? ''))
  // 排序是 updated_at 新到舊：剛登入的在最前面，seed 的名片在後面。第 0 頁要看到 seed 的**某幾張**（`002_seed.sql`）。
  const SEED = ['晨風遊俠', '銀月製圖師', '灰燼鍛造士', '霜刃斥候']
  if (names.length === 20 && SEED.some((n) => names.some((x) => x.includes(n)))) ok(`人才看板從本地資料庫開出來：第 0 頁 ${names.length} 張，含 seed 的名片`)
  else bad('人才看板的資料不對', `${names.length} 張：${names.slice(0, 3).join(' | ')}`)
  const listCall = apiCalls.find((c) => c.startsWith('GET /api/profiles?page=0'))
  if (listCall && listCall.includes(new URL(FRONTEND).host)) ok(`清單打的是同源：${listCall}`)
  else bad('清單沒有打同源的 /api/profiles', apiCalls.join('\n   '))
  await page.screenshot({ path: path.join(OUT, 'talent-board-from-local-db.png') })

  // 翻頁：第 1 頁也是本地資料（seed 28 張 + 測試登入的幾張）。
  await page.click('button:has-text("下一頁")')
  await page.waitForTimeout(800)
  const page1 = await page.$$eval('[data-testid="talent-card"]', (els) => els.length)
  if (page1 > 0 && page1 <= 20) ok(`第 1 頁 ${page1} 張`)
  else bad('第 1 頁不對', String(page1))
  await page.screenshot({ path: path.join(OUT, 'talent-board-page-1.png') })
  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
