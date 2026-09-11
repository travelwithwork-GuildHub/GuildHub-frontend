// `FE-B09` 的瀏覽器驗收：一連串網址變化之後，Canvas 還是同一個 DOM 節點（S12）；
// 深連結直達詳情、Escape 不離站（S11）；直達的頁碼已空退回第 0 頁、網址跟著改（S04）。
// 規格 `openspec/changes/fe-b09-deep-link/`。
//
// ⚠️ **S12 的主判準是這裡，不是 jsdom。** jsdom 掛不了 WebGL，那邊的探針只證明 provider 那一層沒重掛；
// `key={url}` 綁在 Canvas 上探針照樣是 1。這裡抓的是 **element handle**（不是 locator ——
// locator 每次都重新解析，會抓到新節點），走完之後它要 `isConnected`、而且頁面上只有一個 `canvas`。
//
// ⚠️ **也驗頁面沒有被整個重新載入。** Next App Router 在 popstate 時如果在 `history.state` 找不到自己的標記，
// 會 `location.reload()` —— 畫面一樣、Canvas 也「同一個」（因為整頁都是新的），只有掛載時放的記號會不見。
//
// ⚠️ **回應是這支腳本攔截並偽造的**（`page.route`）。**不連任何團隊共用的位址** —— 只打本機自己起的 dev server。
//
// 用法：
//   1. npm run dev
//   2. node tests/e2e/deep-link.mjs
//   環境變數：FRONTEND（預設 http://localhost:3100）、HEADED=1、OUT（截圖目錄）

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-b09'
const HEADED = process.env.HEADED === '1'

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const PROFILES = ['人才丁', '人才戊'].map((display_name, i) => ({
  id: uuid(10 + i),
  display_name,
  avatar_id: i,
  skills: ['three.js'],
  hours_per_week: 10,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
}))
const DETAIL = { ...PROFILES[0], bio: '詳情端點回的新自介。' }

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
  await page.waitForTimeout(400)
}
async function approach(page, label, steps) {
  for (const [code, ms] of steps) await hold(page, code, ms)
  for (let i = 0; i < 8; i++) {
    const prompt = await page.$eval('[data-testid="interaction-prompt"]', (n) => n.textContent ?? '').catch(() => null)
    if (prompt !== null && prompt.includes(label)) return prompt
    await hold(page, 'ArrowUp', 120)
  }
  await page.screenshot({ path: path.join(OUT, 'lost.png') })
  throw new Error(`走不到「${label}」前面（截圖 ${OUT}/lost.png）`)
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
async function route(page) {
  await page.route('**/api/profiles?*', async (r) => {
    const url = new URL(r.request().url())
    const empty = url.searchParams.get('page') === '7'
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty ? [] : PROFILES) })
  })
  await page.route('**/api/projects?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/rooms', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  for (const p of PROFILES) {
    await page.route(`**/api/profiles/${p.id}`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(p.id === PROFILES[0].id ? DETAIL : p) }),
    )
  }
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  await route(page)

  // ── S12：從 /world 開清單、開詳情、上一頁、下一頁、Escape 兩次；Canvas 是同一個節點 ──
  const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
  if (response === null) throw new Error(`連不到 ${FRONTEND} —— dev server 起了嗎？（npm run dev）`)
  await waitForWorld(page)
  const canvas = await page.$('canvas')
  if (canvas === null) throw new Error('沒有 canvas —— 世界沒畫出來')
  await page.evaluate(() => {
    window.__guildhubMark = 'mounted-once'
  })
  // 「仍然連在 DOM 上」是**整段序列期間從沒斷開**，不只是每一步量的那一刻（審查抓到的：
  // 拔掉再插回同一個節點，事後看 isConnected 還是 true）。MutationObserver 盯著整棵樹，斷開過就記下來。
  // ⚠️ 看的是 `removedNodes`，不是回呼當下的 `isConnected`：回呼是 microtask 批次，同步「拔掉再插回」跑到回呼時已經接回去了。
  await canvas.evaluate((el) => {
    window.__guildhubDetached = false
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.removedNodes) if (n === el || n.contains(el)) window.__guildhubDetached = true
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
  })
  const sameCanvas = async (label) => {
    // 整頁重載之後舊的 handle 連 evaluate 都做不了（執行環境沒了）—— 那也是「不是同一個」。
    const connected = await canvas.evaluate((el) => el.isConnected).catch(() => false)
    const count = await page.evaluate(() => document.querySelectorAll('canvas').length)
    const mark = await page.evaluate(() => window.__guildhubMark)
    const detached = await page.evaluate(() => window.__guildhubDetached)
    if (connected && !detached && count === 1 && mark === 'mounted-once') ok(`[S12] ${label}：Canvas 還是同一個節點，中途沒斷開（頁面沒重載）`)
    else bad(`[S12] ${label}：Canvas 被重掛了`, `isConnected=${connected}，中途斷開過=${detached}，canvas 數=${count}，記號=${mark}（記號不見 = 整頁重載）`)
  }

  // 出生點 (0, -1)；人才看板在 (3.5, -6.5)。
  await approach(page, '看人才看板', [['ArrowRight', 700], ['ArrowUp', 1000]])
  await page.keyboard.press('KeyE')
  await page.waitForSelector('[data-testid="talent-card"]', { timeout: 5_000 })
  await expectUrl(page, '[S06] 按 E 開清單', '/world?panel=profiles')
  await sameCanvas('開清單之後')

  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]', { timeout: 5_000 })
  await expectUrl(page, '[S07] 開詳情', `/world?panel=profiles&profile=${PROFILES[0].id}`)
  await sameCanvas('開詳情之後')
  await page.screenshot({ path: path.join(OUT, 'detail-with-url.png') })

  await page.goBack()
  await page.waitForSelector('[data-testid="talent-detail"]', { state: 'detached', timeout: 3_000 }).catch(() => {})
  const listStill = await page.$('[data-testid="list-panel"]')
  if (listStill !== null && (await page.$('[data-testid="talent-detail"]')) === null) ok('[S09] 上一頁：詳情關、清單還在')
  else bad('[S09] 上一頁之後不對', `panel=${listStill !== null}`)
  await expectUrl(page, '[S09] 上一頁', '/world?panel=profiles')
  await sameCanvas('上一頁之後')

  await page.goForward()
  const reopened = await page.waitForSelector('[data-testid="talent-detail"]', { timeout: 3_000 }).catch(() => null)
  if (reopened !== null) ok('[S09] 下一頁：詳情重開')
  else bad('[S09] 下一頁沒有重開詳情', '')
  await expectUrl(page, '[S09] 下一頁', `/world?panel=profiles&profile=${PROFILES[0].id}`)
  await sameCanvas('下一頁之後')

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="talent-detail"]', { state: 'detached', timeout: 3_000 }).catch(() => {})
  await expectUrl(page, '[S10] 第一下 Escape', '/world?panel=profiles')
  await sameCanvas('第一下 Escape 之後')
  await page.keyboard.press('Escape')
  await expectUrl(page, '[S10] 第二下 Escape', '/world')
  // 等面板真的從 DOM 拔掉再量 —— 量早了，「這一步剛好重掛」尺看不到（審查抓到的）。
  const panelGone = await page.waitForSelector('[data-testid="list-panel"]', { state: 'detached', timeout: 3_000 }).then(() => true).catch(() => false)
  if (panelGone) ok('[S10] 兩下 Escape 之後面板關了')
  else bad('[S10] 兩下 Escape 之後面板還在', '')
  await sameCanvas('第二下 Escape 之後')
  // 退回去的紀錄還在：前進一次又是清單。
  await page.goForward()
  const forwardList = await page.waitForSelector('[data-testid="list-panel"]', { timeout: 3_000 }).catch(() => null)
  if (forwardList !== null) ok('[S10] Escape 是退不是 replace：下一頁又開回清單')
  else bad('[S10] Escape 之後下一頁沒有開回清單', 'Escape 用了 replace？')
  await sameCanvas('再下一頁之後')
  await page.screenshot({ path: path.join(OUT, 'after-history-dance.png') })
  await context.close()

  // ── S11：深連結直達詳情，Escape 不離站 ──
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page2 = await ctx2.newPage()
  await route(page2)
  await page2.goto(`${FRONTEND}/world?panel=profiles&profile=${PROFILES[0].id}`)
  await waitForWorld(page2)
  const direct = await page2.waitForSelector('[data-testid="talent-detail"][data-phase="ready"]', { timeout: 5_000 }).catch(() => null)
  if (direct !== null) ok('[S02] 深連結直達：詳情開著、載入完成')
  else bad('[S02] 深連結直達沒有開出詳情', '')
  await page2.screenshot({ path: path.join(OUT, 'deep-link-detail.png') })
  await page2.keyboard.press('Escape')
  await expectUrl(page2, '[S11] 直達之後 Escape', '/world?panel=profiles')
  const stillHere = await page2.$('[data-testid="list-panel"]')
  if (stillHere !== null) ok('[S11] 直達之後 Escape：沒離站，清單還在')
  else bad('[S11] 直達之後 Escape 之後清單不在', '')
  await page2.keyboard.press('Escape')
  await expectUrl(page2, '[S11] 再 Escape', '/world')
  await ctx2.close()

  // ── S04：直達的頁碼已空 → 第 0 頁，網址跟著改 ──
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page3 = await ctx3.newPage()
  await route(page3)
  await page3.goto(`${FRONTEND}/world?panel=profiles&page=7`)
  await waitForWorld(page3)
  await page3.waitForSelector('[data-testid="talent-card"]', { timeout: 5_000 }).catch(() => null)
  const cards = (await page3.$$('[data-testid="talent-card"]')).length
  if (cards === PROFILES.length) ok(`[S04] page=7 撲空之後呈現第 0 頁（${cards} 張卡）`)
  else bad('[S04] page=7 撲空之後沒有第 0 頁', `卡片 ${cards} 張`)
  await expectUrl(page3, '[S04] 網址退回', '/world?panel=profiles')
  await page3.screenshot({ path: path.join(OUT, 'page-7-fallback.png') })
  await ctx3.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
