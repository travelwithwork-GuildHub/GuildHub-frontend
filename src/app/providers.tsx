// 規格 FE-X01-S05 / S13：全域 Provider 的**唯一**組合位置。
//
// 這一刀刻意不掛載任何東西。TanStack Query 與 `ui` / `world` / `interaction` /
// `avatar` store 是 FE-X02 的範圍 —— 在這裡先裝等於替它裁決。
//
// **不得多包一層元素。** 多包一層會讓依賴父子關係的版面規則靜默失效，
// 而那種失效沒有錯誤訊息。所以回傳 Fragment，不是 `<div>`。
//
// 還沒標 `'use client'`：現在它是純粹的傳遞，Server Component 可以直接用。
// FE-X02 掛上第一個 client provider 時再加 —— 現在加等於憑空多一個
// 沒有內容的 client 邊界。
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
