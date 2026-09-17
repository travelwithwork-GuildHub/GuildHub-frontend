import { defineConfig } from 'vitest/config'

// **切換演練專用的設定。`pnpm test` 不會跑到這些。** 規格 FE-O08。
//
// 只由 `scripts/contract-guildhub.mjs --suite rehearsal` 起：它自己起真後端、跑完從 JSON reporter 產報告。
// globalSetup 沿用契約測試的 harness（同一套「只接受 wrapper 起的 loopback 後端」守門）；
// 測試檔透過 `inject('contractBaseUrl')` 拿位址，不看環境變數。
//
// `fileParallelism: false`＋單一檔案：閉環十三步是循序接力（共用狀態），不能打散。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/rehearsal/**/*.rehearsal.ts'],
    globalSetup: ['tests/contract/harness.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
