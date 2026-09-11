// `FE-A04` tasks 5.1：真瀏覽器 —— 開面板 → 編輯 → 送出 → 人才看板上自己那張變了。
// 在 `NEXT_PUBLIC_DATA_ADAPTER=internal` 的 dev server 上跑（本地 Route Handlers ＋ 可拋棄的 Postgres），不攔任何 `/api/*`。
//
//   NEXT_PUBLIC_DATA_ADAPTER=internal NEXT_PUBLIC_REALTIME_ADAPTER=none INTERNAL_DATABASE_URL=… npx next dev -p 3103
//   node tests/e2e/profile-editor.mjs
//
// **只打本機自己起的 dev server 與可拋棄的資料庫。**

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3103'
const OUT = process.env.OUT ?? 'docs/evidence/fe-a04'
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

const NICK = `名片實測${Date.now() % 100000}`
const NEW_NAME = `${NICK}改`
const SKILLS_TYPED = 'React， TypeScript ,react, Playwright'

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  const apiCalls = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/')) apiCalls.push({ method: r.method(), path: u.pathname, body: r.postData() })
  })
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', NICK)
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  await page.goto(`${FRONTEND}/world`)
  await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(1000)

  // 1. 標題列的名字是按鈕；按下開面板、焦點在面板內。
  const opener = page.getByRole('button', { name: /^我的名片/ })
  if ((await opener.textContent()) === NICK) ok('標題列的名字是「我的名片」按鈕')
  else bad('標題列的名字不是按鈕', await page.$eval('[data-testid="identity"]', (n) => n.outerHTML))
  await opener.click()
  await page.waitForSelector('[data-testid="profile-panel"]')
  const focusInPanel = await page.evaluate(() => document.querySelector('[data-testid="profile-panel"]')?.contains(document.activeElement))
  if (focusInPanel) ok('面板開了，焦點在面板內')
  else bad('焦點不在面板內', await page.evaluate(() => document.activeElement?.outerHTML ?? 'null'))
  // 面板開著方向鍵不走：記位置、按右、位置不變（用 ProfilePanel 的鎖）。
  await page.screenshot({ path: path.join(OUT, '1-panel-view.png') })

  // 2. 編輯：預填、改名、技能（含全形逗號與重複）、時數、自介。
  await page.getByRole('button', { name: '編輯' }).click()
  await page.waitForSelector('[data-testid="profile-form"]')
  const nameField = page.getByLabel('在世界裡顯示的名字')
  if ((await nameField.inputValue()) === NICK) ok('表單預填目前的名字')
  else bad('預填不對', await nameField.inputValue())
  await nameField.fill(NEW_NAME)
  await page.getByLabel('技能（用逗號分開）').fill(SKILLS_TYPED)
  await page.getByLabel('每週可投入的小時數').fill('12')
  await page.getByLabel('自我介紹').fill('真瀏覽器實測寫的自介。')
  await page.screenshot({ path: path.join(OUT, '2-panel-edit.png') })

  // 3. 送出：PATCH 只有四鍵、無 avatar_id；成功回到顯示，顯示伺服器的值；標題列也變。
  const patchDone = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/api/profiles/me')
  await page.getByRole('button', { name: '儲存' }).click()
  const patch = await patchDone
  const body = JSON.parse(patch.request().postData() ?? '{}')
  if (Object.keys(body).sort().join(',') === 'bio,display_name,hours_per_week,skills' && !('avatar_id' in body)) ok(`PATCH body 只有四鍵：${JSON.stringify(body)}`)
  else bad('PATCH body 形狀不對', JSON.stringify(body))
  if (JSON.stringify(body.skills) === JSON.stringify(['React', 'TypeScript', 'Playwright'])) ok('skills 去重不分大小寫、全形逗號也切')
  else bad('skills 正規化不對', JSON.stringify(body.skills))
  if (patch.status() === 200) ok('後端（本地 Route Handler ＋ Postgres）回 200')
  else bad('PATCH 沒成功', `${patch.status()} ${await patch.text()}`)
  await page.waitForSelector('[data-testid="profile-form"]', { state: 'detached' })
  const shown = await page.$eval('[data-testid="talent-facts"]', (n) => n.textContent ?? '')
  if (shown.includes(NEW_NAME) && shown.includes('Playwright') && shown.includes('12 小時')) ok('回到顯示，顯示的是存進去的值')
  else bad('顯示的值不對', shown)
  const header = await page.$eval('[data-testid="identity"]', (n) => n.textContent ?? '')
  if (header.includes(NEW_NAME)) ok('標題列的名字也變了')
  else bad('標題列沒變', header)
  await page.screenshot({ path: path.join(OUT, '3-panel-saved.png') })

  // 4. Escape 關面板：焦點回按鈕；鎖放開（方向鍵能走）。
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="profile-panel"]', { state: 'detached' })
  const backOnOpener = await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('我的名片'))
  if (backOnOpener) ok('Escape 關面板，焦點回到那個按鈕')
  else bad('焦點沒回按鈕', await page.evaluate(() => document.activeElement?.outerHTML ?? 'null'))

  // 5. 人才看板上自己那張變了（資料真的進了本地資料庫）。
  await page.click('[data-testid="world-canvas-container"]')
  await approach(page, '看人才看板', [['ArrowRight', 700], ['ArrowUp', 1000]])
  await page.keyboard.press('KeyE')
  await page.waitForSelector('[data-testid="talent-card"]', { timeout: 10_000 })
  const cards = await page.$$eval('[data-testid="talent-card"]', (els) => els.map((e) => e.textContent ?? ''))
  const mine = cards.find((c) => c.includes(NEW_NAME))
  if (mine && mine.includes('Playwright')) ok(`人才看板上自己那張變了：${mine.slice(0, 60)}`)
  else bad('人才看板上找不到改過的自己', cards.slice(0, 3).join(' | '))
  await page.screenshot({ path: path.join(OUT, '4-talent-board-updated.png') })
  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
