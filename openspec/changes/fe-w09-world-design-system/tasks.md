## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-w09-world-design-system` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-w09-world-design-system --strict` 通過且 PR 已合併

## 2. 實作前要有答案的三個問題（design 的〈待答問題〉）

- [x] 2.1 **Q1**：drei 已經被審查排除在幾何之外（它的 `RoundedBox` 自建
      geometry，跟 cache 衝突）。確認自己寫的 `ExtrudeGeometry` ＋ bevel
      在 three 0.185.1 上可行，量一下頂點數
- [x] 2.2 **Q2**：現有的 6 處硬寫顏色**各自該叫什麼名字**
      （⚠️ 不是「收斂成幾個」—— 見 design 的待答問題）
- [x] 2.3 **Q3**：3D 色票要不要跟 DOM 的 `@theme` 共用？
      不共用的話，把理由寫進 token 檔的檔頭（否則之後一定有人問）
- [x] 2.4 **Q4**：模組層級 cache 在 HMR／測試隔離下的行為，
      量一次並寫進檔頭。**不寫進 Requirement**（還沒有答案的東西不是需求）

## 3. token 與取用（`FE-W09-S01`）

- [x] 3.1 新增 3D 視覺常數的單一來源。取用函式**對未知名稱拋錯**
      （型別受限是額外一層，不是驗收）
- [x] 3.2 檔頭寫清楚**為什麼不能回 `undefined`** ——
      `undefined` 傳給 three.js 的 `color` 會靜默變白色；
      並寫清楚**為什麼比 `layers.ts` 嚴一級**（z-index 拿到 undefined 看得到，
      顏色拿到 undefined 看不到）

## 4. 掃描檢查（`FE-W09-S02`／`S03`）

- [x] 4.1 純函式：判定一段原始碼裡有沒有顏色字面值
      —— **含 `0x` 數字形式**（只看 `#` 繞得過）。
      ⚠️ **刻意不掃 CSS 色名** —— 純字串分不出 `const red = 1` 與
      `color="red"`，誤報會讓這個檢查被關掉。這是明知的漏洞
- [x] 4.2 讀檔那一層，正向控制是**掃描集合逐一包含一組具名檔案**
      （⚠️ 不是「至少 N 個」—— 路徑縮成一個檔案時那個斷言仍然綠）
- [x] 4.2b 另外證明**新增與巢狀的檔案會自動納入**（暫存目錄或 fixture）——
      具名檔案只擋得住既有範圍縮水，擋不住「未來新增的檔案沒被掃到」
- [x] 4.3 遷移現有的 6 處（`ChibiPlayer` 5 處、`DebugShadowScene` 2 處）
- [x] 4.4 `ChibiPlayer` **只改顏色**，不動結構、不動 `CHIBI_PARTS` 契約

## 5. 共用實例（`FE-W09-S04`）

- [x] 5.1 幾何依（形狀、尺寸、圓角）快取；材質依
      （**材質類別**、顏色 token、影響行為的參數）快取
      （⚠️ **不是**「每種 primitive 一份再靠縮放共用」——
      那樣圓角會沿軸變形；⚠️ **也不是只用顏色 token 當鍵** ——
      發光體與一般物件同色時會拿到型別錯誤的實例）
- [x] 5.4 不可變：`scene.traverse` 就地改寫共用實例的路徑要被擋住
      （`FE-W09-S06`）
- [x] 5.2 在**那個檔案的檔頭**寫明它跟 `world-resources` 的關係 ——
      不是在規格裡寫完就算了，出事的人是在讀那個檔案
- [x] 5.3 檔頭寫明**誤釋放的症狀是「看不出來」**，不是畫面壞掉

## 6. primitive（`FE-W09-S05`）

- [x] 6.1 封閉列舉：`RoundedBox`／`Capsule`／`Sphere`／`Cylinder`
- [x] 6.2 四個**都要真的實作**，各自產生得出有頂點的幾何
      （只宣告型別的空殼會讓所有名稱檢查通過）

## 7. 負向驗證

**驗收條件不是「測試全綠」，是「把防禦拿掉，測試要變紅」。**

- [x] 7.1 在 `src/world/` 任一檔案塞回 `color="#ff0000"` → 掃描測試要紅
- [x] 7.2 再塞一次 `color={0xff0000}` → **也**要紅（只看 `#` 的判定會綠）
- [x] 7.3 把掃描路徑改成**只匹配一個檔案** → `S03` 要紅。
      **這是 7.1 的正向控制** —— 沒有它，7.1 可能是靠一個只掃到
      一個檔案的路徑在假綠
- [x] 7.4 把「逐一包含具名檔案」換回「至少掃到一個檔案」，
      路徑仍然只匹配一個檔案 → 測試變綠（**證明那個換法是退步**）
- [x] 7.5 把 cache 拿掉（每次 `new`）→ `S04` 的 `toBe` 要紅
- [x] 7.6 在元件卸載加一行 `dispose()` → `S04` 的事件計數要紅。
      **同時確認畫面判準是無效的**：那個突變之下「元件還在畫面上」仍然綠
- [x] 7.7 把取用函式的 `throw` 換成回傳 `undefined` → `S01` 要紅
- [x] 7.8 把任一個 primitive 換成只有型別的空殼 → `S05` 的頂點數斷言要紅
- [x] 7.9 寫一段 `scene.traverse` 就地改 `material.color` → `S06` 要紅
- [x] 7.10 把 material 的 cache 鍵改回「只用顏色 token」→
      用同色不同材質類別取兩次，要拿到錯的實例 → 相關斷言要紅
- [x] 7.11 把掃描路徑改成不遞迴（只掃第一層）→ `S03` 的巢狀那半要紅

## 7b. 實作時撞到的既有防禦（`FE-W07-S06`）

實作完跑全套測試時，`tests/leak-coverage.test.ts` 擋住了新的兩個檔案 ——
它們用 `new` 建 GPU 資源，按 `FE-W07-S06` 必須登記進洩漏偵測的受測清單。

跟 gpt-5.6-sol 與 Gemini 3.1 Pro 討論，**兩邊都選「登記進去」**，
並一致否決了「開規格更正排除共用快取」與「把 cache 移出 `src/world/`」。

- [x] 7b.1 `geometry.ts`／`material.ts` 登記進 `SUBJECTS`，`expect: 'clean'`
- [x] 7b.2 wrapper 明確設 `dispose={null}`（codex 指出：不能依賴
      「prop 傳進去的資源目前碰巧不會被 R3F 釋放」這個實作細節）
- [x] 7b.3 負向驗證：拿掉 `geometryFor` 的 cache → 真瀏覽器量到每輪 +1 個
      geometry，兩個 subject 都變 `leaks`
- [x] 7b.4 在量測台檔頭寫明**這個 subject 只證明得了 geometry 那一半** ——
      `info.memory` 沒有 material 欄位，拿掉 material cache 這裡仍然是 clean

## 8. 不做的事（對照 proposal 的 Non-goals）

- [x] 8.1 `grep -rn "Floor\|Wall\|Desk\|ProjectBoard" src/world/` 回空 ——
      場景元件是 `FE-W10`，這個 change 一個都不做
- [x] 8.2 `DebugShadowScene` 仍然存在（由 `FE-W10` 移除，不是這裡）
