// `FE-J01` 的瀏覽器驗收：發出去的案子在伺服器上（`FE-J01-S08`）。
// 規格 `openspec/changes/fe-j01-create-project/specs/project-posting/spec.md`。
//
// ⚠️ **為什麼要有這一支：jsdom 那 16 條全綠，但它們每一條的後端都是 `contract-server` 回的那一筆。**
// 「送出去的案子第二個人看得到」「重新整理還在」「瀏覽器真的只送四個鍵」——
// 這三件事只在真的瀏覽器、真的 Route Handler、真的 Postgres 上成立或不成立。
//
// **不攔任何 `/api/*`。** `POST /api/projects` 只用 `context.on('request')` 旁觀 —— 事件監聽不接管請求；
// 規格括號裡寫的 `page.route` 其實是攔截後放行（`route.continue()`），兩個審查者都指出純旁觀該用事件（規格要的是「旁觀，不攔截」，這一條比它更嚴）。
// 攔下來偽造的話，「恰好四鍵」證明的是測試自己。
// **只打本機自己起的 `next start` 與可拋棄的資料庫**（`assertLoopback`／`guardLoopback`）。
//
// 用法（**要先 build、起 internal adapter 的正式 server**；`next dev` 會 HMR panic 假紅，`FE-V01` 記著）：
//
//   pnpm run db:reset
//   NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_DATA_ADAPTER=internal NEXT_PUBLIC_REALTIME_ADAPTER=none \
//     INTERNAL_DATABASE_URL=postgresql://guildhub:guildhub@localhost:5432/guildhub_frontend pnpm exec next build
//   （同一組環境變數）pnpm exec next start -p 3101
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/create-project.mjs
//
// ⚠️ 位址用 127.0.0.1 不用 localhost：`page.request` 與頁面要是同一個 host，session cookie 才跟得上（`identity-flow.mjs` 記著）。

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { approach, assertLoopback, bad, failureCount, guardLoopback, ok, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-create-project-shots'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

/** 每次跑都是新標題：同一個資料庫重跑時，上一輪的案子也在列表裡，「第一筆」要分得出是這一輪的。時間戳給人讀、UUID 前 8 碼把同秒撞名的機率壓到可忽略（不是保證）。 */
const TITLE = `瀏覽器發的案 ${new Date().toISOString().slice(11, 19)} ${randomUUID().slice(0, 8)}`
const PAYLOAD_KEYS = ['title', 'body', 'needed_skills', 'seat_count']

const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))

