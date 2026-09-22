import { CanvasTexture, Color, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, RepeatWrapping } from 'three'
import type { Material, Texture } from 'three'
import { worldColor, type WorldColorName } from '@/design/world'

// 場景元件可用的材質。規格 `FE-W09-S04`／`S06`，像素貼圖是 `FE-W14-S02`／`S03`。
//
// ⚠️ **快取的鍵是（材質類別、顏色 token、影響行為的參數），不是只有顏色。**
// 只用顏色當鍵的話，一個要 `MeshBasicMaterial` 的發光體與一個要
// `MeshStandardMaterial` 的桌子只要同色，第二個要求者就會拿到型別錯誤的實例
// —— 而那是靜默的（畫面上只是「那個東西不吃光」）。
//
// ⚠️⚠️ **回傳的實例是不可變的。** 見 `geometry.ts` 的檔頭：
// `scene.traverse` 就地改寫共用材質是 three.js 圈子的標準慣例
// （參考專案 `26-code-structuring` 的 `Environment.js` 就是那樣寫的），
// 而在共用實例之上它會無差別污染每一個使用同一組參數的物件。
//
// ⚠️ **MUST NOT 對這些實例呼叫 `dispose()`。** 理由同 `geometry.ts`。
//
// ⚠️ **像素貼圖只依 color token 的 hex 程序生成，依 hex 快取一次**（`FE-W14-S02`）。
// 內容用**決定性**的值噪（不是 `Math.random`）—— 同一個 hex 每次都畫出同一張貼圖，
// 截圖可重現，且 render loop 每幀讀共用貼圖、不新建 `CanvasTexture`。
// 沒有 canvas 2D context 的環境（SSR／jsdom）退化為無貼圖純色、不拋錯（`FE-W14-S03`）。

export const MATERIAL_KINDS = ['standard', 'basic'] as const

export type MaterialKind = (typeof MATERIAL_KINDS)[number]

export interface MaterialSpec {
  /** `standard` 吃光與陰影；`basic` 不吃 —— 用在自發光或不該被打光的東西上。 */
  readonly kind: MaterialKind
  readonly color: WorldColorName
  /** 只有 `standard` 有意義。省略時用 three.js 的預設。 */
  readonly roughness?: number
  /** 只有 `standard` 有意義。 */
  readonly metalness?: number
}

// 像素貼圖的固定參數（`FE-W14` 範圍）。雜訊貼圖比木紋小、tiling 密一階。
const NOISE_SIZE = 8
const NOISE_REPEAT = 3
const WOOD_SIZE = 16
const WOOD_REPEAT = 2
/** 木紋上幾條較深的順紋。 */
const WOOD_GRAIN_ROWS = [2, 6, 11, 14] as const
/** 木紋上最深、最明顯的一條板縫。 */
const WOOD_SEAM_ROW = 8

/** `map.name`：讓木紋與一般雜訊在測試（與除錯）中分得出來。 */
export const NOISE_TEXTURE_NAME = 'world-pixel-noise'
export const WOOD_TEXTURE_NAME = 'world-pixel-wood'

const texCache = new Map<string, Texture | null>()

/**
 * 依 base 色算明暗階的十六進位字串（mul<1 變暗、>1 變亮），通道值 clamp 在 0..255。
 *
 * ⚠️ **刻意輸出 `#` 開頭、由 `${}` 插值拼出的十六進位，不用顏色函式字面。**
 * 值是**從 color token 衍生**的 canvas fillStyle（不是硬寫的顏色），但 `FE-X16-S01`
 * 的 DOM token 掃描器是純文字掃描（連註解都掃），會把源碼裡的顏色函式字面攔下來。
 * 這裡源碼裡沒有任何字面色碼，兩個掃描器（`FE-X16-S01`／`FE-W09` 的 hex 掃描）都不誤攔。
 */
