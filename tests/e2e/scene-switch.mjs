// `FE-V01` 的瀏覽器驗收：換場景之後 Canvas 還是同一個 DOM 節點（S04）；進房間多一層紀錄、
// 一次上一頁就回大廳、頁面沒有整個重新載入（S09）；重新整理仍在房間裡、票從不進網址、
// 換一個身分讀不到前一個人的票（S14）。規格 `openspec/changes/fe-v01-scene-switch/`。
//
// ⚠️ **這裡只驗 jsdom 驗不了的那幾句。** 狀態機、票、網址 codec、握手順序的判準都在
// `tests/world-scenes-*.test.tsx`；這裡抓的是 **element handle**（不是 locator ——
// locator 每次都重新解析，會抓到新節點）、整頁重載會消失的記號、以及真的瀏覽器
// `history` 的上一頁／下一頁。
//
// ⚠️ **S09 的 GIVEN「清單開著」在瀏覽器裡做不到。** 進房間唯一的入口是對著門按 E，
// 而清單開著的時候輸入被鎖住（`ListPanelProvider` 持有 `holdInputLock`）。
// 所以這裡從 `/world` 走到門前進去；「面板關掉、上一頁清單回來」那兩句由
// `tests/world-scenes-url.test.tsx` 的 S09 守。這裡守的是「一次上一頁就到、不是兩次」與「沒有重載」。
//
// ⚠️ **即時層與 REST 都是這支腳本攔截並偽造的**（`routeWebSocket`／`page.route`）。
// **不連任何團隊共用的位址** —— 只打本機自己起的 dev server。假後端對每一條 socket
// 回 `hello` ＋ 空的 `snapshot`，並把每一條的 `scene`／`token` 記下來：那就是
// 「第一條 socket 的位址含什麼」的證據。
//
// 用法：
//   1. pnpm run dev
//   2. node tests/e2e/scene-switch.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT（截圖目錄）

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-v01'
const HEADED = process.env.HEADED === '1'

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const profile = (n, display_name) => ({
  id: uuid(n),
  display_name,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-14T00:00:00Z',
})
const P = profile(21, '人才甲')
const Q = profile(22, '人才乙')
const ROOM = uuid(1)
const ROOM_TITLE = '星際導航'
const ROOMS = [{ project_id: ROOM, title: ROOM_TITLE, online_count: 3 }]
/** 一眼認得出來的票。S14 要的是 `location.href` 從頭到尾不含這串字。 */
const TOKEN = 'e2e-ticket-XYZ7-must-never-appear-in-url'
const tokenKey = (profileId) => `guildhub.roomToken.${profileId}.${ROOM}`

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

/**
 * 假的即時後端。每一條連線記一筆 `{ scene, token }`（順序就是建立的順序），
 * 回 `hello` ＋ 只有自己的 `snapshot`，讓連線走到 `ready`。
 */
function fakeRealtime(context, sockets) {
  return context.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    const url = new URL(ws.url())
    sockets.push({ scene: url.searchParams.get('scene'), token: url.searchParams.get('token') })
    const you = `self-${sockets.length}`
    ws.send(JSON.stringify({ t: 'hello', you, hz: 10 }))
    ws.send(JSON.stringify({ t: 'snapshot', players: [{ id: you, name: '訪客', av: 0, x: 0, y: 0, f: 0, st: 'idle' }] }))
  })
}

/** REST 全部偽造。`me` 是一個可以換人的盒子 —— S14 後半段要「同一個分頁換身分」。 */
async function fakeRest(page, me) {
  await page.route('**/api/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me.current) }))
  await page.route('**/api/rooms', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROOMS) }))
  await page.route('**/api/profiles?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/projects?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
}

async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
  await page.waitForTimeout(300)
}
const promptText = (page) => page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => null)
/**
 * 走到走廊第一扇門前。出生點 (0, -1)；走廊隔牆在 x=-6、z∈[-3, 9]，先往北繞過它的北端再往西，
 * 然後一小步一小步往南，直到提示上出現這扇門的名字。
 */
async function approachDoor(page) {
  await hold(page, 'ArrowUp', 900)
  await hold(page, 'ArrowLeft', 2600)
  for (let i = 0; i < 24; i++) {
    const prompt = await promptText(page)
    if (prompt !== null && prompt.includes(ROOM_TITLE)) return prompt
    await hold(page, 'ArrowDown', 120)
  }
  await page.screenshot({ path: path.join(OUT, 'lost.png') })
  throw new Error(`走不到「${ROOM_TITLE}」的門前（截圖 ${OUT}/lost.png）`)
}

