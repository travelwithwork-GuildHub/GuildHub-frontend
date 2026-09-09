## Why

`FE-W06 SpatialInteraction` 是「走到一個物件旁邊、按 E、打開面板」那條路徑的機制層。

而 `CONTEXT.md` 對這件事下了一句很重的警語：

> 如果主要行為都是「走到一個物件、按 E、打開 DOM 面板」——
> **那 3D 就是一條很貴的導覽列。**
>
> 空間唯一真正的優勢是把這條鏈變得自然且低摩擦：
> 看見 → 靠近 → 旁聽 → 打招呼 → 正式申請

**這兩件事不衝突，但順序不能弄反。** 那條鏈（`FE-V02`～`FE-V06`，W11）需要一個
底層機制回答「我現在對著誰、離它多遠」。`FE-W06` 提供那個機制。
它**不能**把「按 E 開面板」寫死成唯一的互動形狀 —— 否則 W11 要重做。

具體來說：`FE-V04` 漸進式接近要的是**連續的**接近度（越靠近顯示越多、每一步都能退回），
不是 on／off。所以 contract 必須交出距離，不能只交出一個 boolean。

## 不做會怎樣

`FE-W12` 互動物件（W3）有四種物件要接上這個機制。沒有先定 contract 的話，
四種各自實作一次「怎麼算在範圍內」「兩個靠很近時聽誰的」，
而**「提示在兩個物件之間閃爍」這種 bug 每一份都會各犯一次**。

## 已經量到的事實

### Sensor 不管遮蔽

已封存的 `FE-W04` 規格寫著「這是 `Interaction Range` 的原語」。實測（真 Rapier）：

| 情況 | 結果 |
|---|---|
| `world.step()` **之前**查 `intersectionPairsWith` | `false` —— **假的**，narrow phase 還沒跑過 |
| step 之後，角色與 sensor 中間隔一道實心牆 | **`true`** —— 牆完全擋不住 |
| 對照：角色朝那道牆走 | 停在 `x = 0.54`（牆面 0.8 − 半徑 0.25，正確） |

也就是 **sensor 重疊不等於可互動**。要處理遮蔽只能另外做 raycast。

第一列那個 `false` 是量測本身的陷阱：`intersectionPairsWith` 在 `world.step()`
跑過 narrow phase 之前一律查不到東西，而它**不會報錯**。

### 這改變了範圍決定

W1 的互動範圍**用距離判定，不用 sensor**（design 的 D1），
而 `FE-W04` 那句「sensor 是 Interaction Range 的原語」要正式修訂 ——
兩個模型都說只在 design 記一筆不夠，那是跨規格的架構承諾。

## What Changes

- `Interactable` contract：物件註冊自己的 id、位置與顯示名稱
- 目標選擇：**唯一一個** active target，規則是朝向優先於距離，
  加上遲滯避免邊界閃爍，完全平手時用 id 決斷
- contract 交出 `targetId` **與連續的距離**，不定義 far／near／adjacent 分級
- 目標改變才通知 React（走在兩個物件邊界上不得每幀 setState）
- `E` 只作用在目前的 target；提示是 DOM 不是 3D 物件
- **修訂 `world-physics`**：sensor 是物理觸發原語，但重疊不等於可互動

## Non-goals

- **不做遮蔽（視線）判定。** 今天世界裡沒有內部牆（`FE-W10`／`FE-W11` 才有），
  所以既沒有對象也驗不了。contract 保留加上它的空間，
  而「sensor 不管遮蔽」這個量測寫進規格，免得 `FE-V03`／`FE-V04` 假設它會
- **不把 Rapier world 的所有權從 `LocalPlayer` 搬出來。** 用 sensor 當範圍閘門
  需要那個搬家，而那是動已封存項目的架構，換到的東西今天是零
- **不定義接近度的分級。** `far`／`near`／`adjacent` 幾級、閾值多少，
  是 `FE-V04`（W11）的事。現在訂就是把猜測寫成需求
- **不做任何互動物件。** Project Board、Talent Board、Door、Seat 是 `FE-W12`（W3）
- **不做面板的內容。** 這一項只交出「對著誰」，面板裡放什麼是各個產品項目的事

## Capabilities

### New Capabilities

- `spatial-interaction`: 空間裡的互動目標判定與提示

### Modified Capabilities

- `world-physics`: sensor 的定位修訂 —— 它是物理觸發原語，不是 Interaction Range 的判定方式

## Impact

- 正式碼：新增 `src/world/interaction/`；`WorldCanvas` 掛上互動層
- `FE-W12`（W3）的四種物件都接這個 contract
- `FE-V03`／`FE-V04`（W11）在這個 contract 上加分級與遮蔽
