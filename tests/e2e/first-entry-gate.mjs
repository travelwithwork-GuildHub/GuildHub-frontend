// require-name 的真瀏覽器判準：訪客進 `/world` 看到的是**取代世界的取名門檻**，取名之後才進世界。
// 規格 first-entry `FE-A06-S04`（訪客看到取名不是世界）／`S05`（沒有旁觀出口）／`S06`（取名後進），
// fe-a06-first-entry 二次反轉。REST 全部 `page.route` 偽造、只打本機自己起的 `next start`。
//
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/first-entry-gate.mjs

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, guardLoopback, ok, profile, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-a06'
assertLoopback(FRONTEND)

// 取名後後端建的名片（`POST /api/login` 回它）。
const ME = profile(1, '阿福')

async function run() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext()
  guardLoopback(context)
  const page = await context.newPage()

  // 一開始是訪客（`/api/me` 401）。取名走 `POST /api/login`（建名片）＋ `PATCH /api/profiles/me`（指派外觀）；
  // 之後身分由 `adopt` 直接交給前端，不再依賴 `/api/me`。
  let guest = true
  const json = (body, status = 200) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/me', (r) =>
    guest ? r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'no' }) }) : json(ME)(r),
  )
  await page.route('**/api/rooms', json([]))
  await page.route('**/api/profiles?*', json([]))
  await page.route('**/api/projects?*', json([]))
  await page.route('**/api/login', json(ME))
  await page.route('**/api/profiles/me', json(ME))

  await page.goto(`${FRONTEND}/world`, { waitUntil: 'domcontentloaded' })

  // S04：訪客看到取名門檻與取名輸入框。
  await page.waitForSelector('[data-testid="world-entry-gate"]', { timeout: 15_000 })
  const field = page.getByLabel('在世界裡顯示的名字')
  ;(await field.count()) === 1 ? ok('S04：訪客看到取名輸入框') : bad('S04：訪客沒看到取名輸入框')

  // S04：取代世界、不是蓋住 —— 世界根本沒 render（沒有 canvas、沒有載入層），所以沒有可漏的世界輸入。
  const canvas = await page.$('[data-testid="world-canvas-container"]')
  const loading = await page.$('[data-testid="world-loading"]')
  !canvas && !loading
    ? ok('S04：取名前世界沒 render（沒有 canvas 也沒有載入層）')
    : bad('S04：取名前世界就 render 了', `canvas=${!!canvas} loading=${!!loading}`)

  // S05：沒有「先四處看看」這種繞過取名的旁觀出口。
  const bypass = await page.getByRole('button', { name: '先四處看看' }).count()
  bypass === 0 ? ok('S05：沒有「先四處看看」旁觀出口') : bad('S05：留著旁觀出口')

  // S06：取名之後才進世界（門檻讓出、世界載入）。
  guest = false
  await field.fill('阿福')
  await page.getByRole('button', { name: '進入世界' }).click()
  await page.waitForSelector('[data-testid="world-entry-gate"]', { state: 'detached', timeout: 15_000 })
  await waitForWorld(page)
  await page.$('[data-testid="world-canvas-container"]')
    ? ok('S06：取名之後進入世界（門檻讓出、世界載入）')
    : bad('S06：取名之後世界沒載入')

  await page.screenshot({ path: path.join(OUT, 'require-name-after.png') })
  await browser.close()

  const n = failureCount()
  if (n > 0) {
    console.error(`\n${n} 條判準紅了`)
    process.exit(1)
  }
  console.log('\n全部綠')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
