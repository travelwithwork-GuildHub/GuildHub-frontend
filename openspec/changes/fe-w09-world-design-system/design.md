## Context

`src/design/layers.ts` 已經是這個 repo 的先例：z-index 的單一來源，
型別受限的存取（`layer('hud')`），層名打錯在 typecheck 就紅。
它的檔頭寫著為什麼不放進 Tailwind 的 `@theme` ——
CSS 自訂屬性取不到時是空字串，會**靜默**退化。

3D 這一半要解同一個問題，但材料不同：three.js 的 `color` prop 吃字串或
`THREE.Color`，沒有「取不到就靜默」的問題，卻有另外兩個：
**共用實例的釋放**，以及**沒有視覺回歸時怎麼驗收**。

## D1：要不要加 `@react-three/drei`

`docs/WBS.md` 的 `FE-W09` 逐字列了 `RoundedBox / Capsule / Sphere / Cylinder`
與 `StylizedMaterial / Outline / Shadow conventions`。
drei 有 `<RoundedBox>`、`<Outlines>`、`<ContactShadows>`，全部現成。

**現況**：`package.json` 沒有 drei。three 0.185.1、R3F 9.7.0。
使用者給的參考專案（`course/threejs/66-create-a-game-with-r3f-final`）用了
drei 的 `Float`／`Text`／`useGLTF`。

**待答（要在 spec PR 上決定，不是實作時決定）**：

| | 加 drei | 自己寫 |
|---|---|---|
| RoundedBox | 現成 | `ExtrudeGeometry` ＋ bevel，約 30 行 |
| Outline | `<Outlines>`（背面外擴法） | 同樣是背面外擴，約 20 行 |
| bundle | +約 200KB（tree-shake 後未量） | 0 |
| 風險 | 多一個要跟著 three 升級的相依 | 自己維護 |

**傾向已經被審查推翻。** 初稿寫「加 drei」，Gemini 3.1 Pro 指出一個
技術衝突：drei 的 `<RoundedBox>` 內部用 `useMemo` 依 props 建**自己的**
`ExtrudeGeometry` 並自行管理生命週期，**不支援外部傳入共用實例** ——
而共用實例正是 D3 的核心。兩者不能同時成立。

**所以：自己寫幾何，drei（如果之後要用）只用在非幾何的 API。**
`RoundedBox` 的 `ExtrudeGeometry` ＋ bevel 約 30 行，
Outline 的背面外擴約 20 行，都是可以自己養的量。

**spec 仍然不寫「用什麼實作」** —— 只寫「primitive 的清單是封閉的」，
換掉實作不該需要改規格。

## D2：「所有場景元件只能用統一 tokens」怎麼變成可執行的

WBS 那句話如果只是文件，它就是口號。三種做法：

**選項 A：只提供 token 常數，靠 review。** 最省事，但 `FE-W10`
有十幾種元件，review 會漏。

**選項 B（採用）：token ＋ 一條掃描檢查。**
`src/world/**` 底下不得出現顏色字面值（十六進位、CSS 色名、
`new THREE.Color('...')` 的字面引數）。

**選項 C：把 `meshStandardMaterial` 也包起來，只暴露 `<StylizedMaterial token="...">`。**
更嚴，但它會擋掉合法的一次性用途（例如 `FE-W12` 的 Seat 要用
occupied／available 兩個狀態色，那本來就該是 token，但也可能有真的需要
動態計算顏色的場合）。**先不做**，等真的有人繞過去再說
（`AGENTS.md`〈新增流程閘門的門檻〉：答不出「哪一個 PR 因為缺少它而出事」就先記著）。

### 掃描檢查的形狀

**純函式 ＋ 讀檔分離**，沿用 `src/api/scope.ts` 的先例：

```
src/design/worldTokens.ts     colorLiterals(source: string): string[]   ← 純函式
tests/world-color-scan.test.ts  讀檔 + 斷言                              ← 碰檔案系統
```

分開的理由跟 `scope.ts` 一模一樣：**負向驗證需要餵它假的輸入**
（一段含色碼的原始碼、一段不含的），而碰檔案系統的函式做不到 ——
只能真的去改檔案，那種測試失敗時會留下垃圾。

**正向控制**：初稿寫「至少掃到 N 個檔案」。**gpt-5.6-sol 指出那太弱** ——
把路徑誤改成只匹配 `ChibiPlayer.tsx`，檔案數仍然大於零，
而其他 `src/world/**` 全部可以寫死顏色。

改成：斷言掃描集合**逐一包含幾個具名的檔案**
（`ChibiPlayer.tsx`、`DebugShadowScene.tsx`、`WorldCanvas.tsx`⋯⋯）。
名單縮水或路徑打錯都會紅。

