// `FE-R12-S09` 的瀏覽器驗收：A、B 在大廳互見；伺服器關掉 A 的連線 → A 看到「正在重新連線」通知、B 從 A 的畫面消失；
// A 自動重連（不重新整理、不按任何東西）→ 通知消失、B 回來、A 的狀態文字在 B 那邊仍看得到。
//
// **兩個瀏覽器 process**（同一個瀏覽器兩個 context 會互搶焦點，`room-seats.mjs` 踩過）。REST 與 WS 全偽造（`page.route`／`routeWebSocket`），
// **只打本機自起的 `next start`**；「伺服器」是這支腳本：每個人一條「目前連線」，`status` 從一個人來 → 回聲給他、廣播給另一個人；
// 每條新連線的 snapshot 帶對方（含對方目前的狀態）。**A 的第一條連線可以被腳本主動關掉**（模擬後端重啟）；A 重連時腳本接受新連線、送新 snapshot。
//
//   FRONTEND=http://127.0.0.1:3101 OUT=<截圖目錄> node tests/e2e/reconnect.mjs

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, fakeRest, guardLoopback, ok, profile, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3101'
const OUT = process.env.OUT ?? '/tmp/guildhub-reconnect-shots'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

const A = profile(61, '重連甲')
const B = profile(62, '重連乙')
const check = (label, actual, wanted) => (actual === wanted ? ok(label) : bad(label, `要 ${JSON.stringify(wanted)}，是 ${JSON.stringify(actual)}`))
const px = (n) => n * 32

await mkdir(OUT, { recursive: true })
const browsers = []
const launch = async () => {
  const b = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  browsers.push(b)
  return b
}

/**
 * 假伺服器：每個人一條「目前連線」（重連會換掉）。狀態每次 `join` 清空（新的 Player）—— B 在房間裡看得到 A 的狀態**只能**靠 A 重送。
 * `dropCurrent(who)`：主動關掉那個人目前的連線（模擬後端重啟）。
 */
function fakeServer() {
  const conns = new Map() // who.id → { ws }
  const statusText = new Map() // who.id → 目前伺服器上的狀態（每次 join 清空）
  const wire = (who, other, context) =>
    context.routeWebSocket(/\/ws(\?|$)/, (ws) => {
      conns.set(who.id, { ws })
      statusText.set(who.id, '')
      ws.send(JSON.stringify({ t: 'hello', you: who.id, hz: 10 }))
      const at = who === A ? { x: px(0), y: px(0) } : { x: px(2), y: px(1) }
      const otherAt = who === A ? { x: px(2), y: px(1) } : { x: px(0), y: px(0) }
      // snapshot 帶對方目前的狀態（對方若已重送，這裡就有）
      ws.send(JSON.stringify({ t: 'snapshot', players: [{ id: who.id, name: who.display_name, av: 0, ...at, f: 0, st: '' }, { id: other.id, name: other.display_name, av: 1, ...otherAt, f: 0, st: statusText.get(other.id) ?? '' }] }))
      ws.onMessage((raw) => {
        let m
        try { m = JSON.parse(String(raw)) } catch { return }
        if (m.t !== 'status') return
        if (typeof m.text !== 'string' || m.text.length > 12) return
        statusText.set(who.id, m.text)
        const out = JSON.stringify({ t: 'status', id: who.id, text: m.text })
        ws.send(out) // 回聲
        const peer = conns.get(other.id)
        if (peer) peer.ws.send(out) // 廣播給對方
      })
    })
  const dropCurrent = (who) => {
    const conn = conns.get(who.id)
    if (conn) conn.ws.close({ code: 1012, reason: 'server restart' })
  }
  return { wire, dropCurrent, sent: () => statusText }
}

async function person(who, other, server) {
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  guardLoopback(context)
  await server.wire(who, other, context)
  const page = await context.newPage()
  await fakeRest(page, { current: who }, [])
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  return { who, page, context }
}

