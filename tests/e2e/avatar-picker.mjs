// `FE-A05` 的瀏覽器驗證（design 的 `V1`／`V3`／`V8`）。
//
// ⚠️⚠️ **這一支存在的理由是「選了角色，畫面上真的看得出來」。**
//
// `tests/avatar-picker.test.tsx` 驗的是狀態流轉（選了→草稿變、存失敗→不重連），
// **在 jsdom 裡，沒有一個像素被畫出來**。而這一列整個存在的理由，
// 就是 WBS 那句警告：「使用者選完之後自己的外觀不變⋯⋯那是製造錯誤期待不是 MVP」。
//
// ⚠️ **已知缺口：`V4`（B 先在場、A 儲存之後 B 看到新外觀）不在這一支裡。**
// 那條要兩個真的瀏覽器**加上真的後端** —— `avatar_id` 要真的落地、
// session 要真的被重讀。這一支完全不碰後端（`/api/me` 是攔下來的），
// 所以它問不了那個問題。
//
// 用法（要先起前端）：
//
//   node tests/e2e/avatar-picker.mjs

import { chromium } from 'playwright-core'
import { burst, stableDiff } from './lib/pixels.mjs'

const FRONTEND = process.env.FRONTEND ?? 'http://127.0.0.1:3100'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

const PROFILE = {
  id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  display_name: '選角測試員',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
}

/**
 * 訊號下限。**沿用 `FE-W19` 的 `SIGNAL_FLOOR`**，理由是同一個模型、
 * 同一組換色 —— 只是這次觸發它的是使用者按了一個按鈕，而不是後端送來的值。
 */
const SIGNAL_FLOOR = 500

/** 雜訊上限。`FE-W19` 實測同一個 `av` 兩次是 0；這裡是同一頁不動，只會更低。 */
const NOISE_CEILING = 50

/** 規格 `FE-A05-S12` 的門檻，沿用 `control-affordance` 的 `3:1`。 */
const MIN_RATIO = 3

let failures = 0
const ok = (l) => console.log(`✅ ${l}`)
const bad = (l, d) => {
  failures++
  console.log(`❌ ${l}\n   ${d}`)
}

/**
 * 量一個控制項與它緊鄰背景的對比度。
 *
 * ⚠️ **顏色一定要畫出來再讀，不可以 parse 字串** —— `getComputedStyle`
 * 對 `oklch()` 會原樣回傳，直接 parse 會算出 `1.00:1` 而且看起來很合理。
 * 這個坑在 `FE-X13` 踩過（見 `control-contrast.mjs`）。
 */
const measureControl = (page, selectorText) =>
  page.evaluate((text) => {
    const el = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === text,
    )
    if (!el) return null
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
    const backdrop = (node) => {
      for (let n = node.parentElement; n; n = n.parentElement) {
        const c = toRgba(getComputedStyle(n).backgroundColor)
        if (c[3] > 0) return c
      }
      return toRgba(getComputedStyle(document.body).backgroundColor)
    }
    const cs = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    // ⚠️ **「在 DOM 裡」不等於「看得見」**（`S13`）。
    // 這裡直接問瀏覽器：這個座標上最上面的元素是不是它自己？
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const top = document.elementFromPoint(cx, cy)
    return {
      w: box.width,
      h: box.height,
      onTop: top === el || el.contains(top),
      fill: toRgba(cs.backgroundColor),
      back: backdrop(el),
      sides: ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
        width: parseFloat(cs[`border${s}Width`]),
        style: cs[`border${s}Style`],
        color: toRgba(cs[`border${s}Color`]),
      })),
    }
  }, selectorText)

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
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

/** 填色與四個邊框裡對比最高的那一個。`1px solid transparent` 在這裡是 `1:1`。 */
function bestSignal(c) {
  let best = contrast(over(c.fill, c.back), c.back)
  for (const s of c.sides) {
    if (s.width <= 0 || s.style === 'none') continue
    best = Math.max(best, contrast(over(s.color, c.back), c.back))
  }
  return best
}

