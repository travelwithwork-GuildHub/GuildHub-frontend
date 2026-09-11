import { defineConfig } from 'vitest/config'

// **契約測試專用的設定。`npm test` 不會跑到這些。** 規格 FE-O05。
//
// 同一組測試對兩個目標各跑一次：`CONTRACT_TARGET=internal`（harness 自己起 `next start` ＋ 可拋棄 Postgres）
// 或 `CONTRACT_TARGET=guildhub`（`scripts/contract-guildhub.mjs` 自己起真後端）。目標的差異只在 `globalSetup`，
// 測試檔本身不知道自己在打誰（`FE-O05-S02`）。
//
// environment 是 node：走**真的** HTTP 與 WebSocket，不 import 任何 Route Handler。
// `fileParallelism: false`：兩個目標都是一份共用狀態的後端（同一個 lobby、同一個庫）。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.contract.ts'],
    globalSetup: ['tests/contract/harness.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
