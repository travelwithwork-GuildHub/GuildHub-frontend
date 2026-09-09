## Why

工作分解表的 `FE-W07`（W1 那一列）寫著：

> 場景切換時 geometry / material / texture 的釋放；**重複進出十次記憶體不得成長**（可量測的驗收）

**照字面寫成 Scenario 的話，那條測試會是恆真的。** 開工前先量了。

量測台：`vite` 起一個臨時頁面，import 這個 repo 真正的場景元件，
用 `createRoot` 反覆 render / unmount，讀 `renderer.info.memory`，
並 patch `BufferGeometry.prototype.dispose` 計數（有正向對照確認計數器會動）。
真 Chromium ＋ SwiftShader。

| # | 資源的形狀 | 量到的結果 |
|---|---|---|
| A | JSX 子元素 `<mesh><boxGeometry/><meshStandardMaterial/></mesh>` —— **本 repo 現在全部是這一種** | 十輪 `info.memory` 都是 `{geometries:10, textures:3}`，**完全不變**；dispose 計數每輪 +10 |
| B | 模組層級共用、用 prop 傳 `<mesh geometry={SHARED}/>` | 三輪之後 `SHARED` 的 dispose 事件 **0 次** —— R3F **不會**過度釋放 |
| C | 元件自己 `useMemo(() => new BoxGeometry())`、用 prop 傳 | `info.memory.geometries` = 1,2,3,4,5,6 —— **線性成長，永遠不釋放** |
| D | renderer 與 WebGL context | 每次卸載一則 `THREE.WebGLRenderer: Context Lost.`（R3F 有 `forceContextLoss`） |
| E | Rapier `World` 與 character controller | bindings 原始碼：`World.free()` 內含 `characterControllers.forEach(c => c.free())`，正式碼那一行已經夠 |

R3F 的 `removeChild` 只對 **reconciler 自己建的 instance** 呼叫 `disposeOnIdle`
（跳過 `<primitive>` 與 `Scene`，`dispose={null}` 可退出）。
**用 prop 傳進去的物件不是 instance，不在它的管轄內** —— 那就是 B 與 C 的分野。

### 兩個「聽起來很危險」的東西，量過之後都不是

草稿裡我寫了「手動釋放 R3F 建的資源會變成 double dispose」，
審查時另外被提醒「loader 的產物是共用快取，釋放會讓快取中毒」。
**兩個都量了，都不成立**：

| 做的事 | 量到的結果 |
|---|---|
| 掛載中手動 `geo.dispose()`，卸載時 R3F 再 dispose 一次 | 零錯誤，畫面照樣 12 triangles |
| 同一個 renderer 裡 A 與 B 共用一份資源，A 卸載後把它 dispose 掉 | **B 照樣畫得出來**；`info.memory.geometries` 仍是 1（被重新上傳），零錯誤 |

three.js 的 `dispose()` 只丟掉 GPU 端那一份，JS 端的資料還在，
下一次 render 會重新上傳。所以「釋放了還在用的資源」的代價是**一次重新上傳**，
不是壞掉。

**量到的無聲失敗只有 C 一種。這份規格就只防它。**

### 不做會怎樣

`FE-W08` ProceduralAvatar、`FE-W09` WorldDesignSystem、`FE-W10` EnvironmentComponents、
`FE-W15` 資產管線都會產生「元件自己建資源」的形狀。C 的症狀是**無聲的**：
記憶體逐次進出成長，要到 `FE-R09`（40 人壓測）或使用者長時間遊玩才看得出來，
而那時候已經分不出是哪一個工作項目引入的。

## What Changes

- 一條所有權規則：**元件自己建立的 GPU 資源，由建立它的那一層在卸載時釋放**
- 一個**在真 Chromium 裡跑的洩漏偵測載具**，放在 `tests/`，**產品程式碼零改動**
- 載具必須先證明自己量得到 —— 一個故意洩漏的 fixture 必須讓它變紅
- **涵蓋率**規則：`src/world/` 底下每一個會建立 GPU 資源的模組都要被偵測涵蓋，
  沒登記就紅（兩個方向都擋）

## Non-goals

- **不把 A 的行為寫成需求。** 它是 R3F 保證的，不是我們的程式碼保證的 ——
  寫成 Scenario 的話沒有任何防禦可以拿掉。它只作為載具的基線資料記在 design 裡
- **不禁止「釋放不是自己建的資源」。** 量過，代價是一次重新上傳，不是壞掉。
  在沒有量到傷害之前立一條 MUST NOT，那條規則沒有負向驗證，會是假防禦
- **不定義 loader／快取產物的所有權。** 這個 repo 今天沒有 `useLoader`，
  也沒有任何外部資產。那屬於 `FE-W15` 資產管線（W5），要連同快取層一起定義
- **不做 Rapier world 與 R3F tree 的拆除順序** —— 那是 `FE-W07` 的第二列（W4）
- **不做 instancing／共用 material。** `ChibiPlayer` 每個實例 9 份 geometry ＋ 9 份 material，
  40 人 360 對 —— **那是效能問題不是洩漏問題**，量測顯示每輪都被完整釋放。
  屬於 `FE-W13` 渲染預算（W5）
- **不加 `WEBGL_lose_context` 之類的確定性 context 釋放**（見 `chore/` #132 的量測）
- **不在 `@react-three/test-renderer` 裡驗這件事**（見 design 的 D1）

## Capabilities

### New Capabilities

- `world-resources`: 3D 場景裡 GPU 資源的所有權與釋放

### Modified Capabilities

（無）

## Impact

- 產品程式碼：**沒有變更**
- 測試基礎建設：`tests/e2e/` 多一個量測台；`vite` 從 vitest 的傳遞相依升成直接 `devDependency`
- `FE-W08`／`FE-W09`／`FE-W10`／`FE-W15` 新增場景元件時要登記進受測清單
