// `FE-R10-S10` 的端到端驗收：**兩個獨立登入身分，互相看得見對方的名字。**
//
// ⚠️⚠️ **這一支是 `FE-R10` 封存前的最後一道門，而它刻意不偽造任何東西。**
//
// 規格 `openspec/changes/fe-r10-presence/specs/remote-players/spec.md`〈兩個獨立登入身分互相看得到姓名〉
// 與 design `D5`：驗收 MUST 用兩個**隔離 cookie** 的 browser context，MUST NOT 用共用 cookie 的兩個普通分頁
// 冒充兩個登入身分；判準 MUST 是遠端角色旁**實際可見的姓名**，MUST NOT 用隱藏 DOM、測試專用標籤或只檢查 state。
//
// 所以這裡：
//   - 名字牌的文字直接從 `[data-testid="name-tag"]` 的 `textContent` 讀（`FE-W08` 畫的那塊真的 DOM），
//     而且還要量 `visibility`、`getBoundingClientRect()` —— **在 DOM 裡不等於看得見**。
//   - 兩邊的名字是**這一次執行才產生的**（帶亂數尾碼）：寫死的名字會讓腳本在一個殘留的資料庫上假綠。
//   - 一個 context 一個身分，cookie 不共用。
//
// **可拋棄的本機後端與測試資料庫**（task 4.2：不使用團隊共用環境）：
//
//   # 1. 一個只給這支用的庫，跑完可以直接 drop
//   docker exec guildhub-db psql -U guildhub -d postgres -c 'DROP DATABASE IF EXISTS guildhub_r10_s10' -c 'CREATE DATABASE guildhub_r10_s10'
//   export DB=postgresql://guildhub:guildhub@localhost:5432/guildhub_r10_s10
//   INTERNAL_DATABASE_URL=$DB node scripts/db.mjs reset --init && INTERNAL_DATABASE_URL=$DB node scripts/db.mjs seed
//
//   # 2. 本地後端（Route Handlers ＋ Postgres）＋ 即時層替身（`FE-O03`，照 `protocol.py` 寫、從同一個庫查名片）
//   INTERNAL_REALTIME_PORT=3102 INTERNAL_DATABASE_URL=$DB pnpm exec tsx scripts/realtime-stub.ts &
//   NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_DATA_ADAPTER=internal NEXT_PUBLIC_REALTIME_ADAPTER=guildhub \
//     NEXT_PUBLIC_GUILDHUB_WS=ws://localhost:3102/ws INTERNAL_DATABASE_URL=$DB pnpm run build
//   … 同一組環境變數 … pnpm exec next start -p 3101 &
//
//   # 3. 跑
//   FRONTEND=http://localhost:3101 node tests/e2e/two-browsers-names.mjs
//
// ⚠️ **名字是從資料庫來的，不是從前端來的。** 兩個 context 各自打 `POST /api/login` 拿到自己的簽章 session cookie，
// 即時層替身**解 cookie、查名片表**才知道這條連線叫什麼名字 —— 跟真後端 `auth.py` 同一條路（`BE-G02` 修好的那條）。
// 前端從頭到尾沒有機會「知道」對方叫什麼，除非那個名字真的走完 DB → WS → snapshot → roster → 名字牌。

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { assertLoopback, bad, failureCount, guardLoopback, ok, waitForWorld } from './lib/world.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3101'
const OUT = process.env.OUT ?? 'docs/evidence/fe-r10'
const HEADED = process.env.HEADED === '1'
assertLoopback(FRONTEND)

/** 這一次執行專屬的尾碼。**寫死的名字會在殘留的資料庫上假綠** —— 上一次跑剩下的那個人也叫這個名字。 */
const STAMP = Math.random().toString(36).slice(2, 6)
const JIA = `甲${STAMP}`
const YI = `乙${STAMP}`

const TAGS = '[data-testid="name-tag"]'
/** 牌子的文字 ＋ 它到底看不看得見。**只讀 `textContent` 會讓 `visibility:hidden` 的牌子算通過。** */
const tagsOf = (page) =>
  page.$$eval(TAGS, (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { text: el.textContent ?? '', visibility: getComputedStyle(el).visibility, width: r.width, height: r.height, x: r.x, y: r.y }
    }),
  )
