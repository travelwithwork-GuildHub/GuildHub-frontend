## Purpose

Guild Hall 的兩塊看板（專案、人才）在**看板面上**各自畫出第一頁前幾筆的可辨識摘要（案件標題／人才名字），
並把「有東西／沒東西／暫時讀不到／載入中」四種狀態畫成從房間另一端就分得出來的訊號。它讓
`CONTEXT.md` 那條鏈「看見 → 靠近 → 旁聽 → 加入」的第一環（看見這裡有東西值得靠近）在**沒有按 E 開面板**之前就成立 ——
看板不再是一條走過去才知道有沒有內容的「很貴的導覽列」。摘要是常駐輪詢的資料、投影成 Canvas 外的 DOM，跟門標籤、工位錨點同一條路。

## Applicability

權限：適用 —— 看板讀的是 `listProjects`／`listProfiles`（跟面板同一組公開清單）；本 change 不做授權判斷，但失敗分類要分出「權限／驗證」那一類（沿用 `FE-X04` 的 `failureKind`）。
併發：適用 —— 常駐輪詢每 30 秒重取，同時 render loop 每幀寫 overlay 的位置；舊回應晚到不得蓋掉新的（單飛 `AbortController`）。
持久資料相容性：不適用 —— 不讀寫任何持久資料；看板資料是唯讀的清單快照。
失敗路徑：適用 —— 清單為空、載入失敗（含權限／驗證類）、投影落在畫面外、名單有資料但輪詢中止／分頁隱藏。
測試連到什麼：jsdom 判準不連任何外部服務（`listProjects`／`listProfiles` 用 fake adapter）；真瀏覽器判準連**本機自起**的 `next start`，`/api/*` 用 `page.route` 偽造、`/ws` 用 `routeWebSocket` 偽造（`tests/e2e/lib/world.mjs` 的 `fakeRealtime`）。不連任何團隊共用的位址。

## 名詞

- **看板**：`board-project`（專案）與 `board-talent`（人才），Guild Hall 北面的兩塊 `Interactable`（`world-interactive-objects`）；本 change 只加它們面上的摘要，不動 mesh／座標／按 E 開面板。
- **摘要**：看板面上最多 **4** 張卡，每張寫 page 0 的一筆的單一欄位 —— 專案看板寫案件標題、人才看板寫 `display_name`；單行、超出截斷（固定寬）。
- **卡槽**：看板 mesh 上既有的 4 個卡位；摘要填 `min(4, n)` 張（`n` = page 0 筆數），其餘維持空槽。
- **四種狀態**：**有內容**（≥1 張填了字的卡）、**空的**（page 0 零筆）、**讀不到**（載入失敗）、**載入中**（還沒拿到 page 0）。
- **狀態訊號**：四種狀態各自在看板面上的粗略外觀（填了字的卡／空的處置／錯的處置／骨架卡），**從出生點（z=-1）就分得出來是哪一種**（不需讀得到字）。
- **`useBoardSummary(kind)`**：看板的常駐資料 hook，抓 page 0、每 **30 秒**輪詢、分頁隱藏停、離開 Guild Hall 中止；跟面板的 `useListPage` **各自獨立**。
- **投影**：世界座標 → CSS 像素，**跟門標籤／工位錨點同一份**（`labelProjection.ts` 的 `screenPixelFor` → `framing.ts` 的 `toScreen`）；不得另寫公式。

## ADDED Requirements

### Requirement: 看板面上有第一頁前幾筆的可辨識摘要

有人登入、在 Guild Hall 場景時，每塊看板 SHALL 在它的卡槽上畫出 page 0 的前 `min(4, n)` 筆的可辨識摘要
（`n` = page 0 的筆數）：專案看板每張卡寫一筆的**案件標題**、人才看板寫一筆的 **`display_name`**。
每張卡 SHALL 是**單行、超出截斷**（固定寬，不隨字長改變看板版面）。筆數少於 4 時 SHALL 只填對應張數、其餘卡槽維持空槽 ——
SHALL NOT 補假卡、SHALL NOT 顯示 total 或「還有更多」這類後端沒給的數字（沒有 total／has_more）。

摘要 SHALL 是 Canvas 外的 DOM，位置由 render loop 每幀經 `screenPixelFor` 寫進 `style`（不進 React state）、跟著看板釘在畫面上；
整塊落在畫面外時 SHALL 移出無障礙樹（跟門標籤同一條）。**摘要資料不進 Canvas 的 3D 幾何**（看板 mesh 不動）。

