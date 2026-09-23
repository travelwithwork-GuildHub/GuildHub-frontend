import { NearestFilter, NearestMipmapLinearFilter, RepeatWrapping } from 'three'
import type { CanvasTexture, Color } from 'three'

// 像素貼圖的共用底層工具。規格 `FE-W14-S02`／`S03`／`S04`。
//
// ⚠️ **這個檔案刻意不 `new` 任何 GPU 資源**（`CanvasTexture`／`Geometry`／`Material`）。
// 它只做：離屏 canvas 2D context、把既有貼圖設成最近鄰、決定性的值噪、由 token 衍生的明暗階。
// 真正 `new CanvasTexture` 的是 `material.ts`（雜訊／木紋）與 `grass.ts`（草地）——
// 那兩個檔案才被 `FE-W07` 的 GPU 資源涵蓋率抓進 leak-harness。這裡不建資源，所以不需登記。
//
// ⚠️ 顏色一律**由 color token 衍生**、輸出 `#` 開頭的十六進位字串（由 `${}` 插值拼出、
// 源碼裡沒有字面色碼）—— `FE-X16-S01` 的 DOM token 掃描器與 `FE-W09` 的 hex 掃描都不誤攔。

/**
 * 依 base 色算明暗階的十六進位字串（mul<1 變暗、>1 變亮），通道值 clamp 在 0..255。
 */
export function shadeOf(base: Color, mul: number): string {
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * mul)))
  const hex2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex2(channel(base.r))}${hex2(channel(base.g))}${hex2(channel(base.b))}`
}

/**
 * 建一個 `size`×`size` 的離屏 canvas 2D context。
 *
 * 沒有 `document`（SSR）或環境不提供 canvas 2D context（jsdom 沒裝 `canvas` 套件）時回 `null`
 * —— 呼叫端據此退化為無貼圖純色（`FE-W14-S03`）。**這是唯一呼叫 `getContext` 的地方。**
 */
export function offscreen2d(
  size: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  return { canvas, ctx }
}

/** 把 canvas 貼圖設成最近鄰放大、可重複、指定 tiling 的像素貼圖。 */
export function pixelate(texture: CanvasTexture, repeat: number, name: string): CanvasTexture {
  texture.name = name
  // ⚠️ **`magFilter` 最近鄰、`minFilter` 走 mipmap（`FE-W14-S02`，走動穩定）。**
  // 放大（近看）用 `NearestFilter` → 硬像素外觀不變；縮小（遠看／移動）走 mipmap → 不再每幀取到不同 texel 而爬行／閃。
  // 低有效 DPR 下無 mipmap 的 minification 是「走動時地面／牆整片爬」的成因之一（見 change fe-w14-motion-stability）。
  texture.magFilter = NearestFilter
  texture.minFilter = NearestMipmapLinearFilter
  texture.generateMipmaps = true
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

/** 依字串內容導出的種子，同一個字串永遠一樣。 */
export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** 依種子與座標算一個決定性的 [0,1) 值噪 —— 不依賴全域 RNG，貼圖內容可重現。 */
export function valueNoise(seed: number, x: number, y: number): number {
  let h = Math.imul(seed ^ (x * 374761393) ^ (y * 668265263), 1274126177)
  h = (h ^ (h >>> 15)) >>> 0
  return h / 0x100000000
}
