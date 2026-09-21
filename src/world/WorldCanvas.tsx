'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { layer } from '@/design/layers'
import { useIdentity } from '@/identity/IdentityProvider'
import { shownAvatar } from '@/identity/avatarDraft'
import { useAvatarDraft } from '@/identity/AvatarDraftProvider'
import { useRealtimeGeneration } from '@/realtime/RealtimeGenerationProvider'
import { isWebGL2Available } from './webgl'
import { WorldShell } from './environment/WorldShell'
import { WorldCamera } from './WorldCamera'
import { LocalPlayer } from './player/LocalPlayer'
import { RemoteWorld } from './RemoteWorld'
import type { RemoteIdentity } from '@/realtime/remotePlayers'
import { NameTags, useNameTagNodes } from './NameTags'
import { EditableFocusLock } from './interaction/EditableFocusLock'
import { InteractionProvider } from './interaction/InteractionProvider'
import { InteractionPrompt } from './interaction/InteractionPrompt'
import { SpatialInteraction } from './interaction/SpatialInteraction'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { InboxPanel } from '@/inbox/InboxPanel'
import { ProfilePanel } from '@/profile/ProfilePanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { labelAnchorsFor } from './rooms/anchors'
import { DoorLabels, useLabelNodes } from './rooms/DoorLabels'
import { RoomsNotice } from './rooms/RoomsNotice'
import { CORRIDOR_SLOTS } from './rooms/slots'
import { RoomsRefreshProvider } from './rooms/RoomsRefreshContext'
import { useRooms } from './rooms/useRooms'
import { useSeatAnchorNodes } from './seats/SeatAnchors'
import { RoomSeats } from './seats/SeatMarkers'
import { sceneOf } from './scenes/registry'
import { useSceneRef } from './scenes/SceneContext'
import { WorldUrlSync } from '@/list-panel/PanelUrlSync'
import { SceneObjects } from './scenes/SceneObjects'
import { useRequestEntry } from './scenes/EntryGate'
import { useSceneChatPortIfProvided } from '@/realtime/SceneChatProvider'
import { useStatusPortIfProvided } from '@/realtime/StatusProvider'
import { SceneChatHud } from '@/chat/SceneChatHud'
import { StatusHud } from '@/status/StatusHud'
import { useRoomEntryGateIfProvided } from './scenes/RoomEntryGate'
import { RoomPasswordDialog } from './scenes/RoomPasswordDialog'
import { useScene } from './scenes/SceneProvider'
import { SceneTransitionOverlay } from './scenes/SceneTransitionOverlay'
import { OnlineCount } from './OnlineCount'
import { CAPTION } from '@/design/controls'

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
      <p {...CAPTION}>需要支援 WebGL2 的瀏覽器。</p>
    </div>
  )
}

