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
//   1. pnpm run dev
//   2. node tests/e2e/board-panel.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT（截圖目錄）

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { burst, stableDiff } from './lib/pixels.mjs'
import { approach } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-b01'
const HEADED = process.env.HEADED === '1'

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
// `expires_at` 釘在「當下 ＋7 天」：卡片的「剩幾天」是 `ceil`（`FE-B02-S07`），從這裡到瀏覽器畫出來差的那幾百毫秒吸得掉、一定是 7。
// 12 筆：列表要溢出面板才捲得動（FE-B03-S13 要驗返回之後的 scrollTop）。第一筆仍是「案件甲」（S01 看它）。
const PROJECTS = ['案件甲', '案件乙', '案件丙', ...Array.from({ length: 9 }, (_, i) => `案件 ${i + 4}`)].map((title, i) => ({
  id: uuid(i + 1),
  owner_id: uuid(99),
  title,
  body: '內容',
  needed_skills: i === 0 ? ['Three.js'] : [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
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
  // 案件詳情（FE-B03-S14）：詳情端點回的 body 刻意跟列表那一筆不同；發案者名片另一個端點。
  const PROJECT_DETAIL = { ...PROJECTS[0], body: '詳情端點回的內容：做一個小房間。' }
  const OWNER = { id: uuid(99), display_name: '發案的人', avatar_id: 1, skills: ['React'], hours_per_week: null, bio: null, updated_at: '2026-09-09T00:00:00Z' }
  for (const p of PROJECTS) {
    await page.route(`**/api/projects/${p.id}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(p.id === PROJECTS[0].id ? PROJECT_DETAIL : p) }),
    )
  }
  await page.route(`**/api/profiles/${OWNER.id}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OWNER) }),
  )
  // 兩張卡的詳情都攔：返回之後焦點回到那張卡（FE-X06-S12），下一個 Tab 到的是**第二張**卡。
  for (const p of PROFILES) {
    await page.route(`**/api/profiles/${p.id}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(p.id === PROFILES[0].id ? DETAIL : p),
      }),
    )
  }

  const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
  if (response === null) throw new Error(`連不到 ${FRONTEND} —— dev server 起了嗎？（pnpm run dev）`)
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
  const prompt = await approach(page, '看專案看板', [['ArrowLeft', 1400], ['ArrowUp', 1000]], OUT)
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

    // ── FE-B02-S07：第一個列項是整張卡，欄位各自讀得出來 ──
    const first = await panel.$('[data-testid="list-panel-list"] li [data-testid="project-card"]')
    if (first === null) {
      bad('[FE-B02-S07] 第一個列項不是案件卡', '`BoardPanel` 的 `renderItem` 還是一行標題？')
    } else {
      const read = async (testid) => (await first.$eval(`[data-testid="${testid}"]`, (n) => n.textContent?.trim() ?? '').catch(() => null))
      const skills = await first.$$eval('[data-testid="project-skill"]', (ns) => ns.map((n) => n.textContent?.trim()))
      const got = { title: await read('project-card-title'), skills, status: await read('project-status'), expires: await read('project-expires'), seats: await read('project-seats') }
      const want = { title: '案件甲', skills: ['Three.js'], status: '招募中', expires: '剩 7 天', seats: '4 個座位' }
      if (JSON.stringify(got) === JSON.stringify(want)) ok('[FE-B02-S07] 卡片上的標題、技能、狀態、剩 7 天、4 個座位都讀得出來')
      else bad('[FE-B02-S07] 卡片欄位對不上', `要 ${JSON.stringify(want)}，是 ${JSON.stringify(got)}`)

      // ── FE-B03-S14：Tab 到第一張卡按 Enter → 詳情（詳情端點的 body、發案者名字）→ 返回，焦點回那張卡 ──
      // 面板開了焦點在列表（`ul`）上：Tab 一次先到工具列？訪客沒有「發案」，所以第一下 Tab 就到第一張卡。
      await page.keyboard.press('Tab')
      const focusedId = await page.evaluate(() => document.activeElement?.getAttribute('data-project-id') ?? null)
      if (focusedId === PROJECTS[0].id) ok('[FE-B03-S14] Tab 一下就到了第一張案件卡')
      else bad('[FE-B03-S14] Tab 之後焦點不在第一張案件卡', `activeElement: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`)
      await page.keyboard.press('Enter')
      const pd = await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 5_000 }).catch(() => null)
      if (pd === null) bad('[FE-B03-S14] 按 Enter 沒有開出案件詳情（或沒載完）', '')
      else {
        const body = await pd.$eval('[data-testid="project-body"]', (n) => n.textContent?.trim()).catch(() => null)
        if (body === PROJECT_DETAIL.body) ok('[FE-B03-S14] 詳情呈現的是詳情端點回的 body（不是列表那一筆）')
        else bad('[FE-B03-S14] 詳情的 body 不對', `要「${PROJECT_DETAIL.body}」，是「${body}」`)
        const ownerName = await pd.waitForSelector('[data-testid="owner-card"][data-phase="ready"] [data-testid="owner-name"]', { timeout: 5_000 }).then((n) => n.textContent()).catch(() => null)
        if (ownerName === OWNER.display_name) ok('[FE-B03-S14] 發案者名片載到了：「發案的人」')
        else bad('[FE-B03-S14] 發案者名片沒載到', `是「${ownerName}」`)
        const listInert = await page.$eval('[data-testid="list-panel-list"]', (n) => n.hasAttribute('inert'))
        if (listInert) ok('[FE-B03-S13] 詳情開著時列表區是 inert')
        else bad('[FE-B03-S13] 詳情開著時列表區不是 inert', '')
        await page.screenshot({ path: path.join(OUT, 'project-detail-open.png') })
        await page.getByTestId('list-panel').getByRole('button', { name: '返回' }).click()
        await page.waitForSelector('[data-testid="project-detail"]', { state: 'detached', timeout: 5_000 })
        const backTo = await page.evaluate(() => document.activeElement?.getAttribute('data-project-id') ?? null)
        if (backTo === PROJECTS[0].id) ok('[FE-B03-S14] 返回之後焦點回到那張卡')
        else bad('[FE-B03-S14] 返回之後焦點沒回到那張卡', `activeElement: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`)
        const stillThree = await page.$$eval('[data-testid="project-card"]', (ns) => ns.length)
        if (stillThree === PROJECTS.length) ok(`[FE-B03-S13] 返回之後列表還在（${stillThree} 張卡）`)
        else bad('[FE-B03-S13] 返回之後列表不對', `${stillThree} 張卡`)
        if (hits.projects === 1) ok('[FE-B03-S13] 返回沒有重打列表（仍是 1 次 /api/projects）')
        else bad('[FE-B03-S13] 返回時重打了列表', `${hits.projects} 次`)

        // ── FE-B03-S13：真的捲動 —— 把列表捲到第 2、3 張卡在視窗裡，用滑鼠點第 2 張（在畫面上、不會被 scrollIntoView 動到），返回後 scrollTop 要一樣 ──
        // jsdom 沒有排版引擎，手動塞的 scrollTop 永遠留著、驗不到；這裡是唯一能驗它的地方（審查抓到的）。
        const LIST = '[data-testid="list-panel"] ul'
        const scrolled = await page.$eval(LIST, (ul) => { ul.scrollTop = 150; return ul.scrollTop })
        if (scrolled > 0) ok(`[FE-B03-S13] 列表捲得動（scrollTop ${scrolled}）`)
        else bad('[FE-B03-S13] 列表捲不動 —— 12 筆沒有溢出面板？量測壞了', '')
        await page.waitForTimeout(100)
        // 點一張**完全在視窗裡**的卡：半露的卡 Playwright 會先 scrollIntoView 再點、返回時 focus() 也會捲 —— 那是量測動到了尺，不是產品
        const visibleId = await page.$eval(LIST, (ul) => {
          const r = ul.getBoundingClientRect()
          for (const c of ul.querySelectorAll('[data-testid="project-card"]')) {
            const b = c.getBoundingClientRect()
            if (b.top >= r.top && b.bottom <= r.bottom) return c.getAttribute('data-project-id')
          }
          return null
        })
        if (visibleId === null) bad('[FE-B03-S13] 捲動後沒有一張卡完全在視窗裡 —— 量測壞了', '')
        const before = await page.$eval(LIST, (ul) => ul.scrollTop)
        await page.locator(`[data-testid="project-card"][data-project-id="${visibleId}"]`).click()
        await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 5_000 })
        await page.getByTestId('list-panel').getByRole('button', { name: '返回' }).click()
        await page.waitForSelector('[data-testid="project-detail"]', { state: 'detached', timeout: 5_000 })
        const after = await page.$eval(LIST, (ul) => ul.scrollTop)
        if (after === before && before > 0) ok(`[FE-B03-S13] 返回之後捲動位置還在（${after}）`)
        else bad('[FE-B03-S13] 返回之後捲動位置變了', `進去前 ${before}，回來 ${after}`)
        const backTo2 = await page.evaluate(() => document.activeElement?.getAttribute('data-project-id') ?? null)
        if (backTo2 === visibleId) ok('[FE-B03-S14] 返回之後焦點回到那張（捲動後點的）卡')
        else bad('[FE-B03-S14] 返回之後焦點沒回到那張卡', `${backTo2}`)

        // ── FE-B03-S02：Space 也開得了（焦點還在那張卡上）──
        await page.keyboard.press('Space')
        const bySpace = await page.waitForSelector('[data-testid="project-detail"]', { timeout: 5_000 }).catch(() => null)
        if (bySpace !== null && (await bySpace.getAttribute('data-project-id')) === visibleId) ok('[FE-B03-S02] 按 Space 開出了那一筆的詳情')
        else bad('[FE-B03-S02] 按 Space 沒有開出那一張的詳情', '')
        await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]', { timeout: 5_000 }).catch(() => null)
        await page.getByTestId('list-panel').getByRole('button', { name: '返回' }).click()
        await page.waitForSelector('[data-testid="project-detail"]', { state: 'detached', timeout: 5_000 })
        if (hits.projects === 1) ok('[FE-B03-S13] 三進三出，列表仍只取了 1 次')
        else bad('[FE-B03-S13] 列表被重取了', `${hits.projects} 次`)
      }
    }
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
  const prompt2 = await approach(page, '看人才看板', [['ArrowRight', 900]], OUT)
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

  // ── FE-B04：卡片 → 詳情（真的按 Enter、再一次真的按 Space）→ 返回 ─────
  // 面板開著時焦點在列表上；Tab 一下到第一張卡。規格 S05 要 Enter 與 Space **各一次**。
  for (const keyName of ['Space', 'Enter']) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
    if (focused === 'talent-card') ok(`[B04-S05] Tab 一下就到了第一張人才卡（${keyName} 那一輪）`)
    else bad(`[B04-S05] Tab 之後焦點不在人才卡上（${keyName} 那一輪）`, `activeElement 是 ${focused}`)
    await page.keyboard.press(keyName)
    const opened = await page.waitForSelector('[data-testid="talent-detail"]', { timeout: 5_000 }).catch(() => null)
    if (opened === null) { bad(`[B04-S05] 按 ${keyName} 沒有開出詳情`, ''); continue }
    ok(`[B04-S05] 按 ${keyName} 開出了詳情`)
    if (keyName === 'Space') {
      // Space 那一輪只驗開得了；返回，再用 Enter 走完整條。
      await page.click('button:has-text("返回")')
      await page.waitForTimeout(200)
    }
  }
  const detail = await page.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]', { timeout: 5_000 }).catch(() => null)
  if (detail === null) bad('[B04-S06] 詳情沒有載入完成', '')
  else {
    const which = await detail.getAttribute('data-profile-id')
    const bio = await page.$eval('[data-testid="talent-bio"]', (n) => n.textContent ?? '')
    // Space 那一輪開的是第一張（bio 是詳情端點的新自介）；Enter 那一輪焦點從第一張卡 Tab 到第二張。
    const expected = which === PROFILES[0].id ? '詳情端點回的新自介' : '未提供'
    if (bio.includes(expected)) ok(`[B04-S06] 詳情（${which === PROFILES[0].id ? '第一張' : '第二張'}）呈現的是 GET /api/profiles/{id} 回的那一筆`)
    else bad('[B04-S06] 詳情用的是列表那一筆', `id=${which}，bio：${bio}`)
    const inert = await page.$eval('[data-testid="list-panel-list"]', (n) => n.hasAttribute('inert'))
    if (inert) ok('[B04-S16] 詳情開著時列表區是 inert')
    else bad('[B04-S16] 列表區沒有 inert', '')
  }
  await page.screenshot({ path: path.join(OUT, 'talent-detail-open.png') })

  // ── FE-X06 S11：詳情開著，Tab 在面板內循環，不會跑到標題列 ──────────
  const activeIds = []
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    activeIds.push(
      await page.evaluate(() => {
        const el = document.activeElement
        return el === null ? 'null' : `${el.tagName.toLowerCase()}:${el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 8) ?? ''}`
      }),
    )
  }
  const insidePanel = await page.evaluate(
    (ids) => {
      const panel = document.querySelector('[data-testid="list-panel"]')
      // 每一次 Tab 之後焦點都要在面板裡（用最後一次判斷，其餘看紀錄）
      return panel !== null && panel.contains(document.activeElement) && ids.every((id) => !id.includes('建立你的身分'))
    },
    activeIds,
  )
  if (insidePanel) ok(`[X06-S11] Tab 六次都留在面板內：${activeIds.join(' → ')}`)
  else bad('[X06-S11] Tab 跑出面板了', activeIds.join(' → '))

  // ── FE-X06 S01：兩次 Escape，一次一層 ─────────────────────────────
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const afterFirst = { detail: await page.$('[data-testid="talent-detail"]'), panel: await page.$('[data-testid="list-panel"]') }
  if (afterFirst.detail === null && afterFirst.panel !== null) ok('[X06-S01] 第一下 Escape：詳情關、面板還在')
  else bad('[X06-S01] 第一下 Escape 不對', `detail=${afterFirst.detail !== null}，panel=${afterFirst.panel !== null}`)
  const cardCount = (await page.$$('[data-testid="talent-card"]')).length
  if (cardCount === PROFILES.length) ok(`[B04-S11] 返回之後列表還在（${cardCount} 張卡）`)
  else bad('[B04-S11] 返回之後列表不對', `卡片 ${cardCount} 張`)
  const focusAfterDetail = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? 'null')
  if (focusAfterDetail === 'talent-card') ok('[X06-S12] 詳情關了，焦點回到那張卡')
  else bad('[X06-S12] 詳情關了焦點不在卡上', `activeElement 是 ${focusAfterDetail}`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const afterSecond = await page.$('[data-testid="list-panel"]')
  if (afterSecond === null) ok('[X06-S01] 第二下 Escape：面板關')
  else bad('[X06-S01] 第二下 Escape 面板還在', '')
  // ── FE-X06 S13：面板關了，焦點在世界焦點錨上 ──────────────────────
  const anchor = await page.evaluate(() => document.activeElement?.getAttribute('data-focus-anchor') ?? `(${document.activeElement?.tagName ?? 'null'})`)
  if (anchor === 'world') ok('[X06-S13] 面板關了，焦點在世界焦點錨上')
  else bad('[X06-S13] 面板關了焦點不在錨上', `activeElement 是 ${anchor}`)
  // ── FE-X06 S17：picker 開著時真的按 E：面板開、picker 關（焦點移出）───
  await page.click('button:has-text("更換角色")')
  const pickerOpen = await page.$('section[aria-label="更換角色"]')
  if (pickerOpen === null) bad('[X06-S17] 「更換角色」沒開出 picker', '')
  else {
    await page.keyboard.press('KeyE')
    const panelAfterE = await page.waitForSelector('[data-testid="list-panel"]', { timeout: 5_000 }).catch(() => null)
    const pickerAfterE = await page.$('section[aria-label="更換角色"]')
    if (panelAfterE !== null && pickerAfterE === null) ok('[X06-S17] picker 開著按 E：面板開、picker 因失焦而關')
    else bad('[X06-S17] picker 開著按 E 不對', `panel=${panelAfterE !== null}，picker=${pickerAfterE !== null}`)
    const focusInPanel = await page.evaluate(() => document.querySelector('[data-testid="list-panel"]')?.contains(document.activeElement) ?? false)
    if (focusInPanel) ok('[X06-S17] 面板取得焦點')
    else bad('[X06-S17] 面板沒有取得焦點', '')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  // 再打開人才看板讓後面 401 那一段照舊（它會自己按 Escape 關）

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
