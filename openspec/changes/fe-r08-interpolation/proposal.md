## Why

遠端角色現在**每 100 毫秒瞬移一格**。後端的廣播是固定 10 Hz（`protocol.py` 的
`HZ = 10`），而畫面是 60 FPS —— `FE-R07` 收到 `pos` 就直接把座標寫進 transform，
所以六幀不動、第七幀跳 0.4 個世界單位。

**不做的話，這個世界看起來是壞的。** 不是「不夠精緻」——
是一屋子人像幻燈片一樣閃動，而 `CONTEXT.md` 對 3D 的辯護（可旁觀、
可漸進加入的空間感）建立在「看得到別人自然地走動」上。
`FE-R09` 的 40 人 Browser E2E 是 W1 的 Go／No-Go，
而**跳格的角色沒辦法用來判斷 40 人下的表現**：
每一幀的位移都被 10 Hz 的節奏支配，量不到渲染本身的成本。

現在做，是因為它擋著 `FE-R09`，而且它要改的資料結構（`RemoteMotion`）
每多一項功能長在上面，之後改動就多一處要跟著改。

## What Changes

- **`RemoteMotion` 從「一個目前位置」變成「一段樣本歷史」** —— **BREAKING**
  （對 `remote-players` 的內部契約而言；沒有對外 API）
- 遠端角色的畫面位置改由 `render delay = 250ms` 的**純函式**求值：
  `畫面位置 = f(樣本, now() − 250ms)`，不依賴上一幀畫在哪裡
- **單段插值時長上限 = render delay**。這一條同時處理長時間靜止後重新移動、
  斷線恢復後的封包突波，以及缺包
- **不外插**。樣本用完就停在最後一個樣本
- **teleport 由協定語義定義，不是由距離定義**：只有 `snapshot` 與
  `presence.join` 會 snap 並清空樣本；一般的 `pos` 永遠不因為「距離很遠」而 snap
- 離散朝向 `f` **綁在樣本上**，渲染 A→B 這一段時用 `B.f`。**不做角度插值**
- 新增瀏覽器 E2E 驗收：兩個真實分頁，量遠端角色的**每幀位移分佈**

### Non-goals（這一刀**不做**什麼）

- **不做走路動畫。** 判斷「這個人在不在走」現在有了 previous／target 就做得到，
  但動畫狀態機是 `FE-W08`／`FE-W14` 的事。在這裡先做一個近似值，
  之後會變成兩份互相打架的判斷
- **不做自適應 render delay。** 250 這個數字來自實測（見 design.md），
  真實網路上的驗證是 `FE-R09` 的工作。**現在把它做成會自己調的，
  等於在還沒有量測的情況下先寫一個控制迴路**
- **不改送出端。** 原地轉身現在不會被送出去（`FE-R03` 只在整數像素改變時送），
  所以別人原地轉頭你看不到。那是 `position-sync` 的缺口，另開 change
- **不做外插／dead reckoning。** 協定沒有速度、沒有停止事件、沒有時間戳
- **不加 client 端的距離／速度防護欄。** 沒有任何測試能證明那個常數是對的
- **不做 40 人的效能量測。** 那是 `FE-R09`
- **不做角度插值，也不做轉身過渡。** 朝向 `f` 是離散的 0–3。
  **這一條最容易被順手做掉** —— 寫完位置的連續插值之後，
  下一個直覺就是「朝向也 lerp 一下」，而那會產生協定沒有定義的斜向朝向
- **不做斷線突波的 timestamp shaping／backlog replay。**
  把突波撐開成每則 100 毫秒看起來更平滑，代價是角色**永久落後兩秒**。
  那個取捨在 design.md 的 D5 已經做過決定，**看到 burst 跳動的人最容易順手加的就是它**
- **不做 spline／曲線平滑，也不用距離推估速度。** 量到的資料證明
  「距離沒變、變的是時間」（design.md 的含意 2），任何依距離推速度的方案都會提早走完然後停住

## Capabilities

### New Capabilities
- `remote-interpolation`: 遠端角色從 10 Hz 的位置樣本重建 60 FPS 的連續移動 ——
  樣本緩衝、render delay、單段時長上限、餓死、離散朝向的套用時機

### Modified Capabilities
- `remote-players`: `pos` 寫入的不再是「目前位置」而是「一個帶時間的樣本」；
  「畫面上的角色每 100 毫秒跳一格」這條明文的範圍限制被解除；
  `snapshot`／`presence.join` 除了寫座標之外還要**清空樣本**

## Impact

- `src/realtime/remotePlayers.ts` —— `RemoteMotion` 的形狀、`applyMessage` 要吃 `now`
- `src/world/player/RemotePlayer.tsx` —— render loop 改成求值而不是複製
- `src/world/RemoteWorld.tsx` —— 注入時間來源
- 新檔案：插值本身（純函式，與 React 和 three 都無關）
- 新增 devDependency：`playwright-core`（瀏覽器 E2E；**不下載瀏覽器**，
  用系統既有的 Chromium）
- **不影響**：協定、座標換算、送出端、本地角色、相機、物理
