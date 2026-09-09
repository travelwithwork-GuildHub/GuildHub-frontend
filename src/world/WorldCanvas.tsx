'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import { layer } from '@/design/layers'
import { isWebGL2Available } from './webgl'
import { WorldShell } from './environment/WorldShell'
import { WorldCamera } from './WorldCamera'
import { LocalPlayer } from './player/LocalPlayer'
import { RemoteWorld } from './RemoteWorld'
import { InteractionProvider } from './interaction/InteractionProvider'
import { InteractionPrompt } from './interaction/InteractionPrompt'
import { SpatialInteraction } from './interaction/SpatialInteraction'
import { BoardTargets } from './rooms/BoardTargets'
import { ProjectDoors } from './rooms/ProjectDoors'
import { CORRIDOR_SLOTS } from './rooms/slots'
import { useRooms } from './rooms/useRooms'

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

  // 相機的跟隨目標。**是 ref 不是 state** —— CONTEXT.md：高頻資料不進 React。
  // FE-W03 接上角色之後，這個 ref 會指向角色的位置；現在它是靜止的原點。
  const cameraTarget = useRef({ x: 0, y: 0, z: 0 })

  // 給網路層的權威狀態。**跟相機的 target 分開** —— 兩者今天相同，
  // 但相機之後可能鎖定別的東西（FE-R03 的 design D1）。
  const localPose = useRef({ x: 0, z: 0, f: 0 })

  // 走廊要生成哪些門（`FE-W12`）。**在 Canvas 外面呼叫** ——
  // 門畫在 3D 裡，而狀態與標籤是 DOM，兩邊要看到同一份資料。
  const rooms = useRooms(CORRIDOR_SLOTS.length)
  // 狀態說明（載入中／失敗／沒有專案／排不下）在下一刀。

  if (!webgl2) return <WebGLUnavailable />

  return (
    // ⚠️ **`InteractionProvider` 要包住 Canvas 與它外面的提示。**
    // 提示是 DOM（`CONTEXT.md`：3D 負責空間，DOM 負責產品操作），
    // 而算出目標的那一半在 Canvas 裡面 —— 兩邊要看到同一份狀態。
    <InteractionProvider>
      <div data-testid="world-canvas-container" className="relative h-full w-full">
        <Canvas
          shadows
          // 規格 FE-W01-S02：DPR 上限 2。不設限的話 3x 螢幕會用九倍的像素
          // 去畫同一個畫面。`2` 不是量出來的最佳值 —— 真正的數字等 FE-O12，
          // 而那時要改的是 Requirement，不是這一行。
          dpr={[1, 2]}
          onCreated={() => setReady(true)}
        >
          {/* 相機由 FE-W05 提供。FE-W01 當時那個 perspective 相機是暫時的 ——
              CONTEXT.md 訂的是固定的 Orthographic Elevated 相機。 */}
          <WorldCamera targetRef={cameraTarget} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[5, 8, 3]}
            intensity={1.6}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <Suspense fallback={null}>
            <WorldShell />
            <LocalPlayer targetRef={cameraTarget} poseRef={localPose} />
            {/* 遠端玩家由 FE-R07 提供。**它自己建立連線** ——
                WorldCanvas 不知道即時層的存在，也不該知道。 */}
            <RemoteWorld poseRef={localPose} />
            {/* 互動目標的判定（FE-W06）。**它不渲染任何東西** ——
                提示在 Canvas 外面。今天世界裡還沒有可互動的物件，
                那是 FE-W12（W3）。 */}
            {/* 走廊上依 `GET /api/rooms` 生成的門（`FE-W12-S01`）。 */}
            <ProjectDoors rooms={rooms.doors} slots={CORRIDOR_SLOTS} />
            {/* 兩塊看板接上互動系統（`FE-W12-S14`）。**它們不接任何 API。** */}
            <BoardTargets />
            <SpatialInteraction poseRef={localPose} />
          </Suspense>
        </Canvas>

        {/* 規格 FE-W01-S05：ready 之後等待狀態消失 */}
        {!ready && <LoadingOverlay />}
        {/* 規格 FE-W06-S13：提示在 Canvas **外面** */}
        <InteractionPrompt />
        {/* ⚠️ 規格 FE-O14-S11／S12：這裡刻意什麼都沒有。
            以前這裡有一段「目前是單人預覽，看不到其他人」——
            拿掉是產品決定（這個網址對外的用途是展示世界，而那段字是
            畫面上唯一的文字，會先於世界本身被讀到）。
            **MUST NOT 加回任何描述即時層狀態的常駐說明。**
            「有位址但連不上」怎麼呈現是 FE-R12（W5），那個可以做 ——
            唯一的限制是不得借用「單人預覽」這種「一切正常」的措辭。 */}
      </div>
    </InteractionProvider>
  )
}
