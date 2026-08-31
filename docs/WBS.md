# 前端工作分解

> **WBS = Work Breakdown Structure（工作分解結構）** ——
> 把 12 週的產品目標拆成一條一條可以認領的工作項目。

六個群組。`點` 是估點，來自原始規劃表。
產品與場景的「為什麼」在 `docs/ROADMAP.md`，這裡只有「做什麼」。

**這份不是規格。** 規格在 `openspec/changes/<change>/`，由 `/opsx:propose` 產生。
開 change 的時候用這裡的 ID 命名（例如 `fe-w04-camera-controller`），方便對照。

---

## FE-C 基礎架構

> Next.js / TypeScript / TanStack Query / Zustand / Zod / Session
> W1–W2｜建立所有前端模組共用基礎

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-C01 | AppShell | 建立 Next.js + TypeScript 專案骨架與 `/world` 路由（World 以 Client Component 載入） | W1 | 3 |
| | | 全域 Layout / Provider（QueryClient、Store、Error Boundary） | W1 | 3 |
| | | Tailwind CSS 與 DOM UI Design Token | W1 | 2 |
| FE-C02 | APIClient | FastAPI REST Client；統一 baseURL / headers / error handling | W2 | 3 |
| | | Profile / Project / Message / Room / Seat API modules | W2 | 5 |
| FE-C03 | Schema | Profile / Project / Message / Room / Avatar Zod Schemas | W2 | 4 |
| | | ClientMessage / ServerMessage discriminated union | W1 | 4 |
| | | API Error Schema 與 safeParse 錯誤處理 | W2 | 2 |
| FE-C04 | StateManagement | TanStack Query Provider / Query Keys 規範 | W2 | 2 |
| | | `ui.store` / `world.store` / `interaction.store` / `avatar.store`（高頻 position / animation **不寫入 Zustand**） | W1–W2 | 4 |
| FE-C05 | Session | 匿名暱稱登入與 Session 保存 | W2 | 3 |
| | | 重整恢復 Session；Guest / Member 權限辨識 | W2 | 3 |

**所有 API / WebSocket 外部資料皆以 Zod 驗證。**

---

## FE-W 3D 空間

> React Three Fiber / Three.js / Drei / Rapier / Procedural Stylized 3D

### W1 技術 Spike —— 先以程式化幾何驗證移動、視角、碰撞、互動與多人呈現

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-W01 | WorldCanvas | R3F Canvas、Renderer、Lighting、Soft Shadow、Resize | W1 | 4 |
| | | Suspense / World Loading fallback 與資源清理 | W1 | 2 |
| FE-W02 | LocalPlayer | 程式化 Chibi Player prototype 與 WASD / 方向鍵輸入 | W1 | 4 |
| | | X/Z 平面移動、rotation、速度限制（3D rendering + 2D gameplay logic） | W1 | 4 |
| | | Idle / Walk 程式動畫 prototype（bounce / arm-leg swing） | W1 | 3 |
| FE-W03 | Physics | Rapier Player / Ground / Wall / Static Object Collider | W1 | 5 |
| | | World Bounds、穿牆防護、Trigger / Sensor 基礎元件 | W1 | 4 |
| FE-W04 | CameraController | 固定 Orthographic Elevated Camera（固定角度／距離，**不給玩家自由旋轉**） | W1 | 3 |
| | | Camera follow + smoothing；Resize 維持構圖 | W1 | 3 |
| FE-W05 | SpatialInteraction | Interactable contract 與 Interaction Range 判定 | W1 | 4 |
| | | 顯示 E 互動提示；避免同時觸發多個物件 | W1 | 3 |
| | | `interactionTarget` → React DOM Panel / Modal（**3D 負責空間，DOM 負責產品操作**） | W1 | 3 |

