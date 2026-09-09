## Why

Guild Hall 現在是一座**沒有人在裡面發生任何事**的房子。
`FE-W11`（已封存）把十四種場景元件擺成了 24×24 的大廳：兩塊看板、
一條走廊、兩扇貼著西牆的門。但那兩扇門的註解逐字寫著

> 它們今天通不到任何地方 —— `FE-W12` 才依 API 生成。

而兩塊看板從 `FE-W10` 交出來到現在，**沒有註冊進互動系統** ——
走到它們面前，畫面上什麼都不會出現。

**不做會怎樣**：`CONTEXT.md`〈3D 憑什麼存在〉那條鏈是

```
看見 → 靠近 → 旁聽 → 打招呼 → 正式申請
```

第一環「**看見**」今天不成立。玩家走進大廳，看到的是家具，
不是「哪裡有人、在做什麼」。而在線數如果只在走到門前才顯示，
那第一環仍然不成立 —— 那是「靠近」之後才拿到的資訊。

這一項讓世界第一次跟資料接上。

## What Changes

- 新增 `world-interactive-objects` capability
- 走廊的門**依 `GET /api/rooms` 生成**，槽位從 `FE-W11` 交下來的走廊矩形推導
- 名稱與在線數用 **DOM overlay** 呈現（**不引入 3D 文字**），
  位置由固定正交相機的投影算出
- 兩塊看板註冊進 `FE-W06` 的互動系統
- 輪詢 `online_count`，並定義**頁籤在背景時停止**的生命週期
- `LAYOUT` 移除兩扇寫死的示意門

## Non-goals

- **不做「進入專案房間」。** 場景切換是 `FE-V01`（W4，10 點）。
  門**不帶 `onInteract`** —— `FE-W06` 的契約明文允許
  「沒有的話那個物件只顯示提示，按下去什麼都不做」。
  今天造一個 `onEnterProject` prop 交給一個什麼都不做的函式，
  正是這個 repo **三次**否決過的「今天沒有讀取者的抽象」
- **不做任何 DOM 面板。** 案件列表與詳情是 `FE-B01`–`FE-B03`。
  而 `CONTEXT.md` 對「走過去按 E 開面板」有明文警語
- **不引入 3D 文字。** troika／drei／`CanvasTexture` 三條路都會建立 GPU 資源，
  直接違反 `FE-W09`／`FE-W10` 選定的資源所有權契約（見 design 的 D2）
- **不做溢位的 3D 分頁 UI。** 走廊排不下就只放前 N 扇，
  「還有幾個沒顯示」由既有的 DOM 層講出來 —— **但不得靜默截斷**
- **不改看板的造型，也不讓它們接任何 API。** 板上的卡片數不反映資料 ——
  卡片上沒有字，「四張卡代表四個專案」在畫面上讀不出來
- **不做 `FE-O03` 的 Route Handler。** 本地後端是 W2 的獨立工作項目
- **不動 `FE-W11` 的走廊幾何。** 隔牆的開口與 `door-corridor` 原樣留著
- **不做 Seat。** 座位綁專案，Guild Hall 不是專案 —— 已由 governance PR #212
  移交 `FE-W16`

## Capabilities

### New Capabilities

- `world-interactive-objects`: 世界裡**依資料生成**的物件、它們的螢幕標籤，
  以及它們與互動系統的接線

### Modified Capabilities

（無 —— `world-layout` 的 Requirement 沒有列舉配置的內容，
移除兩扇示意門不改變任何產品義務；`spatial-interaction` 的三個係數
刻意沒有寫進規格，重量 `range` 不是規格變更。見 design 的 D7）

## Impact

- 新增 `src/world/rooms/`（門槽位、房間資料的取得與輪詢、標籤投影）
- `src/world/layout/guildHallLayout.ts`：移除 `door-room-1`／`door-room-2`
- `src/world/WorldCanvas.tsx`：掛上門與標籤層
- `src/world/interaction/tuning.ts`：`range` 依實際物件尺寸重量
