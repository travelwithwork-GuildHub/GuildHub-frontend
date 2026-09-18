// `FE-X16` 的真瀏覽器判準（design D7）：`S02` 字體、`S10` 三級與焦點環／hover、`S11` 高度、`S12` 動態。
// 規格點名的表面各走一次：`/login`、金鑰交接、訪客提示、標題列、看板清單／詳情（案件與人才；owner 的案件另量）、收件匣清單／對話、
// 我的名片（看／改）、場景聊天框、結案確認、放棄修改確認。房間密碼視窗要走到門前，`--shell` 的 `S06` 一起量。
// REST 全部 `page.route` 偽造、只打本機自己起的 `next start`（`lib/world.mjs` 的 loopback 守衛）。
//
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/dom-visual.mjs
//
// ⚠️ 顏色一律畫到 canvas 再讀（`control-contrast.mjs` 的 M1）：`getComputedStyle` 對 `oklch()` 原樣回字串，直接 parse 會算出 1.00:1。
// ⚠️ 焦點環用**真的 Tab** 走到每一個控制項：`el.focus()` 不一定觸發 `:focus-visible`，而規格量的是鍵盤看到的那一圈。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, guardLoopback, ok, profile, uuid, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-x16'
assertLoopback(FRONTEND)

const ME = profile(1, '我自己')
const OTHER = profile(2, '對方')
const PROJECTS = [['案件甲', OTHER, 'recruiting'], ['案件乙', OTHER, 'recruiting'], ['我的招募中', ME, 'recruiting'], ['我的已成軍', ME, 'active']].map(([title, owner, status], i) => ({
  id: uuid(i + 11), owner_id: owner.id, title, body: '內容', needed_skills: i === 0 ? ['Three.js'] : [], status,
  room_template: status === 'active' ? 0 : null, seat_count: 4, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), updated_at: '2026-09-09T00:00:00Z',
}))
const [, , MINE_RECRUITING, MINE_ACTIVE] = PROJECTS
const MESSAGE = { id: uuid(31), sender_id: OTHER.id, recipient_id: ME.id, body: '嗨，看到你的名片', created_at: '2026-09-12T10:00:00.000000Z', read_at: null }

