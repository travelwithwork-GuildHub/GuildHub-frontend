# `FE-X04` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-x04-empty-states`）

## 2. 表與元件（`src/empty-state/`）

對應 Requirement〈五種空狀態，封閉，各自認得出來〉、〈載入失敗可以重試同一頁，權限阻擋不能〉

- [x] 2.1 `EmptyStateKind` 封閉聯集；前三種的字句表
- [x] 2.2 `<EmptyState>`：種類標記；`kind: 'failure'` 由 `error.kind` 決定是載入失敗還是權限阻擋，前者帶重試、後者帶選填動作
- [x] 2.3 判準：`S01`、`S02`、`S03`、`S09`、`S10`
- [x] 2.4 **突變**：把「篩選無結果」alias 到「首次無資料」，`S03` 要紅；權限阻擋加上重試，`S09`／`S10` 要紅

## 3. 哪一種失敗畫成哪一種

對應 Requirement〈哪一種失敗畫成哪一種，由 `FE-X03` 的種類決定〉

- [x] 3.1 `failureKind(error: UiError)`
- [x] 3.2 `ListPanel` 的錯誤插槽改成 `({ retry, cause }) => ReactNode`（design `D3`）；翻譯在 `BoardPanel`
- [x] 3.3 判準：`S04`、`S05`、`S06`（**成對**）
- [x] 3.4 **突變**：`failureKind` 一律載入失敗，`S04`／`S05` 要紅；一律權限阻擋，`S06` 要紅

## 4. 接上兩塊看板的面板

對應 Requirement〈清單容器的三個插槽裡直接寫的節點只能是這一列的元件〉

- [x] 4.1 `BoardPanel` 接上 `empty`／`exhausted`／`error`
- [x] 4.2 判準：`S08`、`S11`
- [x] 4.3 lint 規則：三個插槽裡直接寫的元素只能是 `EmptyState`；判準 `S12`（負向＋成對＋拿掉規則會紅）
- [x] 4.4 **突變**：`BoardPanel` 少接 `exhausted`，`S11` 要紅；lint 規則拿掉，`S12` 要紅

## 5. 收尾

- [x] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [x] 5.2 真瀏覽器看一次訪客按 E（`tests/e2e/board-panel.mjs` 加一段攔 401）
- [ ] 5.3 封存（`archive/fe-x04-empty-states`，獨立 PR）
