import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 副檔名是 .mts 而不是 .ts：Vite 未來版本的預設 config loader 會把 .ts
// 當成 CommonJS 載入，那會對這個檔案的 ESM 語法發警告。
// 現在就用 .mts，不要留一個之後才會咬人的警告。
export default defineConfig({
  plugins: [react()],
  resolve: {
    // 取代 vite-tsconfig-paths：Vite 已經原生支援，多一個外掛就是多一個
    // 之後會被棄用的東西。
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // `passWithNoTests` 保持預設的 false。規格 FE-X01-S12：
    // 零個測試而回報成功等同於沒有驗證。
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