/** 等到畫面上出現**文字正好是 `name`、而且 visible** 的牌子。等不到就回 false，由呼叫端印出現況。 */
const waitTag = (page, name) =>
  page
    .waitForFunction(
      (n) => {
        const el = [...document.querySelectorAll('[data-testid="name-tag"]')].find((t) => t.textContent === n)
        return el !== undefined && getComputedStyle(el).visibility === 'visible'
      },
      name,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false)

/**
 * 真的登入一個身分。打的是同源的 `POST /api/login` → 本地 Postgres，拿回簽章的 HttpOnly session cookie。
 *
 * ⚠️ **拿不到恢復金鑰時要說出畫面上有什麼。** 少了這一段，紅燈只會說「等 `[data-testid=recovery-key]` 逾時」，
 * 而那句話對「後端拒絕了這個名字」「按鈕沒被點到」「資料庫沒起來」是同一句 —— 這個專案為了「證據被吞掉」繞過很多遠路。
 */
async function login(context, name) {
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/login`)
  const FORM = 'form[aria-labelledby="nickname-heading"]'
  await page.waitForSelector(`${FORM} input`, { timeout: 30_000 })
  await page.fill(`${FORM} input`, name)
  await page.click(`${FORM} button[type="submit"]`)
  try {
    await page.waitForSelector('[data-testid="recovery-key"]', { timeout: 30_000 })
  } catch {
    const alert = await page.locator('[role=alert]').allTextContents()
    const body = (await page.textContent('body'))?.replace(/\s+/g, ' ').trim().slice(0, 300)
    throw new Error(`${name} 沒有登入成功。\n   畫面上的警告：${alert.join(' / ') || '（沒有）'}\n   畫面文字：${body}`)
  }
  await page.goto(`${FRONTEND}/world`)
  await waitForWorld(page)
  return page
}

/**
 * **這個 context 的 cookie 真的是它自己那個身分的。**
 *
 * ⚠️⚠️ **少了這一條，整支腳本就守不住規格那句「MUST NOT 用共用 cookie 的兩個分頁冒充兩個登入身分」。**
 * 實測（合併前的突變）：把兩個 context 改成同一個 context 的兩個分頁，上面那些判準**全部照樣綠** ——
 * 因為第二次登入雖然把 cookie 蓋掉了，第一個分頁那條 WS 的身分是**握手當下**決定的，之後不會變。
 * 也就是說「兩邊看得到彼此的名字」這件事**分不出**「兩個身分」與「一個身分加一條過期的連線」。
 *
 * 所以這裡直接問伺服器：用這個 context **現在**的 cookie 打 `GET /api/me`，回來的名片要是自己。
 * 共用 cookie 的話，先登入的那一邊會拿到**後登入的那個人**的名片 —— 紅。
 *
 * ⚠️ 用 `page.request`（它跟 context 共用同一個 cookie jar），不用 `page.evaluate` 裡的 `fetch` ——
 * 後者是瀏覽器端的程式碼，但 `no-restricted-globals` 那條規則（`fetch` 只准出現在 `src/api/`）分不出來，lint 會紅。
 */
async function assertOwnSession(page, me) {
  const response = await page.request.get(`${FRONTEND}/api/me`)
  const mine = response.ok() ? await response.json() : { error: response.status() }
  if (mine.display_name === me) ok(`[S10] ${me} 的 cookie 還是自己的 session（/api/me 回「${mine.display_name}」）`)
  else
    bad(
      `[S10] ${me} 的 cookie 不是自己的 session`,
      `/api/me 回 ${JSON.stringify(mine)} —— 兩個身分共用了 cookie。` +
        '規格明文：MUST NOT 使用共用 cookie 的兩個普通分頁冒充兩個登入身分',
    )
}

/** 一邊的完整判準：看得到對方、只看得到對方、而且真的看得見。 */
async function assertSees(page, me, other) {
  const seen = await waitTag(page, other)
  const tags = await tagsOf(page)
  const texts = tags.map((t) => t.text)
  if (seen) ok(`[S10] ${me} 的畫面上看得到「${other}」的名字牌`)
  else
    bad(
      `[S10] ${me} 的畫面上沒有「${other}」的名字牌`,
      `畫面上的牌子：${JSON.stringify(texts)}。` +
        '兩個人都在同一個 scene 嗎（兩條 WS 都連上替身）？名字有走完 DB → snapshot → roster → 牌子嗎？',
    )

  // 「不是共用 fallback」—— `BE-G02` 那一段歷史：一整片「訪客」看起來像前端壞了。
  const FALLBACK = ['訪客', '未命名', 'Guest', 'Anonymous', '玩家']
  const fallback = texts.filter((t) => FALLBACK.includes(t.trim()))
  if (fallback.length === 0) ok(`[S10] ${me} 看到的不是共用 fallback`)
  else bad(`[S10] ${me} 的畫面上有 fallback 名字`, `${JSON.stringify(fallback)} —— session 的名字沒有被讀出來（規格明文禁止替代字）`)

  // 「不是自己的姓名」—— 自己不該有名字牌（`FE-W08`），所以自己的名字一次都不該出現在牌子上。
  if (!texts.includes(me)) ok(`[S10] ${me} 沒有看到自己的名字（自己沒有牌子）`)
  else bad(`[S10] ${me} 在牌子上看到自己的名字`, `${JSON.stringify(texts)} —— 名單把自己也當成遠端玩家了`)

  // 恰好一塊：多出來的那塊代表離開的人沒清掉，或同一個人被算成兩個。
  if (texts.length === 1) ok(`[S10] ${me} 的畫面上恰有一塊名字牌`)
  else bad(`[S10] ${me} 的畫面上有 ${texts.length} 塊名字牌`, JSON.stringify(texts))

  // **在 DOM 裡不等於看得見。** 量出來的牌子要有面積、要 visible、要在視窗內。
  const tag = tags.find((t) => t.text === other)
  if (tag) {
    const size = await page.viewportSize()
    const onScreen = tag.x >= 0 && tag.y >= 0 && tag.x + tag.width <= size.width && tag.y + tag.height <= size.height
    if (tag.visibility === 'visible' && tag.width > 0 && tag.height > 0 && onScreen)
      ok(`[S10] 「${other}」的牌子真的看得見：${Math.round(tag.width)}×${Math.round(tag.height)} px＠(${Math.round(tag.x)}, ${Math.round(tag.y)})`)
    else bad(`[S10] 「${other}」的牌子在 DOM 裡但看不見`, `${JSON.stringify(tag)}，視窗 ${JSON.stringify(size)}`)
  }
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const viewport = { width: 1280, height: 720 }
  // **兩個 context，不是兩個分頁** —— 分頁共用 cookie，兩邊會是同一個身分，
  // 而 `FE-R06` 的分頁協調還會讓第二個分頁根本不連線（規格明文禁止用分頁冒充）。
  const ctxJia = await browser.newContext({ viewport })
  const ctxYi = await browser.newContext({ viewport })
  guardLoopback(ctxJia)
  guardLoopback(ctxYi)

  const pageJia = await login(ctxJia, JIA)
  const pageYi = await login(ctxYi, YI)

  // 先證明兩邊真的是兩個身分（cookie 沒共用），再看它們互相看到什麼 ——
  // 順序刻意：身分沒隔離的話，下面那些「看得到對方的名字」全部沒有意義。
  await assertOwnSession(pageJia, JIA)
  await assertOwnSession(pageYi, YI)
  await assertSees(pageJia, JIA, YI)
  await assertSees(pageYi, YI, JIA)

  await pageJia.screenshot({ path: path.join(OUT, 'two-browsers-jia.png') })
  await pageYi.screenshot({ path: path.join(OUT, 'two-browsers-yi.png') })

  await ctxJia.close()
  await ctxYi.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  const n = failureCount()
  console.log(n === 0 ? `\n全部通過（${JIA} ／ ${YI}）` : `\n${n} 條紅`)
  process.exit(n === 0 ? 0 : 1)
}
