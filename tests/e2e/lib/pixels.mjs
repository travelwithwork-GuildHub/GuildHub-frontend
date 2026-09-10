// 從真的 WebGL 讀像素、並且比較兩組畫面。
//
// ⚠️ **這一份是從 `avatar-pixels.mjs` 抽出來的，不是新寫的。**
// `FE-A05` 的驗證要問跟 `FE-W19` 一模一樣的問題（「畫面上真的看得出差別嗎」），
// 而兩份實作一定會漂 —— 尤其是底下那兩個常數與那個多幀交集的演算法。

/** 差異像素的門檻：RGB 任一通道絕對差 `≥ 32/255`（`FE-W19` design 的 D1）。 */
export const CHANNEL = 32

/**
 * 讀 WebGL 的 back buffer。
 *
 * ⚠️ **一定要在 `requestAnimationFrame` 裡讀，不能用截圖或 `toDataURL()`。**
 * 畫布沒有開 `preserveDrawingBuffer`，截圖取到的是**全透明** ——
 * 這個坑在 `FE-A06` 踩過一次，症狀是「3D 世界一片空白」而產品其實好好的。
 *
 * ⚠️⚠️ **不可以回傳 `Array.from(px)`。** Playwright 會把回傳值 JSON 序列化，
 * 而那是 1440×900×4 = 518 萬個 JS number，一幀就好幾十 MB。
 * 實測後果不是「比較慢」而是**整台機器開始 swap**（`FE-W19` 那次卡了 35 分鐘，
 * 而 dev server 的 log 顯示頁面早就載入完了）。
 */
export const grab = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.querySelector('canvas')
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
        if (!gl) return resolve(null)
        requestAnimationFrame(() => {
          const w = gl.drawingBufferWidth
          const h = gl.drawingBufferHeight
          const px = new Uint8Array(w * h * 4)
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
          let s = ''
          const CHUNK = 8192
          for (let i = 0; i < px.length; i += CHUNK)
            s += String.fromCharCode.apply(null, px.subarray(i, i + CHUNK))
          resolve({ w, h, b64: btoa(s) })
        })
      }),
  )

/** base64 → `Buffer`。`stableDiff` 只用索引讀，所以呼叫端完全不用改。 */
export const decode = (f) =>
  f === null ? null : { w: f.w, h: f.h, px: Buffer.from(f.b64, 'base64') }

/**
 * **保守差異**：一個像素只有在「A 的每一幀 vs B 的每一幀都不同」時才算數。
 *
 * ⚠️ **這是為了 idle 動畫。** 真實的世界沒有固定姿勢 —— 角色的手腳與起伏
 * 一直在動。單幀相減時那些動作也算差異（`FE-W19` 實測基線 496 像素，
 * 而訊號只有 1285，信噪比 2.6:1，太弱）。
 *
 * 取交集就把它濾掉了：**動畫造成的差異在不同幀的位置會變，換色造成的不會。**
 * 實測基線因此降到 **0**。
 */
export function stableDiff(as, bs) {
  let count = 0
  outer: for (let i = 0; i < as[0].px.length; i += 4) {
    for (const a of as)
      for (const b of bs) {
        const d = Math.max(
          Math.abs(a.px[i] - b.px[i]),
          Math.abs(a.px[i + 1] - b.px[i + 1]),
          Math.abs(a.px[i + 2] - b.px[i + 2]),
        )
        if (d < CHANNEL) continue outer
      }
    count++
  }
  return count
}

/** 連拍幾幀。`stableDiff` 要靠多幀取交集才濾得掉動畫。 */
export async function burst(page, frames = 3, gapMs = 220) {
  const out = []
  for (let i = 0; i < frames; i++) {
    out.push(decode(await grab(page)))
    if (i < frames - 1) await page.waitForTimeout(gapMs)
  }
  return out
}
