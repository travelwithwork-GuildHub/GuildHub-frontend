// `FE-X16` 的真瀏覽器判準（第三片 `--shell`）：`S05` 三層（面板不透明、邊界、陰影、不把世界變暗）、`S06` 遮罩（確認視窗與世界上的視窗有、子畫面沒有）、
// `S07` 標題列的解剖（返回｜標題｜關閉、五個面板同寬同關閉位置，1280×720 與 1024×640）、`S08` 內容區捲、標題列不走。
// REST 全部 `page.route` 偽造、只打本機自己起的 `next start`。顏色一律畫到 canvas 讀（`dom-visual.mjs` 同一把尺）。
//
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/dom-shell.mjs

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, guardLoopback, ok, profile, uuid, waitForWorld, walker } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-x16'
assertLoopback(FRONTEND)

const ME = profile(1, '我自己')
const OTHER = profile(2, '對方')
// 整整一頁 20 筆（PAGE_SIZE；分頁是換頁不是累加，規格 S08 的「30 筆」在這個模型裡就是一頁滿的）：`S08` 要內容溢出面板。
// 第 1 筆是別人的招募中、第 2 筆是我的已成軍（`S06` 結案確認）。
const PROJECTS = Array.from({ length: 20 }, (_, i) => ({
  id: uuid(i + 11), owner_id: i === 1 ? ME.id : OTHER.id, title: `案件 ${i + 1}`, body: '內容', needed_skills: [], status: i === 1 ? 'active' : 'recruiting',
  room_template: i === 1 ? 0 : null, seat_count: 4, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), updated_at: '2026-09-09T00:00:00Z',
}))
const [FIRST, MINE_ACTIVE] = PROJECTS
const ROOMS = [{ project_id: uuid(41), title: '星際導航', online_count: 3 }, { project_id: uuid(42), title: '深海探勘', online_count: 1 }]
const { approachDoor } = walker({ room: ROOMS[0].project_id, decoy: ROOMS[1].project_id, title: ROOMS[0].title, out: OUT })
const MESSAGE = { id: uuid(31), sender_id: OTHER.id, recipient_id: ME.id, body: '嗨，看到你的名片', created_at: '2026-09-12T10:00:00.000000Z', read_at: null }

async function fakeRest(page) {
  const json = (body, status = 200) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/me', json(ME))
  await page.route('**/api/rooms', json(ROOMS))
  await page.route('**/api/profiles?*', json([OTHER]))
  await page.route('**/api/projects?*', (r) => { const p = Number(new URL(r.request().url()).searchParams.get('page') ?? '0'); return json(p === 0 ? PROJECTS : [])(r) })
  for (const p of PROJECTS) await page.route(`**/api/projects/${p.id}`, json(p))
  await page.route(`**/api/profiles/${OTHER.id}`, json(OTHER))
  await page.route(`**/api/profiles/${ME.id}`, json(ME))
  await page.route('**/api/messages*', json([MESSAGE]))
}

const world = async (page, query = '') => { await page.goto(`${FRONTEND}/world${query}`); await waitForWorld(page) }
const openProfile = async (page) => { await world(page); await page.click('[data-testid="identity"] button'); await page.waitForSelector('[data-testid="talent-facts"]') }
const openInboxList = async (page) => { await world(page); await page.click('[data-testid="inbox-button"]'); await page.waitForSelector('[data-testid="inbox-thread-item"]') }
const openThread = async (page) => { await openInboxList(page); await page.click('[data-testid="inbox-thread-item"]'); await page.waitForSelector('[data-testid="inbox-message"]') }
const openList = async (page) => { await world(page, '?panel=projects'); await page.waitForSelector('[data-testid="project-card"]') }
const openDetail = async (page) => { await world(page, `?panel=projects&project=${FIRST.id}`); await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]') }

