'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import { layer } from '@/design/layers'
import { isWebGL2Available } from './webgl'
import { DebugShadowScene } from './DebugShadowScene'

// 規格 FE-W01-S04：載入中的呈現**必須是 DOM**，不是 3D 物件 ——
// WebGL 還沒起來的時候畫不出 3D 的等待畫面。
function LoadingOverlay() {
  return (
    <div
      data-testid="world-loading"
      role="status"
      style={{ zIndex: layer('hud') }}
      className="text-ink-muted absolute inset-0 flex items-center justify-center"
    >
      世界載入中⋯⋯
    </div>
  )
}

// 規格 FE-W01-S06：WebGL2 不可用的呈現。
// **MUST NOT 提供重試操作** —— 這不是暫時性失敗，重試永遠不會成功，
// 而一個永遠不會成功的按鈕比沒有按鈕更糟。
function WebGLUnavailable() {
  return (
    <div
      data-testid="world-webgl-unavailable"
      role="alert"
      style={{ zIndex: layer('hud') }}
      className="border-line text-ink-muted border p-gutter"
    >
      <p>這台裝置或瀏覽器無法顯示 3D 世界。</p>
      <p className="text-caption">需要支援 WebGL2 的瀏覽器。</p>
    </div>
  )
}

export default function WorldCanvas() {
  // 偵測只做一次。每次 render 都建一個 canvas 去問的話，
  // 會一直吃掉瀏覽器對同時存在的 WebGL context 的配額。
  const [webgl2] = useState(isWebGL2Available)
  const [ready, setReady] = useState(false)

  if (!webgl2) return <WebGLUnavailable />

  return (
    <div data-testid="world-canvas-container" className="relative h-full w-full">
      <Canvas
        shadows
        // 規格 FE-W01-S02：DPR 上限 2。不設限的話 3x 螢幕會用九倍的像素
        // 去畫同一個畫面。`2` 不是量出來的最佳值 —— 真正的數字等 FE-O12，
        // 而那時要改的是 Requirement，不是這一行。
        dpr={[1, 2]}
        camera={{ position: [4, 4, 4], fov: 50 }}
        onCreated={() => setReady(true)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 8, 3]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Suspense fallback={null}>
          <DebugShadowScene />
        </Suspense>
      </Canvas>

      {/* 規格 FE-W01-S05：ready 之後等待狀態消失 */}
      {!ready && <LoadingOverlay />}
    </div>
  )
}
