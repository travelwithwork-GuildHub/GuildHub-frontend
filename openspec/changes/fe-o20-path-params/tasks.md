# `FE-O20` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o20-path-params`）

## 2. 型別與判準

- [x] 2.1 先寫判準：`tests/type-fixtures/path-params-{typo,missing,extra,superset,ok}.ts` 五個檔；
      `tests/path-params.test.ts` 對 `tests/type-fixtures/tsconfig.json` 跑一次 tsc（`process.execPath` ＋ `typescript/bin/tsc`），
      解析成 `{ 檔名 → [診斷碼] }`；`[FE-O20-S01]`～`[FE-O20-S04]` 各斷言自己的檔恰好一則指定碼、`[FE-O20-S06]` 斷言 `ok` 檔零診斷
      —— 此時 S01～S04 四條紅（fixture 能編譯）、S06 綠，commit
- [x] 2.2 `src/api/transport.ts`：`ParamsOf`／`WithParams`／`RequestSpec`（D1）＋ 三條 `ParamsOf` 哨兵（D3，`[FE-O20-S05]`）；
      `RequestBase.params` 的註解搬到 `WithParams` 上 —— 四條轉綠，commit
- [x] 2.3 `[FE-O20-S06]`：`pnpm run typecheck` 綠、`tests/api-operations-coverage.test.ts` 綠，`operations.ts` 零 diff
- [x] 2.4 **突變**（先 commit）：`WithParams` 改回 `{ params?: Record<string, string> }` → S01～S04 四條 `it` 失敗、S06 過；
      `ParamsOf` 改 `? K : never` → `pnpm run typecheck` 紅在哨兵；兩個都改回來

## 3. 收尾

- [x] 3.1 `pnpm run typecheck`、`pnpm run lint`、`pnpm test` 全綠
- [ ] 3.2 封存（`archive/fe-o20-path-params`，獨立 PR）
