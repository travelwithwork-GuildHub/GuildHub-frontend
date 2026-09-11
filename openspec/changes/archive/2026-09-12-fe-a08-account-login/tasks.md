# `FE-A08` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-a08-account-login`）

## 2. 本地後端與契約

對應 Requirement〈本地後端與契約測試補上 register 與密碼登入〉

- [x] 2.1 `src/app/api/register/route.ts`（`handle()` 管線、`hashPassword`、只認 `profiles_login_id_key` 的 unique violation → 409）；`src/server/profiles.ts` 的 insert 帶 `login_id`／`password_hash`
- [x] 2.2 契約測試：`tests/contract/rest/register.contract.ts`（register 成功／撞名／併發撞名／422 golden）、`login.contract.ts` 補密碼登入三條；兩個目標都跑
- [x] 2.3 判準：`S09`、`S10`、`S15`、`S16`（`tests/server-auth.test.ts` 注入 23505）
- [x] 2.4 **突變**：先查再寫（select 再 insert、不接 unique）→ `S15` **在 Promise.all 下沒撞到同一個窗、沒紅**，補了資料層形狀判準（只發一道 SQL、以 insert 開頭）→ 紅；任何 23505 都回 409 → `S16`；403 兩句不同 → `S10`

## 3. 資料層與身分層

對應 Requirement〈註冊⋯⋯〉、〈帳號密碼登入⋯⋯〉

- [x] 3.1 `operations.register()`；`session.ts` 的 `signInWithPassword`、`registerAccount`（只在各自那一次請求轉 403／409）、`CredentialsRejectedError`、`LoginIdTakenError`
- [x] 3.2 判準：`S02` 的 body、`S05` 的 body 與錯誤型別；別的 status 原樣拋（新檔 `tests/identity-account.test.ts`）

## 4. 登入頁

對應 Requirement〈登入頁有帳號密碼的入口〉、〈註冊⋯⋯〉、〈帳號密碼登入⋯⋯〉

- [x] 4.1 `LoginForm` 加「用帳號密碼」區塊：切換鈕、兩個 `useForm`（只渲染一個 `<form>`）、「顯示密碼」、`describeError` 認兩個新錯誤、成功 `router.push('/world')`、任一送出中全部禁用
- [x] 4.2 判準：`S01`～`S08`、`S11`～`S14`；`tests/login-form*.test.tsx`、`tests/form-conventions.test.tsx` 全綠
- [x] 4.3 **突變**：403 走 `toUiError` → `S05`；夾帶 `detail` → `S03`／`S05`；失敗清密碼欄 → `S06`；切換清值 → `S01`；`hidden` 切 → `S01`；送出中可切 → `S12`；body 多鍵 → `S02`／`S05`；太短即時擋 → `S04`／`S14`；用 `.length` 算長度 → `S04`；成功顯示金鑰畫面 → `S02`；trim login_id → `S02`

## 5. 收尾

- [x] 5.1 `npm run typecheck`、`npm run lint`、`npm test`、`npm run test:contract:internal` 全綠；`test:contract:guildhub` 本機綠
- [x] 5.2 封存（`archive/fe-a08-account-login`，下一個 PR）