/** 五個阻斷式面板（`S07`）：根節點、標題列該寫什麼、要不要有返回。標題逐一核對（審查：任意非空 heading 會被空殼繞過）。 */
const PANELS = [
  { name: '看板清單', root: '[data-testid="list-panel"]', title: '專案看板', back: false, open: openList },
  { name: '看板詳情', root: '[data-testid="list-panel"]', title: '案件', back: true, open: openDetail },
  { name: '收件匣清單', root: '[data-testid="inbox-panel"]', title: '收件匣', back: false, open: openInboxList },
  { name: '收件匣對話', root: '[data-testid="inbox-panel"]', title: '對話', back: true, open: openThread },
  { name: '我的名片', root: '[data-testid="profile-panel"]', title: '我的名片', back: false, open: openProfile },
]

/** 頁面裡的量尺。 */
const install = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    const toRgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
    const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
    const covers = (a, b, tol = 1) => a.left <= b.left + tol && a.top <= b.top + tol && a.right >= b.right - tol && a.bottom >= b.bottom - tol
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.closest('[inert]') === null }
    const focusables = (scope) => [...scope.querySelectorAll('button, a[href], input, textarea, select, [tabindex]')].filter((el) => visible(el) && !el.disabled && el.tabIndex >= 0)
    // 陰影的顏色：computed `box-shadow` 是 `<color> x y blur spread, …`；每一段抓第一個顏色函式
    const shadowAlphas = (s) => [...s.matchAll(/(?:rgba?|oklch|lab|color)\([^)]*\)/g)].map((m) => toRgba(m[0])[3])
    window.__ds = {
      toRgba, rect, covers, focusables: (sel) => focusables(document.querySelector(sel)).map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').trim(), rect: rect(el) })),
      /** S05：一個表面的底／邊界／陰影 */
      surface(sel) {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return { bg: toRgba(cs.backgroundColor), border: toRgba(cs.borderTopColor), borderWidth: parseFloat(cs.borderTopWidth), borderStyle: cs.borderTopStyle, shadow: cs.boxShadow, shadowAlphas: shadowAlphas(cs.boxShadow), page: toRgba(getComputedStyle(document.body).backgroundColor) }
      },
      /**
       * S05：面板開著時世界有沒有被蓋住 —— 掃**整份文件**（不只世界容器的後代：portal、兄弟節點也算）裡「會畫東西」的可見元素：
       * 底色 alpha > 0、背景圖、backdrop-filter、或 ::before／::after 有底色；跟世界區相交；排除面板本身與它的後代、世界容器與它的祖先、canvas，
       * 以及**點名的合法 HUD**（聊天框、在線人數、走廊提示、門標籤、互動提示）。其餘的矩形聯集用 40×40 的格點取樣 —— 要是**零**
       *（審查：單一元素 ≥ 90% 會被分片繞過；「≤ 20%」會把 HUD 的 7.5% 變成新的容許量）。
       */
      worldCovers(panelSel) {
        const worldEl = document.querySelector('[data-testid="world-canvas-container"]')
        const w = rect(worldEl)
        const panel = document.querySelector(panelSel)
        const HUD = '[data-testid="scene-chat"], [data-testid="online-count"], [data-testid="rooms-notice"], [data-testid="door-labels"], [data-testid="interaction-prompt"]'
        const ancestors = new Set(); for (let n = worldEl; n; n = n.parentElement) ancestors.add(n)
        const paints = (el) => {
          const cs = getComputedStyle(el)
          if (toRgba(cs.backgroundColor)[3] > 0 || cs.backgroundImage !== 'none' || (cs.backdropFilter ?? 'none') !== 'none') return true
          return ['::before', '::after'].some((p) => { const ps = getComputedStyle(el, p); return ps.content !== 'none' && toRgba(ps.backgroundColor)[3] > 0 })
        }
        const boxes = [...document.querySelectorAll('body *')].filter((el) => el !== panel && !panel.contains(el) && !ancestors.has(el) && el.tagName !== 'CANVAS' && el.closest(HUD) === null && visible(el))
          .filter(paints)
          .map((el) => ({ el, r: rect(el) })).filter(({ r }) => r.right > w.left && r.left < w.right && r.bottom > w.top && r.top < w.bottom)
        let hit = 0
        const N = 40
        for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) {
          const x = w.left + ((i + 0.5) / N) * w.width, y = w.top + ((j + 0.5) / N) * w.height
          if (boxes.some(({ r }) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) hit += 1
        }
        return { fraction: hit / (N * N), who: boxes.map(({ el, r }) => `${el.tagName.toLowerCase()}#${el.getAttribute('data-testid') ?? el.className.slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`) }
      },
      /** S06：遮罩與它蓋住的那一層。inert 驗**行為**不只屬性：被遮那一層裡第一個可聚焦的元素 `focus()` 之後不能成為 activeElement。 */
      scrim(scrimSel, coveredSel, inertSels) {
        const scrim = document.querySelector(scrimSel)
        if (scrim === null) return null
        const covered = document.querySelector(coveredSel)
        const center = rect(covered)
        const hit = document.elementFromPoint((center.left + center.right) / 2, (center.top + center.bottom) / 2)
        const inert = inertSels.map((s) => {
          const layerEl = document.querySelector(s)
          if (layerEl === null) return { attr: null }
          const target = [...layerEl.querySelectorAll('button, a[href], input, textarea, select, [tabindex]')].find((el) => el.tabIndex >= 0 && !el.disabled) ?? null
          const before = document.activeElement
          target?.focus()
          const stole = target !== null && document.activeElement === target
          if (stole) before?.focus()
          return { attr: layerEl.hasAttribute('inert'), tried: target?.tagName.toLowerCase() ?? null, focusable: stole }
        })
        return { alpha: toRgba(getComputedStyle(scrim).backgroundColor)[3], covers: covers(rect(scrim), rect(covered)), onTop: hit !== null && (scrim === hit || scrim.contains(hit)), inert }
      },
      /** S07：面板的第一個區塊是標題列；標題列裡的標題與可聚焦元素 */
      anatomy(sel) {
        const section = document.querySelector(sel)
        const first = section.firstElementChild
        const heading = first?.querySelector('h1, h2, h3')
        return { firstTag: first?.tagName.toLowerCase() ?? null, title: (heading?.textContent ?? '').trim(), focusables: focusables(first ?? section).map((el) => ({ text: (el.textContent ?? '').trim(), rect: rect(el) })), width: rect(section).width, header: rect(first), panel: rect(section) }
      },
      /** S08：內容區的捲動容器（body 自己或它底下第一個真的在捲的） */
      scroller(bodySel) {
        const body = document.querySelector(bodySel)
        const el = [body, ...body.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY))
        if (el === undefined) return null
        el.setAttribute('data-ds-scroller', '')
        // 標題列（面板裡第一個 header）往上到 section 之間不准有任何會捲的容器 —— 不只「不在量到的那個捲動容器裡」（突變：標題列放進 body、ul 在捲，會漏）
        const section = body.closest('section')
        const header = section.querySelector('header')
        let inScroller = false
        for (let n = header?.parentElement ?? null; n !== null && n !== section; n = n.parentElement) if (/auto|scroll/.test(getComputedStyle(n).overflowY)) inScroller = true
        return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, containsHeader: inScroller, doc: { scrollHeight: document.scrollingElement.scrollHeight, clientHeight: document.scrollingElement.clientHeight } }
      },
    }
  })