### W3 GuildHub 3D Design System —— 以程式化元件統一 Toy-like / Chibi 風格

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-W06 | WorldDesignSystem | 3D 色票、材質、比例、圓角、Outline、Shadow 規範（**所有場景元件只能用統一 tokens**） | W3 | 4 |
| | | RoundedBox / Capsule / Sphere / Cylinder 基礎 Primitive | W3 | 4 |
| | | 共用 StylizedMaterial / Outline / Shadow conventions | W3 | 3 |
| FE-W07 | EnvironmentComponents | Floor / Wall / Carpet / Platform | W3 | 4 |
| | | Desk / Chair / Shelf / Plant / Lamp / Sign | W3 | 6 |
| | | GuildBanner / ProjectBoard / TalentBoard / Door 視覺元件 | W3 | 5 |
| FE-W08 | GuildHallScene | 用程式化元件組出 Guild Hall（**不依賴完整外部場景模型**） | W3 | 6 |
| | | spawn、Project Board、Talent Board、社交區與 Corridor 配置 | W3 | 5 |
| | | 簡化 Collider 與固定 Camera 構圖驗證 | W3 | 3 |
| FE-W09 | ProceduralAvatar | Head / Hair / Body / Arms / Legs 模組化 Chibi Avatar | W2–W3 | 6 |
| | | Body / Hair / Outfit / Skin / Color variation 系統 | W3 | 5 |
| | | Idle / Walk 程式動畫正式版，Local / Remote 共用 | W3 | 4 |
| | | 顯示 Display Name / Status | W3 | 2 |
| FE-W10 | AvatarCreator | 首次登入顯示角色外觀選擇流程 | W2 | 4 |
| | | Body / Hair / Hair Color / Outfit / Outfit Color / Skin 選項 | W2 | 5 |
| | | R3F Avatar 即時 Preview | W2 | 4 |
| | | **儲存 Avatar Configuration，不儲存模型檔** | W2 | 3 |
| FE-W11 | ProjectBoardObject | 程式化 3D Project Board 與 Interaction Range | W3 | 2 |
| | | 互動後開啟 ProjectBoard React UI | W3 | 2 |
| FE-W12 | TalentBoardObject | 程式化 3D Talent Board 並接 SpatialInteraction | W3 | 2 |
| FE-W13 | ProjectDoor | 依 active projects 程式生成 Door；顯示 Project Name / Online Count | W4 | 4 |
| | | Door interaction → Room Password UI | W4 | 2 |
| FE-W14 | ProjectRoomScene | 用共用 3D Design System 組出 Project Room | W4 | 5 |
| | | Room spawn / collision / desk layout | W4 | 4 |
| | | Guild Hall ↔ Project Room scene transition | W4 | 4 |
| FE-W15 | SeatObject | 程式化 Seat Object 與 available / occupied 狀態 | W4 | 3 |
| | | Seat interaction 與 API 結果同步 3D 狀態 | W4 | 3 |
| FE-W16 | ExternalAssetFallback | 外部 GLB 使用規則：僅特殊物件、需符合色票與風格 | W3 | 1 |
| | | 必要時以 Blender 簡化／改材質後導入（**預設不排入 MVP 工時**） | W3–W5 | 0 |

---

## FE-R 即時協作

> Native WebSocket / Presence / Position Sync / Interpolation / Chat
> **W1 Go / No-Go：40 真實 R3F Browser E2E**

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-R01 | RealtimeClient | WebSocket connection / handshake / connection state | W1 | 4 |
| | | 加入／離開 scene、disconnect cleanup | W1 | 3 |
| | | Heartbeat / reconnect 基礎流程 | W1–W5 | 4 |
| FE-R02 | RealtimeProtocol | Zod 驗證 snapshot / player_joined / player_left / positions | W1 | 4 |
| | | 補 status / chat / invalid payload handling | W3 | 3 |
| FE-R03 | PositionSync | Local Player position / rotation 取樣與 **≤10 Hz** send | W1 | 4 |
| | | 靜止停止送 position；scene 切換停止舊同步 | W1 | 2 |
| FE-R04 | RemotePlayers | Snapshot 建立 Remote Players；join / leave lifecycle | W1 | 4 |
| | | positions 更新 target state；Remote Avatar 用同一 ProceduralAvatar | W1–W3 | 3 |
| FE-R05 | Interpolation | previous / target position；**10 Hz network → 60 FPS render**（遠端角色無明顯跳格） | W1 | 6 |
| | | rotation interpolation、jitter / 缺包 / teleport threshold | W1 | 4 |
| FE-R06 | BrowserLoadTest | 40 個真實 Chromium / R3F browser E2E 腳本（**不是只有 WebSocket fake client**） | W1 | 6 |
| | | 驗證單一 browser 同畫面渲染 39 個 remote（記錄 FPS / CPU / GPU / Memory） | W1 | 4 |
| | | 另執行 40 WebSocket client network baseline（**區分 server/protocol 與 browser rendering 問題**） | W1 | 2 |
| FE-R07 | Presence | Online user snapshot / Player status / offline cleanup | W3 | 3 |
| | | Status 12 字限制、快捷狀態與 Online Count | W3 | 3 |
| FE-R08 | RealtimeChat | Lobby / Room scene chat send / receive | W3–W4 | 4 |
| | | Client memory 保留近期訊息；**Refresh 後清空** | W3 | 2 |

