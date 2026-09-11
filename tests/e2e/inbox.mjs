// `FE-K01` tasks 5.1：真瀏覽器兩個人互寄 —— A 從人才看板寄信給 B，B 開收件匣看到、回信，A 重開看到回信。
// 在 `NEXT_PUBLIC_DATA_ADAPTER=internal` 的 dev server 上跑（本地 Route Handlers ＋ 可拋棄的 Postgres），不攔任何 `/api/*`。
//
//   NEXT_PUBLIC_DATA_ADAPTER=internal NEXT_PUBLIC_REALTIME_ADAPTER=none INTERNAL_DATABASE_URL=… npx next dev -p 3104
//   FRONTEND=http://localhost:3104 node tests/e2e/inbox.mjs
//
// **只打本機自己起的 dev server 與可拋棄的資料庫。**

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3103'
const OUT = process.env.OUT ?? 'docs/evidence/fe-k01'
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
async function login(context, nickname) {
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', nickname)
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  const id = await page.$eval('[data-testid="recovery-key"]', (n) => n.textContent ?? '')
  await page.goto(`${FRONTEND}/world`)
  await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(1500)
  return { page, id }
}

const stamp = Date.now() % 100000
const NICK_A = `寄信人${stamp}`
const NICK_B = `收信人${stamp}`

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const B = await login(ctxB, NICK_B)
  const A = await login(ctxA, NICK_A)

  // 1. A 走到人才看板、打開 B 的名片、按「寄信給他」。先把鍵盤焦點放進世界（兩個 context 同時開，焦點不一定在 canvas）。
  await A.page.click('[data-testid="world-canvas-container"]')
  await A.page.bringToFront()
  await A.page.waitForTimeout(500)
  await approach(A.page, '看人才看板', [['ArrowRight', 700], ['ArrowUp', 1000]])
  await A.page.keyboard.press('KeyE')
  await A.page.waitForSelector('[data-testid="talent-card"]', { timeout: 10_000 })
  const card = A.page.locator('[data-testid="talent-card"]', { hasText: NICK_B }).first()
  if ((await card.count()) === 0) bad('人才看板第 0 頁找不到 B', await A.page.$$eval('[data-testid="talent-card"]', (els) => els.slice(0, 3).map((e) => e.textContent)))
  await card.click()
  await A.page.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]')
  const sendButton = A.page.getByTestId('send-message')
  if (await sendButton.count()) ok('別人的名片上有「寄信給他」')
  else bad('別人的名片沒有寄信鈕', await A.page.$eval('[data-testid="talent-detail"]', (n) => n.outerHTML.slice(0, 300)))
  await sendButton.click()
  await A.page.waitForSelector('[data-testid="inbox-thread"]')
  const listGone = (await A.page.$('[data-testid="list-panel"]')) === null
  const withB = await A.page.$eval('[data-testid="inbox-thread"]', (n) => n.getAttribute('data-with'))
  if (listGone && withB === B.id) ok('看板關了、收件匣直接進跟 B 的對話')
  else bad('交接不對', `list-panel 還在=${!listGone} with=${withB} B=${B.id}`)
  await A.page.waitForSelector('[data-testid="inbox-thread"][aria-busy="false"]')
  await A.page.screenshot({ path: path.join(OUT, '1-a-new-thread.png') })

  // 2. A 寄一封：201、對話裡出現、清空。
  const postDone = A.page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/messages')
  await A.page.getByLabel('寫一封信').fill('嗨，我在人才看板看到你。')
  await A.page.getByRole('button', { name: '寄出' }).click()
  const post = await postDone
  if (post.status() === 201) ok('POST /api/messages 201（本地 Route Handler ＋ Postgres）')
  else bad('寄信沒成功', `${post.status()} ${await post.text()}`)
  await A.page.waitForSelector('[data-testid="inbox-message"][data-mine="true"]')
  const cleared = (await A.page.getByLabel('寫一封信').inputValue()) === ''
  if (cleared) ok('201 之後對話裡有那封、表單清空')
  else bad('表單沒清空', '')
  await A.page.screenshot({ path: path.join(OUT, '2-a-sent.png') })
  await A.page.keyboard.press('Escape')
  await A.page.keyboard.press('Escape')
  await A.page.waitForSelector('[data-testid="inbox-panel"]', { state: 'detached' })

  // 3. B 開收件匣：看到 A 的對話（名字解析）、進去、回信。
  await B.page.getByTestId('inbox-button').click()
  await B.page.waitForSelector('[data-testid="inbox-list"][aria-busy="false"]')
  const row = B.page.locator('[data-testid="inbox-thread-item"]', { hasText: NICK_A }).first()
  if (await row.count()) ok(`B 的收件匣有 A（${NICK_A}）的對話，名字解析出來了`)
  else bad('B 看不到 A 的對話', await B.page.$eval('[data-testid="inbox-list"]', (n) => n.textContent ?? ''))
  const previewText = await row.locator('[data-testid="inbox-thread-preview"]').textContent()
  if (previewText?.includes('嗨，我在人才看板看到你。')) ok('摘要是那一句')
  else bad('摘要不對', previewText ?? '')
  await B.page.screenshot({ path: path.join(OUT, '3-b-inbox-list.png') })
  await row.click()
  await B.page.waitForSelector('[data-testid="inbox-message"][data-mine="false"]')
  await B.page.getByLabel('寫一封信').fill('收到了，我們聊聊。')
  await B.page.getByRole('button', { name: '寄出' }).click()
  await B.page.waitForFunction(() => document.querySelectorAll('[data-testid="inbox-message"]').length === 2)
  ok('B 回信，對話裡兩封（舊到新）')
  await B.page.screenshot({ path: path.join(OUT, '4-b-thread-replied.png') })

  // 4. A 重開收件匣：第 0 頁重取，看到 B 的回信。
  await A.page.getByTestId('inbox-button').click()
  await A.page.waitForSelector('[data-testid="inbox-list"][aria-busy="false"]')
  const rowA = A.page.locator('[data-testid="inbox-thread-item"]', { hasText: NICK_B }).first()
  const previewA = await rowA.locator('[data-testid="inbox-thread-preview"]').textContent()
  if (previewA?.includes('收到了，我們聊聊。') && !previewA.startsWith('你：')) ok('A 重開看到 B 的回信是最新一封（不是「你：」）')
  else bad('A 沒看到回信', previewA ?? '')
  await rowA.click()
  const bodies = await A.page.$$eval('[data-testid="inbox-message"]', (els) => els.map((e) => `${e.getAttribute('data-mine')}:${e.textContent}`))
  if (bodies.length === 2 && bodies[0].startsWith('true') && bodies[1].startsWith('false')) ok('A 的對話：自己那封在前、B 的回信在後')
  else bad('對話順序不對', bodies.join(' | '))
  await A.page.screenshot({ path: path.join(OUT, '5-a-thread-with-reply.png') })
  await ctxA.close()
  await ctxB.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