const tagOf = (page, id) => page.evaluate((i) => {
  const tag = document.querySelector(`[data-testid="name-tag"][data-player="${i}"]`)
  if (!tag) return null
  return { status: tag.querySelector('[data-testid="name-tag-status"]')?.textContent ?? null }
}, id)
const waitTagGone = (page, id) => page.waitForFunction((i) => !document.querySelector(`[data-testid="name-tag"][data-player="${i}"]`), id, { timeout: 15_000 }).then(() => true).catch(() => false)
const waitTagBack = (page, id) => page.waitForFunction((i) => !!document.querySelector(`[data-testid="name-tag"][data-player="${i}"]`), id, { timeout: 30_000 }).then(() => true).catch(() => false)
const waitTagStatus = (page, id, text) => page.waitForFunction(([i, t]) => (document.querySelector(`[data-testid="name-tag"][data-player="${i}"] [data-testid="name-tag-status"]`)?.textContent ?? null) === t, [id, text], { timeout: 15_000 }).then(() => true).catch(() => false)
const waitNotice = (page, present) => page.waitForFunction((p) => (document.querySelector('[data-testid="reconnecting-notice"]') !== null) === p, present, { timeout: 15_000 }).then(() => true).catch(() => false)
const alerts = (page) => page.$$eval('[role="alert"]', (ns) => ns.map((n) => n.textContent?.slice(0, 60) ?? ''))

try {
  const server = fakeServer()
  const a = await person(A, B, server)
  const b = await person(B, A, server)
  const urlBefore = a.page.url()

  check('[S09] 一開始 A、B 互相在名單裡', (await tagOf(a.page, B.id)) !== null && (await tagOf(b.page, A.id)) !== null, true)

  // A 設「趕工中」→ B 看到
  await a.page.click('[data-testid="status-hud"] button')
  await a.page.click('[data-testid="status-hud"] button:has-text("趕工中")')
  check('[S09] B 看到 A 的牌子含「趕工中」', await waitTagStatus(b.page, A.id, '趕工中'), true)

  // 伺服器關掉 A 的連線
  server.dropCurrent(A)
  check('[S09] A 看到「正在重新連線」通知', await waitNotice(a.page, true), true)
  check('[S09] A 的畫面上 B 的牌子消失', await waitTagGone(a.page, B.id), true)
  // 頁面有一個常駐的空 `role="alert"` 容器（錯誤邊界，沒錯誤時空的）；斷線重連不該冒出有文字的 alert（進不了房那種）。
  check('[S09] 斷線重連沒有出現有文字的 alert', (await alerts(a.page)).filter((t) => t.trim() !== '').length, 0)
  await a.page.screenshot({ path: path.join(OUT, '1-a-reconnecting.png') })

  // A 自動重連（不做任何事）→ 通知消失、B 回來
  check('[S09] A 自動重連後通知消失', await waitNotice(a.page, false), true)
  check('[S09] A 的畫面上 B 的牌子回來', await waitTagBack(a.page, B.id), true)
  check('[S09] 重連後 A 的網址不變', a.page.url(), urlBefore)
  check('[S09] 重連後伺服器上 A 的狀態又是「趕工中」（A 重送了）', server.sent().get(A.id), '趕工中')
  check('[S09] B 的畫面上 A 的牌子仍含「趕工中」', await waitTagStatus(b.page, A.id, '趕工中'), true)
  await a.page.screenshot({ path: path.join(OUT, '2-a-recovered.png') })
  await b.page.screenshot({ path: path.join(OUT, '3-b-still-sees-a.png') })

  for (const who of [a, b]) await who.context.close()
} catch (err) {
  bad('腳本中途拋出', err instanceof Error ? (err.stack ?? err.message) : String(err))
} finally {
  for (const br of browsers) await br.close()
}
if (failureCount() > 0) {
  console.log(`\n${failureCount()} 條沒過`)
  process.exit(1)
}
console.log('\n全部通過')