const lum = ([r, g, b]) => [r, g, b].map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }).reduce((s, c, i) => s + [0.2126, 0.7152, 0.0722][i] * c, 0)
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05) }
const sameRect = (a, b, tol = 1) => ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(a[k] - b[k]) <= tol)
const inViewport = (r, vw, vh) => r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh

/** S05：一個表面的底是實的、有邊界、有陰影 */
async function surfaceChecks(page, name, sel) {
  await install(page)
  const s = await page.evaluate((sel) => window.__ds.surface(sel), sel)
  s.bg[3] === 1 ? ok(`[S05] ${name}：底 alpha = 1`) : bad(`[S05] ${name}：底 alpha ${s.bg[3]}`, JSON.stringify(s.bg))
  const r = s.borderWidth > 0 && s.borderStyle !== 'none' ? contrast(over(s.border, s.page), s.page) : 0
  r >= 3 ? ok(`[S05] ${name}：邊界 ${s.borderWidth}px、對 surface ${r.toFixed(2)}:1`) : bad(`[S05] ${name}：邊界不夠`, `${s.borderStyle} ${s.borderWidth}px、${r.toFixed(2)}:1`)
  s.shadow !== 'none' && s.shadowAlphas.some((a) => a > 0) ? ok(`[S05] ${name}：有陰影 ${s.shadow}`) : bad(`[S05] ${name}：沒有陰影`, s.shadow)
}

