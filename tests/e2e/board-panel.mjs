// `FE-B01` 的瀏覽器驗收：走到看板前按 E 開面板、面板開著人不走、Escape 之後人走得動。
// 規格 `openspec/changes/fe-b01-list-container/`，Scenario S01／S02、S16／S17／S18。
//
// ⚠️ **這一支是整條鏈在真瀏覽器裡唯一走過一次的地方。**
// 單元判準把鏈切在 `inputLockRef` 兩邊（DOM 面板與 three 的角色是兩個 renderer）；
// 這裡是同一個視窗、同一份 `WorldCanvas.tsx` 的 JSX 排列 —— provider 包錯層級只有這裡抓得到。
//
// ⚠️ **回應是這支腳本攔截並偽造的**（`page.route`），跟 `rooms-fixture.mjs` 同一套說明：
// 它證明「元件在收到這份資料時會這樣做」，**不**證明真 GuildHub 整合可用。
// **不連任何團隊共用的位址** —— 只打本機自己起的 dev server。
//
// ⚠️ **移動的判準是 WebGL 像素**，不是 DOM：角色走動時相機跟著走，整個場景位移，
// 差異像素以萬計；鎖住時只剩 idle 動畫，而 `stableDiff` 的多幀交集把那個濾成 0。
// 面板是 DOM，不在 WebGL 的 back buffer 裡，所以它開著不影響這把尺。
//
// 用法：
//   1. npm run dev
//   2. node tests/e2e/board-panel.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT（截圖目錄）

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { burst, stableDiff } from './lib/pixels.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-b01'
const HEADED = process.env.HEADED === '1'

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const PROJECTS = ['案件甲', '案件乙', '案件丙'].map((title, i) => ({
  id: uuid(i + 1),
  owner_id: uuid(99),
  title,
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-09T00:00:00Z',
}))
const PROFILES = ['人才丁', '人才戊'].map((display_name, i) => ({
  id: uuid(i + 11),
  display_name,
  avatar_id: i,
  skills: ['Three.js', 'TypeScript'],
  hours_per_week: i === 0 ? 12 : null,
  bio: i === 0 ? '列表上的舊自介' : null,
  updated_at: '2026-09-09T00:00:00Z',
}))
/** 詳情端點回的那一筆 —— `bio` 刻意跟列表不同，證明詳情用的是這一個（`FE-B04-S06`）。 */
const DETAIL = { ...PROFILES[0], bio: '詳情端點回的新自介：做過三個 3D 專案。' }

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

/** 按住某個鍵走一段。 */
async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
  await page.waitForTimeout(400)
}

/** 走到某塊看板前，直到提示指名它。走不到就把畫面上有什麼說出來。 */
async function approach(page, label, steps) {
  for (const [code, ms] of steps) await hold(page, code, ms)
  for (let i = 0; i < 8; i++) {
    const prompt = await page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => null)
    if (prompt !== null && prompt.includes(label)) return prompt
    await hold(page, 'ArrowUp', 120)
  }
  const prompt = await page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => '（沒有提示）')
  await page.screenshot({ path: path.join(OUT, 'lost.png') })
  throw new Error(`走不到「${label}」前面。畫面上的提示：${prompt}（截圖 ${OUT}/lost.png）`)
}