const world = async (page, query = '') => { await page.goto(`${FRONTEND}/world${query}`); await waitForWorld(page) }
const openProfile = async (page) => { await world(page); await page.click('[data-testid="identity"] button'); await page.waitForSelector('[data-testid="talent-facts"]') }
const openInboxList = async (page) => { await world(page); await page.click('[data-testid="inbox-button"]'); await page.waitForSelector('[data-testid="inbox-thread-item"]') }
/** 一個表面：怎麼到、根節點是哪個、要不要登入。 */
const SURFACES = [
  { name: '/login', guest: true, root: 'body', open: (page) => page.goto(`${FRONTEND}/login`).then(() => page.waitForSelector('form')) },
  {
    name: '金鑰交接', guest: true, root: 'section[aria-labelledby="key-heading"]',
    open: async (page) => { await page.goto(`${FRONTEND}/login`); await page.fill('form[aria-labelledby="nickname-heading"] input', '新來的'); await page.click('form[aria-labelledby="nickname-heading"] button[type="submit"]'); await page.waitForSelector('[data-testid="recovery-key"]') },
  },
  { name: '訪客提示', guest: true, root: '[data-testid="first-entry-notice"]', open: (page) => page.goto(`${FRONTEND}/world`).then(() => waitForWorld(page)).then(() => page.waitForSelector('[data-testid="first-entry-notice"]')) },
  { name: '看板清單', root: '[data-testid="list-panel"]', open: async (page) => { await world(page, '?panel=projects'); await page.waitForSelector('[data-testid="project-card"]') } },
  { name: '看板詳情', root: '[data-testid="list-panel"]', open: async (page) => { await world(page, `?panel=projects&project=${PROJECTS[0].id}`); await page.waitForSelector('[data-testid="project-detail"][data-phase="ready"]') } },
  { name: 'owner 案件詳情（招募中）', root: '[data-testid="list-panel"]', open: async (page) => { await world(page, `?panel=projects&project=${MINE_RECRUITING.id}`); await page.waitForSelector('[data-testid="owner-actions-body"]') } },
  {
    name: '結案確認', root: '[data-testid="close-project-confirm"]',
    open: async (page) => { await world(page, `?panel=projects&project=${MINE_ACTIVE.id}`); await page.click('[data-testid="owner-actions-body"] >> text=結案'); await page.waitForSelector('[data-testid="close-project-confirm"]') },
  },
  { name: '人才清單', root: '[data-testid="list-panel"]', open: async (page) => { await world(page, '?panel=profiles'); await page.waitForSelector('[data-testid="talent-card"]') } },
  { name: '人才詳情', root: '[data-testid="list-panel"]', open: async (page) => { await world(page, `?panel=profiles&profile=${OTHER.id}`); await page.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]') } },
  { name: '收件匣清單', root: '[data-testid="inbox-panel"]', open: openInboxList },
  { name: '收件匣對話', root: '[data-testid="inbox-panel"]', open: async (page) => { await openInboxList(page); await page.click('[data-testid="inbox-thread-item"]'); await page.waitForSelector('[data-testid="inbox-message"]') } },
  { name: '我的名片', root: '[data-testid="profile-panel"]', open: openProfile },
  { name: '我的名片（編輯）', root: '[data-testid="profile-panel"]', open: async (page) => { await openProfile(page); await page.click('[data-testid="profile-panel"] >> text=編輯'); await page.waitForSelector('[data-testid="profile-form"]') } },
  {
    name: '放棄修改確認', root: '[data-testid="profile-discard-confirm"]',
    open: async (page) => { await openProfile(page); await page.click('[data-testid="profile-panel"] >> text=編輯'); await page.fill('[data-testid="profile-form"] textarea', '改了字'); await page.keyboard.press('Escape'); await page.waitForSelector('[data-testid="profile-discard-confirm"]') },
  },
  { name: '場景聊天框', root: '[data-testid="scene-chat"]', open: async (page) => { await world(page); await page.waitForSelector('[data-testid="scene-chat"] textarea') } },
  // 標題列：三個入口（名片、收件匣、換角色）都在
  { name: '標題列', root: '[data-testid="app-header"]', open: async (page) => { await world(page); await page.waitForSelector('[data-testid="inbox-button"]') } },
]

async function fakeRest(page, guest) {
  const json = (body, status = 200) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/me', guest ? (r) => r.fulfill({ status: 401, body: '' }) : json(ME))
  await page.route('**/api/login', json(ME))
  await page.route('**/api/rooms', json([]))
  await page.route('**/api/profiles?*', json([OTHER]))
  await page.route('**/api/projects?*', json(PROJECTS))
  for (const p of PROJECTS) await page.route(`**/api/projects/${p.id}`, json(p))
  await page.route(`**/api/profiles/${OTHER.id}`, json(OTHER))
  await page.route(`**/api/profiles/${ME.id}`, json(ME))
  await page.route('**/api/messages*', json([MESSAGE]))
}

/** 頁面裡的量尺：畫到 canvas 讀 RGBA、往上找緊鄰背景、列出一個表面上的按鈕與輸入框。 */
const install = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    const toRgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
    const backdrop = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) { const c = toRgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) return c }
      return toRgba(getComputedStyle(document.body).backgroundColor)
    }
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.closest('[inert]') === null }
    const label = (el) => (el.textContent || el.getAttribute('aria-label') || el.closest('label')?.textContent || '(無標籤)').trim().slice(0, 20)
    const style = (el) => {
      const cs = getComputedStyle(el)
      return {
        fill: toRgba(cs.backgroundColor), text: toRgba(cs.color), border: toRgba(cs.borderTopColor), borderWidth: parseFloat(cs.borderTopWidth), borderStyle: cs.borderTopStyle,
        outline: toRgba(cs.outlineColor), outlineWidth: parseFloat(cs.outlineWidth), outlineStyle: cs.outlineStyle, back: backdrop(el),
        duration: cs.transitionDuration, animation: cs.animationDuration, property: cs.transitionProperty, animationName: cs.animationName, opacity: parseFloat(cs.opacity),
        h: el.getBoundingClientRect().height, font: cs.fontFamily,
      }
    }
    window.__dv = {
      toRgba, style,
      controls(root) {
        const scope = document.querySelector(root)
        const els = [...scope.querySelectorAll('button, input, textarea')].filter((el) => visible(el) && el.type !== 'checkbox' && el.type !== 'radio')
        els.forEach((el, i) => el.setAttribute('data-dv', String(i)))
        return els.map((el, i) => ({ i, tag: el.tagName.toLowerCase(), label: label(el), tier: el.getAttribute('data-tier'), disabled: el.disabled === true, ...style(el) }))
      },
      focused() { const el = document.activeElement; return el && el.hasAttribute('data-dv') ? { i: Number(el.getAttribute('data-dv')), ...style(el) } : null },
    }
  })

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
const lum = ([r, g, b]) => [r, g, b].map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }).reduce((s, c, i) => s + [0.2126, 0.7152, 0.0722][i] * c, 0)
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05) }
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
const ms = (s) => s.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000))
const TC = ['Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC']

