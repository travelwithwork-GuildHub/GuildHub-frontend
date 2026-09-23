## ADDED Requirements

### Requirement: 大廳只有一扇專案走廊入口門，走廊是 `lobby` 內傳送到達的獨立空間

主大廳（Guild Hall 的出生區）SHALL 只呈現**一扇**「專案走廊」入口門，SHALL NOT 在主大廳直接呈現依
`GET /api/rooms` 生成的 N 扇 Project Door。N 扇 Project Door SHALL 渲染在**專案走廊**裡 —— 一塊仍屬於
`lobby` 伺服器場景、但在主大廳視野之外的獨立區域（例如遠離主大廳、以牆或距離隔開，使主大廳看不到走廊裡的門）。

對主大廳的走廊入口門按 `E`，系統 SHALL 以**本地傳送**把玩家帶進走廊：SHALL 覆寫玩家的 **Rapier 剛體位置**
（不只改 Three.js mesh，否則物理下一步把玩家彈回）、把相機**瞬間切**到走廊入口（不得橫越主大廳與走廊之間的
空曠地帶做平滑平移）。此傳送 SHALL NOT 關閉或重開 WebSocket、SHALL NOT 改變網址、SHALL NOT 觸發任何
伺服器場景切換 —— 全程仍是同一條 `lobby` 連線（後端只看到一個位置位移，照常廣播給別人）。

走廊入口門本身 SHALL NOT 是房間門禁（`room-entry-gate`）的對象：它不要求票、不開密碼視窗，只做本地傳送。

> **這是空間動線，不是 DOM 選單。** 產品負責人 2026-09-23：大廳一次列出所有房間太雜亂、也不像 3D；要「大廳一扇門 →
> 按 E 進另一個空間 → 裡面選一道門進去」。與 codex／gemini 討論一致：做成 `lobby` **視覺分區 ＋ 本地傳送**（非新後端
> 場景、非前端假場景 —— 兩者都是陷阱），保留 Project Door 空間概念與 3D 動線，不動後端。

#### Scenario: [FE-W12-S27] 主大廳只有一扇走廊入口門，N 扇 Project Door 在走廊裡

- **WHEN** 已登入的玩家在主大廳出生、有 N（≥1）筆 `recruiting` 專案
- **THEN** 主大廳的互動系統裡 SHALL 只有一個「走廊入口」互動物件，SHALL NOT 有任何 `door:<project_id>` 的 Project Door
- **AND** N 扇 Project Door（含其標籤）SHALL 註冊／渲染在走廊區域，主大廳出生視野內 SHALL 看不到它們

#### Scenario: [FE-W12-S28] 對走廊入口門按 E ＝ 本地傳送，連線與場景不變

- **GIVEN** 玩家在主大廳、正對走廊入口門、提示顯示著
- **WHEN** 按 `E`
- **THEN** 玩家的 Rapier 剛體位置 SHALL 被設到走廊入口（`setTranslation`，不是只改 mesh），相機 SHALL 瞬切到走廊入口
- **AND** 整個過程 SHALL NOT 送出任何 scene 切換、SHALL NOT 關閉或重開 WebSocket、網址 SHALL 維持 `/world`
- **AND** 傳送後下一個物理步 SHALL NOT 把玩家彈回主大廳（剛體位置已被覆寫）

#### Scenario: [FE-W12-S29] 走廊裡的 Project Door 照舊進房，輪詢與生命週期不變

- **WHEN** 玩家在走廊、對一扇 Project Door 按 `E`
- **THEN** SHALL 走既有的房間門禁流程（持票即進 `room:{id}`、無票開密碼視窗）—— 與門在主大廳時**行為完全相同**
- **AND** `GET /api/rooms` 的輪詢 SHALL 仍只在 `lobby`（含走廊，因為走廊仍是 `lobby`）進行；成軍後新門 SHALL 在 5 秒內出現在走廊、結案後那扇門 SHALL 在 5 秒內從走廊消失（含其標籤與 `E` 互動註冊一併移除）

#### Scenario: [FE-W12-S30] 從走廊回主大廳

- **WHEN** 玩家在走廊、對走廊出口（或回程互動點）按 `E`
- **THEN** SHALL 以同樣的本地傳送把玩家帶回主大廳入口（覆寫 Rapier 剛體、相機瞬切），連線／網址／場景不變
