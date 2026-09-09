import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FE-W07 洩漏偵測的量測台。**這不是產品的一部分** ——
// 它只在 `tests/e2e/leak-detection.mjs` 執行期間存在。
//
// ⚠️ `root` 指到這個資料夾，所以 vite 只服務 `tests/e2e/leak-harness/` 底下的東西
// 加上它 import 到的模組。它**不經過 Next**，所以不會有 app 的路由、
// middleware 或環境變數。

const here = path.dirname(new URL(import.meta.url).pathname)

export default defineConfig({
  root: here,
  plugins: [react()],
  // 量測台 import 真正的場景元件，所以 `@/` 要指到 `src/`（跟 tsconfig 一致）
  resolve: { alias: { '@': path.resolve(here, '../../../src') } },
  server: { host: '127.0.0.1', strictPort: true },
  // 這是一次性的量測，不需要任何快取
  cacheDir: path.resolve(here, '../../../node_modules/.vite-leak-harness'),
})
