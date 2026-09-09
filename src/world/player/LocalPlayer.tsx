'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import type { Group, Object3D } from 'three'
import { FACING, type Facing } from '@/world/coords'
import type { MutableVector3 } from '@/world/camera'
import type { LocalPose } from '@/world/PositionSync'
import { CHIBI_PARTS, ChibiPlayer, type ChibiPart } from './ChibiPlayer'
import { advancePhase, animationStateFor, poseAt, type AnimationState } from './animation'
import { MOVEMENT_KEYS, directionFromKeys } from './input'
import { FACING_ROTATION, nextFacing } from './facing'
import { displacement, speedOf } from './movement'
import { advanceRenderMotion, createRenderMotion } from './renderMotion'
import { PHYSICS, createPhysicsWorld, movePlayer, type PhysicsWorld } from '@/world/physics/world'

// 本地玩家。
//
// ⚠️ **位置、朝向、動畫相位、手腳角度全部不進 React state**
// （CONTEXT.md：高頻資料不進 React）。它們放在 ref，每幀直接寫進
// Three 的 transform。這個元件在整個生命週期裡**一次都不會重新渲染**。

export interface LocalPlayerProps {
  /** 相機要跟隨的目標。**由這裡每幀寫入，不經過 React。** */
  targetRef: RefObject<MutableVector3>
  /**
   * 給網路層讀的權威狀態。**專用的，不重用上面那個。**
   *
   * `targetRef` 的語意是「相機要看哪裡」—— 之後相機可能鎖定別的東西
   *（觀戰、過場、鎖定目標），兩者一分岔，送出去的就變成相機在看的位置，
   * 而不是角色在的位置。規格 FE-R03。
   */
  poseRef: RefObject<LocalPose>
}

