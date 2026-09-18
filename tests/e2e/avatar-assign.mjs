// 首次建立身分隨機發一款外觀（change `fe-a05-avatar-variety`）：`FE-A05-S17`／`S18`／`S19`／`S20`。
//
// 真的 internal 後端（Route Handlers ＋ 本機 Postgres；`db:reset` 過）—— `PATCH /api/profiles/me` 是真的存進去，
// 用 `page.on('request'/'response')` 記錄次數、body、時間；`S20` 用 `page.route` 把 `PATCH` 換成 500。
//
//   pnpm run db:reset && NEXT_PUBLIC_DATA_ADAPTER=internal … pnpm exec next build && pnpm exec next start -p 3101
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/avatar-assign.mjs

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const API = process.env.API ?? FRONTEND
const AVATAR_COUNT = 8

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d = '') => { failures++; console.log(`❌ ${l}\n   ${d}`) }

/** 記這個 page 送出的每一個 `PATCH /api/profiles/me`：body、送出時間、回應時間；另記往 `/world` 的導覽時間。 */
function watch(page) {
  const log = { patches: [], worldAt: null }
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && new URL(req.url()).pathname === '/api/profiles/me') log.patches.push({ body: req.postDataJSON(), at: performance.now(), respondedAt: null, status: null })
  })
  page.on('response', (res) => {
    const req = res.request()
    if (req.method() === 'PATCH' && new URL(req.url()).pathname === '/api/profiles/me') {
      const entry = log.patches.find((p) => p.respondedAt === null)
      if (entry) { entry.respondedAt = performance.now(); entry.status = res.status() }
    }
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/world' && log.worldAt === null) log.worldAt = performance.now()
  })
  return log
}
const whoAmI = async (page) => { const r = await page.request.get(`${API}/api/me`); return r.ok() ? r.json() : { error: r.status() } }
const validBody = (b) => b !== null && typeof b === 'object' && Object.keys(b).join() === 'avatar_id' && Number.isInteger(b.avatar_id) && b.avatar_id >= 0 && b.avatar_id < AVATAR_COUNT

