## Why

要把目前的前端部署到 Vercel「讓其他人上去看」。今天做不到，而且**擋路的不是缺功能，
是缺一個定義**：這個前端在「沒有即時後端可連」的情況下該做什麼，目前沒有答案。

三件量過的事實，都不是假設：

1. **設定錯誤只會在訪客的瀏覽器裡爆炸。** `wsUrl()` 是在 `RemoteWorld` 的
   `useEffect` 裡第一次被呼叫的（`client.connect()` → `connectionUrl()` → `wsUrl()`）。
   `NEXT_PUBLIC_APP_ENV=production` 而少了 `NEXT_PUBLIC_GUILDHUB_WS` 時，
   `resolve()` 拋 `ConfigError`，那個錯在 effect 裡穿出去，整棵樹倒掉 ——
   **實測：`next build` 綠燈、CI 綠燈、部署成功，線上只剩下「GuildHub」四個字。**
   `fe-o09-env` 建立的那些守衛全部是對的，但它們的**觸發時機**是執行期，
   而部署設定的錯誤在建置時就該被知道。

2. **前端沒有任何重連邏輯**（那是 `FE-R12`，W5）。所以連不上不是「一直轉圈」，
   是**一次失敗之後永遠安靜**。實測用一個連不上的 `wss://` 位址做 production
   建置：世界照常出現、角色照常用方向鍵走（x 從 0 走到 6.4 撞到邊界）、
   唯一的痕跡是 console 一行 WebSocket 連線失敗。
   **畫面上零提示** —— 那個 `role="alert"` 是 Next 注入的空 route announcer，不是錯誤畫面。
   訪客會看到一個空盪盪的世界，而且**分不出「本來就沒人」與「壞了」**。

3. **「沒有後端」今天不是一個表達得出來的狀態。** `NEXT_PUBLIC_GUILDHUB_WS`
   在 `preview`／`production` 是必填且沒有預設值 —— 那條規則是對的
   （`fe-o09-env`：安靜退回 localhost 會讓症狀變成「所有資料都不見了」）。
   但它的副作用是：一個**刻意沒有即時後端**的部署，只能填一個假位址進去騙過檢查。
   於是設定檔看起來像「有後端」，行為卻是「沒有後端」。

不做會發生的具體事情：部署上去，訪客看到一個空世界或一片空白，而我們**沒有辦法
從設定檔看出哪一種是預期的**。

## 為什麼不是「用 Next.js 寫一個測試後端」

這是原本的提議，量過之後不成立，理由記在 `design.md` 的 D1。摘要：

- **REST 那半沒有用。** `src/` 底下沒有任何元件 import `@/api/operations`。
  畫面上唯一會動的東西（別人的角色）**全部走 WebSocket**。
  做 Route Handlers 部署上去，畫面一模一樣。
- **WS 那半不該用 Next.js 寫。** Vercel 官方文件明寫連線被釘在個別 function
  instance 上，跨實例要靠 Redis。不接 Redis 的話兩個訪客可能落在不同實例，
  形成**兩個互不相見的房間** —— 而那是間歇性的，最難診斷的失敗形態。
  接了 Redis 也不解決 10 Hz 房間 tick 的生命週期問題。
- **而且會製造協定漂移。** 真實來源是後端的 `protocol.py`。用 TypeScript 再寫一份
  10 Hz 廣播、「沒有人移動就不送 `pos`」、整數座標，等於把同一份協定實作兩次。

要讓兩個人**真的**互相看得到，路徑是把已經存在的 FastAPI 部署到一個常駐容器
（Railway／Render／Fly）—— 那是一次設定，不是一次重寫。**那件事不在這個 change 裡**
（見 Non-goals），這個 change 讓前端在那之前就能誠實地上線。

## What Changes

- **`NEXT_PUBLIC_REALTIME_ADAPTER`**：新的環境變數，值為 `guildhub` 或 `none`。
  `none` 是「這個部署刻意沒有即時後端」的**明確宣告**。
  這補上 `FE-O02` 留下的不對稱 —— REST 有 adapter（`NEXT_PUBLIC_DATA_ADAPTER`），
  WS 那條路直接讀位址。
- **建置時驗證**：`preview` 與 `production` 的建置，設定不合法就讓
  `next build` **失敗**，而不是產出一個會在瀏覽器裡拋錯的 bundle。
  **preview 不能排除在外** —— preview 部署是拿給人看的，
  它壞掉的方式跟 production 完全一樣。
- **設定項目集中成一份清單**，建置時的驗證迭代它 ——
  而不是在 `next.config.ts` 裡逐一列舉變數（兩份清單一定會漂）。
- **單人預覽的呈現**：`none` 的時候前端**不建立連線**，並用 DOM 告訴訪客
  「目前是單人預覽，看不到其他人」。
- `.env.example` 補上新變數與兩種部署情境的完整範例。

### 不做什麼（Non-goals）

- **不做任何後端。** 不寫 Route Handlers、不寫 WS 伺服器、不接資料庫。
  `FE-O03`／`FE-O04`（本地後端與可拋棄資料庫）還在 W2，不提前。
- **不部署後端，也不選擇部署後端的平台。** 那需要帳號與帳單決策，不是程式碼。
  這個 change 只保證「之後把 `NEXT_PUBLIC_REALTIME_ADAPTER` 改成 `guildhub`、
  填上位址」就會接上，不需要改任何程式碼。
- **不做斷線重連、退避與鬼影清理** —— 那是 `FE-R12`（W5）。
  這裡處理的是「**刻意**沒有後端」，跟「有後端但斷了」是兩個狀態，
  規格明文要求它們不得混為一談。
- **不做假玩家／機器人。** 讓空世界看起來熱鬧是 `FE-O15` 的
  「Local fake player（不進 DB、不送 WebSocket）」，W5。
  這個 change 的答案是**誠實告知**，不是製造熱鬧。
- **不碰 `NEXT_PUBLIC_DATA_ADAPTER` 的既有行為**，也不讓任何元件開始呼叫 REST。
- **不處理跨網域的 SameSite / Secure** —— `FE-O09` 那一列的 `W13–W16` 那一格。
- **不設定 Vercel 專案本身**（連 repo、開網域、加環境變數）。那是使用者在
  Vercel 主控台上的操作，程式碼證明不了它。這裡只保證**設定錯了會在建置時紅**。

## Capabilities

### New Capabilities

（無。）

### Modified Capabilities

- `runtime-config`: 加入「即時層的資料來源」這個軸，以及**設定錯誤的失敗時機**
  —— 從執行期提前到建置期。

## Impact

- 修改 `src/config/env.ts`（新增 `realtimeAdapter()`，`wsUrl()` 的必填條件跟著改）。
- 修改 `next.config.ts`：加入一行建置時的設定驗證（迭代那份清單）。
  實測過 `next dev` 不受影響：config 在 dev 時以 `NODE_ENV=development` 載入，
  `appEnv()` 於是回 `local`，走的是本機預設值那條路。
- 修改 `src/world/RemoteWorld.tsx`：`none` 時不建立連線。
- 新增單人預覽的 DOM 呈現，掛在 `WorldCanvas` 既有的提示位置旁邊。
- 修改 `.env.example`。
- **不影響本機開發**：`NEXT_PUBLIC_APP_ENV` 缺席時仍然是 `local`，
  `NEXT_PUBLIC_REALTIME_ADAPTER` 缺席時仍然是 `guildhub`、仍然連
  `ws://localhost:8000/ws`。今天的 E2E 測試不必改。
