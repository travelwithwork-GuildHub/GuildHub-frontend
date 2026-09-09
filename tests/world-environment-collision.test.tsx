import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type {} from '@react-three/fiber'
import { Box3, Vector3, type Mesh, type Object3D } from 'three'
import { footprintOf, rotateFootprint, type PropDefinition } from '@/world/environment/definition'
import {
  FURNITURE_KINDS,
  Furniture,
  furnitureDefinition,
  furnitureFootprint,
  type FurnitureKind,
} from '@/world/environment/furnitureProps'
import { PropParts } from '@/world/environment/PropParts'
import { carpetDefinition } from '@/world/environment/structural'

// 規格：openspec/changes/fe-w10-environment-components/specs/world-environment/spec.md
//   Requirement: 場景元件分成三類 —— FE-W10-S02
//   Requirement: 碰撞尺寸由元件擁有 —— FE-W10-S04 / S05 / S06 / S07
//
// ⚠️⚠️ **`S05` 的期望值是獨立量出來的，不是呼叫 `footprintOf`。**
// 用 `footprintOf` 算一次再拿去比 `footprintOf`，那是同源的恆真測試 ——
// 它算錯的時候兩邊會一起錯，而測試是綠的。
// 這裡的做法是**把會擋路的部件真的 render 出來，用 `Box3` 量**。

const EPS = 4

/** ⚠️ 測試環境沒有 render loop，`matrixWorld` 沒有人更新過（見 shell 的測試）。 */
async function measure(definition: PropDefinition): Promise<Box3 | null> {
  const renderer = await ReactThreeTestRenderer.create(<PropParts definition={definition} />)
  const scene = renderer.scene.instance as Object3D
  scene.updateMatrixWorld(true)
  const meshes: Mesh[] = []
  scene.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh)
  })
  if (meshes.length === 0) return null
  return new Box3().setFromObject(scene)
}

async function meshCount(node: React.ReactNode): Promise<number> {
  const renderer = await ReactThreeTestRenderer.create(<>{node}</>)
  let n = 0
  ;(renderer.scene.instance as Object3D).traverse((o) => {
    if ((o as Mesh).isMesh) n += 1
  })
  return n
}

