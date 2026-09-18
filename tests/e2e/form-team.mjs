// `FE-J04` 的瀏覽器驗收：成軍長出門、結案門消失（`FE-J04-S09`）。
// 規格 `openspec/changes/fe-j04-form-team/specs/project-lifecycle/spec.md`。
//
// 真的瀏覽器、真的 Route Handler、真的 Postgres（`internal`）：**不偽造任何 `/api/*`**；`/api/rooms` 只旁觀（數請求，`route.continue()`）。
// **只打本機自己起的 `next start`**（`assertLoopback`／`guardLoopback`）。用法跟 `create-project.mjs` 一樣（db:reset → build → next start 3101）。
//
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/form-team.mjs

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, guardLoopback, ok, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-form-team-shots'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const TITLE = `成軍測試 ${new Date().toISOString().slice(11, 19)} ${randomUUID().slice(0, 8)}`
const PASSWORD = 'demo-1234'
const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  let roomsHits = 0
  await context.route('**/api/rooms', async (route) => {
    roomsHits += 1
    await route.continue()
  })
  const page = await context.newPage()

  // ── 建身分、進世界 ──
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', '成軍的人')
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  await page.click('button:has-text("複製鑰匙")')
  await page.waitForSelector('[role="status"]:has-text("已經複製")', { timeout: 15_000 })
  await page.click('button:has-text("進入世界")')
  await page.waitForURL('**/world', { timeout: 30_000 })
  await waitForWorld(page)
  ok('[S09] 建立了身分並進到世界')

  // ── 發案（面板從網址開：不走位）──
  await page.goto(`${FRONTEND}/world?panel=projects`)
  await waitForWorld(page)
  const panel = page.getByTestId('list-panel')
  await panel.getByRole('button', { name: '發案', exact: true }).click()
  const form = page.getByTestId('create-project-form')
  await form.getByLabel('標題').fill(TITLE)
  await form.getByLabel('內容').fill('成軍 e2e 用的案子。')
  await form.getByLabel('座位數').fill('2')
  await form.getByRole('button', { name: '送出' }).click()
  await page.waitForSelector('[data-testid="create-project-form"]', { state: 'detached', timeout: 15_000 })
  await page.waitForFunction((t) => document.querySelector('[data-testid="list-panel-list"] li [data-testid="project-card-title"]')?.textContent?.includes(t), TITLE, { timeout: 15_000 })
  const projectId = await page.$eval('[data-testid="list-panel-list"] li [data-testid="project-card"]', (n) => n.getAttribute('data-project-id'))
  ok(`[S09] 發了案：${projectId}`)

  // ── 開詳情、成軍 ──
  await page.locator(`[data-testid="project-card"][data-project-id="${projectId}"]`).click()
  await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 10_000 })
  const detail = page.getByTestId('project-detail')
  check('[S09] owner 看到「成軍」', await detail.getByRole('button', { name: '成軍', exact: true }).isVisible(), true)
  const roomsBefore = roomsHits
  await detail.getByRole('button', { name: '成軍', exact: true }).click()
  await detail.getByLabel('房間密碼').fill(PASSWORD)
  await detail.getByRole('button', { name: '確定成軍' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="project-detail"] [data-testid="project-status"]')?.textContent === '已成軍', null, { timeout: 15_000 }).catch(() => {})
  check('[S09] 詳情呈現「已成軍」', await detail.getByTestId('project-status').textContent(), '已成軍')
  check('[S09] 詳情呈現剛設定的密碼', await detail.getByTestId('room-password-reveal').textContent().catch(() => null), PASSWORD)
  await detail.getByRole('button', { name: '複製密碼' }).click()
  await page.waitForSelector('[role="status"]:has-text("已複製")', { timeout: 5_000 }).catch(() => null)
  check('[S09] 剪貼簿是那串密碼', await page.evaluate(() => navigator.clipboard.readText()).catch(() => null), PASSWORD)
  await page.screenshot({ path: path.join(OUT, '1-formed.png') })
  // 門立即重取：rooms 請求數要比成軍前多（不是等 30 秒輪詢）
  await page.waitForFunction(() => true)
  await page.waitForTimeout(500)
  check('[S09] 成軍後立即重取了 /api/rooms（請求數增加）', roomsHits > roomsBefore, true)

  // ── 關面板看走廊：那扇門的標籤 5 秒內出現 ──
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="list-panel"]', { state: 'detached', timeout: 5_000 })
  const doorSeen = await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="door-label"]')].some((n) => n.textContent?.includes(t)), TITLE, { timeout: 5_000 }).then(() => true).catch(() => false)
  check('[S09] 走廊 5 秒內長出那扇門的標籤', doorSeen, true)
  await page.screenshot({ path: path.join(OUT, '2-door.png') })

  // ── 深連結回詳情（案子已不在招募清單）、結案 ──
  await page.goto(`${FRONTEND}/world?panel=projects&project=${projectId}`)
  await waitForWorld(page)
  await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 15_000 })
  const detail2 = page.getByTestId('project-detail')
  check('[S09] 重開詳情不再呈現密碼', await detail2.getByTestId('room-password-reveal').count(), 0)
  const roomsBeforeClose = roomsHits
  await detail2.getByRole('button', { name: '結案', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '確定結案' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="project-detail"] [data-testid="project-status"]')?.textContent === '已結案', null, { timeout: 15_000 }).catch(() => {})
  check('[S09] 詳情呈現「已結案」', await detail2.getByTestId('project-status').textContent(), '已結案')
  check('[S09] 結案後動作插槽沒有任何按鈕', await detail2.getByTestId('owner-actions').getByRole('button').count(), 0)
  await page.waitForTimeout(500)
  check('[S09] 結案後立即重取了 /api/rooms', roomsHits > roomsBeforeClose, true)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="list-panel"]', { state: 'detached', timeout: 5_000 })
  const doorGone = await page.waitForFunction((t) => ![...document.querySelectorAll('[data-testid="door-label"]')].some((n) => n.textContent?.includes(t)), TITLE, { timeout: 5_000 }).then(() => true).catch(() => false)
  check('[S09] 走廊上那扇門 5 秒內消失', doorGone, true)
  await page.screenshot({ path: path.join(OUT, '3-closed.png') })
  await context.close()
} catch (err) {
  bad('腳本中途拋出', err instanceof Error ? (err.stack ?? err.message) : String(err))
} finally {
  await browser.close()
}
if (failureCount() > 0) {
  console.log(`\n${failureCount()} 條沒過`)
  process.exit(1)
}
console.log('\n全部通過')
