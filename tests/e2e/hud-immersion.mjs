// `FE-X17` 世界 HUD 臨場感的真瀏覽器判準（§6；`S03`／`S04`／`S05`）。
//
// ⚠️⚠️ **這一支只能在真瀏覽器跑，而且 CI 不會自動跑**（同 `control-contrast.mjs`／`dom-visual.mjs`）。
// jsdom 不載入 CSS，`getComputedStyle` 對 `oklch()` 原樣回字串 —— 顏色一律畫到 canvas 再讀（`control-contrast.mjs` 的 M1）。
//
// HUD 蓋在 WebGL canvas 上，DOM 這邊取不到它後面那格 3D 的實際像素。**所以對比用「世界最亮的顏色」當背景量**：
// 把玻璃底色（半透明）合成到 `world.ts` 最亮的色（`glow` #ffe9b0 燈光高光，比任何牆／看板大面都亮）上，再算白字對它的對比 ——
// 過了，就對更暗的 3D 背景都過（背景愈暗，淺字對比只會愈高）。這比抽一張 3D frame 更穩、不 flaky，也回應了「小面積 glow 是不是漏掉的最壞情況」：
// 直接拿 glow 當背景，就把那個最壞情況也涵蓋了。不用純白 —— 像素世界沒有純白，會過嚴到不可能。
//
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/hud-immersion.mjs
//   （build 要 NEXT_PUBLIC_APP_ENV=local、REALTIME_ADAPTER=guildhub；REST/WS 全 route 偽造，只打本機 next start）

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, fakeRealtime, fakeRest, guardLoopback, ok, profile, uuid, waitForWorld, walker } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-x17'
/** 視窗（`§6.2` 要 1440×900 桌機與手機寬各截一次）。截圖檔名帶寬度，兩次不互蓋。 */
const VW = Number(process.env.VW ?? 1440)
const VH = Number(process.env.VH ?? 900)
assertLoopback(FRONTEND)

/** `S04` 的文字對比門檻（WCAG 2.1 SC 1.4.3 一般文字）。寫在規格裡，改它要先改 `openspec/specs/dom-visual-system/spec.md`。 */
const MIN_TEXT = 4.5
const ME = profile(1, '我自己')
const ROOMS = [{ project_id: uuid(41), title: '星際導航', online_count: 3 }, { project_id: uuid(42), title: '深海探勘', online_count: 1 }]
const ROOM = ROOMS[0].project_id
const { approachDoor } = walker({ room: ROOM, decoy: ROOMS[1].project_id, title: ROOMS[0].title, out: OUT })

// ── WCAG（Node 端；顏色已在頁面裡畫成 rgba）────────────────────────
// 最壞背景＝世界裡**最亮的顏色**（`src/design/world.ts` 的 `glow` #ffe9b0 燈光高光；比牆 #e7d3a4、看板 #e6dcc8 等大面都亮）。
// 連這個最亮色下都 ≥4.5，就對整個世界都成立。不用純白 —— 像素世界沒有純白，用它會過嚴、把「對深玻璃 ≥4.5」量成不可能。
const WORLD_BRIGHT = [0xff, 0xe9, 0xb0]
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) }
const luminance = ([r, g, b]) => [r, g, b].map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }).reduce((s, c, i) => s + [0.2126, 0.7152, 0.0722][i] * c, 0)
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05) }

/** 量一個 HUD 文字節點：它的字色、它視覺上坐落的玻璃底（往上找第一個有畫底色的祖先）、那層玻璃有沒有 backdrop-filter、位置。 */
const read = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el === null) return null
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const ctx = cv.getContext('2d')
    const toRgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
    // 視覺底：自己或往上第一個 alpha>0 的底色（就是那層玻璃）。同時記那一層的 backdrop-filter。
    let bg = null; let backdrop = ''
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      const c = toRgba(cs.backgroundColor)
      if (c[3] > 0) { bg = c; backdrop = cs.backdropFilter || cs.webkitBackdropFilter || ''; break }
    }
    const r = el.getBoundingClientRect()
    return { color: toRgba(getComputedStyle(el).color), bg, backdrop, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, hasKbd: el.querySelector('kbd.keycap') !== null, vw: innerWidth, vh: innerHeight }
  }, sel)

