// `FE-X16` 標題列的真瀏覽器判準（`S19`）：訪客、已登入在大廳、已登入在房間三次量到的標題列 rect 相同；
// 第一個元素是品牌、其餘互動控制全在品牌右側且 `≤ 5`；開任一阻斷式面板（看板、收件匣、名片）時面板 rect 與**整個標題列** rect 的交集是 0。
// 房間走深連結 `/world?room=<id>`（票放 sessionStorage，`room-entry.mjs` 同一招）；REST 與 WS 全部偽造、只打本機自己起的 `next start`（`lib/world.mjs` 的 loopback 守衛）。
//
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/dom-surfaces.mjs     （要 `NEXT_PUBLIC_REALTIME_ADAPTER=guildhub` 的 build：房間要有一條假的 WS 才會 ready）

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, fakeRealtime, guardLoopback, ok, profile, uuid, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-x16'
assertLoopback(FRONTEND)

const ME = profile(1, '我自己')
const OTHER = profile(2, '對方')
const ROOM = uuid(41)
const ROOMS = [{ project_id: ROOM, title: '星際導航', online_count: 3 }]
const PROJECT = { id: uuid(11), owner_id: OTHER.id, title: '案件甲', body: '內容', needed_skills: [], status: 'recruiting', room_template: null, seat_count: 4, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), updated_at: '2026-09-09T00:00:00Z' }
const MESSAGE = { id: uuid(31), sender_id: OTHER.id, recipient_id: ME.id, body: '嗨', created_at: '2026-09-12T10:00:00.000000Z', read_at: null }
const HEADER = '[data-testid="app-header"]'

async function fakeRest(page, guest) {
  const json = (body, status = 200) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/me', guest ? (r) => r.fulfill({ status: 401, body: '' }) : json(ME))
  await page.route('**/api/rooms', json(ROOMS))
  await page.route('**/api/profiles?*', json([OTHER]))
  await page.route('**/api/projects?*', json([PROJECT]))
  await page.route(`**/api/projects/${PROJECT.id}`, json(PROJECT))
  await page.route(`**/api/profiles/${OTHER.id}`, json(OTHER))
  await page.route('**/api/messages*', json([MESSAGE]))
}

const rect = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
const sameRect = (a, b) => ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) < 0.5)
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
const fmt = (r) => `${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`

/** 標題列的結構：第一個元素、可見的互動控制（文字、是不是在品牌右側）。 */
const anatomy = (page) =>
  page.$eval(HEADER, (header) => {
    const first = header.firstElementChild
    const brand = first?.getBoundingClientRect()
    const controls = [...header.querySelectorAll('button, a, input, select, textarea')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      .map((el) => ({ label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 12), rightOfBrand: el.getBoundingClientRect().left >= brand.right }))
    return { firstTag: first?.tagName.toLowerCase(), firstText: first?.textContent?.trim(), controls }
  })

const PANELS = [
  { name: '看板', query: '?panel=projects', selector: '[data-testid="list-panel"]', ready: '[data-testid="project-card"]' },
  { name: '收件匣', selector: '[data-testid="inbox-panel"]', ready: '[data-testid="inbox-thread-item"]', open: (page) => page.click('[data-testid="inbox-button"]') },
  { name: '名片', selector: '[data-testid="profile-panel"]', ready: '[data-testid="talent-facts"]', open: (page) => page.click('[data-testid="identity"] button') },
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const rects = []
  for (const who of [
    { name: '訪客', guest: true },
    { name: '已登入在大廳', guest: false },
    { name: '已登入在房間', guest: false, room: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    const sockets = []
    await fakeRealtime(context, sockets)
    if (who.room) await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [`guildhub.roomToken.${ME.id}.${ROOM}`, 'e2e-ticket-X16'])
    const page = await context.newPage()
    await fakeRest(page, who.guest)
    try {
      await page.goto(`${FRONTEND}/world${who.room ? `?room=${ROOM}` : ''}`)
      await waitForWorld(page)
      if (who.room) await page.waitForSelector('button[aria-label="回到 Guild Hall"]', { timeout: 10_000 })
      if (!who.guest) await page.waitForSelector('[data-testid="inbox-button"]')
      const r = await rect(page, HEADER)
      rects.push({ who: who.name, r })
      const a = await anatomy(page)
      a.firstTag === 'h1' && a.firstText === 'GuildHub' ? ok(`[S19] ${who.name}：第一個元素是品牌「${a.firstText}」`) : bad(`[S19] ${who.name}：第一個元素是 ${a.firstTag}「${a.firstText}」`)
      const wrong = a.controls.filter((c) => !c.rightOfBrand)
      wrong.length === 0 ? ok(`[S19] ${who.name}：${a.controls.length} 個互動控制全部在品牌右側（${a.controls.map((c) => c.label).join('、')}）`) : bad(`[S19] ${who.name}：有控制不在品牌右側`, wrong.map((c) => c.label).join('、'))
      a.controls.length >= 1 && a.controls.length <= 5 ? ok(`[S19] ${who.name}：互動控制 ${a.controls.length} 個 ≤ 5`) : bad(`[S19] ${who.name}：互動控制 ${a.controls.length} 個`, '上限 5、至少 1')
      await page.screenshot({ path: path.join(OUT, `header-${who.name}.png`) })
      // 面板與整個標題列不相交（只在大廳的已登入身分開三個面板；房間只驗一個 —— 面板掛在世界區裡，房間與大廳是同一個容器）
      for (const p of who.guest ? [] : who.room ? PANELS.slice(0, 1) : PANELS) {
        if (p.query) { await page.goto(`${FRONTEND}/world${p.query}`); await waitForWorld(page) } else await p.open(page)
        await page.waitForSelector(p.ready)
        const [h, panel] = [await rect(page, HEADER), await rect(page, p.selector)]
        const area = overlap(h, panel)
        area === 0 ? ok(`[S19] ${who.name}：${p.name}面板（${fmt(panel)}）與整個標題列（${fmt(h)}）交集 0`) : bad(`[S19] ${who.name}：${p.name}面板蓋到標題列`, `交集 ${area.toFixed(0)}px²`)
        sameRect(h, r) ? ok(`[S19] ${who.name}：開${p.name}後標題列 rect 沒動`) : bad(`[S19] ${who.name}：開${p.name}後標題列 rect 變了`, `${fmt(r)} → ${fmt(h)}`)
        if (!p.query) await page.keyboard.press('Escape')
      }
    } catch (e) {
      bad(`[S19] ${who.name}：走不到或量不到`, e.message)
      await page.screenshot({ path: path.join(OUT, `lost-header-${who.name}.png`) }).catch(() => {})
    }
    await context.close()
  }
  if (rects.length === 3 && rects.every(({ r }) => sameRect(r, rects[0].r))) ok(`[S19] 三種身分的標題列 rect 相同：${fmt(rects[0].r)}`)
  else bad('[S19] 三種身分的標題列 rect 不同', rects.map(({ who, r }) => `${who} ${fmt(r)}`).join('；'))
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
