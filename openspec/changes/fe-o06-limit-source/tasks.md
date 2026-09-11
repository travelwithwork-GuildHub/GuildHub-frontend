# `FE-O06` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o06-limit-source`）

## 2. 來源與 helper

對應 Requirement〈`LIMITS` 是唯一來源，契約 schema 與邊界表都從它取值〉、〈長度單位是 Unicode code point，helper 是唯一算法〉

- [ ] 2.1 `limits.ts`：`codePointLength`、`remaining`、`violates`、`LIMIT_SOURCES`
- [ ] 2.2 `eslint.config.mjs`：契約 schema 的 `.min/.max` 不接數字字面（只掃 `rest.ts`、`ws.ts`）
- [ ] 2.3 判準：`S01`（邊界表產生器接受注入；產生器本身在 `FE-O05`，這裡先以純函式形狀放 `src/api/contract/boundaries.ts`）、`S02`～`S05`
- [ ] 2.4 **突變**：helper 改 `.length` → `S04` 紅；lint 拿掉 → `S02` 紅；`LIMIT_SOURCES` 少鍵 → `S03` 紅

## 3. 登入表單

對應 Requirement〈登入表單的暱稱欄真的拿到那些數字〉

- [ ] 3.1 `LoginForm`：剩餘字數、超出禁用、不用 `maxlength`
- [ ] 3.2 判準：`S06`～`S08`
- [ ] 3.3 **突變**：表單寫死 20 → `S08` 紅；用 `.length` → `S07` 紅

## 4. 收尾

- [ ] 4.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [ ] 4.2 封存（`archive/fe-o06-limit-source`，獨立 PR）