**判定要含數字形式。** 兩邊都指出 `color={0xff0000}` 繞得過只看 `#` 的判定。
漏報與誤報的代價不對稱：**漏報製造「有人在管」的假象**，
誤報只是叫人多寫一行豁免 —— 所以判定寧可寬。

## D3：共用實例是一個 **keyed cache**，不是「每種 primitive 一份」

初稿寫「同一種 primitive 的 geometry／material 是模組層級的單一實例」，
參考的是使用者給的那個 R3F 專案：

```js
const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
const floor1Material = new THREE.MeshStandardMaterial({ color: 'limegreen' })
```

**兩個模型各自獨立指出那是錯的**，而且理由是實體的：

| 問題 | 反例 |
|---|---|
| 一份 material 撐不起語意色差 | 紅色招牌與棕色桌子不能同時存在 |
| 一份 geometry 撐不起尺寸差 | 兩個不同尺寸的 `RoundedBox` 共用 geometry 再非等比縮放，**圓角半徑會沿軸變形** |

那個參考專案能這樣寫，是因為它只有四種顏色、而且方塊全部是同一個
`BoxGeometry` 再縮放（`boxGeometry` 沒有圓角，所以非等比縮放看不出來）。
**這裡有圓角，所以那個做法直接失效。**

採用的形狀：

```
geometryFor(shape, size, radius)   → 依 (形狀, 尺寸, 圓角) 快取
materialFor(colorToken)            → 依 token 快取
```

同一組參數回同一個實例（可測：`toBe`），不同參數回不同實例。
draw call 的收斂由「參數的種類有限」達成 —— 而 token 是封閉列舉，
所以 material 的種類**本來就有上界**。

## D3b：它跟 `FE-W07` 的交界（**初稿在這裡寫了一件我沒有量過的事**）

初稿寫：

> 有人加了 `material.dispose()`，症狀是**其他元件變黑或消失**。

**兩個模型都指出那是錯的**：three.js 對已 dispose 的 material
會在下一次 render 重新上傳，畫面照樣顯示。
**我沒有量過就把一個症狀寫成事實** —— 刪掉。

真正的規則不需要那個症狀就成立：

- `world-resources`（`FE-W07`）明寫「**用 prop 傳進 tree 的物件不是 instance，
  不在它的管轄內**」，而 cache 回傳的實例正是那種
- 誤 dispose 之後**畫面看起來是對的**，所以它不會被人發現 ——
  這比「變黑」更值得防，因為變黑至少會被看到

**驗收因此不能測畫面**，要測 dispose 事件的次數。這不是新技術：
`world-resources` 的規格自己就寫著「material 的釋放要另外靠
**dispose 事件計數**，不能從 `info.memory` 推」。

**仍然沒有答案的**（gpt-5.6-sol 指出，我同意，列為待答）：
模組層級的 cache 在 HMR、測試隔離、renderer 終止時由誰釋放？
今天的答案是「沒有人」，而那在開發期會累積。**這件事寫進待答問題，
不寫進 Requirement** —— 還不知道答案的東西不該假裝是需求。

## D4：`FE-W09` 與 `FE-W14` 的邊界

`docs/WBS.md` 兩列的字面描述幾乎一樣：

```
FE-W09 (W3, 11pt)  3D 色票、材質、比例、圓角、Outline、Shadow 規範
FE-W14 (W5, 10pt)  統一 Chibi / Toy-like 的色彩、圓角、Outline、Shadow
```

**不寫下邊界的話，`FE-W09` 會把 `FE-W14` 吃掉**，而 W5 那 10 點會變成
「已經做完了」——那不是提前完成，是把一件沒做的事標成做完了。

採用的邊界：

| | `FE-W09`（現在） | `FE-W14`（W5） |
|---|---|---|
| 色票 | **有幾個 token、叫什麼名字、怎麼取用** | **每個 token 是什麼顏色** |
| 圓角 | 有一個 `radius` token，`RoundedBox` 吃它 | 那個值是多少才好看 |
| Outline | primitive 支援 outline | 粗細與顏色、哪些物件該有 |
| 驗收 | 機制存在且被強制（可測） | 固定相機下的構圖與可讀性（要人看） |

一句話：**`FE-W09` 交的是「有沒有一個地方可以改」，`FE-W14` 交的是「改成什麼」。**

## D6：`@ts-expect-error` 不是有效的驗收（**兩邊都打回來的一條**）

初稿的 `S01`／`S05` 寫「型別檢查失敗」。gpt-5.6-sol 與 Gemini 3.1 Pro
各自指出同一個洞：

> `@ts-expect-error` 只證明**那一行有某種錯誤**，不證明錯的是非法名稱。
> 反例：`missingFunction(worldColor('typo'))` —— 即使 `worldColor`
> 已經退化成接受任意字串，那行仍然因為 `missingFunction` 而有錯誤，測試維持綠。

