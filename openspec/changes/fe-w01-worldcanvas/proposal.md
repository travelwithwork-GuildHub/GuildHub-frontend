## Why

`/world` 現在渲染的是一個 DOM 佔位方塊。`FE-X01` 交出了 World 的 client 邊界
與那道縫，**但縫裡還是空的** —— 這個產品到目前為止還沒有任何 3D。

不做會怎樣：**W1 剩下的每一項 3D 工作都沒有地方站。** `FE-W02` 座標系對映、
`FE-W03` LocalPlayer、`FE-W04` Physics、`FE-W05` CameraController、
`FE-W06` SpatialInteraction 全部是 W1，而它們都要掛在一個已經在跑的
render loop 上。里程碑寫 W1 結束時「進得了 3D 世界、走得動、看得到別人」——
**這一項是那句話的第一個字。**

而且這是第一次有東西真的用到 WebGL。**在此之前「這台機器跑不跑得動」
從來沒有被回答過** —— 沒有 Canvas 就沒有東西需要 WebGL2 的 fallback，
現在有了。

## What Changes

- 把 `/world` 的 `WorldPlaceholder` 換成 R3F `<Canvas>`
- Renderer 設定：畫布尺寸與裝置像素比跟著容器變
- 燈光與 soft shadow 設定
- 一個**最小的除錯場景**（一個接收陰影的平面 ＋ 一個投射陰影的方塊），
  存在的唯一理由是讓燈光與陰影可被驗證。**`FE-W10` 會移除它**
- 3D 內容載入期間的 Suspense loading 呈現
- WebGL2 不可用時的降級呈現（**不重試** —— 重試永遠沒用）
- Canvas 卸載時的資源釋放

## Non-goals

**這次明確不做。每一條都對應到一個已經有主人的工作項目：**

- **不做 Floor / Wall / Carpet / Platform 等場景元件** —— `FE-W10`（W3）。
  本次的平面與方塊是除錯用的臨時物件，程式碼裡會標明
- **不做相機** —— `FE-W05`（W1）的 Orthographic Elevated Camera、follow、
  smoothing、以及 **resize 之後維持構圖**。本次的 resize 只管畫布尺寸與 DPR
- **不做玩家、移動、動畫** —— `FE-W03`（W1）
- **不做物理與碰撞** —— `FE-W04`（W1）
- **不做互動與 Interaction Range** —— `FE-W06`（W1）
- **不做場景切換的資源生命週期**，也不做「重複進出十次記憶體不得成長」
  那個可量測的驗收 —— `FE-W07`（W1）。本次只管 Canvas 自己卸載時的釋放
- **不做座標系對映** —— `FE-W02`（W1）
- **不做 3D 色票、材質、比例、Outline 規範** —— `FE-W09`（W3）
- **不做相容矩陣的其餘部分** —— `FE-X09`（W5）的整合顯卡降級、
  **context lost 回復**、`prefers-reduced-motion`、背景分頁節流、Safari／iOS。
  本次只做「WebGL2 不可用時不要白畫面」這一件事
- **不做渲染預算與 40 人同畫面的量測** —— `FE-W13`（W5）
- **不導入 E2E 測試框架** —— `FE-O11`（W1）的裁決範圍。3D 渲染在 jsdom 裡
  驗不到，本次的渲染面靠人工瀏覽器驗證並留證據（見 `design.md`〈驗證方式〉）

## Capabilities

### New Capabilities

- `world-canvas`: World 的 3D 渲染面 —— Canvas 與 renderer 的建立、
  燈光與陰影、畫布尺寸跟隨、載入中的呈現、WebGL2 不可用時的降級、
  以及卸載時的資源釋放

### Modified Capabilities

- `app-shell`: Requirement「World 區域的 client 邊界」——
  `FE-X01-S03` 原本斷言「頁面渲染出⋯⋯World 區域的**佔位內容**」。
  佔位內容被 3D 內容取代之後那句話不再成立。
  **Scenario ID 不變**（它已經在 main 上），改的是它斷言什麼

## Impact

- **相依套件新增**：`three`、`@react-three/fiber`、`@types/three`。
  ⚠️ `@react-three/fiber@9.7.0` 的 peer 是 `react: >=19 <19.3`，
  本專案是 `19.2.8` —— **在範圍內，但接近上界**，升 React 之前要先看它
- **首次載入的體積從這一項開始算。** `three` 進 bundle 之後，
  `FE-O12` 效能預算量到的數字主要由這裡決定
- **`src/app/world/WorldPlaceholder.tsx` 被移除**，`WorldBoundary.tsx`
  的殼**不動** —— 那道縫就是為了這件事留的
- **不影響**：不連任何外部服務，不讀寫持久資料，不觸及後端契約
