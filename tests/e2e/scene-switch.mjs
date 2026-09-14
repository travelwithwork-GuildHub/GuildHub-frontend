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
//
// 走位不按固定毫秒（`e2e-main.sh` 記著那種尺在 runner 上會 flake）：角色的位置從門標籤的螢幕座標量出來，
// 每一小步量一次，只設步數上限 —— 見 `odometer`。

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
/** 第二扇門是量尺：兩扇門在世界裡相隔剛好一格（`CORRIDOR_SLOTS` z 差 2），螢幕上的距離就是「每單位幾個像素」。 */
const DECOY = uuid(2)
const ROOMS = [
  { project_id: ROOM, title: ROOM_TITLE, online_count: 3 },
  { project_id: DECOY, title: '深海探勘', online_count: 1 },
]
const SLOT_GAP = 2
/** 出生點（`world-layout` 的 hall spawn）。走位用它當起點，之後的位置都是量出來的。 */
const SPAWN = { x: 0, z: -1 }
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
}
const promptText = (page) => page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => null)

/**
 * 角色走了多遠，用門標籤量出來。相機跟著角色、正交投影、沒有偏航（`camera.ts`：offset (0, 12, 12)），
 * 所以世界裡的門在螢幕上移動多少，就是角色反向走了多少：x 一單位 = s px，z 一單位 = s/√2 px（俯角 45°）。
 * s 從兩扇門量：它們在世界裡相隔 `SLOT_GAP`。**不假設任何速度、幀率、毫秒** —— 第一版按固定毫秒走，
 * `e2e-main.sh` 記著那種尺在 runner 上「一次走到、一次走不到」。
 * 讀值等相機收斂（連續兩次讀數差 ≤1 px）：跟拍是阻尼的（半衰期 120 ms），剛放開鍵那一刻的讀數還在追。
 * 回傳的是**相對起點**的位移（起點是校準那一刻）；絕對位置只用得到 z：校準前只往西走過，z 還是出生點的。
 */
async function odometer(page) {
  const read = () =>
    page.evaluate(
      ([a, b]) => {
        const rect = (id) => {
          const n = document.querySelector(`[data-testid="door-label"][data-target="door:${id}"]`)
          if (n === null || getComputedStyle(n).visibility !== 'visible') return null
          const r = n.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top }
        }
        return { target: rect(a), decoy: rect(b), cx: innerWidth / 2 }
      },
      [ROOM, DECOY],
    )
  const settled = async () => {
    let prev = await read()
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(150)
      const next = await read()
      if (prev.target && next.target && Math.abs(prev.target.x - next.target.x) <= 1 && Math.abs(prev.target.y - next.target.y) <= 1) return next
      prev = next
    }
    throw new Error('門標籤一直在動 —— 相機沒收斂，或標籤沒畫出來')
  }
  // 出生點看不到走廊（`rooms-fixture` 記著：門根本不在畫面裡）。先往西一小步一小步，直到兩個標籤都看得見再校準。
  let origin = null
  for (let i = 0; i < 15 && origin === null; i++) {
    const now = await read()
    if (now.target !== null && now.decoy !== null) origin = await settled()
    else await hold(page, 'ArrowLeft', 200)
  }
  if (origin === null || origin.decoy === null) throw new Error('往西走了 15 步還看不到兩扇門的標籤（標籤是量尺）')
  const pxPerZ = (origin.decoy.y - origin.target.y) / SLOT_GAP
  const pxPerX = pxPerZ * Math.SQRT2
  if (!(pxPerZ > 5)) throw new Error(`量尺不對：兩扇門在螢幕上只差 ${(pxPerZ * SLOT_GAP).toFixed(1)} px`)
  return async () => {
    const now = await settled()
    return {
      // 走了多遠（世界單位；x 往西為負、z 往北為負）
      dx: -(now.target.x - origin.target.x) / pxPerX,
      dz: -(now.target.y - origin.target.y) / pxPerZ,
      // 門在角色的西邊幾單位（角色永遠在畫面正中央）
      doorWest: (now.cx - now.target.x) / pxPerX,
      z: SPAWN.z - (now.target.y - origin.target.y) / pxPerZ,
    }
  }
}

