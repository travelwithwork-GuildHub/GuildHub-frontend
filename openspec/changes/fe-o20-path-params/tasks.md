# `FE-O20` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o20-path-params`）

## 2. 型別與判準

- [ ] 2.1 先寫判準：`tests/type-fixtures/path-params-{typo,missing,extra,superset}.ts` 四個檔；
      `tests/path-params.test.ts` 對 `tests/type-fixtures/tsconfig.json` 跑一次 tsc（`process.execPath` ＋ `typescript/bin/tsc`），
      四條 `it` 各斷言一個檔名在錯誤輸出裡（`[FE-O20-S01]`～`[FE-O20-S04]`）—— 此時四條全紅（fixture 能編譯），commit
- [ ] 2.2 `src/api/transport.ts`：`ParamsOf`／`WithParams`／`RequestSpec`（D1）；`RequestBase.params` 的註解搬到 `WithParams` 上 —— 四條轉綠，commit
- [ ] 2.3 `[FE-O20-S05]`：`pnpm run typecheck` 綠、`tests/api-operations-coverage.test.ts` 綠，`operations.ts` 零 diff
- [ ] 2.4 **突變**（先 commit）：`WithParams` 改回 `{ params?: Record<string, string> }` → `S01`～`S04` 紅、`S05` 綠；改回來

## 3. 收尾

- [ ] 3.1 `pnpm run typecheck`、`pnpm run lint`、`pnpm test` 全綠
- [ ] 3.2 封存（`archive/fe-o20-path-params`，獨立 PR）
