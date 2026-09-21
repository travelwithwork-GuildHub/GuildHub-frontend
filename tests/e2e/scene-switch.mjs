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
// 每一小步量一次，只設步數上限 —— 見 `lib/world.mjs` 的 `walker`（偽造的後端、過場計數、網址軌跡也在那裡；`room-entry.mjs` 共用）。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, countOverlays, expectUrl, failureCount, fakeRealtime, fakeRest, guardLoopback, hold, ok, overlaysSeen, profile, traceUrls, uuid, waitForTransition, waitForWorld, walker, watchCanvas } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-v01'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

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
/** 一眼認得出來的票。S14 要的是 `location.href` 從頭到尾不含這串字。 */
const TOKEN = 'e2e-ticket-XYZ7-must-never-appear-in-url'
const tokenKey = (profileId) => `guildhub.roomToken.${profileId}.${ROOM}`
const { approachDoor } = walker({ room: ROOM, decoy: DECOY, title: ROOM_TITLE, out: OUT })

async function expectNoToken(page, urls, label) {
  const leaked = urls.filter((u) => u.includes(TOKEN))
  const now = await page.evaluate(() => location.href)
  if (leaked.length > 0 || now.includes(TOKEN)) bad(`[S14] ${label}：票出現在網址裡`, [...leaked, now].join('\n   '))
  else ok(`[S14] ${label}：到此為止 ${urls.length} 次網址寫入都不含票`)
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  // ── S04／S09：從大廳走到門前按 E 進房間；上一頁一次回大廳；下一頁再進；Canvas 全程同一個節點 ──
  {
    const sockets = []
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await countOverlays(context)
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, { current: P }, ROOMS)

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
    let since = await overlaysSeen(page)
    await page.keyboard.press('KeyE')
    await waitForTransition(page, '按 E 進房間', since)
    await expectUrl(page, '[S09] 按 E 進房間', `/world?room=${ROOM}`)
    const entered = sockets[1]
    if (sockets.length === 2 && entered?.scene === `room:${ROOM}` && entered.token === TOKEN) ok('[S04] 進房間：第二條 socket 帶 scene=room:<id> 與票，而且只建了一條')
    else bad('[S04] 進房間的 socket 不對', JSON.stringify(sockets))
    await sameCanvas('S04', '進房間之後')
    const returnButton = await page.$('button:has-text("回到 Guild Hall")')
    if (returnButton !== null) ok('[S13] 房間裡有「回到 Guild Hall」')
    else bad('[S13] 房間裡沒有「回到 Guild Hall」', '')
    await page.screenshot({ path: path.join(OUT, 'in-room.png') })

    since = await overlaysSeen(page)
    await page.goBack()
    await waitForTransition(page, '上一頁', since)
    await expectUrl(page, '[S09] 上一頁（一次）', '/world')
    if (sockets.length === 3 && sockets[2]?.scene === 'lobby') ok('[S09] 上一頁：連線回到 scene=lobby（走過場）')
    else bad('[S09] 上一頁之後的 socket 不對', JSON.stringify(sockets))
    await sameCanvas('S09', '上一頁之後')
    if ((await page.$('button:has-text("回到 Guild Hall")')) === null) ok('[S13] 回到大廳之後按鈕不見了')
    else bad('[S13] 回到大廳之後按鈕還在', '')

    since = await overlaysSeen(page)
    await page.goForward()
    await waitForTransition(page, '下一頁', since)
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
    guardLoopback(context)
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await traceUrls(context, urls)
    await countOverlays(context)
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, me, ROOMS)

    await page.goto(`${FRONTEND}/world?room=${ROOM}`)
    await expectNoToken(page, urls, '載入時')
    // 直達房間的那場過場：`transitionSeq` 還是 0，第一版覆蓋層沒畫（這裡抓到的）。新 document 從 0 數起。
    await waitForTransition(page, '直達房間', 0)
    await expectNoToken(page, urls, '過場中')
    await waitForWorld(page)
    await expectNoToken(page, urls, 'ready 後')
    await expectUrl(page, '[S14] 重新整理仍在房間裡', `/world?room=${ROOM}`)
    if (sockets.length >= 1 && sockets[0].scene === `room:${ROOM}` && sockets[0].token === TOKEN) ok('[S14] 第一條 socket 就是 scene=room:<id> ＋ 票（沒有先進大廳）')
    else bad('[S14] 第一條 socket 不對', JSON.stringify(sockets))
    if (sockets.length === 1) ok('[S14] 載入到 ready 只建了一條 socket')
    else bad('[S14] 建了不只一條 socket', JSON.stringify(sockets))
    await page.screenshot({ path: path.join(OUT, 'reload-in-room.png') })

    let since = await overlaysSeen(page)
    await page.click('button:has-text("回到 Guild Hall")')
    await waitForTransition(page, '回到 Guild Hall', since)
    await expectUrl(page, '[S13] 回到 Guild Hall', '/world')
    await expectNoToken(page, urls, '按「回到 Guild Hall」後')
    if (sockets.length === 2 && sockets[1]?.scene === 'lobby') ok('[S13] 回到 Guild Hall：連線換成 scene=lobby')
    else bad('[S13] 回到 Guild Hall 之後的 socket 不對', JSON.stringify(sockets))

    since = await overlaysSeen(page)
    await page.goBack()
    await waitForTransition(page, '上一頁回到房間', since)
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

  // ── S20：進房之後往南穿過門洞，自動回大廳（不按 E、不點按鈕）──
  // 房間裡沒有門標籤當里程計，改讀房間 socket 的 `move` frame 位置；一路按住 ArrowDown（+z＝往南）穿過門洞，
  // 直到出現新的 `scene=lobby` socket（＝穿門觸發了回大廳）。這一段驗的是 jsdom 驗不了的：碰撞真的讓角色穿得過門、走得到觸發區。
  {
    const sockets = []
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    guardLoopback(context)
    await context.addInitScript(([key, token]) => sessionStorage.setItem(key, token), [tokenKey(P.id), TOKEN])
    await countOverlays(context)
    await fakeRealtime(context, sockets)
    const page = await context.newPage()
    await fakeRest(page, { current: P }, ROOMS)

    await page.goto(`${FRONTEND}/world`)
    await waitForWorld(page)
    await approachDoor(page)
    let since = await overlaysSeen(page)
    await page.keyboard.press('KeyE')
    await waitForTransition(page, 'S20 進房間', since)
    const roomSocket = sockets[sockets.length - 1]
    if (roomSocket?.scene === `room:${ROOM}`) ok('[S20] 進了房間，準備往南走出去')
    else bad('[S20] 沒進房間', JSON.stringify(sockets.map((s) => s.scene)))

    // 焦點放進世界（兩個 context 時焦點不一定在 canvas），一路往南穿門
    await page.click('[data-testid="world-canvas-container"]').catch(() => {})
    await page.bringToFront()
    const roomIndex = sockets.indexOf(roomSocket)
    since = await overlaysSeen(page)
    let exited = false
    for (let i = 0; i < 40 && !exited; i++) {
      await hold(page, 'ArrowDown', 200)
      exited = sockets.slice(roomIndex + 1).some((s) => s.scene === 'lobby')
    }
    if (exited) ok('[S20] 往南穿過門洞：自動回大廳（沒按 E、沒點「回到 Guild Hall」），新 socket 是 scene=lobby')
    else bad('[S20] 穿門走了 40 步還沒回大廳', JSON.stringify(sockets.map((s) => s.scene)))
    await waitForTransition(page, 'S20 回大廳', since).catch(() => {})
    await expectUrl(page, '[S20] 穿門回大廳，網址是 /world', '/world')
    const kept = await page.evaluate((k) => sessionStorage.getItem(k), tokenKey(P.id))
    if (kept === TOKEN) ok('[S20] 穿門回大廳，票仍在（沒被丟掉）')
    else bad('[S20] 穿門回大廳票掉了', String(kept))
    await page.screenshot({ path: path.join(OUT, 'walked-out.png') })
    await context.close()
  }
} finally {
  await browser.close()
}

if (failureCount() > 0) {
  console.log(`\n${failureCount()} 項不符。`)
  process.exit(1)
}
console.log('\n全部符合。')