兩條可行的修法：

**選項 A**：用 TypeScript API 對獨立 fixture 跑，斷言**確切的診斷碼與位置**。
準，但要引進一套只為這條測試存在的機制。

**選項 B（採用）：把驗收下在執行期。**
取用函式對未知名稱 **SHALL 拋錯**，型別受限是額外的一層。

理由不只是便宜：**型別可以被 `as any` 繞過，執行期不行。**
而且 `layers.ts` 的先例在這件事上其實是弱的 —— `layer()` 對
`Z_INDEX[name]` 取不到會回 `undefined`，只是 z-index 拿到 `undefined`
比顏色拿到 `undefined` 容易被看到。**顏色拿到 `undefined` 時
three.js 靜默用白色**，那是「有一個東西顏色不對」不是「有人打錯字」。

所以這條比 `layers.ts` 嚴一級，而那是有理由的、不是不一致。

## D5：沒有視覺回歸的情況下，這個 change 憑什麼驗收

`FE-O13`（3D 畫面怎麼測 —— 截圖比對還是只測 DOM）排在 W5，**還沒決定**。
所以這個 change **不能**用「畫面長得對」當驗收條件。

可測的東西只有這些，而規格只寫這些：

1. **未知的 token 名 → 執行期拋錯**（見 D6：型別不能當唯一驗收）
2. `src/world/**` 出現顏色字面值（含 `0x` 數字形式）→ 掃描測試紅
3. 同一組參數兩次取用 → **同一個**實例（`toBe`）；不同參數 → 不同實例
4. 元件卸載時，共用實例的 **dispose 事件計數是 0**
5. 四個 primitive **各自真的產生得出一個有頂點的幾何**（防空殼）

**這個判準證明不了什麼**（誠實寫出來）：

- 證明不了世界好看。那是 `FE-W14`，要人看
- 證明不了 token 的值選得對。同上
- 證明不了 `FE-W10` 的作者**會用** token —— 只證明他不能用字面值。
  他仍然可以取一個語意不對的 token（拿 `accent` 當地板色）

## 驗證方式

- **V1**：`worldColor('typo')` 在執行期拋錯，訊息包含那個名稱與合法清單
- **V2**：掃描測試對真的 `src/world/**` 跑，全綠，且掃描集合**逐一包含**
  幾個具名檔案
- **V3（驗收條件）**：在 `src/world/` 任一檔案塞回一個 `color="#ff0000"`
  → 掃描測試要紅。**再塞一次 `color={0xff0000}`** → 也要紅
- **V4（正向控制）**：把掃描路徑改成只匹配一個檔案 → 要紅
  （因為「逐一包含具名檔案」那組斷言）。**沒有這一條，
  V3 可能是靠一個只掃到一個檔案的路徑在假綠**
- **V5**：同一組參數兩次取用 → `toBe`；不同尺寸 → `not.toBe`。
  把 cache 拿掉（每次 `new`）→ 要紅
- **V6**：元件卸載時對共用 geometry／material 監聽 `dispose` 事件，
  斷言計數為 `0`。在卸載加一行 `dispose()` → 要紅。
  **MUST NOT 用「畫面還在」當判準** —— three.js 會在下一幀重新上傳，那條恆真
- **V7**：四個 primitive 各自產生的幾何，頂點數 `> 0`。
  只宣告型別不實作 → 要紅

測試連到什麼：**不適用 —— 測試不連任何外部服務。**

## 待答問題（實作前要有答案，不寫進 Requirement）

- **Q1**：加不加 drei？（D1。判準是量過 bundle size 之後）
- **Q2**：現有的 6 處硬寫顏色**各自該叫什麼名字**？
  ⚠️ **初稿問的是「收斂成幾個 token」，那個問法是錯的** ——
  兩個模型都指出：不知道 `FE-W10` 的十幾種元件要區分哪些語意，
  就決定不了總數，強行抽只會產生 `color-1` 或過度特化的 `chibi-skin`。
  **token 集合是可增長的**：`FE-W10` 新增 token 不需要改這份規格。
  這個 change 只負責「有一個地方可以加」與「不能寫字面值」
- **Q4**（gpt-5.6-sol 提出）：模組層級的 cache 在 HMR、測試隔離、
  renderer 終止時由誰釋放？今天沒有答案，而它在開發期會累積
- **Q3**：3D 的色票要不要跟 DOM 的 `@theme` 共用？
  DOM 用 `oklch`，three 吃 sRGB 十六進位 —— 共用需要一層轉換，
  而轉換會在兩邊產生「看起來一樣但不一樣」的顏色。**傾向不共用**，
  但要寫下理由，否則之後一定有人提「為什麼有兩份色票」
