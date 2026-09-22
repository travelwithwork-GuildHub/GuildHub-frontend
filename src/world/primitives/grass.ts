import { CanvasTexture, Color, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { BufferGeometry, Material, Texture } from 'three'
import { worldColor } from '@/design/world'
import { offscreen2d, pixelate, seedOf, shadeOf, valueNoise } from './pixelTexture'

// 像素草地的共用 resource factory。規格 `FE-W14-S04`（design D4）。
//
// ⚠️ **`WorldShell` 不自己 `new CanvasTexture`。** 草地的貼圖與 plane geometry 的
// GPU 資源所有權在這裡 —— 模組級快取、回傳不可變、消費者 MUST NOT `dispose()`，
// 跟 `geometry.ts`／`material.ts` 走同一條路（`world-environment`「場景元件 MUST NOT
// 直接建立 GPU 資源」與「誰負責釋放」）。
//
// ⚠️ 這個檔案 `new` GPU 資源（`CanvasTexture`／`PlaneGeometry`／`MeshStandardMaterial`），
// 所以被 `FE-W07` 的 GPU 資源涵蓋率抓進 leak-harness（`tests/e2e/leak-harness/main.tsx`）。
// 少登記的話 `tests/leak-coverage.test.ts` 會紅。
//
// ⚠️ 草地的多階綠**由 `ground`／`leaf` color token 衍生**（不硬寫 hex）—— 同一個色票來源，
// 掃描器不誤攔，之後調地面色草地會跟著變。

const GRASS_SIZE = 16
/** 疊在雜訊上的深色草葉數（決定性擺放）。 */
const GRASS_BLADES = 10
/** 草葉的高度（像素）。 */
const BLADE_HEIGHT = 2

export const GRASS_TEXTURE_NAME = 'world-pixel-grass'

/**
 * 像素草地 plane 疊在地面的高度（世界 y）。
 * ⚠️ **必須落在主地板頂面（y=0）與 carpet 頂面（`carpetDefinition`：0.02）之間、且與兩者都不共面。**
 * 共面 = z-fighting：W14 一度把草地設在 0.02，剛好等於 carpet 頂面，於是黃色地毯（走道）一直閃。
 * 深度精度在這個相機下約 1e-4，所以 ~0.01 的間距綽綽有餘。分層由 `tests/world-ground-layers.test.ts` 釘住。
 */
export const GRASS_Y = 0.01

/** 由 `ground` 衍生的幾階綠（深淺拉開），草葉用更深的 `leaf`。 */
function grassShades(): { fill: string[]; blade: string } {
  const ground = new Color(worldColor('ground'))
  const leaf = new Color(worldColor('leaf'))
  return {
    fill: [shadeOf(ground, 0.9), shadeOf(ground, 1), shadeOf(ground, 0.8), shadeOf(ground, 1.1), shadeOf(ground, 0.75)],
    blade: shadeOf(leaf, 1),
  }
}

const textureCache = new Map<number, Texture | null>()
const geometryCache = new Map<number, BufferGeometry>()
const materialCache = new Map<number, Material>()

/**
 * 像素草地貼圖（`NearestFilter`、`RepeatWrapping`，tiling = `repeat`）。依 `repeat` 快取。
 *
 * 沒有 canvas 2D context（SSR／jsdom）時回 `null`，呼叫端退化為無貼圖純色。
 */
export function grassTexture(repeat: number): Texture | null {
  const cached = textureCache.get(repeat)
  if (cached !== undefined) return cached
  const surface = offscreen2d(GRASS_SIZE)
  if (!surface) {
    textureCache.set(repeat, null)
    return null
  }
  const { canvas, ctx } = surface
  const { fill, blade } = grassShades()
  const seed = seedOf(GRASS_TEXTURE_NAME)
  // 底噪：每個像素從幾階綠裡挑一個（決定性）
  for (let y = 0; y < GRASS_SIZE; y += 1) {
    for (let x = 0; x < GRASS_SIZE; x += 1) {
      ctx.fillStyle = fill[Math.floor(valueNoise(seed, x, y) * fill.length)] ?? fill[1] ?? blade
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // 深色草葉：決定性擺放的短直痕，讓它讀起來像草而不是綠色雜訊
  ctx.fillStyle = blade
  for (let i = 0; i < GRASS_BLADES; i += 1) {
    const x = Math.floor(valueNoise(seed, i, 100) * GRASS_SIZE)
    const y = Math.floor(valueNoise(seed, i, 200) * (GRASS_SIZE - BLADE_HEIGHT))
    ctx.fillRect(x, y, 1, BLADE_HEIGHT)
  }
  const texture = pixelate(new CanvasTexture(canvas), repeat, GRASS_TEXTURE_NAME)
  textureCache.set(repeat, texture)
  return texture
}

/**
 * 草地 plane 的 geometry（邊長 `size` 的方形平面）。依 `size` 快取、不可變。
 *
 * ⚠️ **MUST NOT 對它 `dispose()`** —— 它是 factory 擁有的共用實例（同 `geometry.ts`）。
 */
export function grassGeometry(size: number): BufferGeometry {
  const cached = geometryCache.get(size)
  if (cached !== undefined) return cached
  const geometry = new PlaneGeometry(size, size)
  geometryCache.set(size, geometry)
  return geometry
}

/**
 * 草地材質（`MeshStandardMaterial`，`map` 是像素草地貼圖、`roughness` 1）。依 `repeat` 快取、不可變。
 *
 * ⚠️ **MUST NOT 對它 `dispose()` 或就地改屬性** —— factory 擁有的共用實例。
 */
export function grassMaterial(repeat: number): Material {
  const cached = materialCache.get(repeat)
  if (cached !== undefined) return cached
  const map = grassTexture(repeat)
  const material = new MeshStandardMaterial({
    color: new Color(worldColor('ground')),
    ...(map ? { map } : {}),
    roughness: 1,
  })
  materialCache.set(repeat, material)
  return material
}