const pathAndSearch = (page) => page.evaluate(() => `${location.pathname}${location.search}`)
async function expectUrl(page, label, want) {
  await page.waitForFunction((w) => `${location.pathname}${location.search}` === w, want, { timeout: 3_000 }).catch(() => {})
  const got = await pathAndSearch(page)
  if (got === want) ok(`${label}：網址是 ${got}`)
  else bad(`${label}：網址不對`, `要 ${want}，是 ${got}`)
}
async function waitForWorld(page) {
  await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(1500)
}
/** 過場覆蓋層出現再消失（最短 300 ms ＋ 淡出）。沒出現也放行 —— 那會在後面的判準紅。 */
async function waitForTransition(page) {
  await page.waitForSelector('[data-testid="scene-transition"][role="status"]', { timeout: 3_000 }).catch(() => {})
  await page.waitForSelector('[data-testid="scene-transition"][role="status"]', { state: 'detached', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(500)
}
const hrefHasToken = (page) => page.evaluate((t) => location.href.includes(t), TOKEN)
async function expectNoToken(page, label) {
  if (await hrefHasToken(page)) bad(`[S14] ${label}：票出現在網址裡`, await page.evaluate(() => location.href))
  else ok(`[S14] ${label}：網址不含票`)
}

/**
 * 「仍然連在 DOM 上」是**整段序列期間從沒斷開**，不只是每一步量的那一刻。
 * MutationObserver 看 `removedNodes`（回呼是 microtask 批次，同步拔掉再插回跑到回呼時已經接回去了）。
 * 整頁重載之後舊 handle 連 evaluate 都做不了、掛載時放的記號也會不見 —— 那也是「不是同一個」。
 */
async function watchCanvas(page, canvas) {
  await page.evaluate(() => {
    window.__guildhubMark = 'mounted-once'
  })
  await canvas.evaluate((el) => {
    window.__guildhubDetached = false
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.removedNodes) if (n === el || n.contains(el)) window.__guildhubDetached = true
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
  })
  return async (scenario, label) => {
    const connected = await canvas.evaluate((el) => el.isConnected).catch(() => false)
    const count = await page.evaluate(() => document.querySelectorAll('canvas').length)
    const mark = await page.evaluate(() => window.__guildhubMark)
    const detached = await page.evaluate(() => window.__guildhubDetached)
    if (connected && !detached && count === 1 && mark === 'mounted-once') ok(`[${scenario}] ${label}：Canvas 還是同一個節點，中途沒斷開（頁面沒重載）`)
    else bad(`[${scenario}] ${label}：Canvas 被重掛了`, `isConnected=${connected}，中途斷開過=${detached}，canvas 數=${count}，記號=${mark}（記號不見 = 整頁重載）`)
  }
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  // ── S04／S09：從大廳走到門前按 E 進房間；上一頁一次回大廳；下一頁再進；Canvas 全程同一個節點 ──
  {
    const sockets = []
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, { current: P })

    const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
    if (response === null) throw new Error(`連不到 ${FRONTEND} —— dev server 起了嗎？（pnpm run dev）`)
    await waitForWorld(page)
    const canvas = await page.$('canvas')
    if (canvas === null) throw new Error('沒有 canvas —— 世界沒畫出來')
    const sameCanvas = await watchCanvas(page, canvas)
    if (sockets[0]?.scene === 'lobby') ok('[S04] 大廳：第一條 socket 是 scene=lobby')
    else bad('[S04] 大廳的第一條 socket 不對', JSON.stringify(sockets))

    const prompt = await approachDoor(page)
    ok(`[S10] 走到門前，提示是「${prompt}」`)
    await page.keyboard.press('KeyE')
    await waitForTransition(page)
    await expectUrl(page, '[S09] 按 E 進房間', `/world?room=${ROOM}`)
    const entered = sockets[1]
    if (sockets.length === 2 && entered?.scene === `room:${ROOM}` && entered.token === TOKEN) ok('[S04] 進房間：第二條 socket 帶 scene=room:<id> 與票，而且只建了一條')
    else bad('[S04] 進房間的 socket 不對', JSON.stringify(sockets))
    await sameCanvas('S04', '進房間之後')
    const returnButton = await page.$('button:has-text("回到 Guild Hall")')
    if (returnButton !== null) ok('[S13] 房間裡有「回到 Guild Hall」')
    else bad('[S13] 房間裡沒有「回到 Guild Hall」', '')
    await page.screenshot({ path: path.join(OUT, 'in-room.png') })

    await page.goBack()
    await waitForTransition(page)
    await expectUrl(page, '[S09] 上一頁（一次）', '/world')
    if (sockets.length === 3 && sockets[2]?.scene === 'lobby') ok('[S09] 上一頁：連線回到 scene=lobby（走過場）')
    else bad('[S09] 上一頁之後的 socket 不對', JSON.stringify(sockets))
    await sameCanvas('S09', '上一頁之後')
    if ((await page.$('button:has-text("回到 Guild Hall")')) === null) ok('[S13] 回到大廳之後按鈕不見了')
    else bad('[S13] 回到大廳之後按鈕還在', '')

    await page.goForward()
    await waitForTransition(page)
    await expectUrl(page, '[S09] 下一頁', `/world?room=${ROOM}`)
    if (sockets.length === 4 && sockets[3]?.scene === `room:${ROOM}` && sockets[3].token === TOKEN) ok('[S09] 下一頁：再進房間、票還在（沒被上一頁丟掉）')
    else bad('[S09] 下一頁之後的 socket 不對', JSON.stringify(sockets))
    await sameCanvas('S09', '下一頁之後')
    await page.screenshot({ path: path.join(OUT, 'after-history-dance.png') })
    await context.close()
  }

  // ── S14：載入 /world?room=<id>（P 持票）：第一條 socket 就是房間；五個時點網址都不含票；換成 Q 讀不到票 ──
  {
    const sockets = []
    const me = { current: P }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, me)

    await page.goto(`${FRONTEND}/world?room=${ROOM}`)
    await expectNoToken(page, '載入時')
    const overlay = await page.waitForSelector('[data-testid="scene-transition"][role="status"]', { timeout: 10_000 }).catch(() => null)
    if (overlay !== null) {
      ok('[S05] 直達房間：有過場覆蓋層')
      await expectNoToken(page, '過場中')
    } else bad('[S05] 直達房間沒有看到過場覆蓋層', '')
    await waitForWorld(page)
    await waitForTransition(page)
    await expectNoToken(page, 'ready 後')
    await expectUrl(page, '[S14] 重新整理仍在房間裡', `/world?room=${ROOM}`)
    if (sockets.length >= 1 && sockets[0].scene === `room:${ROOM}` && sockets[0].token === TOKEN) ok('[S14] 第一條 socket 就是 scene=room:<id> ＋ 票（沒有先進大廳）')
    else bad('[S14] 第一條 socket 不對', JSON.stringify(sockets))
    if (sockets.length === 1) ok('[S14] 載入到 ready 只建了一條 socket')
    else bad('[S14] 建了不只一條 socket', JSON.stringify(sockets))
    await page.screenshot({ path: path.join(OUT, 'reload-in-room.png') })

    await page.click('button:has-text("回到 Guild Hall")')
    await waitForTransition(page)
    await expectUrl(page, '[S13] 回到 Guild Hall', '/world')
    await expectNoToken(page, '按「回到 Guild Hall」後')
    if (sockets.length === 2 && sockets[1]?.scene === 'lobby') ok('[S13] 回到 Guild Hall：連線換成 scene=lobby')
    else bad('[S13] 回到 Guild Hall 之後的 socket 不對', JSON.stringify(sockets))

    await page.goBack()
    await waitForTransition(page)
    await expectUrl(page, '[S13] 上一頁回到房間（回大廳是 push）', `/world?room=${ROOM}`)
    await expectNoToken(page, '上一頁後')

    // 換成 Q：同一個分頁、同一個 sessionStorage（P 的票還躺在裡面）、同一個網址。
    me.current = Q
    sockets.length = 0
    await page.goto(`${FRONTEND}/world?room=${ROOM}`)
    await waitForWorld(page)
    await expectUrl(page, '[S14] Q 沒有票：網址改成 /world', '/world')
    if (sockets.length >= 1 && sockets[0].scene === 'lobby' && sockets[0].token === null) ok('[S14] Q 的第一條 socket 是 scene=lobby、沒有票（P 的票沒被讀到）')
    else bad('[S14] Q 的第一條 socket 不對', JSON.stringify(sockets))
    const status = await page.$('[role="status"][aria-label*="房間密碼"]')
    if (status !== null) ok('[S14] 有 role="status" 的說明（需要房間密碼）')
    else bad('[S14] 沒有 role="status" 的說明', '')
    // Next.js 自己的 `__next-route-announcer__` 也是 `role="alert"`（空的、視覺隱藏、每次導覽都在）；那不是我們的通知。
    const alert = await page.$('[role="alert"]:not(#__next-route-announcer__)')
    if (alert === null) ok('[S14] 沒有 role="alert"（沒票不是失敗）')
    else bad('[S14] 出現了 role="alert"', (await alert.textContent()) ?? '')
    await page.screenshot({ path: path.join(OUT, 'denied-without-ticket.png') })
    await context.close()
  }
} finally {
  await browser.close()
}

if (failures > 0) {
  console.log(`\n${failures} 項不符。`)
  process.exit(1)
}
console.log('\n全部符合。')
