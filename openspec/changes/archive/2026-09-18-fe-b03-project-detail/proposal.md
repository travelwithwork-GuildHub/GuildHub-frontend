## Why

案件卡（`FE-B02`）讓人一眼判斷要不要多看一眼，但**多看一眼的地方不存在**：卡片是純呈現的 `<article>`，
點了沒有反應，案子的內容（`body`）、發案者是誰、能對這個案子做什麼，畫面上都沒有。demo 的閉環
（發案 → 看板 → **詳情** → 成軍 → 門 → 進房 → 結案）在第三步斷掉；`FE-J04`（成軍／結案）要一個 owner 才看得到的入口、
`FE-K01` 的「私訊」要一個「私訊發案者」的位置 —— 兩個都住在詳情裡。

這是 `docs/WBS.md`〈demo 之前的核准順序〉的 #5。不做會怎樣：看板只能「看標題」，發案者永遠沒有地方被找到，
`FE-J04` 沒有 owner 的入口可以接。

後端能給的（`FE-O08` 量過）：`GET /api/projects/{id}` 回 `ProjectOut`（closed 也 200，不存在 404 `專案不存在`）；
發案者名片走 `GET /api/profiles/{owner_id}`；私訊走既有的收件匣（`POST /api/messages`，`FE-K01`）。
WBS 2026-09-17 已把這一列縮成後端有的欄位：沒有 Open Roles、期程、應徵狀況；動作列**只放後端今天做得到的**。

## What Changes

- **`project-directory`**（ADDED）：案件詳情在同一個面板裡蓋在列表上（`ListPanel` 的 `overlay`，跟人才詳情同一種形狀）：
  標題、完整 `body`、需要的技能、狀態、到期（絕對日期＋剩幾天）、座位數，**一律**打 `GET /api/projects/{id}`（列表那一筆只當可辨識的載入中預覽）；
  發案者名片另打 `GET /api/profiles/{owner_id}`，它的載入中／失敗**獨立於**案子本體（發案者名片載不到不能把整份詳情畫成失敗）。
  404 是 `FE-X04` 的「找不到」，401 是權限阻擋，500 是載入失敗。
- **`project-directory`**（ADDED）：動作列只放做得到的。已登入的非 owner 看到**「私訊發案者」**（走 `FE-K01` 的收件匣，關看板、直接進對話）；
  owner 看到**「這是你發的案子」**的標示與一個給 `FE-J04` 用的動作插槽（這一份**不放**成軍／結案按鈕 —— 那是按下去沒反應的控制項；`FE-J04` 把按鈕接進插槽）；
  訪客沒有動作。**沒有**應徵、收藏、檢舉、灰掉的按鈕。
- **`project-directory`**（MODIFIED）：案件卡從非互動的 `<article>` 變成**可聚焦的控制項**（`<button>`，跟人才卡同一種形狀）：點擊、Enter、Space 開那一筆的詳情。
  `FE-B02-S08` 的標題是不改的鍵，內容改成「整張卡是唯一的控制項、裡面不能再有第二個」。
- **`deep-link`**（MODIFIED）：網址多 `project=<id>`（`?panel=projects&project=<id>` 開著那一筆案件詳情），解析、canonical、
  push／replace 的層數規則照 `profile` 的樣子；`FE-B09` 既有的 Scenario 全部不變，多一條 `S14`。
- 返回列表時頁碼與捲動位置都還在（`FE-B04-S11`／`S12` 的案件版）。

## Non-goals

- **不做成軍、結案的動作**（表單、密碼、呼叫 `form-team`／`close`、成功後的狀態變化）—— `FE-J04`。這裡只給 owner 標示與插槽。
- **不做「進房」**：進房是大廳的門＋密碼閘（`room-entry-gate`、`FE-V01`），詳情不複製一份入口；`FE-J04` 成軍後要不要在詳情放「門在大廳」的提示，由它決定。
  WBS 動作列原本列著「進房」與「成軍／結案的入口」—— 由 `governance/wbs-fe-b03-owner-entry` 先改寫 WBS 再合併這份規格（design D3）。
- **不做發案者的信任資訊**（帳號年齡、發過幾個案子、回覆率 —— WBS 第二列，`BE-G24` 待銜接）。
- **不做編輯／刪除**（後端沒有 `PATCH`／`DELETE`）、不做應徵／收藏／檢舉（沒有後端）、不做「我的案件」（`FE-J03`）。
- **不改** `ListPanel` 的翻頁狀態機；不改收件匣的任何行為（只呼叫它既有的「從名片進對話」入口，換一個標籤）。
- 不動 `FE-X06` 的 Escape 語意：詳情層按 Escape 照今天的全域契約（先關詳情、面板留著）。

## Impact

- `src/list-panel/urlState.ts`（`project`）、`ListPanelProvider.tsx`（選中的案件）、`PanelUrlSync.tsx`（層數）
- 新 `src/projects/ProjectDetail.tsx`、`src/projects/useProjectDetail.ts`、`src/projects/OwnerCard.tsx`（發案者名片：獨立載入）
- `src/projects/ProjectCard.tsx`（`<button>`＋`onOpen`）、`src/list-panel/BoardPanel.tsx`（案件那一支的 overlay）、`src/inbox/SendMessageButton.tsx`（可換標籤）
- 判準：`tests/url-state.test.ts`、`tests/deep-link.test.tsx`、新 `tests/project-detail.test.tsx`、`tests/project-card.test.tsx`（S08 → 控制項）、`tests/board-panel-wiring.test.tsx`；e2e `tests/e2e/board-panel.mjs` 案件那一段點卡、看詳情、返回
- 效能：詳情元件進 board chunk；預期 +2 KB gz 以內；量前後差貼 PR
