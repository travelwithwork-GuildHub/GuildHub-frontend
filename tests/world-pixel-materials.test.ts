import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MeshStandardMaterial, NearestFilter, RepeatWrapping } from 'three'
import {
  NOISE_TEXTURE_NAME,
  WOOD_TEXTURE_NAME,
  materialFor,
} from '@/world/primitives/material'

// 規格：openspec/changes/fe-w14-pixel-restyle/specs/world-visual-polish/spec.md
//   FE-W14-S02  木頭 token 帶橫向木紋、同 token 同實例；其餘 token 帶雜訊貼圖
//
// 退化路徑（沒有 2D context → 純色）在 `tests/world-pixel-materials-degrade.test.ts`
// —— 那條要的是「沒有 context」，跟這裡「有 context」互斥，所以拆兩個檔案
// （材質快取是模組級的，同檔內混用會讓 wood 被前一個 describe 快取住）。

// jsdom 沒裝 `canvas` 套件，`getContext('2d')` 預設回 null。這個檔案要驗「有貼圖」那條，
// 所以塞一個最小的假 2D context —— 貼圖只需要 fillStyle／fillRect 就畫得出來。
// 內容不重要（`CanvasTexture` 建構時不讀像素），重要的是 filter／wrapping／快取。
const fake2d = { fillStyle: '', fillRect: () => {} } as unknown as CanvasRenderingContext2D

describe('像素材質貼圖（有 canvas 2D context）', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fake2d as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    )
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('[FE-W14-S02] 木頭 token 帶最近鄰木紋貼圖，且加貼圖不破壞快取', () => {
    const wood1 = materialFor({ kind: 'standard', color: 'wood' })
    const wood2 = materialFor({ kind: 'standard', color: 'wood' })
    // 加了貼圖，同參數仍必須是同一個實例（材質快取契約 FE-W09-S04 不變）
    expect(wood1).toBe(wood2)

    const map = (wood1 as MeshStandardMaterial).map
    expect(map, 'wood 材質要有貼圖').not.toBeNull()
    expect(map?.magFilter).toBe(NearestFilter)
    expect(map?.minFilter).toBe(NearestFilter)
    expect(map?.wrapS).toBe(RepeatWrapping)
    expect(map?.wrapT).toBe(RepeatWrapping)
    // **木頭走木紋，不是一般雜訊** —— 用貼圖名字辨識（假 context 下讀不到像素）
    expect(map?.name).toBe(WOOD_TEXTURE_NAME)
  })

  it('[FE-W14-S02] 非木頭 token 帶雜訊貼圖、是不同實例', () => {
    const wood = materialFor({ kind: 'standard', color: 'wood' })
    const carpet = materialFor({ kind: 'standard', color: 'carpet' })
    expect(carpet).not.toBe(wood)

    const map = (carpet as MeshStandardMaterial).map
    expect(map).not.toBeNull()
    expect(map?.magFilter).toBe(NearestFilter)
    expect(map?.wrapS).toBe(RepeatWrapping)
    // 一般 token 是雜訊貼圖，不是木紋
    expect(map?.name).toBe(NOISE_TEXTURE_NAME)
  })

  it('[FE-W14-S02] 同一張 hex 的貼圖只建一次、被兩個 token 材質共用不重建', () => {
    // `avatarBody` 與其它同 hex 的 token 之外，這裡驗的是：同一個 token 重複取用，
    // 底下的貼圖是同一個 CanvasTexture 實例（render loop 每幀不新建）。
    const a = materialFor({ kind: 'standard', color: 'ground' })
    const b = materialFor({ kind: 'standard', color: 'ground', roughness: 0.9 })
    // 參數不同 → 不同材質實例
    expect(a).not.toBe(b)
    // 但底下是同一張依 hex 快取的貼圖
    expect((a as MeshStandardMaterial).map).toBe((b as MeshStandardMaterial).map)
  })

  it('[FE-W14-S02] basic（自發光體）不加貼圖', () => {
    const glow = materialFor({ kind: 'basic', color: 'glow' })
    // MeshBasicMaterial 沒有 map（自己是光源的外觀，不吃光也不要雜訊）
    expect('map' in glow ? (glow as { map: unknown }).map : null).toBeNull()
  })
})
