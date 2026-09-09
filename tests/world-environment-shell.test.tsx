import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type {} from '@react-three/fiber'
import { Box3, Vector3, type Mesh, type Object3D } from 'three'
import { Carpet, Floor, Platform, Wall } from '@/world/environment/structural'
import { WorldShell } from '@/world/environment/WorldShell'
import { PHYSICS } from '@/world/physics/world'

// 規格：openspec/changes/fe-w10-environment-components/specs/world-environment/spec.md
//   Requirement: 場景元件分成三類 —— FE-W10-S01
//   Requirement: 世界有永久的地面與可見的邊界 —— FE-W10-S10 / S11
//
// ⚠️ **量的是渲染出來的場景，不是 definition。** 用 definition 算一次再拿去比
// definition，那是同源的恆真測試 —— `geometryFor` 做出來的東西跟參數不一致時
// 兩邊會一起錯，而測試是綠的。
//
// **容差是量出來的**：`RoundedBox(2, 1, 0.8)` 實測 Box3 是
// `[2, 1, 0.8000000417232513]` —— 誤差量級 4e-8（float32 的頂點座標）。
const EPS = 1e-5

/**
 * 量一個物件在世界座標下的包圍盒。
 *
 * ⚠️⚠️ **`scene.updateMatrixWorld(true)` 不能省。**
 * 測試環境沒有 render loop，所以沒有人更新過 `matrixWorld`。
 * 少了這一行，`Box3.setFromObject(mesh)` 量到的是**忽略祖先 transform** 的結果
 * —— 實測：四面各在 ±10 的牆全部量在原點，看起來像「牆的位置寫錯了」。
 * **那是尺的問題，不是產品的問題**（這一次是第一版就踩到）。
 */
function boxOf(root: Object3D, target: Object3D = root): Box3 {
  root.updateMatrixWorld(true)
  return new Box3().setFromObject(target)
}

async function sceneOf(node: React.ReactNode): Promise<Object3D> {
  const renderer = await ReactThreeTestRenderer.create(<>{node}</>)
  return renderer.scene.instance as Object3D
}

async function boundsOf(node: React.ReactNode): Promise<{ size: Vector3; center: Vector3 }> {
  const scene = await sceneOf(node)
  const box = boxOf(scene)
  return { size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()) }
}

function meshesOf(root: Object3D): Mesh[] {
  const found: Mesh[] = []
  root.traverse((o) => {
    if ((o as Mesh).isMesh) found.push(o as Mesh)
  })
  return found
}

describe('結構元件', () => {
  it('[FE-W10-S01] 結構元件的尺寸由呼叫端決定', async () => {
    const wide = await boundsOf(<Floor width={6} depth={4} thickness={0.2} />)
    expect(wide.size.x).toBeCloseTo(6, 4)
    expect(wide.size.z).toBeCloseTo(4, 4)
    expect(wide.size.y).toBeCloseTo(0.2, 4)

    // 換一組尺寸，量到的要跟著換 —— 只驗一組的話，寫死尺寸的實作照樣綠。
    const narrow = await boundsOf(<Floor width={2} depth={2} thickness={0.2} />)
    expect(narrow.size.x).toBeCloseTo(2, 4)
    expect(narrow.size.z).toBeCloseTo(2, 4)

    const wall = await boundsOf(<Wall length={5} height={2} thickness={0.5} />)
    expect(wall.size.x).toBeCloseTo(5, 4)
    expect(wall.size.y).toBeCloseTo(2, 4)
    expect(wall.size.z).toBeCloseTo(0.5, 4)
    // 牆的底面在原點 —— 呼叫端給的位置是「牆站在哪裡」，不是「牆的中心在哪裡」。
    expect(wall.center.y).toBeCloseTo(1, 4)

    const platform = await boundsOf(<Platform width={3} depth={2} height={0.4} />)
    expect(platform.size.y).toBeCloseTo(0.4, 4)
    expect(platform.center.y).toBeCloseTo(0.2, 4)

    // ⚠️ `Carpet` 原本一次都沒有真的 render 過（只被 `footprintOf` 讀過）——
    // 那樣的話「它做得出合法的幾何」是沒有人驗過的。
    const carpet = await boundsOf(<Carpet width={2.5} depth={1.5} />)
    expect(carpet.size.x).toBeCloseTo(2.5, 4)
    expect(carpet.size.z).toBeCloseTo(1.5, 4)
    expect(carpet.size.y, '地毯塌成零厚度').toBeGreaterThan(0)
  })
})

describe('世界的外殼', () => {
  it('[FE-W10-S10] 世界渲染完成時地面存在', async () => {
    const scene = await sceneOf(<WorldShell />)
    const meshes = meshesOf(scene)
    expect(meshes.length, '外殼什麼都沒渲染出來 —— 下面的斷言在空場景上恆真').toBeGreaterThan(0)

    // 接收陰影的地面：上表面切齊 y = 0（角色的腳在 y ≈ -0.02，所以它站在地面上）。
    const ground = meshes.filter((m) => m.receiveShadow && m.position.y < 0)
    expect(ground.length, '沒有任何接收陰影的地面').toBe(1)
    const box = boxOf(scene, ground[0] as Object3D)
    expect(box.max.y, '地面的上表面沒有切齊 y = 0，角色會浮在空中或陷進去').toBeCloseTo(0, 4)
  })

  it('[FE-W10-S11] 可見的邊界與物理的邊界對齊', async () => {
    const scene = await sceneOf(<WorldShell />)
    const meshes = meshesOf(scene)
    // 牆是站在地面上的那些（底面在 y = 0）。
    const walls = meshes.filter((m) => {
      const b = boxOf(scene, m as Object3D)
      return Math.abs(b.min.y) < EPS && b.max.y > 0.5
    })
    expect(walls.length, '四面邊界牆').toBe(4)

    // ⚠️ **期望值一律從 `PHYSICS` 推導。** 寫死 20 的話，改了物理範圍之後
    // 玩家會走到牆外面 —— 而畫面上看起來只是「牆的位置怪怪的」。
    const half = PHYSICS.halfExtent
    for (const wall of walls) {
      const b = boxOf(scene, wall as Object3D)
      expect(b.max.y, '牆的高度不是物理的 wallHeight').toBeCloseTo(PHYSICS.wallHeight, 4)
      const size = b.getSize(new Vector3())
      const thin = Math.min(size.x, size.z)
      expect(thin, '牆的厚度不是物理的 wallThickness').toBeCloseTo(PHYSICS.wallThickness, 4)
      // 牆面貼著 ±halfExtent：薄的那一軸的中心落在邊界上。
      const center = b.getCenter(new Vector3())
      const axis = size.x < size.z ? center.x : center.z
      expect(Math.abs(axis), '牆沒有貼在物理邊界上').toBeCloseTo(half, 4)
    }

    // 整個外殼的水平範圍等於場地加上牆的厚度（牆的中心在邊界上，各外露一半）。
    const all = boxOf(scene)
    const span = all.getSize(new Vector3())
    expect(span.x).toBeCloseTo(half * 2 + PHYSICS.wallThickness, 4)
    expect(span.z).toBeCloseTo(half * 2 + PHYSICS.wallThickness, 4)
  })
})