/**
 * 走到走廊第一扇門前。出生點 (0, -1)；走廊隔牆在 x=-6、z∈[-3, 9]：先往北繞過它的北端（z ≤ -4），
 * 再往西到門前（門在角色西邊不到 1.2 單位；互動距離 2），然後往南直到提示上出現這扇門的名字。
 * 每一段都是「量 → 走一小步 → 再量」，只設步數上限。
 */
async function approachDoor(page) {
  const where = await odometer(page)
  const leg = async (label, code, ms, done, maxSteps) => {
    for (let i = 0; i < maxSteps; i++) {
      const pos = await where()
      if (await done(pos)) return pos
      await hold(page, code, ms)
    }
    await page.screenshot({ path: path.join(OUT, 'lost.png') })
    throw new Error(`${label}：走了 ${maxSteps} 步還沒到（截圖 ${OUT}/lost.png）`)
  }
  await leg('往北繞過隔牆', 'ArrowUp', 250, (p) => p.z <= -4, 30)
  await leg('往西到門前', 'ArrowLeft', 300, (p) => p.doorWest <= 1.2, 60)
  const arrived = await leg(
    '往南到門口',
    'ArrowDown',
    120,
    async () => {
      const prompt = await promptText(page)
      return prompt !== null && prompt.includes(ROOM_TITLE)
    },
    40,
  )
  const prompt = await promptText(page)
  return { prompt, pos: arrived }
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
/** 過場覆蓋層出現再消失。每一場過場都至少顯示 300 ms（`S05`），所以「沒看到」就是紅，不是放行。 */
async function waitForTransition(page, label) {
  const seen = await page.waitForSelector('[data-testid="scene-transition"][role="status"]', { timeout: 5_000 }).catch(() => null)
  if (seen !== null) ok(`[S05] ${label}：有過場覆蓋層`)
  else bad(`[S05] ${label}：沒有看到過場覆蓋層`, '')
  const gone = await page.waitForSelector('[data-testid="scene-transition"]', { state: 'detached', timeout: 15_000 }).then(() => true).catch(() => false)
  if (!gone) bad(`[S05] ${label}：覆蓋層 15 秒沒消失`, '')
  await page.waitForTimeout(300)
}
/**
 * 網址的**完整軌跡**，不是五個快照：快照看不到「先 pushState 一個帶票的、下一個 tick 再 replace 掉」（審查抓到的）。
 * 每個 document 一開始就把 `pushState`／`replaceState` 包起來，每一次寫入的網址都送到 Node 這邊；
 * document 自己的第一個網址與整頁導覽（`framenavigated`）也記。五個時點只是報告的段落，判準是整條軌跡。
 */
async function traceUrls(context, urls) {
  await context.exposeBinding('__guildhubRecordUrl', (_source, url) => {
    urls.push(String(url))
  })
  await context.addInitScript(() => {
    window.__guildhubRecordUrl(location.href)
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method]
      history[method] = function (state, title, url) {
        if (url !== undefined && url !== null) window.__guildhubRecordUrl(new URL(String(url), location.href).href)
        return original.call(this, state, title, url)
      }
    }
  })
  context.on('page', (page) => page.on('framenavigated', (frame) => urls.push(frame.url())))
}
async function expectNoToken(page, urls, label) {
  const leaked = urls.filter((u) => u.includes(TOKEN))
  const now = await page.evaluate(() => location.href)
  if (leaked.length > 0 || now.includes(TOKEN)) bad(`[S14] ${label}：票出現在網址裡`, [...leaked, now].join('\n   '))
  else ok(`[S14] ${label}：到此為止 ${urls.length} 次網址寫入都不含票`)
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

    const { prompt, pos } = await approachDoor(page)
    ok(`[S10] 走到門前（量到 z=${pos.z.toFixed(1)}、門在西邊 ${pos.doorWest.toFixed(1)} 單位），提示是「${prompt}」`)
    await page.keyboard.press('KeyE')
    await waitForTransition(page, '按 E 進房間')
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
    await waitForTransition(page, '上一頁')
    await expectUrl(page, '[S09] 上一頁（一次）', '/world')
    if (sockets.length === 3 && sockets[2]?.scene === 'lobby') ok('[S09] 上一頁：連線回到 scene=lobby（走過場）')
    else bad('[S09] 上一頁之後的 socket 不對', JSON.stringify(sockets))
    await sameCanvas('S09', '上一頁之後')
    if ((await page.$('button:has-text("回到 Guild Hall")')) === null) ok('[S13] 回到大廳之後按鈕不見了')
    else bad('[S13] 回到大廳之後按鈕還在', '')

    await page.goForward()
    await waitForTransition(page, '下一頁')
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
    const urls = []
    const me = { current: P }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await traceUrls(context, urls)
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, me)

    await page.goto(`${FRONTEND}/world?room=${ROOM}`)
    await expectNoToken(page, urls, '載入時')
    // 直達房間的那場過場：`transitionSeq` 還是 0，第一版覆蓋層沒畫（這裡抓到的）。
    await waitForTransition(page, '直達房間')
    await expectNoToken(page, urls, '過場中')
    await waitForWorld(page)
    await expectNoToken(page, urls, 'ready 後')
    await expectUrl(page, '[S14] 重新整理仍在房間裡', `/world?room=${ROOM}`)
    if (sockets.length >= 1 && sockets[0].scene === `room:${ROOM}` && sockets[0].token === TOKEN) ok('[S14] 第一條 socket 就是 scene=room:<id> ＋ 票（沒有先進大廳）')
    else bad('[S14] 第一條 socket 不對', JSON.stringify(sockets))
    if (sockets.length === 1) ok('[S14] 載入到 ready 只建了一條 socket')
    else bad('[S14] 建了不只一條 socket', JSON.stringify(sockets))
    await page.screenshot({ path: path.join(OUT, 'reload-in-room.png') })

    await page.click('button:has-text("回到 Guild Hall")')
    await waitForTransition(page, '回到 Guild Hall')
    await expectUrl(page, '[S13] 回到 Guild Hall', '/world')
    await expectNoToken(page, urls, '按「回到 Guild Hall」後')
    if (sockets.length === 2 && sockets[1]?.scene === 'lobby') ok('[S13] 回到 Guild Hall：連線換成 scene=lobby')
    else bad('[S13] 回到 Guild Hall 之後的 socket 不對', JSON.stringify(sockets))

    await page.goBack()
    await waitForTransition(page, '上一頁回到房間')
    await expectUrl(page, '[S13] 上一頁回到房間（回大廳是 push）', `/world?room=${ROOM}`)
    await expectNoToken(page, urls, '上一頁後')

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
    const alert = await page.$('[role="alert"]:not(#__next-route-announcer__):not(#__next-route-announcer__ *)')
    if (alert === null) ok('[S14] 沒有 role="alert"（沒票不是失敗）')
    else bad('[S14] 出現了 role="alert"', (await alert.textContent()) ?? '')
    // 沒票的人不會有過場（design：沒票 → 人在大廳、一句 status；不是進不去、不是過場）。淡出的殘影也不該有。
    if ((await page.$('[data-testid="scene-transition"]')) === null) ok('[S14] Q 沒有票：沒有過場覆蓋層')
    else bad('[S14] Q 沒有票卻出現過場覆蓋層', '')
    await expectNoToken(page, urls, '換成 Q 之後（整條軌跡）')
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
