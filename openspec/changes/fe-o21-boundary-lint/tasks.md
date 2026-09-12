## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o21-boundary-lint` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-o21-boundary-lint --strict` 通過且 PR 已合併

## 2. 測試先行（`tests/boundary-lint-rule.test.ts`，寫法照 `tests/env-lint-rule.test.ts`）

- [ ] 2.1 `FE-O21-S01`：Scenario 列的 11 種寫法用 `it.each` 逐一跑，每種至少一則；`src/world/deep/x.tsx` 的 `../../` 也報
- [ ] 2.2 `FE-O21-S02`：三種 type-only 寫法、`RemoteWorld.tsx` 本身、`tests/realtime-client.test.ts` 都不報
- [ ] 2.3 `FE-O21-S03`：`src/components/world/RemoteWorld.tsx` 報
- [ ] 2.4 `FE-O21-S06`：`src/realtime/index.ts` 值再匯出 `./client` 報、`protocol.ts` 值 import `./client` 報、`export type` 不報
- [ ] 2.5 `FE-O21-S04`：Scenario 列的 10 種寫法逐一跑；零 import 不報
- [ ] 2.6 `FE-O21-S05`：Scenario 列的 8 種寫法逐一跑；`limits.ts` 與 `contract/sub/x.ts` 報；`transport.ts` 不報
- [ ] 2.7 `FE-O09-S01`：`rest.ts` 讀 `process.env` 要報（design D3 的洞）。先寫測試 —— 它在改設定之前**是紅的**
      （那就是洞的證據，寫進 PR），改完設定變綠

## 3. 規則（`eslint.config.mjs`，正式碼零行）

- [ ] 3.1 依 design D1 抽出 `HTTP_CLIENT_PATHS` 與三組 pattern 常數、兩組動態 import selector、D4 的三則訊息（Requirement：三條）
- [ ] 3.2 依 D1 的區塊表組合 `src/**`／`RemoteWorld.tsx`／`src/realtime/**`／`env.ts` 四個區塊
      （Requirement：只有 RemoteWorld 可以 import client 的值；設定模組不 import 契約）
- [ ] 3.3 `src/api/contract/**` 區塊：contract→config ＋ 補回 FE-O09 三個 selector ＋ `OUTPUT_SAFETY`；
      `rest.ts`／`ws.ts` 再加 LIMITS（Requirement：契約不 import 設定；FE-O09 既有）
- [ ] 3.4 `npm run lint` 對現有程式碼全綠（`PositionSync.tsx` 的 `import type` 與兩個傳輸層不得誤報）

## 4. 突變（design D5，結果寫進 PR 內文）

- [ ] 4.1 `PositionSync.tsx` 寫 `new RealtimeClient(` → `npm run lint` 紅在 D4 第一則訊息
- [ ] 4.2 拿掉 `CLIENT_IMPORT_PATTERNS` → `FE-O21-S01`／`S03`／`S06` 紅，`S04`／`S05` 不紅
- [ ] 4.3 拿掉 contract 區塊的 `ANY_PROCESS_ENV` → 標 `FE-O09-S01` 的那條新斷言紅

## 5. ADR 狀態欄（`docs/adr/0005`、`0006`；只改兩行，其他段落是歷史）

- [ ] 5.1 `邊界狀態` 改「已強制」，`證據` 改 `tests/boundary-lint-rule.test.ts:<行>`、`eslint.config.mjs:<行>`
      （Requirement：三條 —— 證據指到證明它們的測試）
- [ ] 5.2 `bash .github/scripts/arch-view.sh` 不再列「僅約定」「已知缺口」、無「對不上的」新增
