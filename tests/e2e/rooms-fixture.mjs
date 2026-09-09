// FE-W12 的瀏覽器驗收：走廊的門依 `GET /api/rooms` 生成。
// 規格 `openspec/changes/fe-w12-interactive-objects/`，Scenario S01–S05、S09–S13。
//
// ─────────────────────────────────────────────────────────────────────
// ⚠️⚠️ 這份截圖證明的是什麼、不是什麼
//
// 它證明：**元件在收到這份資料時會生成這些門、標籤上會出現名稱與在線數。**
//
// 它**不**證明：真的 GuildHub 後端整合可用，也不證明線上的 Vercel 站可用。
// 回應是這支腳本自己攔截並偽造的（`page.route`）——
// 截圖檔名與這段說明都要留著，不得被引用成「整合驗過了」。
//
// 三種主張要分開記錄（change 的 design D1）：
//
//   元件的成功／失敗行為   ← 這支腳本
//   真 GuildHub 整合       ← 只有連得到後端的本機環境
//   Vercel 上可用          ← 今天不能宣稱，那是部署依賴
//
// ⚠️ **必須跑在 `guildhub` adapter 上。** `internal` adapter 在**送出請求之前**
// 就拋 `AdapterNotImplementedError`（`FE-O02-S02` 明文要求），
// 所以網路攔截對它完全無效 —— 畫面會停在「拿不到資料」，而那不是這裡要驗的。
//
// ─────────────────────────────────────────────────────────────────────
// 用法
//
//   1. npm run dev                （預設 adapter 就是 guildhub）
//   2. node tests/e2e/rooms-fixture.mjs
//
//   環境變數：FRONTEND（預設 http://localhost:3100）、
//            HEADED=1（有頭模式）、OUT（截圖目錄，預設 docs/evidence/fe-w12）

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? 'docs/evidence/fe-w12'
const HEADED = process.env.HEADED === '1'
/** 從出生點往西走到走廊要多久（毫秒）。移動速度 4 單位／秒，距離約 10。 */
const WALK_MS = Number(process.env.WALK_MS ?? 2800)

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`

const roomsOf = (count) =>
  Array.from({ length: count }, (_, i) => ({
    project_id: uuid(i + 1),
    title: ['星際導航', '深海測繪', '沙丘物流', '極地補給', '雲端織造', '古書修復',
            '苔原觀測', '潮汐發電', '燈塔重建'][i] ?? `專案 ${i + 1}`,
    online_count: [3, 0, 12, 1, 7, 2, 5, 9, 4][i] ?? 0,
  }))

/** 四種狀態，各拍一張。**空清單與失敗一定要分開拍** —— 它們不得長得一樣。 */
const CASES = [
  { name: 'success-6', rooms: roomsOf(6), note: '剛好排滿走廊' },
  { name: 'overflow-9', rooms: roomsOf(9), note: '超過容量 —— 要說出「另有 3 個沒有顯示」' },
  { name: 'empty', rooms: [], note: '目前沒有公開的專案' },
  { name: 'failed', status: 500, note: '拿不到資料 —— MUST NOT 跟 empty 長得一樣' },
]

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const report = []

  for (const testCase of CASES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    let intercepted = 0

    await page.route('**/api/rooms', async (route) => {
      intercepted += 1
      if (testCase.status !== undefined) {
        await route.fulfill({ status: testCase.status, body: '{"detail":"boom"}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testCase.rooms),
      })
    })

    const response = await page.goto(`${FRONTEND}/world`).catch(() => null)
    if (response === null) {
      throw new Error(`連不到 ${FRONTEND} —— dev server 起了嗎？（npm run dev）`)
    }

    // 等世界真的畫出來（載入中的字消失）。
    await page.waitForSelector('[data-testid="world-loading"]', { state: 'detached', timeout: 30_000 })
    await page.waitForTimeout(1500)

    // ⚠️ **走到走廊去。** 出生點在世界中央，而走廊在最西邊 ——
    // 相機跟著角色，所以站在出生點的時候門根本不在畫面裡。
    // 第一版沒有走，截出來的圖上一扇門都沒有（標籤卻貼在畫面左緣，
    // 那正是這一輪修掉的 bug）。
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(WALK_MS)
    await page.keyboard.up('ArrowLeft')
    await page.waitForTimeout(600)

    const labels = await page.$$eval('[data-testid="door-label"]', (nodes) =>
      nodes.map((n) => ({
        text: n.textContent?.trim() ?? '',
        visible: getComputedStyle(n).visibility === 'visible',
        transform: n.style.transform,
      })),
    )
    const notice = await page
      .$eval('[data-testid="rooms-notice"]', (n) => n.textContent?.trim() ?? '')
      .catch(() => null)

    const file = path.join(OUT, `${testCase.name}.png`)
    await page.screenshot({ path: file })

    report.push({
      case: testCase.name,
      note: testCase.note,
      intercepted,
      labels: labels.length,
      visible: labels.filter((l) => l.visible).length,
      notice,
      sample: labels[0]?.text ?? null,
      screenshot: file,
    })
    console.log(
      `${testCase.name.padEnd(12)} 攔截 ${intercepted} 次｜標籤 ${labels.length} 個` +
        `（可見 ${labels.filter((l) => l.visible).length}）｜說明「${notice ?? '（無）'}」`,
    )
    await context.close()
  }

  await browser.close()
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

  // ⚠️ **這支腳本自己不判定通過與否。** 它產生證據；判準在單元測試那邊。
  // 唯一在這裡失敗的情況是「連不到 dev server」或「一次都沒攔截到」——
  // 後者代表元件根本沒呼叫 `listRooms`，而那時候截圖是沒有意義的。
  const silent = report.filter((r) => r.intercepted === 0)
  if (silent.length > 0) {
    throw new Error(
      `這幾個情況一次請求都沒送出：${silent.map((r) => r.case).join('、')}。` +
        '元件沒有呼叫 listRooms，或者 adapter 不是 guildhub。',
    )
  }
  console.log(`\n證據寫到 ${OUT}/（含 report.json）`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
