import { defineConfig } from 'vitest/config'

// **整合驗證專用的設定。`npm test` 不會跑到這些。**
//
// 規格 FE-R01 的〈驗證方式〉：V1 與 V3 需要一份**真的後端**，
// 而 `AGENTS.md`〈測試環境隔離〉第 2 條寫「CI 不提供任何服務」。
// 所以它們用 `.itest.ts` 副檔名，不在 `vitest.config.mts` 的 include 裡。
//
// ⚠️ **只准打自己 `bash run.sh` 起的那一份後端。**
// 位址從 `runtime-config` 來，預設就是 localhost。
//
// environment 是 node 不是 jsdom：要用**真的** WebSocket。
// 順帶一提，那也是為什麼 V2（cookie 有沒有送到）**不能**在這裡驗 ——
// Node 的 WebSocket 不帶 cookie。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.itest.ts'],
    testTimeout: 60_000,
  },
})
