## Purpose

定義 `/world` 首屏從「打開」到「能動」之間的載入次序與程式碼拆分：什麼先出現、
什麼延後、什麼按使用者意圖才載入，以及所有空窗期畫面都要看得出在動、不是死的白屏。
這個 capability 只規範**次序與有／無**，不規範毫秒門檻 —— 數字目標屬於 `load-budget`。

## Applicability

權限：不適用 —— 本 change 不做授權判斷。
併發：適用 —— 身分解析、chunk 抓取、Canvas 建立、WS 連線、面板開啟意圖會交錯發生，次序要能被鎖死。
持久資料相容性：不適用 —— 不讀寫持久資料、不動合約。
失敗路徑：適用 —— WebGL2 不可用、3D chunk 抓取失敗、面板 chunk 抓取失敗。
測試連到什麼：不連任何外部服務 —— REST 全部 `page.route` 偽造、WS 用 fake client，只打本機自己起的 `next start`（loopback）。

## ADDED Requirements

### Requirement: 首屏以固定次序載入，空窗期由連續載入層覆蓋

打開 `/world` 時系統 SHALL 依此次序推進：DOM 殼（標題列與通知）→ 身分 settled →
3D chunk → Canvas ready → WebSocket 連線。身分 `unknown`（尚未問到答案）時 MUST NOT
開始抓取 3D chunk；身分只要 settled（`guest`／`signed-in`／`unavailable` 三者之一）
即視為可開始。從 `WorldBoundary` 首次顯示到 Canvas ready（`onCreated`）之間，SHALL 由
**同一個**動態載入層持續覆蓋世界區，該載入層 MUST 帶 `role="status"`、且 MUST 有一個
持續運作的動畫（看得出在動，不是靜態文字）；載入層在 Canvas ready 前 MUST NOT 被卸載重掛。

#### Scenario: [FE-X15-S01] DOM 殼與載入層先於 Canvas，載入層到 Canvas ready 才消失

- **WHEN** 使用者打開 `/world`、身分與 Canvas 都尚未就緒
- **THEN** 標題列（DOM 殼）已可見，且世界區有一個 `role="status"`、動畫持續運作的載入層
- **AND** 此時 DOM 中不存在 `<canvas>` 節點
- **AND** 直到 Canvas `onCreated` 之後，該載入層才消失，過程中不曾卸載重掛或閃白

#### Scenario: [FE-X15-S02] 3D chunk 只在身分 settled 後請求

- **WHEN** 身分狀態為 `unknown`
- **THEN** `WorldCanvas` 的 3D chunk 尚未被請求，但標題列與載入層照常顯示
- **WHEN** 身分解析為 settled（`guest`／`signed-in`／`unavailable` 任一）
- **THEN** 3D chunk 才開始被請求

#### Scenario: [FE-X15-S03] Rapier 與 WS 排在 Canvas ready 之後

- **WHEN** Canvas 尚未 ready
- **THEN** Rapier 的 chunk 尚未被請求，且尚未建立 WebSocket 連線
- **WHEN** Canvas ready（`onCreated`）之後
- **THEN** WebSocket 才開始連線，Rapier chunk 才由本地玩家初始化觸發

#### Scenario: [FE-X15-S07] 房間清單不阻塞首個可操作畫面

- **WHEN** Canvas 尚未 ready
- **THEN** 尚未發出房間清單的 `GET /api/rooms` 請求
- **WHEN** Canvas ready 之後
- **THEN** 房間清單才開始載入，其進行中或失敗都不影響世界已可操作

#### Scenario: [FE-X15-S05] 3D chunk 抓取失敗時載入層讓位給錯誤，不無限載入

- **WHEN** 身分已 settled、3D chunk 的請求失敗
- **THEN** 連續載入層讓位給一個可重試的錯誤提示（`role="alert"`），而不是永遠停在載入層
- **AND** 標題列（DOM 殼）仍然可用

### Requirement: 面板按開啟意圖才載入，載入殼立即接管

看板、名片、收件匣三個面板的重模組（entry chunk）在**首次有效開啟意圖**發生前
MUST NOT 被請求。有效開啟意圖包含：看板＝走近後按 E、名片與收件匣＝標題列上的按鈕、
看板深連結＝初始 URL 本身即為開啟意圖。系統 MUST NOT 做 idle prefetch。開啟意圖成立的
當下，輕量 host SHALL 立即（在 chunk 抵達前）鎖住世界輸入、接管焦點、並顯示面板形的
`role="status"` 載入殼；chunk 抵達後於原位換成面板內容。開啟一個面板 MUST NOT 順帶
請求另外兩個面板的 entry chunk。

#### Scenario: [FE-X15-S04] 面板 entry chunk 在開啟意圖前不請求，開啟時只載目標面板

- **WHEN** 使用者已進入世界、尚未對任何面板表達開啟意圖
- **THEN** 三個面板的 entry chunk 都尚未被請求
- **WHEN** 使用者對其中一個面板表達開啟意圖（按 E／點標題列按鈕／帶看板深連結進入）
- **THEN** 立即出現該面板形的 `role="status"` 載入殼、世界輸入被鎖住、焦點被接管
- **AND** 只有被選中的那個面板的 entry chunk 被請求，另外兩個仍未被請求

#### Scenario: [FE-X15-S06] 面板 chunk 抓取失敗時釋放鎖與焦點，使用者不被困住

- **WHEN** 開啟意圖成立、載入殼已鎖住世界輸入、該面板的 entry chunk 請求失敗
- **THEN** 載入殼顯示錯誤提示（`role="alert"`）
- **AND** 世界輸入鎖與焦點被釋放，使用者可回到世界重試，而不是卡在一個永遠載不出來的殼裡