function shadeOf(base: Color, mul: number): string {
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
function offscreen2d(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  return { canvas, ctx }
}

/** 把 canvas 變成最近鄰、可重複、指定 tiling 的像素貼圖。 */
function pixelate(texture: CanvasTexture, repeat: number, name: string): CanvasTexture {
  texture.name = name
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

/** 依 hex 內容導出的種子，同一個 hex 永遠一樣。 */
function seedOf(hex: string): number {
  let h = 2166136261
  for (let i = 0; i < hex.length; i += 1) {
    h = Math.imul(h ^ hex.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** 依種子與座標算一個決定性的 [0,1) 值噪 —— 不依賴全域 RNG，貼圖內容可重現。 */
function valueNoise(seed: number, x: number, y: number): number {
  let h = Math.imul(seed ^ (x * 374761393) ^ (y * 668265263), 1274126177)
  h = (h ^ (h >>> 15)) >>> 0
  return h / 0x100000000
}

/** 同色系的雜訊像素貼圖（一般 token 用）。 */
function noiseTexture(hex: string): Texture | null {
  const cached = texCache.get(hex)
  if (cached !== undefined) return cached
  const surface = offscreen2d(NOISE_SIZE)
  if (!surface) {
    texCache.set(hex, null)
    return null
  }
  const base = new Color(hex)
  const shades = [shadeOf(base, 0.88), shadeOf(base, 1), shadeOf(base, 1.1), shadeOf(base, 0.95)]
  const seed = seedOf(hex)
  const { canvas, ctx } = surface
  for (let y = 0; y < NOISE_SIZE; y += 1) {
    for (let x = 0; x < NOISE_SIZE; x += 1) {
      ctx.fillStyle = shades[Math.floor(valueNoise(seed, x, y) * shades.length)] ?? shadeOf(base, 1)
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const texture = pixelate(new CanvasTexture(canvas), NOISE_REPEAT, NOISE_TEXTURE_NAME)
  texCache.set(hex, texture)
  return texture
}

// 木頭專用貼圖：**橫向木紋**（順紋的深淺條紋＋幾條深色紋路＋一條板縫）。
// 隨機雜訊在木頭上讀起來像砂紙 —— 木頭的訊號是「一條條順著長邊的紋」。
function woodTexture(hex: string): Texture | null {
  const key = `wood:${hex}`
  const cached = texCache.get(key)
  if (cached !== undefined) return cached
  const surface = offscreen2d(WOOD_SIZE)
  if (!surface) {
    texCache.set(key, null)
    return null
  }
  const base = new Color(hex)
  const { canvas, ctx } = surface
  // 順紋：每一列一點深淺變化，像木頭的年輪順著長邊走
  for (let y = 0; y < WOOD_SIZE; y += 1) {
    const streak = 0.9 + (Math.sin(y * 1.7) * 0.5 + 0.5) * 0.2
    ctx.fillStyle = shadeOf(base, streak)
    ctx.fillRect(0, y, WOOD_SIZE, 1)
  }
  // 幾條深色紋路
  ctx.fillStyle = shadeOf(base, 0.76)
  for (const y of WOOD_GRAIN_ROWS) ctx.fillRect(0, y, WOOD_SIZE, 1)
  // 板縫（最深、最明顯的一條）
  ctx.fillStyle = shadeOf(base, 0.6)
  ctx.fillRect(0, WOOD_SEAM_ROW, WOOD_SIZE, 1)
  const texture = pixelate(new CanvasTexture(canvas), WOOD_REPEAT, WOOD_TEXTURE_NAME)
  texCache.set(key, texture)
  return texture
}

/** 這個 token 是否用木紋貼圖（其餘 token 用雜訊）。 */
function isWoodToken(color: WorldColorName): boolean {
  return color === 'wood' || color === 'woodDark'
}

function build(spec: MaterialSpec): Material {
  const hex = worldColor(spec.color)
  const color = new Color(hex)
  // `basic`（自發光體）不加貼圖 —— 它自己是光源的外觀，不吃光也不要材質雜訊。
  if (spec.kind === 'basic') return new MeshBasicMaterial({ color })
  const map = isWoodToken(spec.color) ? woodTexture(hex) : noiseTexture(hex)
  return new MeshStandardMaterial({
    color,
    // 沒有 2D context 時 `map` 為 null，退化為純色（`FE-W14-S03`）。
    ...(map ? { map } : {}),
    ...(spec.roughness === undefined ? {} : { roughness: spec.roughness }),
    ...(spec.metalness === undefined ? {} : { metalness: spec.metalness }),
  })
}

const cache = new Map<string, Material>()

function keyOf(spec: MaterialSpec): string {
  return `${spec.kind}|${spec.color}|${spec.roughness ?? '-'}|${spec.metalness ?? '-'}`
}

/**
 * 取一個材質。同一組參數回同一個實例。
 *
 * ⚠️ **不要 `dispose()` 它，也不要改它的屬性**（見檔頭）。
 */
export function materialFor(spec: MaterialSpec): Material {
  if (!(MATERIAL_KINDS as readonly string[]).includes(spec.kind)) {
    throw new Error(
      `沒有「${String(spec.kind)}」這種材質類別。合法的有：${MATERIAL_KINDS.join('、')}。`,
    )
  }
  const key = keyOf(spec)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const made = build(spec)
  cache.set(key, made)
  return made
}