const browser = await chromium.launch({ args: ARGS })

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PROFILE),
    }),
  )
  const page = await context.newPage()
  await page.goto(`${FRONTEND}/world`)
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="world-loading"]') === null,
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2500)

  // ── `S11`／`S12`／`S13`：入口一直都在、看得見、沒被蓋住 ─────
  //
  // ⚠️ **這一組量的時候還沒有點過任何東西** —— 規格說的是
  // 「不需要使用者先做任何操作就看得見」。
  const entry = await measureControl(page, '更換角色')
  if (entry === null) {
    bad(
      '畫面上沒有「更換角色」這個入口',
      '**選擇器做好了而沒有人找得到入口，就是這個專案第三次踩同一個坑**' +
        '（六扇門的 10 像素細縫、隱形的輸入框）。規格 `FE-A05-S11`',
    )
  } else {
    if (entry.w > 0 && entry.h > 0) ok(`入口有面積（${entry.w.toFixed(0)}×${entry.h.toFixed(0)}）`)
    else bad('入口沒有面積', `${entry.w}×${entry.h} —— 量不到的東西也看不到`)

    if (entry.onTop) ok('入口沒有被別的東西蓋住')
    else
      bad(
        '入口被蓋住了',
        '**「它在 DOM 裡」不等於「看得見」**（`S13`）—— 3D 畫布或某個疊層壓在上面',
      )

    const ratio = bestSignal(entry)
    if (ratio >= MIN_RATIO) ok(`入口與背景的對比 ${ratio.toFixed(2)}:1（下限 ${MIN_RATIO}）`)
    else
      bad(
        `入口與背景只有 ${ratio.toFixed(2)}:1`,
        `低於下限 ${MIN_RATIO}（規格 S12，沿用 control-affordance 的門檻）`,
      )
  }

  // ── `V1`：選了另一個角色，世界裡的自己真的改變 ──────────────
  const before = await burst(page, 3)
  if (before.some((f) => f === null)) {
    bad('拿不到 WebGL context', '世界沒有畫出 canvas —— 那是環境的問題，不是這條判準的')
  } else {
    // 正向對照：同一個狀態連拍兩組，差異要接近 0。
    // **沒有它，底下那條說明不了什麼。**
    const noise = stableDiff(before, await burst(page, 3))
    if (noise <= NOISE_CEILING) ok(`什麼都沒做時的保守差異 ${noise}（上限 ${NOISE_CEILING}）`)
    else
      bad(
        `什麼都沒做就差了 ${noise} 個像素`,
        '這條判準的尺壞了 —— 在修產品之前先修這裡',
      )

    await page.click('button:has-text("更換角色")')
    await page.click('button:has-text("角色 2")')
    await page.waitForTimeout(800)
    const picked = await burst(page, 3)

    const signal = stableDiff(before, picked)
    if (signal >= SIGNAL_FLOOR)
      ok(`選了另一個角色之後，畫面差了 ${signal} 個像素（下限 ${SIGNAL_FLOOR}，雜訊 ${noise}）`)
    else
      bad(
        `選了另一個角色，畫面只差了 ${signal} 個像素`,
        `低於下限 ${SIGNAL_FLOOR}。**這正是 WBS 警告的那件事** ——` +
          `「使用者選完之後自己的外觀不變⋯⋯那是製造錯誤期待不是 MVP」。` +
          '⚠️ 第一嫌疑：WorldCanvas 讀的是已儲存值而不是草稿（規格 S01）',
      )

    // ── `S03`：取消之後，預覽要回到已儲存的那一個 ──────────────
    await page.click('button:has-text("取消")')
    await page.waitForTimeout(800)
    const cancelled = await burst(page, 3)

    const restored = stableDiff(before, cancelled)
    if (restored <= NOISE_CEILING)
      ok(`取消之後畫面回到原樣（差 ${restored}，上限 ${NOISE_CEILING}）`)
    else
      bad(
        `取消之後畫面沒有回到原樣（差了 ${restored} 個像素）`,
        '**畫面停在使用者沒有選的那一個角色**（規格 S03）—— ' +
          '關閉選擇器時要把草稿丟掉',
      )
  }

  await context.close()
} catch (e) {
  bad('腳本中途爆掉', e.message)
} finally {
  await browser.close()
  console.log(failures === 0 ? '\n全部通過' : `\n${failures} 條紅`)
  process.exit(failures === 0 ? 0 : 1)
}
