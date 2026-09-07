# 0002. 前端框架與渲染邊界

- **Status**: Proposed
- **Date**: 2026-09-07
- **Deciders**: 待規格 PR 上確認

## 背景

這個 repo 到 `FE-X01` 之前**沒有任何產品程式碼**，所以框架是從零選的，
而且選完之後 W1–W16 的每一項都建在它上面 —— 換掉的成本會隨週次線性上升。

三個既有條件限制了選項：

1. **前端要自己有一份後端。** `CONTEXT.md`〈先做自己的後端，之後再銜接〉
   明訂本地後端是 **Route Handlers ＋ 一個可拋棄的資料庫**（`FE-O03`／`FE-O04`），
   而且**功能先在它上面做完**，之後才跟真的 GuildHub 後端銜接。
   所以框架必須同時提供前端路由與伺服器端路由。
2. **3D 只能在瀏覽器端跑。** WebGL 沒有伺服器端等價物，World 一定要有一個
   明確的 client 邊界。這個邊界要能被 `FE-W01` 直接接手，而不是被重寫。
3. **真後端是另一個 repo 的 FastAPI**，身分走 session cookie
   （`FE-O09`：`allow_credentials=True`，所有請求帶 credentials，
   **WS 握手也靠同一個 cookie**）。所以部署形態要能處理跨源 cookie，
   不能假設前後端同源。

## 選項

### A. Next.js App Router（React Server Components ＋ Route Handlers）
- 好：Route Handlers 直接滿足「自己的後端」，不必多一個部署單元；
  `next/dynamic` 的 `ssr: false` 給出明確的 client 邊界；
  官方文件對 Vitest ＋ Testing Library 有既定做法
- 好：`redirects()` 用 `permanent: true/false` 明確表達 308／307，
  不必依賴「某個函式預設是幾」
- 壞：Server／Client Component 的邊界是每個人都要理解的額外概念
- 壞：**async Server Component 目前無法被 Vitest 單元測試**，
  一部分路由行為只能靠人工或之後的 E2E 證明

### B. Vite ＋ React Router（純 SPA）
- 好：心智模型最單純，全部都是 client，沒有邊界問題
- 好：3D 專案的常見選擇，建置快
- 壞：**「自己的後端」要另外起一個 server 並各自部署**，
  多一份設定、多一份 CI、多一個會漂的地方
- 壞：之後要 SSR 或 metadata 時無路可走

### C. Remix / React Router 7 framework mode
- 好：同時有前端與伺服器端路由，loader/action 的資料模型清楚
- 壞：它的資料模型（loader/action）跟本 repo 已經決定的
  **「所有資料存取走 `src/api/`，adapter 由環境變數切換」**（`FE-O02`）
  是兩套東西，會有一層要被架空
- 壞：換來的好處在本專案沒有對應的需求

## 決定

選 **A：Next.js App Router**。

**理由**：只有 A 讓「前端自己的後端」不需要第二個部署單元 ——
而那份本地後端是 `CONTEXT.md` 訂下的策略基石，不是可選項。
B 的單純換來的是永久多一份 server 要維護；C 的資料模型跟 `FE-O02`
已經定好的 adapter 架構重複，會有一層變成裝飾。

**渲染邊界劃在哪裡**：

```
Server Component   路由、layout、metadata、之後的 Route Handlers
      │
      │  ← 邊界：一個標了 'use client' 的薄殼
      ▼
Client Component   World（3D）、所有互動式 DOM 面板
```

World 的殼由 `FE-X01` 交付並**保持穩定**；殼裡面的內容由 `FE-W01` 換成 Canvas。
殼與內容分離是為了讓 3D 的引入不需要動路由層。

## 代價

- **async Server Component 測不到。** Vitest 不支援，所以「`/` 回 307」
  這類行為不能靠 component test 證明。`FE-X01` 的做法是把轉址放進
  `next.config` 並斷言設定本身；剩下的差距靠人工開瀏覽器，
  自動化的部分等 `FE-O11` 裁決 E2E 策略。
  **這是真的差距，不是被繞過的問題。**
- **每個人都要懂 Server／Client 邊界。** 放錯邊的症狀是建置期錯誤或
  「為什麼這個 hook 不能用」，對新加入的人不友善。
- **綁定 Next.js 的版本節奏。** App Router 的 API 仍在變
  （`catchError` 這類是新加的），升級要讀 migration。
- **bundle 大小的責任落在我們身上。** three.js 進來之後，
  client 邊界內的東西全部要自己控管 —— `FE-O12` 的效能預算會直接量到它。

## 什麼情況下要重新考慮

- **本地後端被拿掉**（例如改成直接連真後端開發）——
  那時 A 相對 B 的主要理由消失，SPA 會變成比較單純的選擇
- **Route Handlers 撐不住本地後端要模擬的行為** ——
  特別是 WebSocket 替身（`FE-O03`）。Next.js 的 Route Handler 對長連線
  支援有限，如果本地即時層做不出來，要嘛另起一個 server（那就退回 B 的成本），
  要嘛重新評估
- **Server Component 的邊界成為主要的 bug 來源** ——
  如果團隊在這上面花的時間超過它省下的部署成本
- **`FE-O12` 的效能預算長期過不了**，且原因指向框架本身而不是 3D 內容
