import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MeshStandardMaterial } from 'three'
import { materialFor } from '@/world/primitives/material'

// 規格：openspec/changes/fe-w14-pixel-restyle/specs/world-visual-polish/spec.md
//   FE-W14-S03  沒有 canvas 2D context 時退化為無貼圖純色、不拋錯
//
// 「有 context 帶貼圖」那條在 `tests/world-pixel-materials.test.ts`（見該檔說明為何拆檔）。

describe('沒有 canvas 2D context 時的退化', () => {
  // jsdom 沒裝 canvas 套件，`getContext('2d')` 本來就回 null；這裡明確 stub 成 null，
  // 讓「沒有 2D context」是這條測試自己控制的前提，不靠 jsdom 的附帶行為。
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('[FE-W14-S03] 木頭 token 退化為純色 MeshStandardMaterial、map 為 null、不拋錯', () => {
    const wood = materialFor({ kind: 'standard', color: 'wood' })
    expect(wood).toBeInstanceOf(MeshStandardMaterial)
    expect((wood as MeshStandardMaterial).map).toBeNull()
  })

  it('[FE-W14-S03] 一般 token 也退化為純色、map 為 null、不拋錯', () => {
    const ground = materialFor({ kind: 'standard', color: 'ground' })
    expect(ground).toBeInstanceOf(MeshStandardMaterial)
    expect((ground as MeshStandardMaterial).map).toBeNull()
  })
})
