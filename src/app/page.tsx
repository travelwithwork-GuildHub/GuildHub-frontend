import { IdentityProvider } from '@/identity/IdentityProvider'
import { RootEntry } from './RootEntry'

// `/` —— 網站的正式入口。規格 `FE-A06-S01`／`S02`／`S03`。
//
// ⚠️ **這一頁取代了一條 307 轉址。** `next.config.ts` 原本把 `/` 轉到 `/world`，
// 而那一行旁邊的註解逐字寫著它為什麼刻意不是 308：
//
//   > 刻意不是 308 —— **W2 之後 `/` 會變成登入入口**，
//   > 永久轉址會被瀏覽器快取而清不掉。
//
// **這一項就是那個「W2 之後」。** 那條轉址一併拿掉了 ——
// 留著的話它會贏過這一頁（`redirects()` 在路由之前），而症狀是
// 「新的首頁做好了、但永遠看不到」。
export default function HomePage() {
  return (
    <IdentityProvider>
      <RootEntry />
    </IdentityProvider>
  )
}