/** `S03`：玻璃底半透明（alpha 在 (0,1)）＋有 backdrop-filter blur。`S04`：白字對「玻璃合成到世界最亮面」≥ 4.5:1。 */
async function checkGlass(page, sel, label, { wantKbd = false, wantBottomCenter = false } = {}) {
  const m = await read(page, sel)
  if (m === null) { bad(`${label}：找不到 ${sel}`, '量不到的東西也看不到'); return }
  if (m.bg === null) { bad(`${label}：沒有玻璃底`, '往上找不到任何有畫底色的祖先'); return }
  // S03
  if (m.bg[3] > 0 && m.bg[3] < 1) ok(`[S03] ${label}：玻璃底半透明 alpha=${m.bg[3].toFixed(2)}（世界透得出來）`)
  else bad(`[S03] ${label}：玻璃底不是半透明`, `alpha=${m.bg[3].toFixed(2)}（要在 0 與 1 之間）`)
  const hasBlur = m.backdrop.includes('blur')
  hasBlur ? ok(`[S03] ${label}：有 backdrop-filter（${m.backdrop.slice(0, 24)}）`) : bad(`[S03] ${label}：沒有 backdrop-filter blur`, `是「${m.backdrop || '（空）'}」`)
  // S04：最壞背景＝玻璃合成到世界最亮大面
  const worst = over(m.bg, WORLD_BRIGHT)
  const ratio = contrast(m.color, worst)
  ratio >= MIN_TEXT ? ok(`[S04] ${label}：白字對「玻璃壓在世界最亮面上」${ratio.toFixed(2)}:1（下限 ${MIN_TEXT}；真實 3D 背景更暗、只會更高）`) : bad(`[S04] ${label}：文字對比只有 ${ratio.toFixed(2)}:1`, `低於下限 ${MIN_TEXT}（世界最亮面下）`)
  // S05 附加：鍵帽、下半部置中
  if (wantKbd) (m.hasKbd ? ok(`[S05] ${label}：有獨立鍵帽 kbd.keycap`) : bad(`[S05] ${label}：沒有 kbd.keycap`, '「按 E」的 E 要看得出是一顆鍵'))
  if (wantBottomCenter) {
    const cx = m.rect.x + m.rect.w / 2
    const centered = Math.abs(cx - m.vw / 2) <= 4
    const bottom = m.rect.y >= m.vh / 2
    centered && bottom ? ok(`[S05] ${label}：在畫面下半部正中央（中心 x=${cx.toFixed(0)}／${m.vw}，y=${m.rect.y.toFixed(0)}）`) : bad(`[S05] ${label}：不在下半部正中央`, `中心 x=${cx.toFixed(0)}（畫面中線 ${(m.vw / 2).toFixed(0)}）、y=${m.rect.y.toFixed(0)}（半高 ${(m.vh / 2).toFixed(0)}）`)
  }
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  // ── 大廳：常駐 HUD（線上數、狀態）＋開狀態編輯器量 muted 文字 ──
  {
    const context = await browser.newContext({ viewport: { width: VW, height: VH } })
    guardLoopback(context)
    await fakeRealtime(context, [])
    const page = await context.newPage()
    await fakeRest(page, { current: ME }, ROOMS)
    await page.goto(`${FRONTEND}/world`)
    await waitForWorld(page)
    await page.waitForSelector('[data-testid="status-hud"]')
    await checkGlass(page, '[data-testid="online-count"]', '線上數')
    await checkGlass(page, '[data-testid="status-hud"] button', '狀態膠囊')
    await page.click('[data-testid="status-hud"] button')
    await page.waitForSelector('[data-testid="status-remaining"]')
    await checkGlass(page, '[data-testid="status-remaining"]', '狀態剩餘字數(muted)')
    await page.screenshot({ path: path.join(OUT, `hud-hall-${VW}.png`) })
    await context.close()
  }
  // ── 大廳：走到門前，量情境提示膠囊（S05）──
  // walker 用門標籤當量尺，需要走廊在畫面內 —— 只在桌機寬跑（S05 的判準在 1440 驗；手機寬只補常駐 HUD 截圖）。
  if (VW >= 900) {
    const context = await browser.newContext({ viewport: { width: VW, height: VH } })
    guardLoopback(context)
    await fakeRealtime(context, [])
    const page = await context.newPage()
    await fakeRest(page, { current: ME }, ROOMS)
    await page.goto(`${FRONTEND}/world`)
    await waitForWorld(page)
    await approachDoor(page)
    await checkGlass(page, '[data-testid="interaction-prompt"]', '門前提示', { wantKbd: true, wantBottomCenter: true })
    await page.screenshot({ path: path.join(OUT, `hud-prompt-${VW}.png`) })
    await context.close()
  }
  // ── 房間：場景聊天（S03/S04；muted 用剩餘字數）──
  {
    const context = await browser.newContext({ viewport: { width: VW, height: VH } })
    guardLoopback(context)
    await fakeRealtime(context, [])
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [`guildhub.roomToken.${ME.id}.${ROOM}`, 'e2e-ticket-x17'])
    const page = await context.newPage()
    await fakeRest(page, { current: ME }, ROOMS)
    await page.goto(`${FRONTEND}/world?room=${ROOM}`)
    await waitForWorld(page)
    await page.waitForSelector('[data-testid="scene-chat"]')
    await checkGlass(page, '[data-testid="scene-chat"]', '場景聊天')
    await checkGlass(page, '[data-testid="chat-remaining"]', '聊天剩餘字數(muted)')
    await page.screenshot({ path: path.join(OUT, `hud-room-${VW}.png`) })
    await context.close()
  }
} catch (e) {
  bad('腳本中途爆掉', e.stack ?? e.message)
} finally {
  await browser.close()
  console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 條紅`)
  process.exit(failureCount() === 0 ? 0 : 1)
}