/** 走首次進入流程到拿到金鑰（還沒進世界）。 */
async function createByNickname(page, name) {
  await page.goto(`${FRONTEND}/`)
  await page.waitForSelector('text=在世界裡顯示的名字', { timeout: 15_000 })
  await page.fill('input >> nth=0', name)
  await page.click('button:has-text("建立我的身分")')
  await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 15_000 })
  return (await page.textContent('[data-testid="recovery-key"]')).trim()
}
async function enterWorld(page) {
  await page.click('button:has-text("複製鑰匙")')
  await page.waitForSelector('text=已經複製了', { timeout: 15_000 })
  await page.click('button:has-text("進入世界")')
  await page.waitForURL('**/world', { timeout: 15_000 })
  await page.waitForFunction(() => { const el = document.querySelector('[data-testid="identity"]'); return el !== null && !el.textContent.includes('確認身分中') }, null, { timeout: 15_000 })
}
/** 一個 PATCH、body 合法、回應早於 /world 導覽、/api/me 的 avatar_id 等於送出的值。 */
async function assertAssigned(tag, page, log) {
  if (log.patches.length === 1) ok(`[${tag}] 恰好送出一次 PATCH /api/profiles/me`)
  else bad(`[${tag}] PATCH 次數是 ${log.patches.length}`, JSON.stringify(log.patches.map((p) => p.body)))
  const p = log.patches[0]
  if (p && validBody(p.body)) ok(`[${tag}] body 只含 avatar_id，值 ${p.body.avatar_id}（0～${AVATAR_COUNT - 1}）`)
  else bad(`[${tag}] body 不對`, JSON.stringify(p?.body))
  if (p && p.status === 200 && p.respondedAt !== null && log.worldAt !== null && p.respondedAt < log.worldAt) ok(`[${tag}] PATCH 的回應（+${(log.worldAt - p.respondedAt).toFixed(0)} ms 前）先於 /world 的導覽`)
  else bad(`[${tag}] PATCH 沒在導向 /world 之前完成`, JSON.stringify({ status: p?.status, respondedAt: p?.respondedAt, worldAt: log.worldAt }))
  const me = await whoAmI(page)
  if (p && me.avatar_id === p.body.avatar_id) ok(`[${tag}] 進世界後名片上的 avatar_id 就是那一款（${me.avatar_id}）`)
  else bad(`[${tag}] 名片上的 avatar_id 不是送出的那一款`, JSON.stringify({ me, sent: p?.body }))
  return p?.body.avatar_id
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  // ── S17：暱稱建立 ──
  const c1 = await browser.newContext()
  await c1.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const p1 = await c1.newPage()
  const l1 = watch(p1)
  const key = await createByNickname(p1, '隨機外觀的人')
  if (l1.patches.length === 1) ok('[S17] 建立身分的那一步就送了 PATCH（拿到金鑰時已經存好）')
  else bad('[S17] 拿到金鑰時 PATCH 次數不是 1', String(l1.patches.length))
  await enterWorld(p1)
  const assigned = await assertAssigned('S17', p1, l1)
  await p1.screenshot({ path: 'docs/evidence/fe-a05-variety/assigned.png' }).catch(() => {})

  // ── S19：用金鑰回來 —— 零次 PATCH、外觀是原本那一款 ──
  const c2 = await browser.newContext()
  const p2 = await c2.newPage()
  const l2 = watch(p2)
  await p2.goto(`${FRONTEND}/login`)
  await p2.fill('input >> nth=2', key)
  await p2.click('button:has-text("用金鑰回來")')
  await p2.waitForURL('**/world', { timeout: 15_000 })
  await p2.waitForTimeout(1500)
  if (l2.patches.length === 0) ok('[S19] 金鑰回來：一個 PATCH 都沒有')
  else bad('[S19] 金鑰回來卻送了 PATCH', JSON.stringify(l2.patches.map((p) => p.body)))
  const me2 = await whoAmI(p2)
  if (me2.avatar_id === assigned) ok(`[S19] 外觀還是原本那一款（${me2.avatar_id}）`)
  else bad('[S19] 外觀被改了', JSON.stringify({ me2, assigned }))
  await c2.close()

  // ── S18：註冊帳號 ──
  const c3 = await browser.newContext()
  const p3 = await c3.newPage()
  const l3 = watch(p3)
  await p3.goto(`${FRONTEND}/login`)
  await p3.getByRole('button', { name: '註冊', exact: true }).click()
  const form = p3.getByTestId('account-register-form')
  const loginId = `e2e-av-${Date.now().toString(36)}`
  await form.getByLabel('帳號', { exact: true }).fill(loginId)
  await form.getByLabel('密碼', { exact: true }).fill('correct horse battery')
  await form.getByLabel('在世界裡顯示的名字（註冊）').fill('註冊的人')
  await form.getByRole('button', { name: '建立帳號' }).click()
  await p3.waitForURL('**/world', { timeout: 15_000 })
  await p3.waitForFunction(() => { const el = document.querySelector('[data-testid="identity"]'); return el !== null && !el.textContent.includes('確認身分中') }, null, { timeout: 15_000 })
  await assertAssigned('S18', p3, l3)
  await c3.close()

  // ── S19（第二半）：帳號密碼登入既有名片 —— 零次 PATCH ──
  const c4 = await browser.newContext()
  const p4 = await c4.newPage()
  const l4 = watch(p4)
  await p4.goto(`${FRONTEND}/login`)
  const loginForm = p4.getByTestId('account-login-form')
  await loginForm.getByLabel('帳號', { exact: true }).fill(loginId)
  await loginForm.getByLabel('密碼', { exact: true }).fill('correct horse battery')
  await loginForm.getByRole('button', { name: '用帳號密碼登入' }).click()
  await p4.waitForURL('**/world', { timeout: 15_000 })
  await p4.waitForTimeout(1500)
  if (l4.patches.length === 0) ok('[S19] 帳號密碼登入既有名片：一個 PATCH 都沒有')
  else bad('[S19] 帳號密碼登入卻送了 PATCH', JSON.stringify(l4.patches.map((p) => p.body)))
  await c4.close()

  // ── S20：PATCH 回 500 —— 仍進世界、沒有錯誤視窗、不重送 ──
  const c5 = await browser.newContext()
  await c5.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND })
  const p5 = await c5.newPage()
  const l5 = watch(p5)
  await p5.route('**/api/profiles/me', (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: '壞掉了' }) }) : route.continue()))
  await createByNickname(p5, '存不到外觀的人')
  await enterWorld(p5)
  if (l5.patches.length === 1) ok('[S20] 失敗不重送：PATCH 恰好一次')
  else bad('[S20] PATCH 次數不是 1', String(l5.patches.length))
  // 視窗一個都不能有；`role="alert"` 常駐的 live region 是空的（`SceneNotices`），只算有字的
  const blocking = await p5.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => d.textContent?.trim() ?? '')
    const alerts = [...document.querySelectorAll('[role="alert"]')].map((d) => d.textContent?.trim() ?? '').filter((t) => t !== '')
    return { dialogs, alerts }
  })
  if (blocking.dialogs.length === 0 && blocking.alerts.length === 0) ok('[S20] 進了世界，沒有錯誤視窗或阻斷式訊息（有字的 alert 也沒有）')
  else bad('[S20] 出現了視窗或有字的 alert', JSON.stringify(blocking))
  const me5 = await whoAmI(p5)
  if (Number.isInteger(me5.avatar_id)) ok(`[S20] 名片上是後端給的那一款（${me5.avatar_id}）`)
  else bad('[S20] 拿不到名片', JSON.stringify(me5))
  await c5.close()
  await c1.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
