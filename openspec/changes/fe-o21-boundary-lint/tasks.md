## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o21-boundary-lint` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-o21-boundary-lint --strict` 通過且 PR 已合併

## 2. 測試先行（`tests/boundary-lint-rule.test.ts`，寫法照 `tests/env-lint-rule.test.ts`）

- [ ] 2.1 `FE-O21-S01`：`src/world/PositionSync.tsx` 值 import ＋ `new` → 恰好一則；
      `import * as`／`export … from`／`export * from`／`import()`／`require()`／`../realtime/client` 各報
- [ ] 2.2 `FE-O21-S02`：兩種 type-only 寫法、`RemoteWorld.tsx` 本身、`tests/realtime-client.test.ts` 都不報
- [ ] 2.3 `FE-O21-S03`：`src/components/world/RemoteWorld.tsx` 報
- [ ] 2.4 `FE-O21-S04`：`env.ts` 值／type／相對路徑 import 契約各報；零 import 不報
- [ ] 2.5 `FE-O21-S05`：`rest.ts`／`limits.ts` 值／type 各報；`transport.ts` 同時 import 兩邊不報
- [ ] 2.6 `FE-O09-S01`：`rest.ts` 讀 `process.env` 報（design D3 的洞）—— 先確認**現在是綠的**（洞存在），
      再改設定讓它紅

## 3. 規則（`eslint.config.mjs`，正式碼零行）

- [ ] 3.1 依 design D1 的表加三組 selector 常數與 D4 的三則訊息（Requirement：三條）
- [ ] 3.2 `src/**`（含 ignores 那個）與 `SAFE_EXTERNAL_LINK` 的區塊帶上 client 與 env→api 那兩組
      （Requirement：只有 RemoteWorld 可以 import client 的值；設定模組不 import 契約）
- [ ] 3.3 `CONTRACT_SCHEMA_PATHS` 區塊改成帶著 FE-O09 三個 selector ＋ `OUTPUT_SAFETY` ＋ LIMITS ＋ contract→config；
      `src/api/contract/**` 其他檔案另一個區塊（Requirement：契約不 import 設定；FE-O09 既有）
- [ ] 3.4 `npm run lint` 對現有程式碼全綠（`PositionSync.tsx` 的 `import type` 與兩個傳輸層不得誤報）

## 4. 突變（design D5，結果寫進 PR 內文）

- [ ] 4.1 `PositionSync.tsx` 寫 `new RealtimeClient(` → `npm run lint` 紅在 D4 第一則訊息
- [ ] 4.2 拿掉 client 那組 selector → 只有 `FE-O21-S01` 紅
- [ ] 4.3 拿掉 contract 區塊的 `ANY_PROCESS_ENV` → 只有 `FE-O09-S01` 那條紅

## 5. ADR 狀態欄（`docs/adr/0005`、`0006`；只改兩行，其他段落是歷史）

- [ ] 5.1 `邊界狀態` 改「已強制」，`證據` 改 `tests/boundary-lint-rule.test.ts:<行>`、`eslint.config.mjs:<行>`
      （Requirement：三條 —— 證據指到證明它們的測試）
- [ ] 5.2 `bash .github/scripts/arch-view.sh` 不再列「僅約定」「已知缺口」、無「對不上的」新增
