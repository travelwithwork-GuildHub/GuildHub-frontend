import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// **沒有這一行，每個測試都會看到前一個測試留下的 DOM。**
// Testing Library 的自動 cleanup 只在 `globals: true` 時才會註冊，
// 而這個專案沒有開 globals。實測症狀是
// `Found multiple elements with the role "heading"` ——
// 但更危險的是反過來的那一種：**測試因為看到別人的 DOM 而假性通過。**
afterEach(cleanup)
