# 工作項目

**分刀**：`spec/`（可能兩刀，看行數）→ `feat/` × 3 → `archive/`。
每一刀都要有自己的突變證據 —— **驗收條件不是「測試全綠」，是「把防禦拿掉，測試要變紅」**。

## 1. 共用的骨架與 World Shell（`feat/…--shell`）

- [x] 1.1 `PartDefinition`／`PropDefinition`／`BoxFootprint` 型別與局部包圍盒的計算
- [x] 1.2 泛用 renderer：吃一份 definition，把每個部件渲染成 `<mesh>`，
      幾何與材質**一律**來自 `geometryFor`／`materialFor`，`dispose={null}`
- [x] 1.3 `Floor`／`Wall`／`Carpet`／`Platform`：typed props → definition → renderer
- [x] 1.4 `WorldShell`：地面 ＋ 由 `PHYSICS.halfExtent`／`wallHeight` 推導的可見牆
- [x] 1.5 `WorldCanvas` 換成 `<WorldShell />`，**刪掉 `src/world/DebugShadowScene.tsx`**
- [x] 1.6 測試 `FE-W10-S01`／`S10`／`S11`／`S12`
- [x] 1.7 測試 `FE-W10-S08`／`S09`（資源限制的兩個方向）
- [x] 1.8 **突變**：把 `Wall` 的尺寸改成寫死的 `20` → `S11` 要紅
- [x] 1.9 **突變**：在 `Floor` 裡塞一個 `<boxGeometry>` → `S08` 要紅
- [x] 1.10 **突變**：在 `WorldShell` 裡呼叫一次 `createCollider` → `S12` 要紅

## 2. 家具與碰撞判準（`feat/…--furniture`）

- [x] 2.1 `Desk`／`Chair`／`Shelf`／`Plant`／`Lamp` 的 definition，
      逐一標記哪些部件擋路（盆栽只有花盆、燈只有底座）
- [x] 2.2 從 definition 算局部碰撞盒（擋路部件的聯集 AABB）
- [x] 2.3 90° 倍數旋轉的轉換（90°／270° 交換半寬與半深）
- [x] 2.4 測試 `FE-W10-S02`／`S04`／`S05`／`S06`／`S07`
- [x] 2.5 ⚠️ `S05` 的期望值**要獨立量**（`Box3.setFromObject` 走渲染出來的場景），
      **MUST NOT** 呼叫 2.2 那個函式 —— 那是同源的恆真測試
- [x] 2.6 **突變**：把 `Desk` 的桌面加寬但不動碰撞盒 → `S05` 要紅
- [x] 2.7 **突變**：把碰撞盒改小（模擬「誤寫成 0.2」）→ `S05` 要紅
      （這一條是單向包含判準抓不到的那個 case）
- [x] 2.8 **突變**：把 `Carpet` 的部件標成擋路 → `S06` 要紅
- [x] 2.9 **突變**：旋轉轉換改成不交換 → `S07` 要紅
- [x] 2.10 測試 `FE-W10-S13`（每一個阻擋物都落地）——
      **走所有 definition，不是只走目前這幾種家具**；判準下在**整組**擋路部件上
      （桌面是擋路的部件，而它站在桌腳上 —— 逐一部件的話桌子永遠不合格）
- [x] 2.11 **突變**：把某個元件的**整組**擋路部件抬離地面 → `S13` 要紅
- [x] 2.12 ⚠️ `S05` 的受測對象要涵蓋**四種 primitive**。實測：只有方塊的話，
      把圓柱的半高寫成全高是**綠的**

## 3. 語意元件（`feat/…--semantic`）

- [x] 3.1 `Sign`（立柱＋小板）、`GuildBanner`（縱向布旗＋頂桿）、
      `ProjectBoard`（框架＋卡片造型）、`TalentBoard`（不同輪廓）、
      `Door`（門框＋門板＋把手）
- [x] 3.2 **只宣告今天就有作用的 props。** `title`／`onlineCount` 這類今天沒有輸出的
      欄位不寫進來 —— 型別上存在但被忽略的 props 是「有 API 的外觀」（`FE-W12` 再加）
- [x] 3.3 需要的新顏色 token 加進 `src/design/world.ts`（那個集合是可增長的）
- [x] 3.4 測試 `FE-W10-S03`、`FE-W10-S14`（門沒有碰撞盒）
- [x] 3.4b **突變**：把門柱標成擋路 → `S14` 要紅
- [x] 3.5 **突變**：把 `TalentBoard` 的部件組成改成跟 `ProjectBoard` 一樣 → `S03` 要紅
- [x] 3.6 **突變**：讓兩個語意元件只差在顏色 → `S03` 要紅（材質欄位是被拿掉才比的）

## 4. 驗證與封存（`archive/…`）

- [x] 4.1 `npm run lint`、`npx tsc --noEmit`、`npx vitest run`
- [x] 4.2 `node tests/e2e/leak-detection.mjs` —— 新元件是否需要登記進受測清單
      （**預期不需要**：它們不建立 GPU 資源。要確認 `leak-coverage` 沒有變紅）
- [x] 4.3 **人工瀏覽器**：`/world` 截圖，確認
      (a) 地面在、(b) 邊界牆看得見且與走不過去的地方一致、
      (c) **角色在地面上有陰影** —— 這是 `FE-W01-S03` 的新證據
- [x] 4.4 把 4.3 的證據寫回 `openspec/specs/world-canvas/spec.md` 的 `VERIFY-BY`
- [x] 4.5 送 codex `gpt-5.6-sol` 與 Gemini 3.1 Pro 驗一次
- [x] 4.6 `openspec archive`、`openspec validate --all --strict`

## 驗證結果（封存前）

- `npm run lint`／`npx tsc --noEmit`／`npx vitest run`（56 檔 359 條）全綠
- `node tests/e2e/leak-detection.mjs`：五個受測對象全部符合預期。
  **新增的 14 個元件都不在受測清單裡，那是對的** —— 它們不建立 GPU 資源
  （資源是 `FE-W09` 的 cache 建的），而 `leak-coverage` 的涵蓋率檢查沒有變紅
- **十八條突變全部跑過**，其中三條是綠的而且刻意保留：
  - 「桌面加寬但碰撞盒不動」—— 推導式設計消除了那種漂移（規格已更正）
  - 「只把一片葉子標成擋路」—— 設計錯誤不是漂移（規格明文不假裝擋得到）
  - 「只改 `PHYSICS.halfExtent`、外殼跟著推導」—— **應該**綠的對照組
- 人工瀏覽器 `/world`（Chromium ＋ SwiftShader、1400×900）：
  永久地面存在、玩家站在地面上沒有縫、**玩家在地面上留下清楚可見的陰影**、
  四面牆在世界邊緣。console 只有一則預期中的 `ws://localhost:8000` 連線被拒
- 人工目視 14 個元件（一次性量測台，**不進版控**）：抓到兩個測試驗不到的造型錯誤
  （平躺的徽章、穿過旗面的旗桿），已修

## 封存前由外部審查抓到、已修的

- **門洞被實心堵死**（`FE-W10-S14`）：碰撞盒是擋路部件的 AABB 聯集，
  兩根分開的門柱會把中間填滿 —— 門寬 1.4、碰撞盒寬 1.58，那扇門走不過去
- **`Carpet` 從來沒有真的 render 過**（只被 `footprintOf` 讀過）
- **props 的邊界值沒驗**（`items = 0/1/12`、極小的尺寸）
