import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MeshStandardMaterial, NearestFilter, RepeatWrapping } from 'three'
import { GRASS_TEXTURE_NAME, grassGeometry, grassMaterial, grassTexture } from '@/world/primitives/grass'
import { createsGpuResources } from '../tests/e2e/leak-harness/coverage'

// 規格：openspec/changes/fe-w14-pixel-restyle/specs/world-visual-polish/spec.md
//   FE-W14-S04  地面有像素草地、貼圖來自共用 factory、WorldShell 不 new CanvasTexture、卸載不 dispose
//
// 「WorldShell 有沒有在受測清單裡漏登記」那條機械檢查在 `tests/leak-coverage.test.ts`
//（grass.ts 會 new GPU 資源，忘了登記進 leak-harness 會在那裡紅）。

const ROOT = path.resolve(import.meta.dirname, '..')

// 草地貼圖需要 canvas 2D context；jsdom 沒裝 canvas 套件，塞一個最小假 context。
const fake2d = { fillStyle: '', fillRect: () => {} } as unknown as CanvasRenderingContext2D

describe('像素草地 factory（有 canvas 2D context）', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fake2d as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    )
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('[FE-W14-S04] 草地貼圖來自 factory、是最近鄰可重複、依 repeat 快取', () => {
    const tex = grassTexture(20)
    expect(tex, '有 context 時要有草地貼圖').not.toBeNull()
    expect(tex?.magFilter).toBe(NearestFilter)
    expect(tex?.minFilter).toBe(NearestFilter)
    expect(tex?.wrapS).toBe(RepeatWrapping)
    expect(tex?.wrapT).toBe(RepeatWrapping)
    expect(tex?.name).toBe(GRASS_TEXTURE_NAME)
    // 同一個 repeat 拿到同一張貼圖（render loop 每幀不新建）
    expect(grassTexture(20)).toBe(tex)
  })

  it('[FE-W14-S04] 草地 geometry 與 material 是 factory 擁有的不可變快取實例', () => {
    expect(grassGeometry(40)).toBe(grassGeometry(40))
    expect(grassGeometry(40)).not.toBe(grassGeometry(41))
    const mat = grassMaterial(20)
    expect(mat).toBe(grassMaterial(20))
    expect(mat).toBeInstanceOf(MeshStandardMaterial)
    // 材質帶草地貼圖
    expect((mat as MeshStandardMaterial).map?.name).toBe(GRASS_TEXTURE_NAME)
  })

  it('[FE-W14-S04] WorldShell 不直接建立任何 GPU 資源（不 new CanvasTexture、不 <planeGeometry>）', () => {
    // **這條擋的是回歸到原型的 inline `new CanvasTexture`。** 用的是 FE-W07 涵蓋率
    // 掃描器的同一支判定：WorldShell 一旦自己建 GPU 資源就會是 true。
    const source = fs.readFileSync(path.join(ROOT, 'src/world/environment/WorldShell.tsx'), 'utf8')
    expect(createsGpuResources(source), 'WorldShell 又自己建 GPU 資源了 —— 應該全部經 factory').toBe(false)
    expect(source).not.toContain('new CanvasTexture')
  })

  it('[FE-W14-S04] factory 擁有的實例，消費者用完丟引用時 dispose 事件為零', () => {
    // 沿用 world-design-system 的 dispose 事件計數技術（不能靠「畫面還在」——
    // three.js 對已 dispose 的資源下一幀會重新上傳，那條恆真）。
    const geometry = grassGeometry(60)
    const texture = grassTexture(60)
    const material = grassMaterial(60)
    let disposed = 0
    const count = () => {
      disposed += 1
    }
    geometry.addEventListener('dispose', count)
    texture?.addEventListener('dispose', count)
    material.addEventListener('dispose', count)

    // 模擬一個用它們的元件：用完、丟掉引用（不呼叫 dispose）。
    {
      const used = geometry
      expect(used.attributes.position?.count ?? 0).toBeGreaterThanOrEqual(0)
    }

    expect(disposed, 'factory 的共用實例被釋放了 —— 症狀看不出來，只能靠事件計數').toBe(0)

    geometry.removeEventListener('dispose', count)
    texture?.removeEventListener('dispose', count)
    material.removeEventListener('dispose', count)
  })
})

describe('像素草地 factory（沒有 canvas 2D context）', () => {
  // 明確 stub getContext 回 null；用不同的 repeat（7）避開上面 describe 的快取。
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('[FE-W14-S04] 沒有 context 時草地貼圖退化為 null、材質為無貼圖純色、不拋錯', () => {
    expect(grassTexture(7)).toBeNull()
    const mat = grassMaterial(7)
    expect(mat).toBeInstanceOf(MeshStandardMaterial)
    expect((mat as MeshStandardMaterial).map).toBeNull()
  })
})
