# FE-W07 資源生命週期（W1）—— 設計

## D1. 這件事不在 `@react-three/test-renderer` 裡驗

**選了：真 Chromium。`@react-three/test-renderer` MUST NOT 當判準來源。**

不是「瀏覽器比較真實」這種一般性理由，是因為**在那裡量會得到相反的答案**。

R3F 的釋放路徑：

```js
function disposeOnIdle(object) {
  if (typeof object.dispose === 'function') {
    const handleDispose = () => { try { object.dispose() } catch {} }
    if (typeof IS_REACT_ACT_ENVIRONMENT !== 'undefined') handleDispose()
    else unstable_scheduleCallback(unstable_IdlePriority, handleDispose)
  }
}
```

實測（patch `BufferGeometry.prototype.dispose` 計數，先用
`new BoxGeometry().dispose()` 做正向對照確認計數器會動）：

| 環境 | 卸載後 dispose 次數 | 等 200 毫秒後 |
|---|---|---|
| `@react-three/test-renderer`（vitest 的 jsdom 環境） | 0 | **0** |
| 真 Chromium ＋ 真 `WebGLRenderer` | 每輪 10 | 每輪 10 |

`IS_REACT_ACT_ENVIRONMENT` 在這個 repo 的 vitest 環境裡是 `undefined`，
所以走 idle 排程那一支，而那個排程在測試裡沒有被沖出來。

**三件事要分清楚**：`@react-three/test-renderer` 是 R3F 的測試 renderer；
jsdom 是 DOM 的實作；真 `WebGLRenderer` 才有 `info.memory`。
上面量到的差異來自第一個 —— 它根本沒有 `info.memory` 可以讀，
而它的 dispose 時機也跟真 renderer 不同。

**代價**：這條驗收要起瀏覽器，比一般測試慢，不能放進預設的 `vitest run`。
它跟 `tests/e2e/interpolation-smoothness.mjs` 同一類。

**照 jsdom 的結果寫規格會怎樣**：會得到「R3F 從來不釋放」的結論，
於是寫出一堆手動 `dispose()` 的正式碼 —— 那是往錯的方向走。

## D2. 載具是 `tests/` 底下的 vite 量測台，不是產品路由

| | 好 | 壞 |
|---|---|---|
| A. app 裡加 dev-only harness 路由 | 用既有的 Next dev server 與 E2E 寫法 | **為了測試在產品裡加路由**；會被 build 進去或需要排除機制 |
| **B. `tests/` 底下的 vite 量測台（選這個）** | 產品零改動；import **真正的**場景元件；真 Chromium；起停在測試手上 | `vite` 要升成直接 `devDependency`；多一份 config |
| C. `@react-three/test-renderer` | — | 依 D1，量出來是相反的答案 |
| D. Playwright Component Testing | 底層就是 B，官方封裝好 | 只有 `playwright-core`，沒有 `@playwright/test`。導入 CT 要多一整套 config 與 runner，**用 400 行的額度換一個封裝不划算** |

**代價**：量測台自己要維護，vite 或 R3F 改版時可能要修。
但它的失敗是**明顯的**（`FE-W07-S04`），不是無聲的。

## D3. 判準是「兩兩完全相等」，不是「成長小於某個百分比」

實測十輪的 `info.memory` 是 `{geometries:10, textures:3}` **一模一樣**，沒有抖動。
所以不需要容差，也**不應該**給容差：

- 給 15% 容差之後，一個每輪洩漏 1 份 geometry 的元件要跑到第七輪才超標，
  而失敗訊息會說「成長 16%」而不是「每輪多 1 份」
- 更糟的是，容差會讓「載具其實沒在量」看起來像通過

第一輪不算（暖機：shader program 編譯、shadow map render target 建立）。

**`info.memory` 只有 `geometries` 與 `textures`，沒有 `materials`。**
material 的釋放只能靠 `dispose` 事件計數，不能從 `info.memory` 推 ——
規格裡那句話是刻意寫的，不寫的話實作會去找一個不存在的欄位。

**什麼情況要回來改**：如果之後有元件的資源數量本來就會隨輪次變（例如快取預熱），
要在規格上為它單獨開一條，不是把全域判準放寬。

## D4. 受測清單用機械檢查，而且它才是這個 change 可否證的那一半

這個 change **沒有產品程式碼**，所以「把防禦拿掉測試要變紅」不能靠現有元件 ——
它們今天全部乾淨（量過），對它們的斷言今天是恆綠的。

可否證的是這兩件事，而且兩件都是我們自己寫的東西：

1. **尺**（`FE-W07-S03`）：故意洩漏的 fixture 沒被抓到 → 以「量不到」失敗
2. **涵蓋率**（`FE-W07-S06`／`S07`）：新元件沒登記 → 紅；清單有幽靈項目 → 紅

這個 repo 已經有兩個同形狀的規則（`tests/no-fetch-rule.test.ts`、
`tests/env-lint-rule.test.ts`）。沒有第 2 項的話，`FE-W08`～`FE-W15` 新增的
十幾個場景元件會全部落在偵測看不到的地方，而測試照樣全綠。

**代價**：`src/world/` 底下加檔案時要多改一行清單。這個摩擦是刻意的。

## D5. 兩條「聽起來該有」的禁令，量過之後不寫

草稿原本有「正式碼 MUST NOT 自己釋放 R3F 建的資源（會 double dispose）」，
審查時另外被建議加「loader 的產物是共用快取，MUST NOT 釋放（會快取中毒）」。

量了：

| 做的事 | 結果 |
|---|---|
| 掛載中手動 `geo.dispose()`，卸載時 R3F 再 dispose 一次 | 零錯誤，畫面照樣 12 triangles |
| 同一個 renderer 裡 A 與 B 共用一份資源，A 卸載後把它 dispose | **B 照樣畫得出來**，`geometries` 仍是 1（重新上傳），零錯誤 |

`dispose()` 只丟掉 GPU 端那一份，JS 端資料還在，下一次 render 會重新上傳。
代價是一次重新上傳，不是壞掉。

**沒有量到傷害的禁令不寫進 Requirement** —— 它沒有負向驗證，
而這個 repo 已經有過一次同樣的錯（`src/world/webgl.ts` 那句「釋放 context」，
見 `chore/` #132）。這兩條改記在這裡與 ADR，讓之後的人不用再量一次。

loader／快取的所有權是真的還沒定義，但這個 repo 今天沒有 `useLoader`
也沒有外部資產 —— 它屬於 `FE-W15`，要連同快取層一起定義。

## D6. 不順手做共用 material

`ChibiPlayer` 每個實例宣告自己的 9 份 geometry ＋ 9 份 material，40 人 360 對。

**那是效能問題，不是洩漏問題** —— 量測顯示每一輪都被完整釋放。
共用化屬於 `FE-W13` 渲染預算（W5）。現在做等於在沒有 `FE-R09` 的數字之前先改架構。

## 待答問題（實作時量；量完如果動到 Requirement，回來重開 spec PR）

- **Q1：每輪之間要等多久？** 規格刻意**沒有**寫死數字。
  原型用 250 毫秒且十輪穩定。實作時要往下找到**開始不穩的那個值**，
  取它的兩倍寫成具名常數，並把量到的數字寫進註解
- **Q2：vite server 的就緒逾時？** 同樣沒有寫死。要量本機起一次要多久再訂
- **Q3：十輪跑多久？** 原型每輪約 450 毫秒 ＋ 瀏覽器啟動。
  工作分解表寫的「十次」是驗收值，**不減輪數**；
  如果總時間讓 CI 不能接受，要處理的是「排除在預設 `npm test` 之外」，不是減輪數