export function LocalPlayer({ targetRef, poseRef }: LocalPlayerProps) {
  const rootRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  /** 子部位查一次就快取。查不到的話動畫會靜默停止 —— 見 partsRef 的初始化。 */
  const partsRef = useRef<Partial<Record<ChibiPart, Object3D>>>({})
  const pressed = useRef<Set<string>>(new Set())
  const facing = useRef<Facing>(FACING.down)
  const phase = useRef(0)
  const animState = useRef<AnimationState>('idle')

  // 物理世界。**位置的權威來源是 rigid body，不是這個元件的 state**
  // （CONTEXT.md 第 214 行明列 Rapier rigid body 是允許放高頻資料的地方）。
  const physics = useRef<PhysicsWorld | null>(null)
  // 累加器 ＋ 前後兩個物理位置。**畫面位置是從這裡插值出來的**，
  // 不是直接讀 rigid body（規格 `FE-W03-S14`）。
  const motion = useRef(createRenderMotion({ x: 0, z: 0 }))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rapier = await import('@dimforge/rapier3d-compat')
      await rapier.init()
      if (cancelled) return
      physics.current = createPhysicsWorld(rapier)
    })()
    return () => {
      cancelled = true
      physics.current?.world.free()
      physics.current = null
    }
  }, [])

  // 子部位查一次，之後每幀直接寫它們的 transform。
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const found: Partial<Record<ChibiPart, Object3D>> = {}
    for (const name of CHIBI_PARTS) {
      const obj = body.getObjectByName(name)
      if (obj) found[name] = obj
    }
    partsRef.current = found
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVEMENT_KEYS.has(e.code)) {
        pressed.current.add(e.code)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code)

    // ⚠️ **按著方向鍵切走時，`keyup` 不會回到這一頁。**
    // 不清的話 `pressed` 裡那個鍵會一直在，切回來角色自己一直走、
    // 而且一直把位置送出去 —— 使用者要再按一次同一個鍵才停得下來。
    //
    // **三個事件都要掛，不是挑一個**（規格 FE-R04，design 的 D3）：
    //
    //   blur                        切到別的應用程式、點到 devtools
    //   visibilitychange → hidden   **切到同一個視窗的別的分頁**、視窗最小化
    //   pagehide                    頁面進 bfcache、導航離開
    //
    // 它們的涵蓋範圍互有缺口：切到同一個視窗的別的分頁時 `blur` **不一定**觸發；
    // 整個視窗失焦但這個分頁仍是可見的那一個時 `visibilitychange` **不觸發**。
    // 清空是冪等的，所以三個都掛的成本是零，漏掉任何一個的成本是「角色自己一直走」。
    const release = () => pressed.current.clear()
    // **只在隱藏時清。** 不看 `visibilityState` 的話，切回前景那一次也會清 ——
    // 那在「切回來的瞬間剛好按著鍵」時會吃掉一次輸入。
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') release()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    window.addEventListener('pagehide', release)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      window.removeEventListener('pagehide', release)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useFrame((_, dt) => {
    const root = rootRef.current
    if (!root) return

    const dir = directionFromKeys(pressed.current)

    // 期望位移由 world-player 算，**最終位置由 character controller 解算** ——
    // 中間可能被障礙物擋掉一部分（規格的 MODIFIED Requirement）。
    const pw = physics.current
    if (pw) {
      // 固定時間步：不跟著 render 的 dt 變，否則影格率不穩時解算會抖。
      //
      // ⚠️ **畫面位置不是物理位置**（規格 `FE-W03-S14`）。
      // render 的節拍跟 1/60 永遠對不齊，直接把 rigid body 的位置畫出去的話
      // 每一幀走 0、1 或 2 步 —— 實測 120 幀裡有 44% 走錯距離，畫面在抖。
      // `advanceRenderMotion` 把它插值到「真實位置延後一個固定步」。
      const delta = displacement(dir, PHYSICS.fixedStep)
      const rendered = advanceRenderMotion(motion.current, dt, () => {
        movePlayer(pw, delta)
        const t = pw.player.translation()
        return { x: t.x, z: t.z }
      })
      root.position.x = rendered.x
      root.position.z = rendered.z
    } else {
      // 物理還在載入（WASM 是非同步的）——先用純位移，載完就接手。
      // 這一支不需要插值：它本來就是跟著 render 的 dt 連續走的。
      const delta = displacement(dir, dt)
      root.position.x += delta.x
      root.position.z += delta.z
      // 載入完成之後 `advanceRenderMotion` 要從**現在的位置**接手，
      // 否則角色會瞬移回原點。
      motion.current.prev.x = root.position.x
      motion.current.prev.z = root.position.z
      motion.current.cur.x = root.position.x
      motion.current.cur.z = root.position.z
    }

    // 朝向用 world-coordinates 的那一份，站著不動時保留前一個
    facing.current = nextFacing(dir, facing.current)
    root.rotation.y = FACING_ROTATION[facing.current]

    // 相位是累積的，切換 Idle／Walk 時不重置 —— 重置的話手腳會跳
    animState.current = animationStateFor(speedOf(dir))
    phase.current = advancePhase(phase.current, dt, animState.current)
    const pose = poseAt(phase.current, animState.current)

    const body = bodyRef.current
    if (body) body.position.y = pose.bounce

    // 手腳反相：左手配右腳
    const parts = partsRef.current
    if (parts.leftArm) parts.leftArm.rotation.x = pose.swing
    if (parts.rightArm) parts.rightArm.rotation.x = -pose.swing
    if (parts.leftLeg) parts.leftLeg.rotation.x = -pose.swing
    if (parts.rightLeg) parts.rightLeg.rotation.x = pose.swing

    // 相機的 target：**直接寫 ref，不經過 React**。
    //
    // ⚠️ **是畫面位置，不是物理位置**（規格 `FE-W03-S17`）。
    // 相機跟著會跳的物理位置的話，它的輸出會帶著同一個 0／1／2 步的節拍
    //（damp 只把它變低頻，不會消掉），而角色本身是平滑的 ——
    // 於是**角色相對於相機在抖**，而使用者的眼睛鎖的正是角色。
    targetRef.current.x = root.position.x
    targetRef.current.y = root.position.y
    targetRef.current.z = root.position.z

    // 給網路層的權威狀態。**另一個 ref** —— 見 `poseRef` 的說明。
    //
    // ⚠️ **是物理位置，不是畫面位置**（規格 `FE-W03-S17`）。
    // 畫面位置刻意延後一個固定步；把那個延遲也送出去，等於讓每個遠端玩家
    // 額外多看到 16.7 ms 的落後，而遠端本來就有自己的插值（`FE-R08`）。
    poseRef.current.x = motion.current.cur.x
    poseRef.current.z = motion.current.cur.z
    poseRef.current.f = facing.current
  })

  return (
    <group ref={rootRef}>
      <ChibiPlayer ref={bodyRef} />
    </group>
  )
}