/** 在 `/login` 用暱稱建立身分、帶走金鑰（`KeyHandoff`）、進世界。**兩個 context 各走一次** —— 兩個全新的儲存空間。 */
async function signUpAndEnter(context, nickname) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/login`)
  await page.fill('form[aria-labelledby="nickname-heading"] input', nickname)
  await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  await page.click('button:has-text("複製鑰匙")')
  await page.waitForSelector('[role="status"]:has-text("已經複製")', { timeout: 15_000 })
  await page.click('button:has-text("進入世界")')
  await page.waitForURL('**/world', { timeout: 30_000 })
  await waitForWorld(page)
  return page
}

/** 走到專案看板前按 E，回傳開出來的面板。出生點 (0, -1)、看板在 (-3.5, -6.5)：往左 900 ms（速度 4 ⇒ 3.6）、往上 1000 ms，再一小步一小步逼近。 */
async function openProjectBoard(page, who) {
  // 先把鍵盤焦點放進世界（`inbox.mjs` 同一招）
  await page.click('[data-testid="world-canvas-container"]')
  await page.waitForTimeout(500)
  const prompt = await approach(page, '看專案看板', [['ArrowLeft', 900], ['ArrowUp', 1000]], OUT)
  ok(`${who}走到了專案看板前：提示是「${prompt.trim()}」`)
  await page.keyboard.press('KeyE')
  const panel = await page.waitForSelector('[data-testid="list-panel"][data-kind="projects"]', { timeout: 5_000 }).catch(() => null)
  if (panel === null) throw new Error(`${who}按 E 沒有開出專案面板`)
  return panel
}
const firstItemText = (page) => page.$eval('[data-testid="list-panel-list"] li', (n) => n.textContent?.trim() ?? '').catch(() => null)
/** 等列表載完、第一筆是 `title`（最多 15 秒），然後**讀出來比對**：等不到就讀到什麼比什麼 —— 判準在 `check`，不在這裡。 */
async function expectFirstItem(page, label, title) {
  await page.waitForFunction((t) => document.querySelector('[data-testid="list-panel-list"] li')?.textContent?.includes(t), title, { timeout: 15_000 }).catch(() => {})
  check(label, await firstItemText(page), title)
}
// 只看面板裡的、名字完全相等：標題列的「我的名片：發案的人」也含「發案」兩個字（第一次跑就撞到）
const postButton = (page) => page.getByTestId('list-panel').getByRole('button', { name: '發案', exact: true })
const hasPostButton = (page) => postButton(page).isVisible()

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  // ── 第一個人：建身分 → 世界 → 看板 → 發案 ───────────────────────────
  const first = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(first)
  const posts = []
  // 旁觀、不攔截：事件監聽只讀，不接管請求 —— 送到真的 Route Handler 的就是這一份
  first.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects') posts.push(request.postDataJSON())
  })
  const page = await signUpAndEnter(first, '發案的人')
  ok('[S08] 第一個人在全新的儲存空間建立了身分並進到世界')

  await openProjectBoard(page, '第一個人')
  check('[S08] 已登入的人的面板裡有「發案」', await hasPostButton(page), true)
  await postButton(page).click()
  const form = await page.waitForSelector('[data-testid="create-project-form"]', { timeout: 5_000 }).catch(() => null)
  if (form === null) throw new Error('按「發案」沒有開出表單')
  await page.screenshot({ path: path.join(OUT, '1-form-open.png') })

  // 全部在表單裡找：場景聊天也有一顆「送出」（第二次跑撞到）
  const inForm = page.getByTestId('create-project-form')
  await inForm.getByLabel('標題').fill(TITLE)
  await inForm.getByLabel('內容').fill('真瀏覽器、真 Route Handler、真 Postgres 上建的案子。')
  await inForm.getByLabel('需要的技能').fill('Three.js, TypeScript')
  await inForm.getByLabel('座位數').fill('3')
  await page.screenshot({ path: path.join(OUT, '2-form-filled.png') })
  await inForm.getByRole('button', { name: '送出' }).click()

  const closed = await page.waitForSelector('[data-testid="create-project-form"]', { state: 'detached', timeout: 15_000 }).then(() => true).catch(() => false)
  check('[S08] 送出之後表單關閉', closed, true)
  await expectFirstItem(page, '[S08] 列表第一筆是剛發的標題', TITLE)
  await page.screenshot({ path: path.join(OUT, '3-after-submit.png') })

  check('[S08] 建案時瀏覽器送出了恰好一個 POST /api/projects', posts.length, 1)
  const keys = Object.keys(posts[0] ?? {}).sort()
  check('[S08] POST body 恰好是四個鍵', keys.join(','), [...PAYLOAD_KEYS].sort().join(','))
  check('[S08] POST body 的 needed_skills 是拆好的陣列', JSON.stringify(posts[0]?.needed_skills), JSON.stringify(['Three.js', 'TypeScript']))
  check('[S08] POST body 的 seat_count 是數字', posts[0]?.seat_count, 3)

  // ── 第一個人重新整理：案子還在 ────────────────────────────────────
  await page.reload()
  await waitForWorld(page)
  // 面板的狀態在網址上（`?panel=projects&page=0`），重新整理會直接開著回來：先看這一份，再關掉、走回去、按 E 再開一次（規格的字面）
  await expectFirstItem(page, '[S08] 重新整理後從網址回來的面板，第一筆仍是那個標題', TITLE)
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="list-panel"]', { state: 'detached', timeout: 5_000 })
  await openProjectBoard(page, '重新整理後的第一個人')
  await expectFirstItem(page, '[S08] 重新整理、再開一次面板，第一筆仍是那個標題', TITLE)
  await page.screenshot({ path: path.join(OUT, '4-after-reload.png') })
  check('[S08] 重新整理前後只有那一個 POST（列表是重取的，不是樂觀塞的）', posts.length, 1)
  const me1 = await page.request.get(`${FRONTEND}/api/me`).then((r) => (r.ok() ? r.json() : null))
  // ⚠️ 第二個人走位之前先關掉第一個 context：同一個 headless 瀏覽器裡兩頁同開，另一頁是 hidden 的 —— rAF 不跑、
  // `visibilitychange` 還會把按著的鍵放掉（`LocalPlayer` 刻意的），第二個人會一步都不動（實測 3 次紅 1 次；`avatar-seen-by-others.mjs` 也是一次只讓一頁活著）。
  // 規格只要求「第二個人開面板時看到同一筆」，沒有要求兩人同時在線。
  await first.close()

  // ── 第二個人：另一個全新的儲存空間 ────────────────────────────────
  const second = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(second)
  const page2 = await signUpAndEnter(second, '看案的人')
  const me2 = await page2.request.get(`${FRONTEND}/api/me`).then((r) => (r.ok() ? r.json() : null))
  check('[S08] 第二個人是另一張名片（不是同一個 cookie）', typeof me2?.id === 'string' && me2.id !== me1?.id, true)

  await openProjectBoard(page2, '第二個人')
  await expectFirstItem(page2, '[S08] 第二個人的面板第一筆是同一個標題', TITLE)
  check('[S08] 第二個人的面板裡也有「發案」（已登入）', await hasPostButton(page2), true)
  await page2.screenshot({ path: path.join(OUT, '5-second-person.png') })

  await second.close()
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
