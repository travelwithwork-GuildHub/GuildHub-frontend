import { beforeAll, describe, expect, it } from 'vitest'
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import { Object3D } from 'three'
import { createPhysicsWorld, teleportPlayer, type PhysicsWorld } from '@/world/physics/world'
import { consumeRelocation, type Relocation, type RelocationTargets } from '@/world/player/relocation'
import { createRenderMotion, advanceRenderMotion } from '@/world/player/renderMotion'
import { FACING } from '@/world/coords'
import { FACING_ROTATION } from '@/world/player/facing'

// ⚠️ 跑的是**真的 Rapier**（跟 `tests/physics.test.ts` 同一套），不是 mock —— 就位要搬的物理體位置權威在這裡驗得到。
// 這裡驗 `FE-W03-S18` 的**機制組合**（`teleportPlayer` ＋ `consumeRelocation` ＋ 不回彈）；
// 整合進 `LocalPlayer` useFrame 的可見結果在 `FE-J13-S08` 的真瀏覽器 e2e 驗。

let RAPIER: typeof RAPIER_NS
beforeAll(async () => {
  RAPIER = await import('@dimforge/rapier3d-compat')
  await RAPIER.init()
}, 30_000)

/** 一組真的就位目標：真 Object3D、真 renderMotion、plain ref。 */
function makeTargets(pw: PhysicsWorld | null): RelocationTargets {
  return {
    pw,
    motion: createRenderMotion({ x: 10, z: 8 }), // 起點在別處，證明會被搬走
    root: new Object3D(),
    facingRef: { current: FACING.down },
    targetRef: { current: { x: 0, y: 0, z: 0 } },
    poseRef: { current: { x: 0, z: 0, f: FACING.down } },
  }
}

describe('[FE-W03-S18] 一次性就位命令原子套用、不回彈、只消費一次', () => {
  const dest: Relocation = { x: 3, z: -5, f: FACING.left }

  it('teleportPlayer 把物理體硬移到目的地（y 固定 0）', () => {
    const pw = createPhysicsWorld(RAPIER)
    teleportPlayer(pw, { x: 3, z: -5 })
    const t = pw.player.translation()
    expect(t.x).toBeCloseTo(3)
    expect(t.z).toBeCloseTo(-5)
    expect(t.y).toBeCloseTo(0)
  })

  it('consumeRelocation 原子設物理/插值前後點/root/朝向/相機/pose，清空 ref、回 true；再呼叫回 false', () => {
    const pw = createPhysicsWorld(RAPIER)
    const t = makeTargets(pw)
    const relocateRef: { current: Relocation | null } = { current: dest }

    const applied = consumeRelocation(relocateRef, t)
    expect(applied).toBe(true)
    // 物理體（位置權威）
    const tr = pw.player.translation()
    expect(tr.x).toBeCloseTo(3)
    expect(tr.z).toBeCloseTo(-5)
    // 插值前後點都在目的地 ⇒ 不回彈
    expect(t.motion.prev).toEqual({ x: 3, z: -5 })
    expect(t.motion.cur).toEqual({ x: 3, z: -5 })
    // root、朝向
    expect(t.root.position.x).toBe(3)
    expect(t.root.position.z).toBe(-5)
    expect(t.facingRef.current).toBe(FACING.left)
    expect(t.root.rotation.y).toBe(FACING_ROTATION[FACING.left])
    // 相機 target、poseRef
    expect(t.targetRef.current).toMatchObject({ x: 3, z: -5 })
    expect(t.poseRef.current).toEqual({ x: 3, z: -5, f: FACING.left })
    // 只消費一次：ref 清空、再呼叫回 false 且不再改
    expect(relocateRef.current).toBeNull()
    expect(consumeRelocation(relocateRef, makeTargets(pw))).toBe(false)
  })

  it('就位後在無輸入下推進 render，畫面停在目的地（prev===cur ⇒ 不回彈）', () => {
    const pw = createPhysicsWorld(RAPIER)
    const t = makeTargets(pw)
    const relocateRef = { current: dest as Relocation | null }
    consumeRelocation(relocateRef, t)
    // 無輸入：stepOnce 讀物理位置（已 teleport 到目的地）
    const rendered = advanceRenderMotion(t.motion, 1 / 60, () => {
      const p = pw.player.translation()
      return { x: p.x, z: p.z }
    })
    expect(rendered.x).toBeCloseTo(3)
    expect(rendered.z).toBeCloseTo(-5)
  })
})