#### Scenario: [FE-W20-S01] 專案看板有兩個案子，看板上就有那兩個標題

- **GIVEN** 在 Guild Hall、`listProjects(0)` 回兩筆 `[{title:"晨光工作室"},{title:"噪音地圖小隊"}]`
- **WHEN** 看板摘要就緒
- **THEN** 專案看板 SHALL 有兩張填了字的卡，文字分別是「晨光工作室」「噪音地圖小隊」，其餘兩個卡槽是空槽
- **AND** 人才看板依 `listProfiles(0)` 各自畫 `display_name`（同一條規則）

#### Scenario: [FE-W20-S02] page 0 超過 4 筆只畫前 4、不假裝知道 total

- **WHEN** `listProjects(0)` 回 6 筆（PAGE_SIZE ≥ 6）
- **THEN** 專案看板 SHALL 只畫前 4 筆的標題、SHALL NOT 顯示第 5／6 筆、SHALL NOT 顯示「共 6 筆」「還有更多」這類字
- **AND** 長標題 SHALL 單行截斷（看板寬度不變）

#### Scenario: [FE-W20-S03] 摘要位置跟門標籤同一份投影、不另寫公式

- **GIVEN** 看板在固定世界座標、相機在跟拍
- **WHEN** 角色移動、相機收斂
- **THEN** 摘要 overlay 的螢幕位置差 SHALL 等於 `screenPixelFor(看板面錨點)` 的差（跟門標籤、工位錨點同一份 `toScreen`）；SHALL NOT 有第二份投影公式

### Requirement: 四種狀態各自可辨、失敗不奪焦、不說謊

看板 SHALL 呈現四種狀態，且**狀態訊號 SHALL 從出生點（z=-1）就分得出來是哪一種**（要分辨的是粗略外觀，不是讀得到字）：

- **載入中**（還沒拿到 page 0）SHALL 畫**骨架卡**填住卡槽 —— SHALL NOT 先畫「空位」或空白（先畫空會是謊，跟 `FE-J13-S01` 同一條原則）。
- **空的**（page 0 零筆）SHALL 用 `FE-X04` 的文案「這裡還沒有東西。」的緊湊看板版呈現；`role="status"`。
- **讀不到**（載入失敗）SHALL 呈現環境化錯誤：**`role="status"`、SHALL NOT 有 retry 按鈕**（重試留給按 E 開出來的面板）。
  失敗語彙用 `FE-X03`（`toUiError().message`）、分類用 `FE-X04` 的 `failureKind`；但**不論哪一類失敗，看板一律 `role="status"`＋無 retry**
  （這是對面板行為的刻意降級：面板裡 `load-failed` 是 `role="alert"`＋retry，看板是環境資訊、不奪焦、不提供動作）。
- 曾經有資料之後輪詢失敗 SHALL **保留舊資料（stale）**、SHALL NOT 閃成空白或錯誤畫面（跟 `useRooms` 的 `stale` 同一條）。

看板 SHALL NOT 把後端字串原樣當摘要或回饋（不回顯後端字串，`FE-N08` 同一條）。

#### Scenario: [FE-W20-S04] 空的清單畫「這裡還沒有東西。」，不是空白、不是骨架

- **WHEN** `listProjects(0)` 回空陣列 `[]`
- **THEN** 專案看板 SHALL 顯示「這裡還沒有東西。」（`FE-X04` 文案的看板版）、`role="status"`、SHALL NOT 有任何填了字的卡、SHALL NOT 停在骨架

#### Scenario: [FE-W20-S05] 載入失敗畫環境化錯誤：role=status、沒有 retry；曾有資料則保留舊的

- **WHEN** 首次 `listProjects(0)` 以 500 失敗（之前沒有資料）
- **THEN** 專案看板 SHALL 呈現讀不到的狀態、`role="status"`、SHALL NOT 有 retry 按鈕、訊息用 `FE-X03` 語彙（不回顯後端字串）
- **AND WHEN** 另一種情形：已經畫著兩筆，下一次 30 秒輪詢以 500 失敗
- **THEN** 看板 SHALL 仍畫那兩筆（stale）、SHALL NOT 閃成空白或錯誤

#### Scenario: [FE-W20-S06] 載入中畫骨架卡，不先畫空位