/** S06：一個確認視窗／世界上的視窗的遮罩 */
async function scrimChecks(page, name, scrimSel, coveredSel, inertSels) {
  await install(page)
  const s = await page.evaluate(([a, b, c]) => window.__ds.scrim(a, b, c), [scrimSel, coveredSel, inertSels])
  if (s === null) return bad(`[S06] ${name}：沒有遮罩`, scrimSel)
  s.alpha >= 0.3 && s.alpha <= 0.6 ? ok(`[S06] ${name}：遮罩 alpha ${s.alpha.toFixed(2)}`) : bad(`[S06] ${name}：遮罩 alpha ${s.alpha}`, '要在 [0.3, 0.6]')
  s.covers ? ok(`[S06] ${name}：遮罩蓋住被擋的那一層`) : bad(`[S06] ${name}：遮罩沒蓋滿被擋的那一層`)
  s.onTop ? ok(`[S06] ${name}：被擋那一層的中心點上是遮罩（或視窗）`) : bad(`[S06] ${name}：中心點上不是遮罩`)
  // 屬性在、而且裡面的東西真的聚焦不了（有可聚焦的才驗得到後半）
  s.inert.every((v) => v.attr === true && v.focusable === false) ? ok(`[S06] ${name}：被遮的那一層 inert（${s.inert.map((v) => v.tried ?? '沒有可聚焦的').join('、')} 聚焦不了）`) : bad(`[S06] ${name}：被遮的那一層不是 inert`, JSON.stringify(s.inert))
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const run = async (context, name, fn) => {
  const page = await context.newPage()
  await fakeRest(page)
  try { await fn(page) } catch (e) { bad(`${name}：走不到或量不到`, e.message); await page.screenshot({ path: path.join(OUT, `lost-shell-${name}.png`) }).catch(() => {}) }
  await page.close()
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(context)

  // ── S05 ──
  await run(context, 'S05 看板', async (page) => {
    await openList(page)
    await surfaceChecks(page, '看板', '[data-testid="list-panel"]')
    const covers = await page.evaluate(() => window.__ds.worldCovers('[data-testid="list-panel"]'))
    covers.fraction === 0 ? ok('[S05] 看板開著時，點名的 HUD 以外沒有任何東西蓋住世界區（0%）') : bad(`[S05] 看板開著時世界區被蓋住 ${(covers.fraction * 100).toFixed(1)}%`, covers.who.join('、'))
  })
  await run(context, 'S05 收件匣', async (page) => { await openInboxList(page); await surfaceChecks(page, '收件匣', '[data-testid="inbox-panel"]') })
  await run(context, 'S05 名片', async (page) => { await openProfile(page); await surfaceChecks(page, '我的名片', '[data-testid="profile-panel"]') })
  await run(context, 'S05 房間密碼', async (page) => {
    await world(page); await approachDoor(page); await page.keyboard.press('KeyE'); await page.waitForSelector('[data-testid="room-password-dialog"] input')
    await surfaceChecks(page, '房間密碼視窗', '[data-testid="room-password-dialog"]')
    // ── S06 世界上的視窗：遮罩蓋世界區、關了就不在 ──
    await scrimChecks(page, '房間密碼', '[data-testid="world-scrim"]', '[data-testid="world-canvas-container"]', ['[data-testid="world-stage"]'])
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-testid="room-password-dialog"]', { state: 'detached' })
    ;(await page.$('[data-testid="world-scrim"]')) === null ? ok('[S06] 房間密碼關了、遮罩不在') : bad('[S06] 房間密碼關了遮罩還在')
  })

  // ── S06 確認視窗 ──
  await run(context, 'S06 結案確認', async (page) => {
    await world(page, `?panel=projects&project=${MINE_ACTIVE.id}`)
    await page.click('[data-testid="owner-actions-body"] >> text=結案')
    await page.waitForSelector('[data-testid="close-project-confirm"]')
    // 被遮的內容區（body 與子畫面）加標題列都要 inert：視窗外的操作一個都不能達（審查：不然 Tab 從視窗溜到返回／關閉）
    await scrimChecks(page, '結案確認', '[data-testid="list-panel"] [data-testid="panel-scrim"]', '[data-testid="list-panel-content"]', ['[data-testid="list-panel-list"]', '[data-testid="list-panel-overlay"]', '[data-testid="list-panel"] > header'])
    await page.screenshot({ path: path.join(OUT, 'shell-close-confirm.png') })
    await page.click('[data-testid="close-project-confirm"] >> text=取消')
    await page.waitForSelector('[data-testid="close-project-confirm"]', { state: 'detached' })
    ;(await page.$('[data-testid="list-panel"] [data-testid="panel-scrim"]')) === null ? ok('[S06] 結案確認關了、遮罩不在') : bad('[S06] 結案確認關了遮罩還在')
  })
  await run(context, 'S06 放棄修改確認', async (page) => {
    await openProfile(page); await page.click('[data-testid="profile-panel"] >> text=編輯'); await page.fill('[data-testid="profile-form"] textarea', '改了字'); await page.keyboard.press('Escape')
    await page.waitForSelector('[data-testid="profile-discard-confirm"]')
    await scrimChecks(page, '放棄修改確認', '[data-testid="profile-panel"] [data-testid="panel-scrim"]', '[data-testid="profile-panel-content"]', ['[data-testid="profile-panel-body"]', '[data-testid="profile-panel"] > header'])
    await page.click('[data-testid="profile-discard-confirm"] >> text=繼續編輯')
    await page.waitForSelector('[data-testid="profile-discard-confirm"]', { state: 'detached' })
    ;(await page.$('[data-testid="profile-panel"] [data-testid="panel-scrim"]')) === null ? ok('[S06] 放棄修改確認關了、遮罩不在') : bad('[S06] 放棄修改確認關了遮罩還在')
  })
  await run(context, 'S06 子畫面', async (page) => {
    await openDetail(page)
    ;(await page.$('[data-testid="list-panel"] [data-testid$="scrim"]')) === null ? ok('[S06] 看板詳情（子畫面）沒有遮罩') : bad('[S06] 看板詳情有遮罩')
  })
  await context.close()

  // ── S07：兩個 viewport、五個面板 ──
  for (const vp of [{ width: 1280, height: 720 }, { width: 1024, height: 640 }]) {
    const ctx = await browser.newContext({ viewport: vp })
    guardLoopback(ctx)
    const closes = []
    const widths = []
    for (const p of PANELS) {
      await run(ctx, `S07 ${p.name} ${vp.width}`, async (page) => {
        await p.open(page)
        await install(page)
        const a = await page.evaluate((sel) => window.__ds.anatomy(sel), p.root)
        const tag = `${vp.width}×${vp.height} ${p.name}`
        a.firstTag === 'header' && a.title === p.title ? ok(`[S07] ${tag}：第一個區塊是標題列、標題「${a.title}」`) : bad(`[S07] ${tag}：第一個區塊是 ${a.firstTag}、標題「${a.title}」（要「${p.title}」）`)
        const last = a.focusables.at(-1)
        last !== undefined && last.text === '關閉' ? ok(`[S07] ${tag}：關閉是標題列最後一個可聚焦的`) : bad(`[S07] ${tag}：標題列最後一個可聚焦的是「${last?.text}」`, a.focusables.map((f) => f.text).join('、'))
        const first = a.focusables[0]
        if (p.back) first !== undefined && first.text === '返回' ? ok(`[S07] ${tag}：返回是標題列第一個可聚焦的`) : bad(`[S07] ${tag}：標題列第一個可聚焦的是「${first?.text}」`)
        else !a.focusables.some((f) => f.text === '返回') ? ok(`[S07] ${tag}：沒有返回`) : bad(`[S07] ${tag}：清單／名片不該有返回`)
        if (last !== undefined) closes.push({ name: p.name, rect: last.rect })
        widths.push({ name: p.name, width: a.width })
        if (vp.width === 1280) await page.screenshot({ path: path.join(OUT, `shell-${p.name}.png`) })
      })
    }
    const [c0] = closes
    closes.length === PANELS.length && closes.every((c) => sameRect(c.rect, c0.rect)) ? ok(`[S07] ${vp.width}×${vp.height}：五個面板的關閉 rect 相同（±1px）`) : bad(`[S07] ${vp.width}×${vp.height}：關閉 rect 不同`, closes.map((c) => `${c.name} ${JSON.stringify(c.rect)}`).join('\n   '))
    widths.length === PANELS.length && widths.every((w) => Math.abs(w.width - widths[0].width) <= 1) ? ok(`[S07] ${vp.width}×${vp.height}：五個面板同寬 ${widths[0]?.width}px`) : bad(`[S07] ${vp.width}×${vp.height}：寬度不同`, widths.map((w) => `${w.name} ${w.width}`).join('、'))
    await ctx.close()
  }

  // ── S08：30 筆、內容區捲、標題列不走 ──
  const ctx8 = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(ctx8)
  await run(ctx8, 'S08', async (page) => {
    await openList(page)
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="project-card"]').length === n, PROJECTS.length)
    const cards = await page.$$eval('[data-testid="project-card"]', (n) => n.length)
    cards === PROJECTS.length ? ok(`[S08] 載了 ${cards} 筆`) : bad(`[S08] 只載了 ${cards} 筆`, `要 ${PROJECTS.length}`)
    await install(page)
    const before = await page.evaluate(() => window.__ds.anatomy('[data-testid="list-panel"]'))
    before.panel.height <= 720 ? ok(`[S08] 面板高 ${before.panel.height.toFixed(0)}px ≤ 視窗 720`) : bad(`[S08] 面板高 ${before.panel.height}px 超過視窗`)
    const s = await page.evaluate(() => window.__ds.scroller('[data-testid="list-panel-content"]'))
    if (s === null) return bad('[S08] 內容區裡沒有在捲的容器', '內容沒溢出？')
    ok(`[S08] 內容區捲動容器 scrollHeight ${s.scrollHeight} > clientHeight ${s.clientHeight}`)
    s.doc.scrollHeight <= s.doc.clientHeight ? ok('[S08] 文件本身不可捲') : bad(`[S08] 文件可捲`, `${s.doc.scrollHeight} > ${s.doc.clientHeight}`)
    !s.containsHeader ? ok('[S08] 標題列在捲動容器之外') : bad('[S08] 標題列在捲動容器裡面')
    const scrolled = await page.evaluate(() => { const el = document.querySelector('[data-ds-scroller]'); el.scrollTop = el.scrollHeight; return el.scrollTop })
    await page.waitForTimeout(100)
    scrolled > 0 ? ok(`[S08] 真的捲了：scrollTop ${scrolled}`) : bad('[S08] scrollTop 還是 0', '找到的容器沒有在捲')
    const after = await page.evaluate(() => window.__ds.anatomy('[data-testid="list-panel"]'))
    const close = after.focusables.at(-1)
    sameRect(before.header, after.header) && inViewport(after.header, 1280, 720) ? ok('[S08] 捲到底標題列 rect 不變、完整在視窗裡') : bad('[S08] 捲到底標題列動了或出了視窗', `${JSON.stringify(before.header)} → ${JSON.stringify(after.header)}`)
    close !== undefined && sameRect(before.focusables.at(-1).rect, close.rect) && inViewport(close.rect, 1280, 720) ? ok('[S08] 捲到底關閉 rect 不變、在視窗裡') : bad('[S08] 捲到底關閉動了', JSON.stringify(close))
    await page.screenshot({ path: path.join(OUT, 'shell-scrolled.png') })
  })
  await ctx8.close()
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
