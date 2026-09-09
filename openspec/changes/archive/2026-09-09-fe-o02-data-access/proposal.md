## Why

工作分解表的 `FE-O02`（W1 的兩列，11 點）：

> domain operations（Profile / Project / Role / Application / Invitation / Offer /
> Message / Room / Seat）。**元件裡不准出現 `fetch`**
>
> Adapter 切換：`local`（自己的 Route Handlers）或 `guildhub`（真後端），
> 環境變數決定。**元件不知道自己連的是誰**

那一列掛著 Alarm：**「這條破了，之後銜接是重寫不是切換。」**

`CLAUDE.md` 也寫了同一件事：散在各處的 `fetch` 讓「之後接真後端」變成重寫。

## 不做會怎樣

`FE-B`／`FE-J`／`FE-M`／`FE-N` 四組（合計五十幾項）全部要讀寫資料。
沒有這一層的話，每一項各自決定「位址從哪來、回應怎麼解、錯誤長什麼樣」——
而那些決定會在五十個地方各做一次。

## 三個現實決定了範圍

| | |
|---|---|
| (a) | **本地後端（`FE-O03`）是 W2，今天不存在。** 也就是那個 adapter 今天沒有東西可以連 |
| (b) | 九個 domain 裡**有四個後端沒有**（Role／Application／Invitation／Offer，`BE-G10`）。契約層 `rest.ts` 已經刻意不涵蓋它們 |
| (c) | **測試不准連團隊共用位址，而 CI 上沒有任何服務。** 真後端只在開發者自己的機器上 |

## What Changes

- `src/api/` 底下的 **domain operations**：Profile／Project／Room／Seat／Message
  五個 domain（後端今天有的那些）
- **Adapter 切換**由 `NEXT_PUBLIC_DATA_ADAPTER` 決定，值是 `guildhub | internal`
- 送出去之前用契約驗；**回來的在 API 邊界驗**，漂掉就在那裡炸，
  不要讓 `undefined` 流進深層元件
- `internal` adapter **存在但每個操作明確失敗** —— 它是切換邏輯的第二條路

### 為什麼不叫 `local`

`src/config/env.ts` 已經有一個 `NEXT_PUBLIC_APP_ENV=local`，那個 `local`
的意思是**「跑在開發者的機器上，連 localhost:8000 的真後端」**。

而 adapter 的 `local` 意思是**「連我們自己的 Route Handlers ＋ 可拋棄資料庫」**。

**同一個字，兩個完全相反的資料來源。** 除錯時那句「你 local 壞了」
會變成沒有意義的句子。改叫 `internal`，跟 `guildhub` 對比。
（工作分解表寫的是 `local`；那份表要跟著改，另開 `chore/`。）

## Non-goals

- **不做本地後端。** Route Handlers ＋ 可拋棄資料庫是 `FE-O03`／`FE-O04`（W2）。
  這裡的 `internal` adapter 每個操作拋「尚未實作」
- **不定義後端沒有的那四個 domain。** Role／Application／Invitation／Offer
  今天沒有契約可以對 —— 現在定的介面是憑空想的，等後端真的開出來
  幾乎一定不合，那時要先改介面才能接。留白，並且**用機械檢查擋住有人偷偷加**
- **不做錯誤語彙的對映。** 「401 要導向登入」「409 要重拉座位圖」是
  `FE-X03` 的唯一一份語彙（`FE-O02` 的第三列，W2）。這裡只保證
  **失敗不會被當成成功**
- **不做重試、退避、快取、請求取消。** 那些各有自己的工作項目
- **不做契約測試。** 「同一組測試對兩個 adapter 各跑一次」是 `FE-O05`（W2）

## Capabilities

### New Capabilities

- `data-access`: domain operations 與 adapter 切換

### Modified Capabilities

（無）

## Impact

- 正式碼：`src/api/` 底下新增 operations 與 adapter；`src/config/env.ts` 多一個設定
- `docs/WBS.md` 的 `FE-O02` 那一列要把 `local` 改成 `internal`（另開 `chore/`）
- `FE-O03`／`FE-O04`（W2）接上 `internal` adapter 之後，那些「尚未實作」才會消失