- **WHEN** 進 Guild Hall、page 0 還在飛
- **THEN** 看板 SHALL 畫骨架卡填住卡槽、SHALL NOT 顯示「這裡還沒有東西。」、SHALL NOT 顯示空白卡槽當成「沒東西」

### Requirement: 常駐訂閱的生命週期跟走廊門同一套、跟面板各自獨立

看板摘要 SHALL 由 `useBoardSummary(kind)` 供給：進 Guild Hall 場景時抓一次 page 0；之後**每 30 秒**輪詢一次；
分頁隱藏（`visibilitychange` → hidden）時 SHALL 停止輪詢、回到可見時 SHALL 立即重取一次再繼續；同時只有一個在飛的請求
（單一 `AbortController`），舊回應晚到 SHALL NOT 蓋掉新的；離開 Guild Hall 場景時 SHALL 中止在飛的請求、停止輪詢。

`useBoardSummary` SHALL 跟面板的 `useListPage` **各自獨立**（各自 fetch、不共享訂閱或 cache）—— 看板要在面板關著時也活著。
輪詢頻率、page 0、最多 4 筆這三個數字 SHALL 寫進實作常數，不留給呼叫端決定（頻率沿用 `useRooms` 的 30 秒）。

#### Scenario: [FE-W20-S07] 進場抓一次、30 秒再輪詢、離場中止、隱藏停

- **WHEN** 進 Guild Hall
- **THEN** SHALL 送出一次 `listProjects(0)` 與一次 `listProfiles(0)`（兩塊看板各一）
- **AND WHEN** 30 秒過去、分頁可見
- **THEN** SHALL 各再送出一次 page 0 的輪詢
- **AND WHEN** 分頁切到隱藏
- **THEN** SHALL 停止輪詢；回到可見 SHALL 立即重取一次
- **AND WHEN** 離開 Guild Hall（進房間或登出）
- **THEN** SHALL 中止在飛的請求、SHALL NOT 再輪詢

### Requirement: 看板摘要與按 E 開出來的面板最終一致、不強一致

看板摘要與面板各自輪詢，允許短暫不一致。判準：**當看板摘要與面板都處於 ready、且對應同一個底層 page 0 時**，
看板顯示的標題 SHALL 恰好是面板 page 0 items 的前 `min(4, n)` 筆、**同順序**。兩邊 SHALL 在一個輪詢週期（≤30 秒）內收斂；
本 change SHALL NOT 為了強一致引入共享 store。看板 SHALL NOT 顯示面板才有的東西（翻頁、選取、total）。

#### Scenario: [FE-W20-S08] 面板開著、兩邊都 ready 時，看板標題是面板 page 0 的前 4 筆

- **GIVEN** `listProjects(0)` 回 5 筆、看板摘要與面板都已就緒對著同一份 page 0
- **WHEN** 比對兩邊
- **THEN** 看板的 4 張卡的標題 SHALL 依序等於面板 page 0 前 4 筆的標題、SHALL NOT 出現第 5 筆、SHALL NOT 顯示 total 或翻頁

### Requirement: 真瀏覽器裡從出生點看得出有沒有東西、移動時摘要釘在看板上

這條的判準 SHALL 在真瀏覽器裡對本機自起的 `next start` 跑（投影、hidden、遮擋、可讀性只有真瀏覽器算得出來）：
玩家**站在出生點、沒有按 E**，SHALL 能從看板的狀態訊號分辨出「有內容／空的／讀不到／載入中」；角色移動時摘要 overlay SHALL
保持釘在看板面（不游移超過投影允差），畫面外整塊移出無障礙樹。

#### Scenario: [FE-W20-S09] 真瀏覽器：spawn 就分得出有資料 vs 空，移動時 overlay 不游移

- **GIVEN** 本機自起的 `next start`、`/api/*` 偽造：一次讓專案看板有 3 筆、人才看板空
- **WHEN** 角色在出生點（沒有走近、沒有按 E）
- **THEN** 專案看板 SHALL 有可辨識為「有內容」的狀態訊號（填了字的卡）、人才看板 SHALL 有可辨識為「空的」的狀態訊號，兩者從 spawn 分得出來
- **AND WHEN** 角色往看板走近幾步、相機跟拍
- **THEN** 摘要 overlay SHALL 一直釘在對應看板上（螢幕位置跟著 `screenPixelFor` 走、不游移到看板外）、SHALL NOT 整塊消失又出現（除非真的走出畫面）