const fontRequests = []
const durations = new Set()
let referenceFill = null

/** 在一個表面上跑 S02／S10／S11／S12（reduce 那一輪只跑 S12 的歸零段）。 */
async function inspect(page, surface, reduce) {
  await install(page)
  const controls = await page.evaluate((root) => window.__dv.controls(root), surface.root)
  const who = (c) => `${surface.name}「${c.label}」`
  if (controls.length === 0) return bad(`${surface.name}：一個控制項都沒有`, '量不到 —— 先確認表面真的開了')

  const panel = await page.evaluate((root) => { const el = document.querySelector(root); return el && el.matches('[data-testid$="panel"]') ? window.__dv.style(el) : null }, surface.root)
  if (reduce) {
    // 按鈕與阻斷式面板都要歸零（審查抓到第一版只量按鈕）
    for (const c of [...controls, ...(panel === null ? [] : [{ ...panel, label: '面板' }])]) {
      if (ms(c.duration).every((d) => d === 0) && ms(c.animation).every((d) => d === 0)) continue
      bad(`[S12] reduce 下${who(c)}的動態沒歸零`, `transition ${c.duration}、animation ${c.animation}`)
    }
    return ok(`[S12] reduce 下 ${surface.name} 的 ${controls.length} 個控制項${panel === null ? '' : '與面板'}動態都是 0s`)
  }

  // S02：這個表面上找得到的樣本都要跟 body 相同、含繁中家族；五種樣本（body、面板標題、卡片標題、按鈕、輸入框）齊全的那一頁（看板清單：聊天框有輸入框）
  // 另外**逐一斷言存在** —— 找不到的樣本被過濾掉的話，只剩 body 也會綠（審查抓到）
  const fonts = await page.evaluate((root) => {
    const f = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily : null }
    return { body: f('body'), title: f(`${root} h2, ${root} h1`), card: f('[data-testid="project-card-title"]'), button: f(`${root} button`), input: f(`${root} input, ${root} textarea, textarea`) }
  }, surface.root)
  const seen = Object.entries(fonts).filter(([, v]) => v !== null)
  if (seen.every(([, v]) => v === fonts.body) && TC.some((n) => fonts.body.includes(n))) ok(`[S02] ${surface.name}：${seen.length} 處 font-family 相同且含繁中家族`)
  else bad(`[S02] ${surface.name}：font-family 不一致或沒有繁中家族`, JSON.stringify(fonts))
  if (surface.name === '看板清單') {
    const missing = Object.entries(fonts).filter(([, v]) => v === null).map(([k]) => k)
    missing.length === 0 ? ok('[S02] 看板清單：五種樣本都找到了') : bad('[S02] 看板清單：五種樣本沒找齊', `少了 ${missing.join('、')}`)
  }

  // S10 第一段：三級可區分
  const ref = controls.find((c) => c.tier === 'primary' && !c.disabled)?.fill ?? referenceFill
  for (const c of controls.filter((x) => x.tier && x.tag === 'button')) {
    if (c.tier === 'primary') {
      const r = contrast(over(c.fill, c.back), c.back)
      r >= 3 ? ok(`[S10] ${who(c)}主要：填色 ${r.toFixed(2)}:1`) : bad(`[S10] ${who(c)}主要級填色只有 ${r.toFixed(2)}:1`, '下限 3')
    } else if (c.tier === 'secondary') {
      const r = c.borderWidth > 0 && c.borderStyle !== 'none' ? contrast(over(c.border, c.back), c.back) : 0
      const noFill = c.fill[3] === 0 || same(c.fill, c.back)
      r >= 3 && noFill ? ok(`[S10] ${who(c)}次要：邊界 ${r.toFixed(2)}:1、沒有填色`) : bad(`[S10] ${who(c)}次要級不對`, `邊界 ${r.toFixed(2)}:1、填色 ${JSON.stringify(c.fill)}`)
    } else if (c.tier === 'tertiary') {
      const noBorder = c.borderWidth === 0 || c.borderStyle === 'none' || c.border[3] === 0
      const noFill = c.fill[3] === 0 || same(c.fill, c.back)
      const textOk = ref !== null && same(c.text, ref)
      noBorder && noFill && textOk ? ok(`[S10] ${who(c)}文字級：無邊界無填色、文字色等於主要級填色`) : bad(`[S10] ${who(c)}文字級不對`, `邊界 ${noBorder}、填色 ${noFill}、文字 ${JSON.stringify(c.text)} vs 主要 ${JSON.stringify(ref)}`)
    }
  }

  // S11：高度
  for (const c of controls) c.h >= 40 ? ok(`[S11] ${who(c)}高 ${c.h.toFixed(1)}px`) : bad(`[S11] ${who(c)}只有 ${c.h.toFixed(1)}px 高`, '下限 40px')

  // S12：每一個按鈕的時長在 [120, 300] 且全部相等（跨表面收集）
  for (const c of controls.filter((x) => x.tag === 'button')) {
    const ds = ms(c.duration)
    if (ds.length === 0 || ds.every((d) => d === 0)) { bad(`[S12] ${who(c)}沒有過渡`, `transition-duration ${c.duration}`); continue }
    ds.forEach((d) => durations.add(d))
    ds.every((d) => d >= 120 && d <= 300) ? ok(`[S12] ${who(c)}過渡 ${c.duration}`) : bad(`[S12] ${who(c)}過渡 ${c.duration} 不在 [120ms, 300ms]`)
  }
  if (panel !== null) {
    const bad12 = panel.property === 'all' || /width|height/.test(panel.property) || (panel.animationName !== 'none' && panel.animationName !== '')
    bad12 ? bad(`[S12] ${surface.name} 的面板動了寬高或用了 all`, `transition-property ${panel.property}、animation ${panel.animationName}`) : ok(`[S12] ${surface.name} 的面板 transition-property=${panel.property}`)
    const pd = ms(panel.duration).filter((d) => d > 0)
    pd.forEach((d) => durations.add(d))
  }

  // S10 第三段：hover 之後背景或邊界跟靜止時不同（只量啟用中的按鈕）
  for (const c of controls.filter((x) => x.tag === 'button' && !x.disabled)) {
    await page.hover(`[data-dv="${c.i}"]`)
    await page.waitForTimeout(350)
    const after = await page.evaluate((i) => window.__dv.style(document.querySelector(`[data-dv="${i}"]`)), c.i)
    !same(after.fill, c.fill) || !same(after.border, c.border) ? ok(`[S10] ${who(c)}hover 有變`) : bad(`[S10] ${who(c)}hover 之後長得一樣`, `填色 ${JSON.stringify(c.fill)}、邊界 ${JSON.stringify(c.border)}`)
  }
  await page.mouse.move(0, 0)

  // S10 第二段：用鍵盤把焦點移到每一個（可聚焦的）控制項，量焦點環
  const focusable = controls.filter((c) => !c.disabled)
  const reached = new Map()
  await page.mouse.click(2, 2)
  for (let i = 0; i < focusable.length * 2 + 4 && reached.size < focusable.length; i += 1) {
    await page.keyboard.press('Tab')
    const f = await page.evaluate(() => window.__dv.focused())
    if (f !== null && !reached.has(f.i)) reached.set(f.i, f)
  }
  for (const c of focusable) {
    const f = reached.get(c.i)
    if (f === undefined) { bad(`[S10] Tab 走不到${who(c)}`, '焦點環量不到'); continue }
    const r = f.outlineStyle !== 'none' && f.outlineWidth >= 2 ? contrast(over(f.outline, f.back), f.back) : 0
    r >= 3 ? ok(`[S10] ${who(c)}焦點環 ${f.outlineWidth}px、${r.toFixed(2)}:1`) : bad(`[S10] ${who(c)}焦點環不夠`, `${f.outlineStyle} ${f.outlineWidth}px、${r.toFixed(2)}:1（下限 2px、3:1）`)
  }
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const reduce of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduce ? 'reduce' : 'no-preference' })
    guardLoopback(context)
    if (!reduce) {
      // 文字級的跨表面基準：/login 暱稱表單的主要按鈕，**填好名字讓它啟用**、滑鼠移開、不聚焦（規格：靜止、啟用）
      const page = await context.newPage()
      await fakeRest(page, true)
      await page.goto(`${FRONTEND}/login`)
      await page.fill('form[aria-labelledby="nickname-heading"] input', '基準')
      await page.mouse.click(2, 2)
      await install(page)
      const c = (await page.evaluate(() => window.__dv.controls('form[aria-labelledby="nickname-heading"]'))).find((x) => x.tier === 'primary')
      if (c && !c.disabled) { referenceFill = c.fill; ok(`基準：/login「${c.label}」啟用中的填色 ${JSON.stringify(c.fill)}`) } else bad('基準：/login 暱稱表單的主要按鈕填了名字仍不是啟用的', JSON.stringify(c))
      await page.close()
    }
    context.on('request', (r) => { if (/\.(woff2?|ttf|otf)(\?|$)/.test(new URL(r.url()).pathname)) fontRequests.push(r.url()) })
    for (const surface of SURFACES) {
      const page = await context.newPage()
      await fakeRest(page, surface.guest === true)
      try {
        await surface.open(page)
        await inspect(page, surface, reduce)
        if (!reduce) await page.screenshot({ path: path.join(OUT, `${surface.name.replace('/', '')}.png`) })
      } catch (e) {
        bad(`${surface.name}${reduce ? '（reduce）' : ''}：走不到或量不到`, e.message)
        await page.screenshot({ path: path.join(OUT, `lost-${surface.name.replace('/', '')}.png`) }).catch(() => {})
      }
      await page.close()
    }
    await context.close()
  }
  fontRequests.length === 0 ? ok('[S02] 整趟沒有任何字型請求') : bad('[S02] 有字型請求', fontRequests.join('\n   '))
  durations.size === 1 ? ok(`[S12] 所有過渡時長相等：${[...durations][0]}ms`) : bad('[S12] 過渡時長不只一種', [...durations].join(', '))
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
