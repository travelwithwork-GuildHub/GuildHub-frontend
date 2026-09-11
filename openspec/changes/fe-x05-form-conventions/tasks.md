# `FE-X05` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-x05-form-conventions`）

## 2. 機制與規則

對應 Requirement〈驗證時機是全站規則〉、〈送出中、失敗、重試〉

- [ ] 2.1 `react-hook-form`、`@hookform/resolvers` 依賴；`src/forms/useForm.ts`（封裝：zod resolver、時機、guard、submit error）；`src/forms/SubmitError.tsx`（alert 在鈕上方）
- [ ] 2.2 判準：`S01`～`S07`、`S14`（Fixture 表單：兩個必填、一個下限 3、一個上限 20、一個 number）
- [ ] 2.3 **突變**：guard 拿掉 → `S05`；失敗 reset → `S06`；自動重送 → `S07`；太短即時擋 → `S02`

## 3. 樂觀回滾與 FORM_LIMITS

對應 Requirement〈樂觀更新的回滾〉、〈前端自訂的上限另立一個模組〉

- [ ] 3.1 `src/forms/optimistic.ts`、`src/forms/limits.ts`（`FORM_LIMITS`、`effectiveLimit`）
- [ ] 3.2 判準：`S08`～`S12`
- [ ] 3.3 **突變**：回滾不還原 → `S08`；成功回 input → `S09`；in-flight 不擋 → `S10`；`FORM_LIMITS` 加 `displayName` → `S11`

## 4. LoginForm 遷移

對應 Requirement〈`LoginForm` 遷到同一套，行為不變〉

- [ ] 4.1 `LoginForm` 改用 `useForm`；判準 `S13`（既有測試全綠）
- [ ] 4.2 `docs/WBS.md` 不用改（RHF 就是 WBS 寫的）

## 5. 收尾

- [ ] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [ ] 5.2 封存（`archive/fe-x05-form-conventions`，獨立 PR）
