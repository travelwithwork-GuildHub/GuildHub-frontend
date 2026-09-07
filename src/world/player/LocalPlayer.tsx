'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import type { Group, Object3D } from 'three'
import { FACING, type Facing } from '@/world/coords'
import type { MutableVector3 } from '@/world/camera'
import { CHIBI_PARTS, ChibiPlayer, type ChibiPart } from './ChibiPlayer'
import { advancePhase, animationStateFor, poseAt, type AnimationState } from './animation'
import { MOVEMENT_KEYS, directionFromKeys } from './input'
import { nextFacing } from './facing'
import { displacement, speedOf } from './movement'

// 本地玩家。
//
// ⚠️ **位置、朝向、動畫相位、手腳角度全部不進 React state**
// （CONTEXT.md：高頻資料不進 React）。它們放在 ref，每幀直接寫進
// Three 的 transform。這個元件在整個生命週期裡**一次都不會重新渲染**。

/** 朝向 → 繞 Y 軸的角度。0 下、1 左、2 右、3 上（協定的編碼）。 */
const FACING_ROTATION: Record<Facing, number> = {
  [FACING.down]: 0,
  [FACING.left]: Math.PI / 2,
  [FACING.right]: -Math.PI / 2,
  [FACING.up]: Math.PI,
}

export interface LocalPlayerProps {
  /** 相機要跟隨的目標。**由這裡每幀寫入，不經過 React。** */
  targetRef: RefObject<MutableVector3>
}

export function LocalPlayer({ targetRef }: LocalPlayerProps) {
  const rootRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  /** 子部位查一次就快取。查不到的話動畫會靜默停止 —— 見 partsRef 的初始化。 */
  const partsRef = useRef<Partial<Record<ChibiPart, Object3D>>>({})
  const pressed = useRef<Set<string>>(new Set())
  const facing = useRef<Facing>(FACING.down)
  const phase = useRef(0)
  const animState = useRef<AnimationState>('idle')

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
    // 視窗失焦時清掉按鍵狀態 —— 不清的話切走再切回來角色會一直走
    const blur = () => pressed.current.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useFrame((_, dt) => {
    const root = rootRef.current
    if (!root) return

    const dir = directionFromKeys(pressed.current)

    const delta = displacement(dir, dt)
    root.position.x += delta.x
    root.position.z += delta.z

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

    // 相機的 target：**直接寫 ref，不經過 React**
    targetRef.current.x = root.position.x
    targetRef.current.y = root.position.y
    targetRef.current.z = root.position.z
  })

  return (
    <group ref={rootRef}>
      <ChibiPlayer ref={bodyRef} />
    </group>
  )
}
