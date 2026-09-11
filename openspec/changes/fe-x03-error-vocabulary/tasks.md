# `FE-X03` 任務（W2 那一半）

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-x03-error-vocabulary`）

## 2. 翻譯器與語彙表（`src/errors/`）

對應 Requirement〈每一個失敗都有一個封閉種類，而且翻譯永遠不拋〉、
〈使用者看到的那一句話來自唯一一份語彙表，而且是安全的〉

- [x] 2.1 `UiErrorKind` 封閉聯集；`VOCABULARY: Record<UiErrorKind, string>`
      （`Record` 讓「少一鍵」在 typecheck 就紅）
- [x] 2.2 `toUiError(error: unknown): UiError` —— 永遠不拋
- [x] 2.3 判準：`S01`–`S10`、`S17`（對映表，**`S01`／`S02` 成對**；`S06`／`S07` 掃整段範圍）
- [x] 2.6 `send()` 把 `fetch` 的 rejection 包成 `NetworkError`（design `D7`）；判準：`S19`、`S20`
- [x] 2.7 整個分類包 try/catch 兜底（design `D8`）；`S17` 的純物件那一半
- [x] 2.4 判準：`S11`（不多不少）、`S12`（哨兵不外漏）、`S13`（互不相同）
- [x] 2.5 **突變**：把 403 併進 401，`S02` 要紅；`message` 改成 `error.message`，`S12` 要紅；
      對 `null` 拋錯，`S10` 要紅；只寫死 418／429，`S07` 要紅

## 3. 結構化細節

對應 Requirement〈結構化的細節保留給要用它的人〉

- [x] 3.1 422 的 `ValidationError[]` 原樣進 `issues`；字串 `detail` 進 `detail`
- [x] 3.2 判準：`S14`、`S15`

## 4. 唯一一處

對應 Requirement〈翻譯入口只有一個〉

- [x] 4.1 `src/identity/session.ts` 的 `isUnauthorized`／`isNotFound` 改成看 `kind`
      （`FE-A01` 的判準要照樣全綠 —— 那兩個 helper 是控制流，行為不變）
- [x] 4.2 判準：`S16`（`HttpError`／`NetworkError` 的 import 邊界 —— **lint 規則**，含改名、整個模組、再匯出；規則自己有負向測試）、`S18`（身分層不含 `.status`）
- [x] 4.3 **突變**：`session.ts` 改回 import `HttpError` 比 `status`，`S16`／`S18` 要紅

## 5. 收尾

- [x] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [ ] 5.2 封存（`archive/fe-x03-error-vocabulary`，獨立 PR）
