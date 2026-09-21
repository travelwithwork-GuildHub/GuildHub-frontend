import type { RefObject } from 'react'
import type { Object3D } from 'three'
import type { Facing } from '@/world/coords'
import type { MutableVector3 } from '@/world/camera'
import type { LocalPose } from '@/world/PositionSync'
import { teleportPlayer, type PhysicsWorld } from '@/world/physics/world'
import { FACING_ROTATION } from './facing'
import type { RenderMotion } from './renderMotion'

// 一次性就位命令（`FE-W03-S18`）：外部（入座成功）寫進共享 ref，`LocalPlayer` 在 `useFrame` 原子消費後清空。
// **只有 `LocalPlayer` 是位置權威** —— 外部只寫命令、不直接改物理體或 `poseRef`。

/** 就位的目的地與朝向。 */
export interface Relocation {
  readonly x: number
  readonly z: number
  readonly f: Facing
}

/** 共享的就位命令 ref：`null` ＝ 沒有待處理的就位。 */
export type RelocationRef = RefObject<Relocation | null>

/** 就位要原子改到的一切（`LocalPlayer` 的物理與畫面狀態）。 */
export interface RelocationTargets {
  /** Rapier 物理世界；還在載入時是 `null`（先只設畫面，物理載完由下一次 `movePlayer` 接手）。 */
  pw: PhysicsWorld | null
  motion: RenderMotion
  root: Object3D
  facingRef: { current: Facing }
  targetRef: RefObject<MutableVector3>
  poseRef: RefObject<LocalPose>
}

/**
 * 把就位原子套到物理與畫面（`FE-W03-S18`）：物理體、render 插值前後點、root、朝向、相機 target、`poseRef`。
 * **`prev` 與 `cur` 都設成目的地** ⇒ 下一次 `advanceRenderMotion` 位移為 0，不從舊位置回彈。
 */
export function applyRelocation(to: Relocation, t: RelocationTargets): void {
  if (t.pw) teleportPlayer(t.pw, to) // 物理體＝位置權威
  t.motion.prev.x = to.x
  t.motion.prev.z = to.z
  t.motion.cur.x = to.x
  t.motion.cur.z = to.z
  t.root.position.x = to.x
  t.root.position.z = to.z
  t.facingRef.current = to.f
  t.root.rotation.y = FACING_ROTATION[to.f]
  t.targetRef.current.x = to.x
  t.targetRef.current.z = to.z
  t.poseRef.current.x = to.x
  t.poseRef.current.z = to.z
  t.poseRef.current.f = to.f
}

/**
 * 消費就位命令：有命令就原子套用、**清空 ref（只套用一次）**、回 `true`；沒有就回 `false`（每幀零成本）。
 * `LocalPlayer` 在 `useFrame` 開頭呼叫這個 —— 讀命令、改狀態、清空全在這裡，維持「只有 `LocalPlayer` 是位置權威」。
 */
export function consumeRelocation(relocateRef: RelocationRef | undefined, t: RelocationTargets): boolean {
  const to = relocateRef?.current
  if (!to) return false
  applyRelocation(to, t)
  relocateRef.current = null
  return true
}