**Realtime state 不落 DB。**

---

## FE-P 產品功能

> Onboarding / Profile / Boards / Projects / Inbox / Room
> W2｜**3D 關閉時產品核心流程仍可使用**

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-P01 | Onboarding | 第一次登入：暱稱 → AvatarCreator → 進入 Guild Hall | W2 | 4 |
| | | 已建立 Avatar 的使用者直接恢復角色設定 | W2 | 2 |
| FE-P02 | Profile | Profile 顯示／編輯：Display Name、Skills、Hours、Bio | W2 | 5 |
| | | 顯示／更新 Avatar Configuration | W2 | 3 |
| | | React Hook Form + Zod validation + API update | W2 | 3 |
| FE-P03 | BoardShell | 共用 Panel Layout、列表、搜尋、篩選、Pagination | W2 | 5 |
| | | Detail、Loading、Empty、Error、Close / Escape | W2 | 4 |
| FE-P04 | ProjectBoard | 讀取 recruiting projects、Project Card / Detail / needed skills | W2 | 4 |
| | | 聯絡發起人與發案入口 | W2 | 2 |
| FE-P05 | TalentBoard | 讀取 profiles、Talent Card / Detail、Skills filter / Available Hours | W2 | 4 |
| | | 聯絡人才 | W2 | 1 |
| FE-P06 | ProjectManagement | Create Project / Project Detail / Status 顯示 | W2 | 4 |
| | | 成軍：**強制設定 Room Password** | W4 | 3 |
| | | 結案與 `expires_at` 狀態顯示 | W4 | 2 |
| FE-P07 | Inbox | Inbox List / Message Detail / Send Message | W2 | 5 |
| | | Read / Unread；**不可 Edit / Delete** | W2 | 2 |
| FE-P08 | StatusControl | 快捷狀態、自由輸入、12 字限制、清除狀態 | W3 | 3 |
| | | 透過 WebSocket 同步 Status | W3 | 2 |
| FE-P09 | ChatPanel | Lobby / Room Chat UI、訊息列表、輸入框 | W3–W4 | 4 |
| | | 場景切換清理 Chat | W4 | 1 |
| FE-P10 | RoomAccess | Password Modal、錯誤回饋、取得 room token | W4 | 4 |
| | | 進入／離開 Project Room | W4 | 2 |
| FE-P11 | SeatManagement | Seat List / Claim Seat / Occupied State | W4 | 4 |
| | | 處理 Seat Conflict / Owner Release Seat | W4 | 3 |
| FE-P12 | MeetingLink | 顯示外部 Meeting URL 並開啟（**不自建視訊**） | W4 | 2 |

---

## FE-Q 品質與發表

> W5｜**不再增加核心功能**

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-Q01 | VisualPolish | 統一 Chibi / Toy-like 風格的色彩、圓角、Outline、Shadow | W5 | 4 |
| | | 固定 Camera 下調整 Guild Hall 構圖與可讀性 | W5 | 3 |
| | | Avatar 外觀組合視覺檢查，避免穿模與色彩衝突 | W5 | 3 |
| FE-Q02 | ErrorHandling | REST / WebSocket / Zod invalid payload 錯誤狀態 | W5 | 3 |
| | | Room password / Seat conflict / Network disconnected UI | W5 | 3 |
| FE-Q03 | LoadingExperience | Page / API / World / Scene transition Loading | W5 | 3 |
| FE-Q04 | Performance | FPS、Draw Calls、Memory、WebSocket traffic 檢查 | W5 | 4 |
| | | 40 Remote Avatar rendering 優化；必要時導入 Instances | W5 | 5 |
| | | 確認單一正常使用 browser 的 Guild Hall 體驗目標（**壓測與渲染分開評估**） | W5 | 3 |
| FE-Q05 | GuestMode | Guest 可移動／看玩家／看板；限制發案／寄信／進房 | W5 | 4 |
| | | 權限不足 UI 提示 | W5 | 2 |
| FE-Q06 | DemoBot | Local fake player：spawn / random wander / idle at board | W5 | 3 |
| | | Status rotation；**不進 DB、不送 WebSocket** | W5 | 2 |
| FE-Q07 | DemoFlow | Demo fake data、固定發表流程、Demo reset | W5 | 3 |
| | | World 預載、異常 fallback、完整 E2E rehearsal | W5 | 4 |