/** 按住方向鍵前後，WebGL 畫面的穩定差異像素數。 */
async function motion(page) {
  const before = await burst(page, 3)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowRight')
  await page.waitForTimeout(300)
  const after = await burst(page, 3)
  return stableDiff(before, after)
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  const hits = { projects: 0, profiles: 0 }
  await page.route('**/api/projects?*', async (route) => {
    hits.projects += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROJECTS) })
  })
  // 人才端點：預設回清單；`guest` 切成 true 之後回 401（訪客的情況，`FE-X04-S04`）。
  let guest = false
  await page.route('**/api/profiles?*', async (route) => {
    hits.profiles += 1
    if (guest) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"未登入"}' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILES) })
  })
  await page.route('**/api/rooms', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(`**/api/profiles/${PROFILES[0].id}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DETAIL) }),
  )

  const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
  if (response === null) throw new Error(`連不到 ${FRONTEND} —— dev server 起了嗎？（npm run dev）`)
  await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // ── 對照：面板還沒開，人走得動 ──────────────────────────────
  //
  // ⚠️ **下面的閾值都是相對於這個對照組的**，不是絕對值。實測走動是 15～22 萬個像素、
  // 鎖住是 0，但 `=== 0` 太脆：swiftshader 的浮點、抗鋸齒、idle 動畫哪天變大，
  // 都可能漏出幾個穩定像素，而那不是產品壞了。對照組自己要先超過一個下限，
  // 否則「量測壞了」（世界沒畫出來、方向鍵沒送到）會讓鎖住那條假綠。
  const SIGNAL_FLOOR = 5_000
  const free0 = await motion(page)
  if (free0 >= SIGNAL_FLOOR) ok(`還沒開面板時按方向鍵，畫面差了 ${free0} 個像素（人在走）`)
  else bad(`還沒開面板時畫面只差了 ${free0} 個像素（下限 ${SIGNAL_FLOOR}）`, '**這是量測壞了**：世界沒畫出來、或方向鍵沒送到。先修這裡')
  const lockedCeiling = Math.round(free0 * 0.01)

  // ── S01：專案看板 ─────────────────────────────────────────
  // 出生點 (0, -1)，剛剛的對照組往右走了 0.5 秒（速度 4 ⇒ x ≈ 2）。
  // 專案看板在 (-3.5, -6.5)：往左 5.5、往上 4 左右到互動範圍（2）內，面向它。
  const prompt = await approach(page, '看專案看板', [['ArrowLeft', 1400], ['ArrowUp', 1000]])
  ok(`走到了專案看板前：提示是「${prompt.trim()}」`)

  await page.keyboard.press('KeyE')
  const panel = await page.waitForSelector('[data-testid="list-panel"]', { timeout: 5_000 }).catch(() => null)
  if (panel === null) {
    bad('[S01] 按 E 沒有開出面板', '`BoardTargets` 的 `onInteract` 有接上嗎？`ListPanelProvider` 有包住 Canvas 嗎？')
  } else {
    const kind = await panel.getAttribute('data-kind')
    const text = await panel.textContent()
    if (kind === 'projects' && text?.includes('案件甲')) ok(`[S01] 專案看板開的是案件清單（攔到 ${hits.projects} 次 /api/projects）`)
    else bad('[S01] 面板開了但不是案件', `data-kind=${kind}，內容：${text?.slice(0, 80)}`)
  }
  await page.screenshot({ path: path.join(OUT, 'project-board-open.png') })

  // ── S18：面板開著，人 SHALL NOT 走 ──────────────────────────
  const locked = await motion(page)
  if (locked <= lockedCeiling) ok(`[S18] 面板開著時按方向鍵，畫面只差 ${locked} 個像素（上限 ${lockedCeiling}，人沒有走）`)
  else bad('[S18] 面板開著人還在走', `差了 ${locked} 個像素（上限 ${lockedCeiling}，對照組 ${free0}）—— 鎖沒有到角色那裡`)

  // ── S16／S17：Escape 關閉，人走得動 ──────────────────────────
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const stillOpen = await page.$('[data-testid="list-panel"]')
  if (stillOpen === null) ok('[S16] Escape 關掉了面板')
  else bad('[S16] Escape 之後面板還在', '')

  const free1 = await motion(page)
  const freeFloor = Math.round(free0 * 0.2)
  if (free1 >= freeFloor) ok(`[S17] 關掉面板之後按方向鍵，畫面差了 ${free1} 個像素（下限 ${freeFloor}，人走得動）`)
  else bad(`[S17] 關掉面板之後畫面只差了 ${free1} 個像素（下限 ${freeFloor}）`, '鎖沒有還回去 —— 使用者要用滑鼠點一下畫面。**只驗 S18 的話這一條是綠的**')

  // ── S02：人才看板 ─────────────────────────────────────────
  // 剛剛 motion() 往右走了兩段；人才看板在 (3.5, -6.5)，跟專案看板同一排。
  const prompt2 = await approach(page, '看人才看板', [['ArrowRight', 900]])
  ok(`走到了人才看板前：提示是「${prompt2.trim()}」`)
  await page.keyboard.press('KeyE')
  const panel2 = await page.waitForSelector('[data-testid="list-panel"]', { timeout: 5_000 }).catch(() => null)
  if (panel2 === null) bad('[S02] 按 E 沒有開出面板', '')
  else {
    const kind = await panel2.getAttribute('data-kind')
    const text = await panel2.textContent()
    if (kind === 'profiles' && text?.includes('人才丁') && !text.includes('案件甲'))
      ok(`[S02] 人才看板開的是人才清單（攔到 ${hits.profiles} 次 /api/profiles）`)
    else bad('[S02] 面板開了但不是人才、或混進了案件', `data-kind=${kind}，內容：${text?.slice(0, 80)}`)
  }
  await page.screenshot({ path: path.join(OUT, 'talent-board-open.png') })

  // ── FE-B04：卡片 → 詳情（真的按 Enter）→ 返回 ────────────────────
  // 面板開著時焦點在列表上；Tab 一下到第一張卡。
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
  if (focused === 'talent-card') ok('[B04-S05] Tab 一下就到了第一張人才卡（它是可聚焦的按鈕）')
  else bad('[B04-S05] Tab 之後焦點不在人才卡上', `activeElement 是 ${focused}`)
  await page.keyboard.press('Enter')
  const detail = await page.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]', { timeout: 5_000 }).catch(() => null)
  if (detail === null) bad('[B04-S05] 按 Enter 沒有開出詳情', '')
  else {
    const bio = await page.$eval('[data-testid="talent-bio"]', (n) => n.textContent ?? '')
    if (bio.includes('詳情端點回的新自介')) ok('[B04-S06] 詳情呈現的是 GET /api/profiles/{id} 回的那一筆，不是列表那一筆')
    else bad('[B04-S06] 詳情用的是列表那一筆', `bio：${bio}`)
    const inert = await page.$eval('[data-testid="list-panel-list"]', (n) => n.hasAttribute('inert'))
    if (inert) ok('[B04-S16] 詳情開著時列表區是 inert')
    else bad('[B04-S16] 列表區沒有 inert', '')
  }
  await page.screenshot({ path: path.join(OUT, 'talent-detail-open.png') })
  await page.click('button:has-text("返回")')
  await page.waitForTimeout(200)
  const stillDetail = await page.$('[data-testid="talent-detail"]')
  const cardCount = (await page.$$('[data-testid="talent-card"]')).length
  if (stillDetail === null && cardCount === PROFILES.length) ok(`[B04-S11] 返回之後列表還在（${cardCount} 張卡）`)
  else bad('[B04-S11] 返回之後列表不對', `detail=${stillDetail !== null}，卡片 ${cardCount} 張`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ── FE-X04 S04：訪客按 E 看到的是「要登入」，不是空白 ─────────────
  guest = true
  await page.keyboard.press('KeyE')
  const blocked = await page
    .waitForSelector('[data-testid="empty-state"]', { timeout: 5_000 })
    .catch(() => null)
  if (blocked === null) {
    bad('[X04-S04] 401 之後面板裡沒有任何空狀態節點', '訪客看到的是一片空白 —— BoardPanel 的 error 插槽接上了嗎？')
  } else {
    const kind = await blocked.getAttribute('data-empty-state')
    const said = (await blocked.textContent())?.trim()
    if (kind === 'permission-blocked' && said && !said.includes('未登入'))
      ok(`[X04-S04] 401 → 權限阻擋：「${said}」（後端的 detail 沒有漏出來）`)
    else bad('[X04-S04] 401 沒有畫成權限阻擋', `data-empty-state=${kind}，內容：${said}`)
  }
  await page.screenshot({ path: path.join(OUT, 'talent-board-guest-401.png') })
  await page.keyboard.press('Escape')
  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
