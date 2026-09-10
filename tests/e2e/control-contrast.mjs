// `FE-X13` 的對比度判準（design 的 V1／V2／V3）。
//
// ⚠️⚠️ **這一支只能在真的瀏覽器上跑。**
// jsdom 不載入 CSS，`getComputedStyle` 拿不到 Tailwind 實際算出來的樣式 ——
// 在那裡問「這個按鈕的邊框有多少對比」永遠得到空字串，而測試會**恆真**。
//
// ⚠️ **已知缺口：CI 不會自動跑這一支**（跟 `avatar-pixels.mjs` 一樣，
// 要先起 dev server）。jsdom 那一半的接線由 `tests/control-affordance.test.tsx`
// 守著，但**對比度本身只有這裡在守**。
//
// 用法（要先起前端）：
//
//   node tests/e2e/control-contrast.mjs

import { chromium } from 'playwright-core'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'

/**
 * 規格 `FE-X13-S01`／`S02`／`S04` 的門檻，出處是 WCAG 2.1 SC 1.4.11。
 *
 * ⚠️ **這個數字寫在規格裡，不是這裡的 magic number。**
 * 改它要先改 `openspec/specs/control-affordance/spec.md` ——
 * 那份要經過 PR 審查、有 CI 擋；這個檔案裡的常數任何人都能順手改掉。
 * 兩個外部審查者在第三輪對這一點達成共識（design 的 `D4`）。
 */
const MIN_RATIO = 3

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

/**
 * 在頁面裡量每一個控制項。
 *
 * ⚠️⚠️ **顏色一定要畫出來再讀，不可以 parse 字串**（design 的 `M1`）。
 * `getComputedStyle` 對 `oklch()` 會**原樣回傳**，而那個字串裡的三個數字
 * 看起來很像 rgb —— 第一版的量測腳本就是這樣把 `line` 與 `ink` 都算成
 * `1.00:1`，而那個結果看起來完全合理。
 *
 * canvas 的 `fillStyle` 吃得下每一種 CSS 顏色語法，並且保留 alpha。
 */
const measure = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    const toRgba = (css) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }

    // 緊鄰背景：往上找第一個真的有畫底色的祖先。
    // 都沒有的話就是 body 的底色（`globals.css` 有設）。
    const backdrop = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const c = toRgba(getComputedStyle(n).backgroundColor)
        if (c[3] > 0) return c
      }
      return toRgba(getComputedStyle(document.body).backgroundColor)
    }

    const describe = (el, kind) => {
      const cs = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
        width: parseFloat(cs[`border${s}Width`]),
        style: cs[`border${s}Style`],
        color: toRgba(cs[`border${s}Color`]),
      }))
      return {
        kind,
        label: (
          el.textContent ||
          el.getAttribute('aria-label') ||
          // 輸入框自己沒有文字，去問包著它的 `<label>`。
          // **紅燈要說得出是哪一個框** —— 全部叫「(無標籤)」的話，
          // 三個輸入框的紅燈長得一模一樣。
          el.closest('label')?.textContent ||
          '(無標籤)'
        )
          .trim()
          .slice(0, 24),
        disabled: el.disabled === true,
        w: box.width,
        h: box.height,
        fill: toRgba(cs.backgroundColor),
        // `disabled:opacity-40` 改的是這個，而它不會出現在
        // 背景色或邊框色裡 —— 少了它，S08 量不到差別。
        opacity: parseFloat(cs.opacity),
        cursor: cs.cursor,
        back: backdrop(el),
        sides,
      }
    }

    const inputs = [...document.querySelectorAll('input')].filter(
      (el) => el.type !== 'checkbox' && el.type !== 'radio',
    )
    return [
      ...[...document.querySelectorAll('button')].map((el) => describe(el, '按鈕')),
      ...inputs.map((el) => describe(el, '輸入框')),
    ]
  })

/** 半透明色壓在底色上。**規格說的是「合成後」的對比度。** */
const over = (fg, bg) => {
  const a = fg[3]
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))
}

