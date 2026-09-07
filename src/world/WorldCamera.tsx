'use client'

import type {} from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { OrthographicCamera } from 'three'
import { CAMERA_DEFAULTS, cameraOffset, damp, orthoFrustum, type MutableVector3 } from './camera'

// 固定的 Orthographic Elevated 相機。**不提供任何旋轉或自由移動的操作** ——
// 沒有 OrbitControls，也沒有任何接受使用者輸入去改變相機的東西。

export interface WorldCameraProps {
  /**
   * 要跟隨的目標。
   *
   * ⚠️ **必須是 ref，不能是座標值。** `CONTEXT.md`：高頻資料不進 React ——
   * position 不得寫入 React state 或 Zustand。角色每幀都在移動，
   * 若用普通的 prop 傳座標，每一幀都會觸發整棵樹重新渲染。
   *
   * **違反這條不會有錯誤訊息，只會變慢**，而且慢的原因在別的地方看不出來。
   */
  targetRef: RefObject<MutableVector3>
}

export function WorldCamera({ targetRef }: WorldCameraProps) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const cameraRef = useRef<OrthographicCamera>(null as unknown as OrthographicCamera)

  if (cameraRef.current === null) {
    cameraRef.current = new OrthographicCamera()
  }

  // 建立一次，接管成預設相機
  useEffect(() => {
    const camera = cameraRef.current
    const offset = cameraOffset()
    const target = targetRef.current
    camera.position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z)
    camera.near = 0.1
    camera.far = 1000
    camera.lookAt(target.x, target.y, target.z)
    camera.updateProjectionMatrix()
    set({ camera })
  }, [set, targetRef])

  // 尺寸變了就重算視錐體：**垂直可見範圍固定，水平隨長寬比**
  useEffect(() => {
    const camera = cameraRef.current
    const { left, right, top, bottom } = orthoFrustum(
      size.width / size.height,
      CAMERA_DEFAULTS.viewHeight,
    )
    camera.left = left
    camera.right = right
    camera.top = top
    camera.bottom = bottom
    camera.updateProjectionMatrix()
  }, [size.width, size.height])

  // 跟隨。**在 useFrame 裡直接讀 ref 的當前值** —— 不經過 React。
  useFrame((_, dt) => {
    const camera = cameraRef.current
    const target = targetRef.current
    const offset = cameraOffset()
    const { halfLife } = CAMERA_DEFAULTS

    camera.position.set(
      damp(camera.position.x, target.x + offset.x, dt, halfLife),
      damp(camera.position.y, target.y + offset.y, dt, halfLife),
      damp(camera.position.z, target.z + offset.z, dt, halfLife),
    )
    camera.lookAt(target.x, target.y, target.z)
  })

  return null
}
