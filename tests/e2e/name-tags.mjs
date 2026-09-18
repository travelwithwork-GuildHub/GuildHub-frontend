// 名字牌的真瀏覽器判準。規格 `openspec/specs/name-tag/spec.md`：`FE-W08-S01`／`S03`／`S04`／`S05`／`S07`～`S10`。
//
// 即時後端偽造（`fakeRealtime`，`others()` 給名單、之後從伺服器那頭主動送 `pos`／`presence`）、REST 偽造；只打本機的 `next start`。
// 要 `NEXT_PUBLIC_REALTIME_ADAPTER=guildhub` 的 build（跟 `scene-chat.mjs` 同一份）。
//
//   NEXT_PUBLIC_REALTIME_ADAPTER=guildhub … pnpm run build && pnpm exec next start -p 3101
//   FRONTEND=http://127.0.0.1:3101 node tests/e2e/name-tags.mjs
//
// ⚠️ 像素期望值是**手算的常數**：正交相機的 viewHeight 固定，畫布高 720 px 時 1 世界單位 = 60 px（x）、42.43 px（z → 螢幕 y）；
// 畫布實際高度（1280×720 的視窗扣掉標題列，約 646）按比例縮 —— 讀的是畫布的 rect，不呼叫產品的投影函式。
// ⚠️ 「同一幀、同一份投影」的尺是**門標籤**：它由同一份 `screenPixelFor` 投影、每幀寫 DOM。相機動的時候名字牌與門標籤的差要每幀不變。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { HALL_SPAWN, assertLoopback, bad, countOverlays, expectUrl, failureCount, fakeRealtime, fakeRest, guardLoopback, ok, overlaysSeen, profile, uuid, waitForTransition, waitForWorld, walker } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-w08'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const P = profile(41, '人才戊')
const ROOM = uuid(1)
const ROOMS = [
  { project_id: ROOM, title: '星際導航', online_count: 3 },
  { project_id: uuid(2), title: '深海探勘', online_count: 1 },
]
const TOKEN = 'e2e-ticket-W08'
const tokenKey = (profileId) => `guildhub.roomToken.${profileId}.${ROOM}`
const PX = 32 // 協定的像素／世界單位（`coords.ts`）
/** 畫布高 720 px 時每世界單位的像素（手算：x 60、z 42.43）；實際畫布高度按比例。 */
const perUnit = (canvasHeight) => ({ x: (60 * canvasHeight) / 720, z: (42.43 * canvasHeight) / 720 })
const canvasHeight = (page) => page.$eval('[data-testid="world-canvas-container"]', (el) => el.getBoundingClientRect().height)
const TAG_WIDTH = 176
/** 世界座標（相對出生點）→ 協定的 player。 */
const at = (id, name, dx, dz) => ({ id, name, av: 0, x: Math.round((HALL_SPAWN.x + dx) * PX), y: Math.round((HALL_SPAWN.z + dz) * PX), f: 0, st: '' })
const LONG = '這個名字剛好有二十個全形字用來測截字省略'
if ([...LONG].length !== 20) throw new Error(`LONG 不是 20 個字：${[...LONG].length}`)

const TAGS = '[data-testid="name-tag"]'
const tagsText = (page) => page.$$eval(TAGS, (t) => t.map((x) => x.textContent))
/** 牌子的 transform 位置與矩形，**都相對名字牌容器**（容器在標題列底下；transform 是容器座標、rect 是視窗座標）。 */
const tagOf = (page, name) =>
  page.evaluate((n) => {
    const el = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === n)
    if (!el) return null
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0(?:px)?\)/.exec(el.style.transform)
    const r = el.getBoundingClientRect()
    const c = document.querySelector('[data-testid="name-tags"]').getBoundingClientRect()
    return { x: m ? Number(m[1]) : NaN, y: m ? Number(m[2]) : NaN, visibility: getComputedStyle(el).visibility, rect: { x: r.x - c.x, y: r.y - c.y, width: r.width, height: r.height }, canvasWidth: c.width }
  }, name)
const waitTags = (page, n) => page.waitForFunction((k) => document.querySelectorAll('[data-testid="name-tag"]').length === k, n, { timeout: 8_000 }).then(() => true).catch(() => false)
const waitVisibility = (page, name, want) =>
  page.waitForFunction(([n, w]) => {
    const el = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === n)
    return el !== undefined && getComputedStyle(el).visibility === w
  }, [name, want], { timeout: 5_000 }).then(() => true).catch(() => false)
