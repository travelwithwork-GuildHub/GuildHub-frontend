# `FE-B09` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-b09-deep-link`）

## 2. 網址 ⇄ 狀態

對應 Requirement〈網址表示開著哪一層，複製它就能還原〉

- [x] 2.1 `urlState.ts`：解析（含 canonical，design `D5`）與序列化
- [x] 2.2 `useListPage` 接受起始頁、回報頁碼；`paging.ts` 起始頁撲空 → 退回第 0 頁（design `D4`）
- [x] 2.3 `<PanelUrlSync />`：掛載與 popstate 時網址 → 狀態
- [x] 2.4 判準：`S01`–`S05`、`S13`
- [x] 2.5 **突變**：不驗參數 → `S05` 紅；起始頁撲空不退回 → `S04` 紅

## 3. 互動寫回、上一頁 ≡ Escape

對應 Requirement〈互動寫回網址；上一頁與 Escape 等效〉

- [x] 3.1 狀態 → 網址（層數變多 push、不變 replace）；`history.state` **合併**寫入 `guildhubPanel: { session, depth }`（design `D2`）
- [x] 3.2 Escape 照舊同步改狀態；`PanelUrlSync` 看到層數變少才退網址：本站有上一層 `back()`，沒有就 replace（design `D3`）
- [x] 3.3 判準：`S06`–`S11`
- [x] 3.4 **突變**：push 改 replace → `S06`／`S07` 紅；翻頁 push → `S08` 紅；直達 Escape 用 back → `S11` 紅

## 4. 世界不重掛

對應 Requirement〈網址改變時世界不重掛〉

- [x] 4.1 判準：`S12` 的 jsdom 探針（輔）
- [x] 4.2 Playwright（`S12` 主判準，序列與 `S12` 完全一致）：從 `/world` 走到看板按 E 開清單、點卡開詳情、上一頁、下一頁、Escape 兩次；一開始抓住的 `canvas` element handle 仍連著且唯一；`S11` 的深連結直達 Escape 另跑一段；截圖進 `docs/evidence/fe-b09/`

## 5. 收尾

- [x] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [ ] 5.2 封存（`archive/fe-b09-deep-link`，獨立 PR）