---

## FE-S 場景與產品擴充

### W4–W5 MVP 場景擴充

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-S01 | SceneNavigation | Guild Hall / Marketplace / Office / Project Room 場景註冊與切換架構 | W4 | 5 |
| | | 場景入口、Transition、Loading、返回 Guild Hall | W4 | 4 |
| | | **切換場景時同步 WebSocket scene membership 與 Presence** | W4 | 4 |
| FE-S02 | MarketplaceScene | Marketplace 場景與 Project / Talent 入口（**DOM 負責搜尋篩選，3D 負責探索入口**） | W4 | 5 |
| | | 案件看板與人才看板的 Spatial Interaction 整合 | W4 | 3 |
| FE-S03 | OfficeScene | 以共用 3D Design System 組出 Office | W4 | 6 |
| | | 工作桌、座位、休息區、玩家 Presence 配置 | W4 | 5 |
| | | 查看附近成員的 Display Name / Status / Profile | W5 | 4 |
| | | Office ↔ Guild Hall / Marketplace 切換 | W4 | 3 |

### W6–W8 媒合與社交強化

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-S04 | SkillSpaces | Developer Office / Design Studio / AI Lab 場景資料模型 | W6 | 4 |
| | | 以同一套 Procedural 元件配置不同主題場景 | W6 | 6 |
| | | Profile Skills 與推薦場景入口連動 | W6 | 4 |
| FE-S05 | PersonalDesk | Office 空位 Claim / Leave 與工作桌顯示 | W6 | 4 |
| | | 工作桌顯示 Avatar、Skills、Status、Profile / Message 入口 | W6 | 4 |
| FE-S06 | LookingFor | Available for Work / Hiring / Looking For 狀態 UI | W7 | 4 |
| | | Looking For 技能／角色標籤，顯示於 Profile / Player Detail | W7 | 4 |
| | | 3D 只顯示簡化媒合狀態，**不讓頭頂資訊過載** | W7 | 3 |
| FE-S07 | TeamFormation | Project Detail 顯示 Founder / Team / Open Roles | W7 | 5 |
| | | 以 Role Slot 呈現已加入與仍招募角色 | W7 | 4 |
| | | 從 Talent / Player Profile 發起專案邀請 | W8 | 5 |
| | | 成軍後同步 Project Door / Room Team 狀態 | W8 | 4 |

### W9–W10 專案空間強化

> GuildHub 管人與空間；專業工作交給外部工具

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-S08 | ProjectResources | Project Room 建立 Resources Board | W9 | 4 |
| | | 顯示 GitHub / Figma / Notion / Drive / Meeting 外部連結 | W9 | 4 |
| | | 資源 icon / type / URL validation 與 External Open | W9 | 3 |
| FE-S09 | RoomPresence | Project Room 顯示 Team Members / Online / Status | W9 | 4 |
| | | Seat / Team / Presence 狀態整合 | W9 | 3 |
| FE-S10 | SceneDiscovery | Guild Hall 增加世界導覽／場景地圖／快速移動 UI | W10 | 5 |
| | | 顯示各場景 Online Count 與推薦入口 | W10 | 4 |

### W11–W12 Community 與留存

| ID | 項目 | 工作 | 週 | 點 |
|---|---|---|---|---|
| FE-S11 | CommunityEvents | 活動列表、活動 Detail、活動場景入口 | W11 | 5 |
| | | Demo Day / Networking / Meetup 等活動類型 | W11 | 4 |
| | | 活動開始時顯示場景 Online Count / Participants | W11 | 3 |
| FE-S12 | EventSpace | 以 Procedural 3D 元件建立 Event Space / Stage / Audience Area | W11 | 6 |
| | | 活動場景 Presence / Chat / Spatial Interaction | W11 | 4 |
| FE-S13 | DiscoveryExperience | Guild Hall 顯示熱門案件、缺人 Project、熱門場景 | W12 | 5 |
| | | 新手導覽：發案／接案／找人／進 Office／進 Project Room | W12 | 5 |
| | | 回訪入口：最近 Project / 最近場景 / 未讀 Inbox | W12 | 4 |