describe('家具', () => {
  it('[FE-W10-S02] 家具由 definition 描述，共用一個 renderer', async () => {
    expect(FURNITURE_KINDS.length, '一種家具都沒有 —— 下面的斷言是空的').toBeGreaterThan(0)
    for (const kind of FURNITURE_KINDS) {
      const parts = furnitureDefinition(kind).parts.length
      expect(parts, `${kind} 的 definition 是空的`).toBeGreaterThan(0)
      expect(await meshCount(<Furniture kind={kind} />), `${kind} 沒有渲染出每一個部件`).toBe(parts)
    }

    // 「沒有任何一種家具需要自己的元件檔」—— 有人開了 `Desk.tsx` 就紅。
    const files = readdirSync(resolve(import.meta.dirname, '../src/world/environment'))
    for (const kind of FURNITURE_KINDS) {
      for (const own of [`${kind[0]?.toUpperCase()}${kind.slice(1)}.tsx`, `${kind}.tsx`]) {
        expect(files, `${own} 不該存在 —— 家具是資料，不是各自一個元件`).not.toContain(own)
      }
    }
  })

  it('[FE-W10-S04] 碰撞描述不帶世界座標', () => {
    const box = furnitureFootprint('desk')
    expect(box).toBeDefined()
    // 欄位是封閉的：多了 `x`／`z` 就代表有人把擺放位置塞進元件的導出值了。
    expect(Object.keys(box ?? {}).sort()).toEqual(
      ['halfDepth', 'halfHeight', 'halfWidth', 'offsetX', 'offsetZ'],
    )
  })

  it('[FE-W10-S05] 碰撞盒等於會擋路的部件', async () => {
    for (const kind of FURNITURE_KINDS) {
      const definition = furnitureDefinition(kind)
      const blocking = { parts: definition.parts.filter((p) => p.blocks === true) }
      // **期望值：把擋路的部件真的 render 出來量。** 不呼叫 footprintOf。
      const measured = await measure(blocking)
      const declared = furnitureFootprint(kind)
      if (measured === null) {
        expect(declared, `${kind} 沒有擋路的部件，卻導出了碰撞盒`).toBeUndefined()
        continue
      }
      expect(declared, `${kind} 有擋路的部件，卻沒有導出碰撞盒`).toBeDefined()
      const size = measured.getSize(new Vector3())
      const center = measured.getCenter(new Vector3())
      expect(declared?.halfWidth, `${kind} 的碰撞盒寬度跟擋路的部件對不上`).toBeCloseTo(size.x / 2, EPS)
      expect(declared?.halfDepth, `${kind} 的碰撞盒深度跟擋路的部件對不上`).toBeCloseTo(size.z / 2, EPS)
      expect(declared?.halfHeight, `${kind} 的碰撞盒高度跟擋路的部件對不上`).toBeCloseTo(size.y / 2, EPS)
      expect(declared?.offsetX, `${kind} 的碰撞盒位置偏了`).toBeCloseTo(center.x, EPS)
      expect(declared?.offsetZ, `${kind} 的碰撞盒位置偏了`).toBeCloseTo(center.z, EPS)
    }
  })

  it('[FE-W10-S05] 四種 primitive 的半尺寸都跟真的幾何對得上', async () => {
    // ⚠️ 這一條**不是**多餘的：上面五種家具的擋路部件全是 `RoundedBox`，
    // 所以 `Capsule`／`Sphere`／`Cylinder` 那三個分支一條都沒被走過。
    // 實測：把 `Cylinder` 的半高寫成全高，上面那條**照樣全綠**。
    const shapes: PropDefinition['parts'] = [
      {
        geometry: { shape: 'RoundedBox', width: 1.2, height: 0.4, depth: 0.6, radius: 0.05 },
        material: { kind: 'standard', color: 'wood' },
        position: [-2, 0.2, 0],
        blocks: true,
      },
      {
        geometry: { shape: 'Capsule', radius: 0.3, length: 0.8 },
        material: { kind: 'standard', color: 'wood' },
        position: [0, 0.7, 0],
        blocks: true,
      },
      {
        geometry: { shape: 'Sphere', radius: 0.45 },
        material: { kind: 'standard', color: 'wood' },
        position: [2, 0.45, 0.5],
        blocks: true,
      },
      {
        geometry: { shape: 'Cylinder', radius: 0.25, height: 1.1 },
        material: { kind: 'standard', color: 'wood' },
        position: [3.5, 0.55, -0.4],
        blocks: true,
      },
    ]
    for (const part of shapes) {
      const one = { parts: [part] }
      const measured = await measure(one)
      const declared = footprintOf(one)
      const size = measured?.getSize(new Vector3()) ?? new Vector3()
      const center = measured?.getCenter(new Vector3()) ?? new Vector3()
      const what = part.geometry.shape
      expect(declared?.halfWidth, `${what} 的半寬`).toBeCloseTo(size.x / 2, 3)
      expect(declared?.halfHeight, `${what} 的半高`).toBeCloseTo(size.y / 2, 3)
      expect(declared?.halfDepth, `${what} 的半深`).toBeCloseTo(size.z / 2, 3)
      expect(declared?.offsetX, `${what} 的位置`).toBeCloseTo(center.x, 3)
    }
  })

  it('[FE-W10-S06] 沒有擋路的部件就沒有碰撞盒', () => {
    expect(footprintOf(carpetDefinition(3, 2)), '地毯不擋路，不該有碰撞盒').toBeUndefined()
    expect(footprintOf({ parts: [] })).toBeUndefined()
  })

  it('[FE-W10-S07] 旋轉 90° 之後碰撞盒跟著轉', () => {
    const box = { offsetX: 1, offsetZ: 2, halfWidth: 0.8, halfDepth: 0.4, halfHeight: 0.38 }
    const q1 = rotateFootprint(box, 1)
    expect([q1.halfWidth, q1.halfDepth], '90° 沒有交換半寬與半深').toEqual([0.4, 0.8])
    expect([q1.offsetX, q1.offsetZ], '90° 的位移不對（(x, z) → (z, -x)）').toEqual([2, -1])

    const q2 = rotateFootprint(box, 2)
    expect([q2.halfWidth, q2.halfDepth], '180° 不該交換半寬與半深').toEqual([0.8, 0.4])
    expect([q2.offsetX, q2.offsetZ]).toEqual([-1, -2])

    const q3 = rotateFootprint(box, 3)
    expect([q3.halfWidth, q3.halfDepth]).toEqual([0.4, 0.8])
    expect([q3.offsetX, q3.offsetZ]).toEqual([-2, 1])

    expect(rotateFootprint(box, 4), '轉一圈要回到原點').toEqual(box)
  })

  it('擋路的部件轉一個不是 90° 倍數的角度時拋錯', () => {
    // 靜默接受的話碰撞盒會悄悄長大，**而畫面上看起來完全正常**。
    const def: PropDefinition = {
      parts: [
        {
          geometry: { shape: 'RoundedBox', width: 1, height: 1, depth: 0.4, radius: 0.05 },
          material: { kind: 'standard', color: 'wood' },
          position: [0, 0.5, 0],
          rotationY: Math.PI / 6,
          blocks: true,
        },
      ],
    }
    expect(() => footprintOf(def)).toThrow(/90°/)
    // 不擋路的部件轉幾度都可以 —— 它不參與碰撞。
    expect(footprintOf({ parts: [{ ...def.parts[0]!, blocks: false }] })).toBeUndefined()
  })
})

describe('家具的名字', () => {
  it('未列舉的家具名稱拋錯', () => {
    expect(() => furnitureDefinition('sofa' as FurnitureKind)).toThrow(/sofa/)
  })
})