const luminance = ([r, g, b]) =>
  [r, g, b]
    .map((c) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    .reduce((s, c, i) => s + [0.2126, 0.7152, 0.0722][i] * c, 0)

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 一個控制項的「最好的那個訊號」：填色與四個邊框裡對比最高的一個。
 *
 * ⚠️ **`1px solid transparent` 在這裡自動變成 `1:1`** ——
 * alpha 是 0，合成之後就是底色本身。這是刻意檢查的作弊路徑：
 * 只看 `border-width > 0` 的判準會被它騙過去（design 的 `D1`）。
 */
function bestSignal(c) {
  let best = contrast(over(c.fill, c.back), c.back)
  let how = '填色'
  for (const s of c.sides) {
    if (s.width <= 0 || s.style === 'none') continue
    const r = contrast(over(s.color, c.back), c.back)
    if (r > best) {
      best = r
      how = `${s.width}px 邊框`
    }
  }
  return { ratio: best, how }
}

const browser = await chromium.launch()

try {
  for (const [path, name] of [
    ['/login', '登入畫面'],
    ['/', '首次進入流程'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    // ⚠️ **一定要攔 `/api/me`，而且要回「沒有身分」。**
    //
    // `/` 在問不到身分時會 `router.replace('/world')`（那是刻意的 ——
    // 後端一抖就沒有人進得去的話，代價比誤放大）。所以不攔的話，
    // 這支腳本會在 `/world` 上量，然後回報「一個啟用中的控制項都沒有」
    // —— 而那個紅燈看起來像產品壞了。
    await page.route('**/api/me', (route) => route.fulfill({ status: 401, body: '' }))
    await page.goto(`${FRONTEND}${path}`)
    await page.waitForSelector('button', { timeout: 30_000 })
    // **不要碰任何控制項** —— 規格要求在「未聚焦」的狀態下量（`S04`）。
    const controls = await measure(page)

    const live = controls.filter((c) => !c.disabled)
    if (live.length === 0) {
      bad(`${name}：一個啟用中的控制項都沒有`, '這條判準沒有東西可以量 —— 先確認頁面真的載入了')
    }

    for (const c of live) {
      const { ratio, how } = bestSignal(c)
      const who = `${name} 的${c.kind}「${c.label}」`

      if (c.w <= 0 || c.h <= 0) {
        bad(`${who}沒有面積`, `${c.w}×${c.h} —— 量不到的東西也看不到`)
        continue
      }

      if (ratio >= MIN_RATIO) ok(`${who}：${how} ${ratio.toFixed(2)}:1（下限 ${MIN_RATIO}）`)
      else
        bad(
          `${who}只有 ${ratio.toFixed(2)}:1`,
          `低於下限 ${MIN_RATIO}（最好的訊號是${how}）。` +
            `**看得出來能操作**是規格 FE-X13-S01／S02／S04 的要求 —— ` +
            `preflight 把 <button> 與 <input> 的外觀清光了，要自己加回去。` +
            `⚠️ 用 --color-line（1.27:1）或白底（1.06:1）都不夠`,
        )
    }

    // ── `S08`：`disabled` 看得出來不能按 ───────────────────────
    //
    // ⚠️ **要主動把按鈕設成 `disabled` 再量一次，不能等它自然出現。**
    // 這兩頁載入時每個按鈕都是啟用的（`disabled={busy}` 而 `busy` 是
    // `false`），所以「篩出 disabled 的按鈕來比」會篩到空集合 ——
    // 而那個迴圈跑零次**不會有任何紅燈**，S08 就靜默地沒有被驗到。
    //
    // ⚠️ 這一條不要求 `disabled` 也達 3:1 —— 降低對比正是「不能按」的
    // 正常表達方式，而 S01／S02／S04 都明寫只管啟用中的控制項。
    const before = live.find((c) => c.kind === '按鈕')
    if (before !== undefined) {
      await page.evaluate(() => {
        document.querySelector('button').disabled = true
      })
      const after = (await measure(page)).find((c) => c.kind === '按鈕')
      const differs =
        bestSignal(after).ratio.toFixed(2) !== bestSignal(before).ratio.toFixed(2) ||
        after.opacity !== before.opacity ||
        after.cursor !== before.cursor
      if (differs) ok(`${name}：「${before.label}」在 disabled 之後看得出差別`)
      else
        bad(
          `${name}：「${before.label}」設成 disabled 之後長得一模一樣`,
          '使用者會一直按一個沒有反應的按鈕，然後認定網站壞了（S08）',
        )
    }

    await page.close()
  }

  // ── V3：判準自己抓不抓得到作弊路徑 ──────────────────────────
  //
  // ⚠️ **這一條驗的是判準，不是產品。**
  // 沒有它的話，「所有控制項都通過」也可能是因為這支腳本量錯了。
  const probe = await browser.newPage()
  await probe.setContent(
    '<body style="background:#f7f8fb">' +
      '<button id="cheat" style="border:1px solid transparent;background:transparent">按我</button>' +
      '<button id="real" style="border:1px solid #798191;background:transparent">按我</button>' +
      '</body>',
  )
  const [cheat, real] = await measure(probe)
  const cheatRatio = bestSignal(cheat).ratio
  const realRatio = bestSignal(real).ratio
  if (cheatRatio < MIN_RATIO)
    ok(`1px 透明邊框被擋下來了（${cheatRatio.toFixed(2)}:1，下限 ${MIN_RATIO}）`)
  else
    bad(
      `1px 透明邊框竟然通過了（${cheatRatio.toFixed(2)}:1）`,
      '**判準壞了，不是產品壞了** —— 它八成只檢查了 border-width > 0，沒有做 alpha 合成',
    )
  if (realRatio >= MIN_RATIO)
    ok(`同樣是 1px 邊框，實色的通過了（${realRatio.toFixed(2)}:1）—— 上一條不是恆假的`)
  else
    bad(
      `實色的 1px 邊框也沒通過（${realRatio.toFixed(2)}:1）`,
      '這條判準把所有東西都判死了，上面那條證明不了任何事',
    )
  await probe.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