const send = (sockets, msg) => sockets.at(-1).ws.send(JSON.stringify(msg))
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(others, { url = '/world', room = false, token = room } = {}) {
  const sockets = []
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  guardLoopback(context)
  if (token) await context.addInitScript(([key, value]) => sessionStorage.setItem(key, value), [tokenKey(P.id), TOKEN])
  await countOverlays(context)
  await fakeRealtime(context, sockets, { others })
  const page = await context.newPage()
  await fakeRest(page, { current: P }, ROOMS)
  const response = await page.goto(`${FRONTEND}${url}`).catch(() => null)
  if (response === null) throw new Error(`連不到 ${FRONTEND} —— server 起了嗎？（next start）`)
  if (room) await waitForTransition(page, '直達房間', 0, 'S10')
  await waitForWorld(page)
  return { page, sockets, context }
}

try {
  // ── A：S01、S04、S05（兩個人、有門標籤當尺） ──
  {
    const { page, sockets, context } = await open(() => [at('u-yu', '小玉', 1, 0), at('u-ada', 'Ada Lovelace', 3, 1)])
    if (await waitTags(page, 2)) ok('[S01] 名單上兩個人，畫面上兩塊牌子')
    else bad('[S01] 牌子數不是 2', String((await tagsText(page)).length))
    const texts = await tagsText(page)
    if (texts.includes('小玉') && texts.includes('Ada Lovelace') && !texts.includes(P.display_name)) ok(`[S01] 文字是協定的 name（${texts.join('、')}），沒有自己的`)
    else bad('[S01] 文字不對', JSON.stringify(texts))
    await page.screenshot({ path: path.join(OUT, 'hall-two.png') })

    // S04：兩個人的位置差 (2, 1) 世界單位 → 螢幕 (2·60, 42.43)·(畫布高/720) px
    const unit = perUnit(await canvasHeight(page))
    const yu = await tagOf(page, '小玉')
    const ada = await tagOf(page, 'Ada Lovelace')
    const dx = ada.x - yu.x
    const dy = ada.y - yu.y
    if (near(dx, 2 * unit.x) && near(dy, 1 * unit.z)) ok(`[S04] 位置差等於投影差（${dx.toFixed(1)}, ${dy.toFixed(1)}；畫布高 ${(unit.x / 60 * 720).toFixed(0)}）`)
    else bad('[S04] 位置差不等於投影差', `量到 (${dx}, ${dy})，手算 (${2 * unit.x}, ${unit.z})`)
    // 牌子的底邊中點對齊錨點：rect 的 bottom-center 要等於 transform 的點（±1）
    if (near(yu.rect.x + yu.rect.width / 2, yu.x) && near(yu.rect.y + yu.rect.height, yu.y)) ok('[S04] 牌子的底邊中點對齊錨點')
    else bad('[S04] 牌子沒有以底邊中點對齊錨點', JSON.stringify(yu))

    // 門標籤是 S05 的尺：從出生點看不到走廊，先用 walker 的校準走到兩扇門的標籤都看得見
    const { odometer } = walker({ room: ROOM, decoy: uuid(2), title: '星際導航', out: OUT })
    await odometer(page)
    // S05（相機動）：按住 W，連續 12 幀同時抓名字牌與門標籤的 transform —— 每幀都變、兩者的差每幀不變（同一幀、同一份投影）
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(150)
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const parse = (el) => { const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0(?:px)?\)/.exec(el?.style.transform ?? ''); return m ? [Number(m[1]), Number(m[2])] : null }
          const tag = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === 'Ada Lovelace')
          const door = document.querySelector('[data-testid="door-label"]')
          const out = []
          const step = () => {
            out.push({ tag: parse(tag), door: parse(door) })
            if (out.length < 12) requestAnimationFrame(step)
            else resolve(out)
          }
          requestAnimationFrame(step)
        }),
    )
    await page.keyboard.up('KeyW')
    const tagKeys = new Set(frames.map((f) => JSON.stringify(f.tag)))
    const diffs = frames.map((f) => (f.tag && f.door ? [f.tag[0] - f.door[0], f.tag[1] - f.door[1]] : null))
    const steady = diffs.every((d) => d !== null && near(d[0], diffs[0][0]) && near(d[1], diffs[0][1]))
    if (tagKeys.size >= 10) ok(`[S05] 相機動時牌子每幀跟著走（12 幀裡 ${tagKeys.size} 個不同的 transform）`)
    else bad('[S05] 牌子沒有每幀跟著相機', `12 幀只有 ${tagKeys.size} 個不同的 transform`)
    if (steady) ok('[S05] 名字牌與門標籤的差每幀不變（同一幀、同一份投影，差 ' + diffs[0].map((v) => v.toFixed(1)).join(', ') + '）')
    else bad('[S05] 名字牌與門標籤不同步（落後一幀或投影不同）', JSON.stringify(diffs))

    // S05（角色動）：伺服器送 Ada 往 +x 走 1 單位的 pos；牌子相對門標籤往右 60 px、門標籤不動
    await page.waitForTimeout(400)
    const before = await page.evaluate(() => {
      const parse = (el) => { const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0(?:px)?\)/.exec(el?.style.transform ?? ''); return m ? [Number(m[1]), Number(m[2])] : null }
      return { tag: parse([...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === 'Ada Lovelace')), door: parse(document.querySelector('[data-testid="door-label"]')) }
    })
    const adaPlayer = at('u-ada', 'Ada Lovelace', 4, 1)
    for (let i = 1; i <= 10; i += 1) {
      const x = Math.round((HALL_SPAWN.x + 3 + i / 10) * PX)
      send(sockets, { t: 'pos', p: [['u-ada', x, adaPlayer.y, 0]] })
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(600) // render delay 250 ms ＋ 收斂
    const after = await page.evaluate(() => {
      const parse = (el) => { const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0(?:px)?\)/.exec(el?.style.transform ?? ''); return m ? [Number(m[1]), Number(m[2])] : null }
      return { tag: parse([...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === 'Ada Lovelace')), door: parse(document.querySelector('[data-testid="door-label"]')) }
    })
    const rel = [after.tag[0] - after.door[0] - (before.tag[0] - before.door[0]), after.tag[1] - after.door[1] - (before.tag[1] - before.door[1])]
    if (near(rel[0], unit.x, 2) && near(rel[1], 0, 2)) ok(`[S05] 角色走了 1 單位，牌子相對門標籤移了 (${rel[0].toFixed(1)}, ${rel[1].toFixed(1)}) px`)
    else bad('[S05] 角色移動後牌子沒有跟著', `相對位移 ${JSON.stringify(rel)}，手算 (${unit.x}, 0)`)
    await context.close()
  }

  // ── B：S08、S09（一個人；角色不動，相機停在出生點） ──
  {
    // 畫布約 53.8 px／單位：+11.5 → 錨點 x≈1259（畫面內），牌子右緣 ≈1347（越界）；+13 → ≈1340（錨點出畫面）
    const { page, sockets, context } = await open(() => [at('u-yu', '小玉', 11.5, 0)])
    if (!(await waitTags(page, 1))) bad('[S08] 牌子沒出現')
    await page.waitForTimeout(800) // 相機收斂
    const edge = await tagOf(page, '小玉')
    const overflows = edge.x + TAG_WIDTH / 2 > edge.canvasWidth
    if (edge.x < edge.canvasWidth && overflows && edge.visibility === 'visible') ok(`[S08] 錨點在畫面內（x=${edge.x.toFixed(0)}）、牌子矩形越出右緣 → 仍然呈現`)
    else bad('[S08] 錨點在畫面內、矩形越界時牌子不該消失', JSON.stringify(edge))
    // 越界的部分要被容器裁掉（規格「由容器裁掉越界的部分」）：容器 overflow 不是 visible，而且牌子在視窗裡看得見的寬度確實比 176 窄
    const clip = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="name-tags"]')
      const el = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === '小玉')
      const cs = getComputedStyle(c)
      const cr = c.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const visibleWidth = Math.max(0, Math.min(r.right, cr.right) - Math.max(r.left, cr.left))
      return { overflowX: cs.overflowX, overflowY: cs.overflowY, visibleWidth, width: r.width, beyond: r.right - cr.right }
    })
    if (clip.overflowX !== 'visible' && clip.overflowY !== 'visible' && clip.beyond > 0 && clip.visibleWidth < clip.width) ok(`[S08] 越界的 ${clip.beyond.toFixed(0)} px 由容器裁掉（overflow ${clip.overflowX}／${clip.overflowY}）`)
    else bad('[S08] 容器沒有裁掉越界的部分', JSON.stringify(clip))
    await page.screenshot({ path: path.join(OUT, 'edge.png') })
    send(sockets, { t: 'pos', p: [['u-yu', Math.round((HALL_SPAWN.x + 13) * PX), Math.round(HALL_SPAWN.z * PX), 0]] })
    if (await waitVisibility(page, '小玉', 'hidden')) ok('[S08] 錨點出畫面 → hidden')
    else bad('[S08] 錨點出畫面牌子還在', JSON.stringify(await tagOf(page, '小玉')))
    const aria = await page.locator('[data-testid="name-tags"]').ariaSnapshot()
    if (!aria.includes('小玉')) ok('[S08] hidden 時不在無障礙樹裡')
    else bad('[S08] hidden 了還在無障礙樹裡', aria)
    send(sockets, { t: 'pos', p: [['u-yu', Math.round((HALL_SPAWN.x + 1) * PX), Math.round(HALL_SPAWN.z * PX), 0]] })
    if (await waitVisibility(page, '小玉', 'visible')) ok('[S08] 走回來 → visible')
    else bad('[S08] 走回來牌子沒出現')
    const ariaBack = await page.locator('[data-testid="name-tags"]').ariaSnapshot()
    if (ariaBack.includes('小玉')) ok('[S08] visible 時在無障礙樹裡')
    else bad('[S08] visible 了卻不在無障礙樹裡', ariaBack)

    // S09：不擋操作、看得清楚
    const probe = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === '小玉')
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      const c = document.createElement('canvas'); c.width = 1; c.height = 1
      const ctx = c.getContext('2d', { willReadFrequently: true })
      const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
      const cs = getComputedStyle(el)
      return { hitIsTag: hit === el || el.contains(hit), text: rgba(cs.color), bg: rgba(cs.backgroundColor), z: cs.zIndex, pe: cs.pointerEvents }
    })
    const lum = ([r, g, b]) => [r, g, b].map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }).reduce((s, c, i) => s + [0.2126, 0.7152, 0.0722][i] * c, 0)
    const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05) }
    if (!probe.hitIsTag) ok('[S09] elementFromPoint(牌子中心) 不是牌子（不擋操作）')
    else bad('[S09] 牌子接收指標事件', JSON.stringify(probe))
    const ratio = contrast(probe.text, probe.bg)
    if (probe.bg[3] === 1 && ratio >= 4.5) ok(`[S09] 文字對底 ${ratio.toFixed(2)}:1、底 alpha 1`)
    else bad('[S09] 對比或底不合格', JSON.stringify({ ratio, bg: probe.bg }))
    // 打開看板面板（深連結）：站在面板會蓋到的位置的人，牌子中心命中的是面板
    await page.goto(`${FRONTEND}/world?panel=projects`)
    await waitForWorld(page)
    send(sockets, { t: 'pos', p: [['u-yu', Math.round((HALL_SPAWN.x + 7.5) * PX), Math.round(HALL_SPAWN.z * PX), 0]] })
    await page.waitForSelector('[data-testid="list-panel"]', { timeout: 8_000 })
    await page.waitForTimeout(900)
    const covered = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === '小玉')
      if (!el) return { missing: true }
      const r = el.getBoundingClientRect()
      // 量的是**堆疊順序**不是指標事件：牌子本來 pointer-events: none，命中一定穿過它 —— 暫時開回 auto 再 hit-test，
      // 牌子若畫在面板上面就會命中牌子（突變「z-index 改到面板之上」在只看 elementFromPoint 時是綠的）
      const container = el.parentElement
      const was = [el.style.pointerEvents, container.style.pointerEvents]
      el.style.pointerEvents = 'auto'
      container.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      el.style.pointerEvents = was[0]
      container.style.pointerEvents = was[1]
      return { inPanel: hit !== null && hit.closest('[data-testid="list-panel"]') !== null, x: r.x, hit: hit ? `${hit.tagName.toLowerCase()}#${hit.getAttribute('data-testid') ?? ''}` : null }
    })
    if (covered.inPanel) ok(`[S09] 看板開著時牌子中心命中的是面板（x=${covered.x.toFixed(0)}）`)
    else bad('[S09] 看板沒蓋住牌子', JSON.stringify(covered))
    await page.screenshot({ path: path.join(OUT, 'under-panel.png') })
    await context.close()
  }

  // ── C：S03、S07（空白名、非字串、二十字） ──
  {
    // 「不是字串」（`null`）的 name 在協定層就不合法：驗證器把整則 snapshot 丟掉（`FE-R07-S05`），到不了名單 —— 那一半在 jsdom 用 `hasName` 直接驗，這裡只放協定合法但空白的
    const { page, context } = await open(() => [at('u-a', '   ', 1, 0), at('u-b', '', 2, 0), at('u-long', LONG, -2, 0), at('u-short', '阿明', -4, 0)])
    if (await waitTags(page, 2)) ok('[S03] 空白名、空字串的人沒有牌子；有名字的兩個有')
    else bad('[S03] 牌子數不是 2', JSON.stringify(await tagsText(page)))
    const texts = await tagsText(page)
    if (!texts.some((t) => /訪客|未命名/.test(t))) ok('[S03] 沒有替代字')
    else bad('[S03] 出現替代字', JSON.stringify(texts))
    const m = await page.evaluate((longName) => {
      const all = [...document.querySelectorAll('[data-testid="name-tag"]')]
      const long = all.find((t) => t.textContent === longName)
      const short = all.find((t) => t.textContent === '阿明')
      const r = (el) => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height } }
      const cs = getComputedStyle(long)
      return { long: r(long), short: r(short), scrollWidth: long.scrollWidth, clientWidth: long.clientWidth, overflowX: cs.overflowX, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, text: long.textContent }
    }, LONG)
    if (near(m.long.w, m.short.w, 0.5) && near(m.long.h, m.short.h, 0.5)) ok(`[S07] 二十字與兩字的牌子同寬同高（${m.long.w}×${m.long.h}）`)
    else bad('[S07] 牌子尺寸隨名字變了', JSON.stringify(m))
    if (m.scrollWidth > m.clientWidth && m.overflowX !== 'visible' && m.textOverflow === 'ellipsis' && m.text === LONG) ok(`[S07] 真的截了：scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}、overflow-x ${m.overflowX}、text-overflow ellipsis、textContent 完整`)
    else bad('[S07] 沒有真的截字', JSON.stringify(m))
    await page.screenshot({ path: path.join(OUT, 'long-name.png') })
    await context.close()
  }

  // ── D：S10（從大廳走進房間：大廳的牌子隨舊子樹卸載、房間的牌子由新名單建立） ──
  {
    const { page, context } = await open((scene) => (scene === `room:${ROOM}` ? [at('u-owner', '房主', 1, 0)] : [at('u-yu', '小玉', 1, 0)]), { token: true })
    if (await waitTags(page, 1) && (await tagsText(page)).includes('小玉')) ok('[S10] 大廳裡先看到「小玉」')
    else bad('[S10] 大廳的牌子沒出現', JSON.stringify(await tagsText(page)))
    const { approachDoor } = walker({ room: ROOM, decoy: uuid(2), title: '星際導航', out: OUT })
    await approachDoor(page)
    const since = await overlaysSeen(page)
    await page.keyboard.press('KeyE')
    await waitForTransition(page, '按 E 進房間', since, 'S10')
    await expectUrl(page, '[S10] 進房間', `/world?room=${ROOM}`)
    await waitForWorld(page)
    if (await waitTags(page, 1)) ok('[S10] 房間裡有一塊牌子')
    else bad('[S10] 房間裡牌子數不是 1', JSON.stringify(await tagsText(page)))
    const texts = await tagsText(page)
    if (texts.includes('房主') && !texts.includes('小玉')) ok('[S10] 是房間裡的人；大廳的「小玉」隨舊子樹卸載、不在 DOM 裡')
    else bad('[S10] 房間的名單不對（大廳的牌子沒卸載？）', JSON.stringify(texts))
    await page.screenshot({ path: path.join(OUT, 'room.png') })
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(failureCount() === 0 ? '\n全部通過' : `\n${failureCount()} 個失敗`)
process.exit(failureCount() === 0 ? 0 : 1)
