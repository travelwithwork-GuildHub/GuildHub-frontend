# `FE-B09` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-b09-deep-link`）

## 2. 網址 ⇄ 狀態

對應 Requirement〈網址表示開著哪一層，複製它就能還原〉

- [ ] 2.1 `urlState.ts`：解析（含 canonical，design `D5`）與序列化
- [ ] 2.2 `useListPage` 接受起始頁、回報頁碼；`paging.ts` 起始頁撲空 → 退回第 0 頁（design `D4`）
- [ ] 2.3 `<PanelUrlSync />`：掛載與 popstate 時網址 → 狀態
- [ ] 2.4 判準：`S01`–`S05`
- [ ] 2.5 **突變**：不驗參數 → `S05` 紅；起始頁撲空不退回 → `S04` 紅

## 3. 互動寫回、上一頁 ≡ Escape

對應 Requirement〈互動寫回網址；上一頁與 Escape 等效〉

- [ ] 3.1 狀態 → 網址（層數變多 push、不變 replace）；`history.state` 標記層數
- [ ] 3.2 Escape 走 `back()`：有上一層 `history.back()`，沒有就 replace（design `D3`）
- [ ] 3.3 判準：`S06`–`S11`
- [ ] 3.4 **突變**：push 改 replace → `S06`／`S07` 紅；翻頁 push → `S08` 紅；直達 Escape 用 back → `S11` 紅

## 4. 世界不重掛

對應 Requirement〈網址改變時世界不重掛〉

- [ ] 4.1 判準：`S12`（探針計數）
- [ ] 4.2 Playwright：深連結直達開詳情、Escape 兩次、上一頁、`canvas` 節點同一；截圖進 `docs/evidence/fe-b09/`

## 5. 收尾

- [ ] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [ ] 5.2 封存（`archive/fe-b09-deep-link`，獨立 PR）
