# 0003. 3D 場景裡 GPU 資源的所有權

- **Status**: Accepted
- **Date**: 2026-09-09
- **Deciders**: FE-W07（規格 `openspec/specs/world-resources/`）

## 背景

three.js 的 `BufferGeometry`／`Material`／`Texture` 在 GPU 端各有一份配置，
需要有人釋放。React Three Fiber 幫忙釋放一部分，但**不是全部** ——
界線不在文件的顯眼處，在 `removeChild` 的實作裡。

`FE-W08` ProceduralAvatar、`FE-W09` WorldDesignSystem、`FE-W10` EnvironmentComponents、
`FE-W15` 資產管線都會產生「元件自己建資源」的形狀。規則不先訂下來的話，
四個工作項目會各自猜一種，而猜錯的症狀是**無聲的**。

量測（真 Chromium ＋ SwiftShader，反覆掛載卸載，讀 `renderer.info.memory`
與 patch 過的 `dispose` 計數，有正向對照）：

| 形狀 | R3F 會不會釋放 | 結果 |
|---|---|---|
| JSX 子元素 `<mesh><boxGeometry/></mesh>` | 會 | 十輪 `{geometries:10, textures:3}` 完全不變 |
| 模組層級共用、prop 傳入 | 不會 | dispose 事件 0 次（**也沒有**被過度釋放） |
| 元件自己 `new`、prop 傳入 | **不會** | `geometries` = 1,2,3,4,5,6 線性成長 |

R3F 的 `removeChild` 只對 **reconciler 自己建的 instance** 呼叫 `disposeOnIdle`。
**用 prop 傳進去的物件不是 instance** —— 那就是第二、三列的分野。

## 選項

### A. 一律由元件自己管，不依賴 R3F
- 好：只有一條規則
- 壞：要為每一個 `<boxGeometry>` 額外寫 ref ＋ cleanup，場景元件膨脹好幾倍，
  換到的東西是零（R3F 本來就會釋放它們）

### B. 一律依賴 R3F
- 好：什麼都不用寫
- 壞：第三列直接洩漏，而且**無聲**

### C. 按建立者分（**選這個**）
- 好：跟 R3F 實際的行為一致，不需要對抗 library
- 壞：有一條違反直覺的界線（「用 prop 傳進去的不算 R3F 建的」），
  所以需要機械檢查兜底

## 決定

選 C。**一條規則**：

> 正式碼自己 `new` 出來的 `BufferGeometry`／`Material`／`Texture`
> （含子類與 render target），**建立它的那一層在卸載時 `dispose()`**。
> R3F 用 JSX 子元素建的，交給 R3F。

配套：一個在真 Chromium 裡跑的洩漏偵測載具，加上一條機械檢查 ——
`src/world/` 底下會建立 GPU 資源的模組沒有登記進受測清單就紅。
**沒有那條檢查，新元件會落在偵測看不到的地方，而測試照樣全綠。**

### 量過之後決定**不寫**的兩條禁令

寫草稿時想寫「MUST NOT 自己釋放 R3F 建的資源（會 double dispose）」，
審查時另外被建議寫「loader 的產物是共用快取，MUST NOT 釋放（會快取中毒）」。
兩條都量了：

| 做的事 | 結果 |
|---|---|
| 掛載中手動 `geo.dispose()`，卸載時 R3F 再 dispose 一次 | 零錯誤，畫面照樣 12 triangles |
| 同一個 renderer 裡 A 與 B 共用一份資源，A 卸載後把它 dispose | **B 照樣畫得出來**，`geometries` 仍是 1（重新上傳），零錯誤 |

`dispose()` 只丟掉 GPU 端那一份，JS 端的資料還在，下一次 render 會重新上傳。
代價是一次重新上傳，不是壞掉。

**所以這兩條不進規格。** 沒有量到傷害的禁令沒有負向驗證，會變成假防禦 ——
這個 repo 剛因為同一個毛病修掉 `src/world/webgl.ts` 一句錯註解。
記在這裡是為了讓之後的人不用再量一次。

## 代價

- 加一個會建立 GPU 資源的場景元件時，要多改一行受測清單。這個摩擦是刻意的
- 洩漏偵測要起真瀏覽器，比一般測試慢，不能放進預設的 `vitest run`
- 界線本身違反直覺（`<mesh geometry={x}/>` 的 `x` 不歸 R3F 管），
  所以規則不能只寫在會被 archive 的 change 裡

## 什麼情況下要重新考慮

- **R3F 改變 `removeChild` 的行為**（例如開始釋放 prop 傳入的物件）——
  那時「共用資源被過度釋放」會第一次變成真的問題
- **引入 `useLoader` 或任何資產快取**（`FE-W15`）—— 產物的建立者是快取層
  而不是使用它的元件，所有權要另外定義。**今天這個 repo 沒有這兩樣東西**
- **開始做 instancing／共用 material**（`FE-W13`）—— 大量資源會從「R3F 建的」
  移到「模組層級共用」，那時要回頭量一次過度釋放的代價還是不是「一次重新上傳」
