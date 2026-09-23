'use client'

import type {} from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { OrthographicCamera } from 'three'
import { CAMERA_DEFAULTS, cameraOffset, damp, orthoFrustum, type MutableVector3 } from './camera'

// 相機收斂尾巴的 snap 門檻（世界單位）。遠小於一個 render 像素（viewHeight 12 / (CSS 高 × dpr 0.25) ≈ 0.06–0.12 世界單位），
// 所以 snap 幅度看不出來；作用是斬斷指數阻尼「永遠差一點點」的無限尾巴，讓站定後整個畫面不再次像素飄移（見 useFrame）。
const CAMERA_SETTLE_EPSILON = 0.01

// 固定的 Orthographic Elevated 相機。**不提供任何旋轉或自由移動的操作** ——
// 沒有 OrbitControls，也沒有任何接受使用者輸入去改變相機的東西。
//
// ⚠️ **朝向是常數，建立時 `lookAt` 一次就固定；`useFrame` 只平移、不再 `lookAt`**（`FE-W05-S11`）。
// offset 是常數，所以「從 `target + offset` 看向 `target`」的方向永遠是 `−offset`、與 target 在哪無關。
// 以前每幀 `lookAt(target)`：位置有阻尼、會落後 target，從落後的位置看向移動中的 target，視線就偏離
// `−offset` —— 走速 3 u/s、半衰期 0.12 s 量到約 2.35°，起停變向反覆擺動。**只在走路時發生的非自主旋轉光流**，
// demo 實測回報「有些人會頭暈」。代價是移動中角色暫時偏離畫面中心約半個單位，停下 ~0.5 s 收斂 —— 偏心不暈，旋轉才暈。

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

  // 建立一次，接管成預設相機。**這裡的 `lookAt` 是整個元件唯一的一次** —— 之後朝向不再變。
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
  // **只阻尼位置。不要在這裡 `lookAt`**（見檔頭）：矩陣由 R3F 每幀 `updateMatrixWorld`，正交投影不因位置改變而需重算。
  useFrame((_, dt) => {
    const camera = cameraRef.current
    const target = targetRef.current
    const offset = cameraOffset()
    const { halfLife } = CAMERA_DEFAULTS
    const wantX = target.x + offset.x
    const wantY = target.y + offset.y
    const wantZ = target.z + offset.z

    // ⚠️ **收斂尾巴的 epsilon snap —— 走動穩定。**
    // 阻尼是指數逼近，永遠差最後一點點；那條**無限尾巴**會在角色停下很久之後才慢慢跨過一個 render 像素，
    // 讓整個畫面（角色臉、門標籤、座位…全部）突然平移一格（`dpr 0.25` 下＝4 螢幕像素）。站著看就是「東西會自己跳/飄」。
    // 已在目標的 render 次像素內（`CAMERA_SETTLE_EPSILON` 遠小於一個 render 像素 ≈0.06–0.12 世界單位）就**直接 snap 到 target**、
    // 這一幀不再阻尼 —— 站定後整個畫面凍住、不再次像素飄移。目標一移動（走路）差距超過 epsilon，阻尼自然恢復、平滑跟隨。
    // 與 `world-camera`〈相機收斂到 target〉一致：這是**更精確地收斂**（snap 幅度 < epsilon、看不出來），不是新方向、不越過 target。
    if (
      Math.abs(camera.position.x - wantX) < CAMERA_SETTLE_EPSILON &&
      Math.abs(camera.position.y - wantY) < CAMERA_SETTLE_EPSILON &&
      Math.abs(camera.position.z - wantZ) < CAMERA_SETTLE_EPSILON
    ) {
      camera.position.set(wantX, wantY, wantZ)
      return
    }

    camera.position.set(
      damp(camera.position.x, wantX, dt, halfLife),
      damp(camera.position.y, wantY, dt, halfLife),
      damp(camera.position.z, wantZ, dt, halfLife),
    )
  })

  return null
}
