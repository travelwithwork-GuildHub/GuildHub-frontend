// `FE-J03` 的瀏覽器驗收（`FE-J03-S06`）：owner 發兩個案 → 我的案件看到兩筆（別人的不在、標示看過幾個）→ 開一筆成軍、返回是「已成軍」、門長出來 →
// 重新整理 `/world?panel=projects&view=mine` 仍在我的案件。規格 `openspec/changes/fe-j03-my-projects/specs/my-projects/spec.md`。
//
// 真的瀏覽器、真的 Route Handler、真的 Postgres（`internal`）：**不偽造任何 `/api/*`**。**只打本機自己起的 `next start`**（`assertLoopback`／`guardLoopback`）。
// 用法跟 `form-team.mjs` 一樣（db:reset → build → next start 3101）。「別人的案子」用第二個 context 另建身分發一個案。
//
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/my-projects.mjs

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, guardLoopback, ok, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-my-projects-shots'
assertLoopback(FRONTEND)

const RUN = randomUUID().slice(0, 8)
const MINE = [`我的甲 ${RUN}`, `我的乙 ${RUN}`]
const THEIRS = `別人的 ${RUN}`
const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))

/** 建身分（暱稱路）、帶走金鑰、進世界。 */
async function signUp(page, nickname) {
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', nickname)
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForURL('**/world', { timeout: 30_000 })
  await waitForWorld(page)
}
/** 在看板（招募中視圖）發一個案，回它的 id。 */
async function post(page, title) {
  const panel = page.getByTestId('list-panel')
  await panel.getByRole('button', { name: '發案', exact: true }).click()
  const form = page.getByTestId('create-project-form')
  await form.getByLabel('標題').fill(title)
  await form.getByLabel('內容').fill('我的案件 e2e 用的案子。')
  await form.getByLabel('座位數').fill('2')
  await form.getByRole('button', { name: '送出' }).click()
  await page.waitForSelector('[data-testid="create-project-form"]', { state: 'detached', timeout: 15_000 })
  await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="project-card-title"]')].some((n) => n.textContent?.includes(t)), title, { timeout: 15_000 })
  return page.$eval(`[data-testid="project-card"]:has([data-testid="project-card-title"]:text-is("${title}"))`, (n) => n.getAttribute('data-project-id')).catch(() => null)
}
const mineTitles = (page) => page.$$eval('[data-testid="my-projects"] [data-testid="project-card-title"]', (ns) => ns.map((n) => n.textContent ?? ''))
const statusOf = (page, title) => page.$eval(`[data-testid="my-projects"] [data-testid="project-card"]:has([data-testid="project-card-title"]:text-is("${title}")) [data-testid="project-status"]`, (n) => n.textContent ?? '').catch(() => null)

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  // ── 別人：另一個 context 建身分、發一個案（要證明「我的」不含它）──
  {
    const other = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(other)
    await other.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
    const page = await other.newPage()
    await signUp(page, '別人')
    await page.goto(`${FRONTEND}/world?panel=projects`)
    await waitForWorld(page)
    const id = await post(page, THEIRS)
    id ? ok(`[S06] 別人發了一個案：${id}`) : bad('[S06] 別人的案沒發成')
    await other.close()
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const page = await context.newPage()
  await signUp(page, '發案的我')
  await page.goto(`${FRONTEND}/world?panel=projects`)
  await waitForWorld(page)
  const ids = []
  for (const title of MINE) ids.push(await post(page, title))
  ids.every(Boolean) ? ok(`[S06] 發了兩個案：${ids.join('、')}`) : bad('[S06] 案沒發成', JSON.stringify(ids))

  // ── 我的案件 ──
  await page.getByTestId('list-panel').getByRole('button', { name: '我的案件', exact: true }).click()
  await page.waitForSelector('[data-testid="my-projects"][aria-busy="false"]', { timeout: 15_000 })
  const titles = await mineTitles(page)
  check('[S06] 我的案件恰好兩筆', titles.length, 2)
  MINE.every((t) => titles.includes(t)) ? ok('[S06] 兩筆都是我發的') : bad('[S06] 我的案件裡不是我發的那兩筆', titles.join('、'))
  titles.includes(THEIRS) ? bad('[S06] 別人的案子混進我的案件') : ok('[S06] 別人的案子不在')
  const summary = await page.$eval('[data-testid="my-projects-summary"]', (n) => n.textContent ?? '').catch(() => null)
  // 不能讓一行以 regex 開頭：ASI 會把上一行的 catch(...) 跟 /…/ 讀成除法
  const labeled = /看過 \d+ 個案子/.test(summary ?? '')
  labeled ? ok(`[S06] 標示：${summary}`) : bad('[S06] 沒有「看過幾個案子」的標示', String(summary))
  check('[S06] 網址是 view=mine', new URL(page.url()).search, '?panel=projects&view=mine')
  await page.screenshot({ path: path.join(OUT, '1-mine.png') })

  // ── 開一筆、成軍、返回 ──
  await page.locator(`[data-testid="my-projects"] [data-testid="project-card"][data-project-id="${ids[0]}"]`).click()
  await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 10_000 })
  const detail = page.getByTestId('project-detail')
  const doorsBefore = await page.$$eval('[data-testid="room-door"]', (ns) => ns.length).catch(() => 0)
  await detail.getByRole('button', { name: '成軍', exact: true }).click()
  await detail.getByLabel('房間密碼').fill('demo-1234')
  await detail.getByRole('button', { name: '確定成軍' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="project-detail"] [data-testid="project-status"]')?.textContent === '已成軍', null, { timeout: 15_000 }).catch(() => {})
  check('[S06] 詳情呈現「已成軍」', await detail.getByTestId('project-status').textContent(), '已成軍')
  await page.getByTestId('list-panel').getByRole('button', { name: '返回', exact: true }).click()
  await page.waitForSelector('[data-testid="project-detail"]', { state: 'detached', timeout: 10_000 })
  check('[S06] 返回後那一筆是「已成軍」', await statusOf(page, MINE[0]), '已成軍')
  check('[S06] 另一筆仍是「招募中」', await statusOf(page, MINE[1]), '招募中')
  check('[S06] 返回後網址回到我的案件', new URL(page.url()).search, '?panel=projects&view=mine')
  // 門長出來（`FE-J04-S10`）：走廊的門標籤裡有這個案子的標題
  await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="door-label"]')].some((n) => n.textContent?.includes(t)), MINE[0], { timeout: 15_000 }).then(() => ok('[S06] 大廳長出那扇門')).catch(() => bad('[S06] 成軍後大廳沒有長出門', `成軍前 ${doorsBefore} 扇`))
  await page.screenshot({ path: path.join(OUT, '2-formed.png') })

  // ── 重新整理仍在我的案件 ──
  await page.goto(`${FRONTEND}/world?panel=projects&view=mine`)
  await waitForWorld(page)
  await page.waitForSelector('[data-testid="my-projects"][aria-busy="false"]', { timeout: 15_000 })
  const again = await mineTitles(page)
  check('[S06] 重新整理後仍是兩筆', again.length, 2)
  check('[S06] 重新整理後那一筆仍是「已成軍」', await statusOf(page, MINE[0]), '已成軍')
  check('[S06] 重新整理後另一筆仍是「招募中」', await statusOf(page, MINE[1]), '招募中')
  await page.screenshot({ path: path.join(OUT, '3-reloaded.png') })
  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