// `onReady`（FE-X15-S01／S03；ADR 0014）：Canvas `onCreated` 時往上回報，讓 `WorldBoundary`
// 的連續載入層知道何時撤掉、下游（WS）知道 Canvas 已 ready。內部的 `ready`／`LoadingOverlay`
// 仍是 `FE-W01-S04／S05` 的等待態，維持不變。
export default function WorldCanvas({ onReady }: { onReady?: () => void } = {}) {
  // 偵測只做一次。每次 render 都建一個 canvas 去問的話，
  // 會一直吃掉瀏覽器對同時存在的 WebGL context 的配額。
  const [webgl2] = useState(isWebGL2Available)
  const [ready, setReady] = useState(false)

  // 自己的 `av`。規格 `avatar-appearance`（`FE-W19`）。
  //
  // ⚠️ **在這裡讀，不在 `LocalPlayer` 裡讀。** `LocalPlayer` 在 `<Canvas>`
  // 裡面，而 React context **不會自動跨過 R3F 的 renderer 邊界** ——
  // 在那裡呼叫 `useIdentity()` 會拿不到 provider。這一行在 Canvas 外面。
  //
  // ⚠️ **還沒登入的人不是錯誤。** `identity` 有四種狀態，只有 `signed-in`
  // 才有 profile；其餘一律不給值，交給 `avatarLook()` 回預設 ——
  // **在這裡寫 `?? 0` 會製造第二份值域規則**，而兩份規則一定會漂。
  //
  // ⚠️⚠️ **這裡讀的是「正在挑的那個」，不是已儲存的那個**（`FE-A05-S01`）：
  // 選了就要立刻看得到，不必先儲存。而**其他人看到的仍然是已儲存值**
  // （`S02`）—— 那條路走的是 WebSocket，跟這一行無關。
  const identity = useIdentity()
  const { draft } = useAvatarDraft()
  const av = shownAvatar(identity, draft)
  // 自己的名字（`FE-X17-S01`）：登入了才有名字牌 —— 訪客沒有 `display_name`，就沒有牌子（跟遠端「空名不畫」同一條規則）。
  const myName = identity.state === 'signed-in' ? identity.profile.display_name : ''
  // ⚠️ **同樣要在 Canvas 外面讀**（context 跨不過 R3F 的邊界）。
  const { generation } = useRealtimeGeneration()

  // 相機的跟隨目標。**是 ref 不是 state** —— CONTEXT.md：高頻資料不進 React。
  // FE-W03 接上角色之後，這個 ref 會指向角色的位置；現在它是靜止的原點。
  const cameraTarget = useRef({ x: 0, y: 0, z: 0 })

  // 給網路層的權威狀態。**跟相機的 target 分開** —— 兩者今天相同，
  // 但相機之後可能鎖定別的東西（FE-R03 的 design D1）。
  const localPose = useRef({ x: 0, z: 0, f: 0 })
  // 換場景的閘門（`FE-V01-S18`）：舊子樹的 `RemoteWorld` 卸載時放進「舊 socket 關乾淨了」的 promise，
  // 新子樹的等它再連。**跨兩次掛載**，所以住在 Canvas 外面這一層。
  const closeGate = useRef<Promise<void> | null>(null)
  // 目前 scene 的在線人數（`FE-R10`，design D4）。**`null` ＝ 還沒有初始 snapshot**，不是 0。
  // 算的是 Canvas 裡的 `RemoteWorld`，顯示在 Canvas 外面（DOM）—— 所以狀態住在這一層。
  // ⚠️ 傳給 `RemoteWorld` 的是 `setOnlineCount` 本身：React 保證 setter 身分穩定，
  // 它在那個 effect 的依賴裡。包一層 inline 箭頭函式的話，每次人數變動都會重連。
  const [onlineCount, setOnlineCount] = useState<number | null>(null)
  // 名單（規格 `name-tag`，design D5）：名字牌是 Canvas 外的 DOM，名單從 `RemoteWorld` 用 callback 送出來（低頻，join／leave 才變）。
  // 同樣傳 setter 本身（身分穩定）。牌子的**位置**不經過這裡 —— 每個 `RemotePlayer` 每幀直接寫進 `tagNodesRef` 登記的節點。
  const [roster, setRoster] = useState<ReadonlyMap<string, RemoteIdentity>>(() => new Map())
  const tagNodesRef = useNameTagNodes()

  // 現在在哪個場景（`FE-V01`）。渲染的配置、出生點、只屬於大廳的東西都從註冊表推導 —— 不各自 `if`。
  const scene = useSceneRef()
  const hall = scene.id === 'hall'
  const def = sceneOf(scene)
  // 票與連線事件的回報（`FE-V01` 的過場）。`reportConnection` 身分穩定 —— 它會進 `RemoteWorld` 的 effect 依賴。
  const { token, reportConnection, canReconnect, returnToHall } = useScene()
  // 對著門按 E（`FE-V01-S10`）：在 Canvas 外面拿動作、當 prop 交給 Canvas 裡的門。
  const requestEntry = useRequestEntry()
  // 房間密碼視窗開著：世界區（canvas、HUD、門標籤）整層 `inert`（`FE-X16-S06` 被遮的那一層），視窗本身在這層外面
  const worldDialogOpen = useRoomEntryGateIfProvided()?.request != null
  // 場景聊天的口（`FE-R11`）：context 不跨 R3F 的 renderer 邊界，當 prop 交給 `RemoteWorld`；沒 provider 就沒有聊天。
  const chat = useSceneChatPortIfProvided()
  // 自己的狀態文字的口（`FE-K05`）：同樣當 prop 交給 `RemoteWorld`；沒 provider 就沒有狀態。
  const status = useStatusPortIfProvided()

  // 走廊要生成哪些門（`FE-W12`）。**在 Canvas 外面呼叫** ——
  // 門畫在 3D 裡，而狀態與標籤是 DOM，兩邊要看到同一份資料。
  // 只有大廳有走廊：房間裡**不打、不輪詢** `GET /api/rooms`（`FE-V01-S03`）。
  //
  // ⚠️ **`&& ready`：房間清單不阻塞首個可操作畫面（`FE-X15-S07`；ADR 0014）。** Canvas ready
  // 之前 `enabled=false`，一次 `GET /api/rooms` 都不打；ready 之後 `false→true`，`useRooms`
  // 立即請求（見它的 `enabled` 說明）。它進行中或失敗都不影響世界已可操作 —— 世界不等它。
  const rooms = useRooms(CORRIDOR_SLOTS.length, hall && ready)
  // 標籤的 DOM 節點。**身分穩定，不進 React** —— 位置每幀由投影元件直接寫進 style。
  const labelNodesRef = useLabelNodes()
  // 工位錨點的 DOM 節點（`FE-W16-S06`）：同樣不進 React，位置由 Canvas 裡的投影器每幀寫。
  const seatNodesRef = useSeatAnchorNodes()

  // WebGL2 不可用是一個**終局可顯示狀態**：照樣回報 `onReady`，讓 `WorldBoundary` 的連續載入層
  // （`WorldLoadSequence`，只在 `onReady` 撤）讓位給下面的 `WebGLUnavailable` 提示。否則這裡永遠不會
  // 有 Canvas／`onCreated`，載入層會**永久覆蓋**那段 `role="alert"`（archive-review／codex 抓到，違反
  // 「載入層讓位、不接管」）。`webgl2` 由 `useState` 建、穩定，effect 只跑一次。
  useEffect(() => {
    if (!webgl2) onReady?.()
  }, [webgl2, onReady])

  if (!webgl2) return <WebGLUnavailable />

  // 標籤掛在門頂上。**錨點與門的幾何從同一份推導** —— 門變高標籤跟著上去。
  const anchors = labelAnchorsFor(rooms.doors, CORRIDOR_SLOTS)

  return (
    // ⚠️ **`InteractionProvider` 要包住 Canvas 與它外面的提示。**
    // 提示是 DOM（`CONTEXT.md`：3D 負責空間，DOM 負責產品操作），
    // 而算出目標的那一半在 Canvas 裡面 —— 兩邊要看到同一份狀態。
    <InteractionProvider>
      {/* 看板開出來的面板（`FE-B01`）：開的動作在 Canvas 裡（看板的 `onInteract`），
          面板在 Canvas 外面 —— 同樣要包住兩者。**要在 `InteractionProvider` 裡面**：
          面板開著時要鎖世界的移動輸入，那把鎖在互動層。 */}
      <ListPanelProvider>
      {/* 門的立即重取交給看板面板裡的成軍／結案（`FE-J04`）：不在大廳時 `useRooms` 的 refresh 是 no-op */}
      <RoomsRefreshProvider refresh={rooms.refresh}>
        {/* 文字輸入框有焦點時打字不是走路（`FE-X06`）。今天世界裡還沒有輸入框 —— 先掛著。 */}
        <EditableFocusLock />
        {/* 網址 ⇄ 開著哪一層、在哪個場景（`FE-B09`、`FE-V01`）。在 Canvas 外面、provider 裡面：它改的是網址不是路由，世界不重掛。 */}
        <WorldUrlSync />
        {/* `tabIndex=-1` ＋ `data-focus-anchor`：世界焦點錨（`FE-X06-S13`）。面板關閉後焦點放這裡 ——
            不是 `body`（鍵盤使用者迷航）、不是標題列（跟這次操作無關）。點世界也會聚焦到它。 */}
        <div
          data-testid="world-canvas-container"
          data-focus-anchor="world"
          tabIndex={-1}
          className="relative h-full w-full outline-none"
        >
          {/* 被遮罩蓋住的那一層：`display: contents`（不改版面、不改堆疊），只帶 `inert`。 */}
          <div data-testid="world-stage" inert={worldDialogOpen} className="contents">
          <Canvas
            shadows
            // 規格 FE-W01-S02：DPR 上限 2。不設限的話 3x 螢幕會用九倍的像素
            // 去畫同一個畫面。`2` 不是量出來的最佳值 —— 真正的數字等 FE-O12，
            // 而那時要改的是 Requirement，不是這一行。
            dpr={[1, 2]}
            onCreated={() => {
              setReady(true)
              onReady?.()
            }}
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
            {/* ⚠️ **世界子樹在 Canvas ready 之後才掛載（`FE-X15-S03`；ADR 0014）。**
                `onCreated`（renderer 建好）之前這裡是空的 —— 於是 WS 連線（`RemoteWorld` 的
                掛載 effect）與 Rapier 的 `import('@dimforge/rapier3d-compat')`（`LocalPlayer` 的
                掛載 effect）在 ready 之前**根本不存在**，不可能提早觸發。`onCreated` 是 renderer
                層級的 callback，不依賴 scene children —— 空 Canvas 一樣會 fire、翻 `ready`，下一個
                commit 才掛這棵子樹（不會 chicken-and-egg；codex／Gemini 覆核一致）。相機與光是
                Canvas 本身的常駐設定，不 gate。 */}
            {ready && (
            /* ⚠️ **`key` 是換場景的機制**（`FE-V01`，design D3）：`wsScene` 變了，這整棵子樹卸載再掛 ——
                物理世界（在 `LocalPlayer` 的 effect 裡建）連同碰撞體全拆全建、`LocalPlayer` 在掛載時讀一次的
                `spawn`／`layout` 拿到新的、`RemoteWorld` 的 cleanup 關掉舊連線。**`<Canvas>` 在外面，不重掛**
                （`FE-B09-S12`）。少了這個 key，畫面會換成房間、玩家卻還撞著大廳的牆。 */
            <Suspense fallback={null} key={def.wsScene}>
              <WorldShell layout={def.layout} />
              <LocalPlayer targetRef={cameraTarget} poseRef={localPose} av={av} spawn={def.spawn} layout={def.layout} tagNodesRef={tagNodesRef} />
              {/* 遠端玩家由 FE-R07 提供。**它自己建立連線** ——
                  WorldCanvas 不知道即時層的存在，也不該知道；連哪個 scene 由註冊表決定（`FE-V01-S01`）。 */}
              <RemoteWorld
                poseRef={localPose}
                generation={generation}
                scene={def.wsScene}
                token={token}
                closeGateRef={closeGate}
                onConnection={reportConnection}
                canReconnect={canReconnect}
                chat={chat}
                status={status}
                onOnlineCountChange={setOnlineCount}
                onRosterChange={setRoster}
                tagNodesRef={tagNodesRef}
              />
              {/* 互動目標的判定（FE-W06）。**它不渲染任何東西** ——
                  提示在 Canvas 外面。今天世界裡還沒有可互動的物件，
                  那是 FE-W12（W3）。 */}
              {/* 隨場景不同的物件：門、看板、門標籤的投影 —— **只在 Guild Hall**（`FE-V01-S03`）。 */}
              <SceneObjects
                scene={scene}
                doors={rooms.doors}
                slots={CORRIDOR_SLOTS}
                anchors={anchors}
                nodesRef={labelNodesRef}
                seatNodesRef={seatNodesRef}
                requestEntry={requestEntry}
                poseRef={localPose}
                requestExit={returnToHall}
              />
              <SpatialInteraction poseRef={localPose} />
            </Suspense>
            )}
          </Canvas>

          {/* 規格 FE-W01-S05：ready 之後等待狀態消失 */}
          {!ready && <LoadingOverlay />}
          {/* 過場（`FE-V01-S05`）：蓋在 Canvas 上、`hud` 層；目的地的名字由發起過場的人給（門知道房間標題）。 */}
          <SceneTransitionOverlay />
          {/* 規格 FE-W06-S13：提示在 Canvas **外面** */}
          <InteractionPrompt />
          {/* 目前 scene 的在線人數（`FE-R10-S07`～`S09`）。兩個場景都有；未就緒時不渲染。 */}
          <OnlineCount count={onlineCount} />
          {/* 遠端玩家的名字牌（`FE-W08`）：HUD，兩個場景都有；位置每幀由 Canvas 裡的 `RemotePlayer` 寫，這裡只掛節點。 */}
          <NameTags roster={roster} nodesRef={tagNodesRef} self={{ name: myName }} />
          {/* 場景聊天（`FE-K04`）：非阻斷的 HUD，靠左下、不遮提示；只看不鎖，輸入框有焦點才鎖（`EditableFocusLock`）。沒 provider 就不畫。 */}
          <SceneChatHud />
          {/* 自己的狀態文字（`FE-K05`）：HUD，在線數底下；只給已登入的人、沒 provider 不畫；輸入框有焦點才鎖（同一道 `EditableFocusLock`）。 */}
          <StatusHud />
          {/* 看板開出來的清單面板（`FE-B01`）。DOM，`layer('panel')`。 */}
          <BoardPanel />
          {/* 「我的名片」面板（`FE-A04`）：開關在標題列的按鈕，面板在這裡 —— 同一個定位基準、同一把鎖的 provider 底下。 */}
          <ProfilePanel />
          {/* 收件匣面板（`FE-K01`）：同一個位置、同一把鎖的 provider 底下；開關與資料在 page.tsx 的 InboxPanelProvider。 */}
          <InboxPanel />
          {/* 規格 FE-W12-S02／S03／S04／S05：走廊的門「為什麼不在那裡」。
              **一切正常時它什麼都不顯示** —— 見下面那條禁令。 */}
          {/* 規格 `FE-W12-S09`：名稱與在線數**常態可見**。
              `CONTEXT.md` 那條鏈的第一環是「看見」—— 只在走到門前才顯示的話，
              那已經是第二環「靠近」了。 */}
          {/* 門標籤與走廊提示也是大廳的（`FE-V01-S03`）：房間裡沒有走廊。 */}
          {hall && <DoorLabels anchors={anchors} nodesRef={labelNodesRef} />}
          {hall && <RoomsNotice view={rooms} />}
          {/* 工位的投影錨點（`FE-W16-S06`）**只在房間**，裡面是座位標籤與回饋（`FE-J13`）；沒登入就只有錨點（aria-hidden、沒內容、e2e 的尺）。
              以 `projectId` 為 key：換房間名字快取從頭來。 */}
          {scene.id === 'room' && <RoomSeats key={scene.projectId} projectId={scene.projectId} nodesRef={seatNodesRef} />}
          </div>
          {/* 房間密碼視窗（`FE-N08`）：沒票的門按 E 開；同一把鎖、同一個焦點錨。開關在 page.tsx 的 RoomEntryGateProvider。在 `world-stage` 外面：遮罩蓋的是它以外的整層。 */}
          <RoomPasswordDialog rooms={rooms.all} />
          {/* ⚠️ 規格 FE-O14-S11／S12：這裡刻意什麼都沒有。
              以前這裡有一段「目前是單人預覽，看不到其他人」——
              拿掉是產品決定（這個網址對外的用途是展示世界，而那段字是
              畫面上唯一的文字，會先於世界本身被讀到）。
              **MUST NOT 加回任何描述即時層狀態的常駐說明。**
              「有位址但連不上」怎麼呈現是 FE-R12（W5），那個可以做 ——
              唯一的限制是不得借用「單人預覽」這種「一切正常」的措辭。 */}
        </div>
      </RoomsRefreshProvider>
      </ListPanelProvider>
    </InteractionProvider>
  )
}
