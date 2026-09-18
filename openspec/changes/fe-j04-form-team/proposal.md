## Why

案件詳情（`FE-B03`）有了 owner 的標示與一個空的動作插槽，但**沒有任何動作**：發案之後案子永遠停在「招募中」，
大廳走廊的門（`FE-W12`，依 `GET /api/rooms` 只回 `active` 的專案生成）永遠長不出來。demo 的閉環
（發案 → 看板 → 詳情 → **成軍 → 門 → 進房 → 結案**）在第四步斷掉：沒有成軍就沒有門、沒有房、沒有座位（`FE-J13`）。

這是 `docs/WBS.md`〈demo 之前的核准順序〉的 #6。不做會怎樣：demo 只能拿 seed 灌的 `active` 專案演「進房」，
演不出「我發的案子成軍了、門長出來、隊員拿密碼進來」；`FE-J03`（我的案件）的「直達成軍／結案」沒有東西可直達。

後端（`FE-O08` 實測）：`POST /api/projects/{id}/form-team` 帶 `{password}` → 200 `ProjectOut`（`status=active`、`room_template` 有值），
**不驗密碼長度**（3 字也 200），非 owner 403「只有發起人可以做這件事」；`POST /api/projects/{id}/close` → 200 `closed`、座位整批刪、**冪等**（重複 200）。
兩個已知的後端 anomaly 這份規格**不依賴也不開放**：`closed` 之後再 `form-team` 會復活（前端 closed 不給成軍）；`closed` 之後舊 room token 仍能坐位（門會消失，`/api/rooms` 只回 active）。
`GET /api/rooms` 由 `useRooms` 每 30 秒輪詢 —— 成軍之後門要**立刻**長出來，不能等 30 秒。

## What Changes

- 新 capability **`project-lifecycle`**：owner 在案件詳情的動作插槽（`FE-B03` 留的）看到**成軍**（只在 `recruiting`）或**結案**（只在 `active`）；`closed` 沒有動作。
  - 成軍：填房間密碼（前端上限 `FORM_LIMITS.roomPassword` 4–64 字，後端不驗）→ `POST form-team` → 詳情呈現回應的狀態「已成軍」，並**只在這一次詳情裡**呈現剛設定的密碼：「複製密碼」、「用私訊寄出」（開收件匣、帶著草稿 —— 隊員是誰後端沒有模型，由 owner 選對話）。
    列表回第 0 頁重取（案子已不在 `recruiting` 清單裡）；大廳的門**立即重取**（不等輪詢）。
  - 結案：確認層 → `POST close` → 「已結案」、沒有任何動作；門立即重取（消失）。
  - 失敗留值（`FE-X05` 的全站規則）：500 留密碼、狀態不變、不重取；403 用 `FE-X03` 的語彙；送出中不可關、連按只送一次。
  - 密碼不落地：不進網址、不進 storage（跟 `FE-N08-S05` 同一條線）。
- **`world-interactive-objects`**（ADDED 一條）：走廊的門在「成軍／結案」之後 SHALL 立即重取一次 `GET /api/rooms`；有請求在飛時在它結束後再取一次（不疊加，`FE-W12-S21` 不變）。
- **`inbox`**（MODIFIED〈收件匣是阻斷式面板，兩個入口〉→ 三個入口）：從案件詳情「用私訊寄出」開收件匣**清單**並帶著草稿；進任一對話時輸入框已填草稿；寄出或關閉後草稿清掉。
- 真瀏覽器 e2e：owner 發案 → 詳情 → 成軍 → 密碼可複製 → 大廳長出那扇門 → 結案 → 門消失。

## Non-goals

- **不做隊員模型**（誰是隊員、應徵、邀請 —— `BE-G10`）：「用私訊寄出」只帶草稿開收件匣，不替 owner 決定寄給誰。
- **不做暫停／取消／已補滿**（WBS 第二列：`BE-G22` 待銜接，demo 之前不做）；後端只有 `recruiting → active → closed`。
- **不做「重新成軍」／改密碼**：`active` 的案子不再顯示成軍（後端重複 form-team 會換密碼、舊密碼立即失效，那是危險的隱藏行為）；`closed` 不給成軍（後端會復活，anomaly 不開放）。
- **不動進房**（`room-entry-gate`）、不動座位（`FE-J13`）、不做「我的案件」（`FE-J03`，它會重用這裡的動作元件）。
- **不動 `useRooms` 的輪詢語意**（30 秒、背景停、單飛）—— 只多一個「立即重取」的觸發。
- 不做密碼強度、不做顯示／隱藏切換（4–64 字的房間密碼，不是帳號密碼）。

## Impact

- 新 `src/projects/OwnerActions.tsx`（成軍表單、結案確認、密碼一次性呈現）、`src/projects/projectRules.ts`（`FormTeamSchema`）、`src/forms/limits.ts`（`FORM_LIMITS.roomPassword`）
- `src/projects/ProjectDetail.tsx`／`useProjectDetail.ts`（拿回應更新詳情）、`src/list-panel/BoardPanel.tsx`（把 `OwnerActions` 接進插槽、列表 `reload`）
- `src/world/rooms/useRooms.ts`（`refresh`）＋ 新 `src/world/rooms/RoomsRefreshContext.tsx`（`WorldCanvas` 提供、詳情呼叫）
- `src/inbox/InboxPanelProvider.tsx`（`openListWithDraft`、`draft`）、`src/inbox/InboxPanel.tsx`／`ComposeForm.tsx`（草稿）
- 判準：新 `tests/project-lifecycle.test.tsx`、`tests/rooms-refresh.test.tsx`；`tests/inbox-panel.test.tsx`（草稿入口）；e2e `tests/e2e/form-team.mjs`
- 效能：表單＋確認層進 board chunk；預期 +2 KB gz 以內；量前後差貼 PR
