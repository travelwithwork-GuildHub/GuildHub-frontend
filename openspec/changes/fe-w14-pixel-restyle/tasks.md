# Tasks —— fe-w14-pixel-restyle

## 1. 規格（本 PR）
- [ ] 1.1 `spec/fe-w14-pixel-restyle` 分支，只動 `openspec/changes/fe-w14-pixel-restyle/`
- [ ] 1.2 `pnpm exec openspec validate fe-w14-pixel-restyle --strict` 綠
- [ ] 1.3 規格 PR 合併到 main（governance 改 charter 的 #625 已先合併）

## 2. 實作：色票與材質貼圖（feat/fe-w14-pixel-restyle--materials）
- [x] 2.1 `src/design/world.ts`：暖色像素調色盤定案（ground 草綠、wall／carpet 暖奶油、accent 暖金、leaf／outside 深草綠）—— 單一色票來源不變（`FE-W14-S01`）
- [x] 2.2 `material.ts`：`noiseTexture(hex)`（同色系決定性值噪、`NearestFilter`、`RepeatWrapping`、依 hex 快取）＋ `woodTexture(hex)`（橫向順紋＋深紋路＋板縫）；`build()` 對 `wood`／`woodDark` 用木紋、其餘用雜訊；`basic` 不加貼圖（`FE-W14-S02`）
- [x] 2.3 沒有 canvas 2D context（SSR／jsdom）時 `map` 退化為 `null`（純色）、不拋錯（`FE-W14-S03`）
- [x] 2.4 單元測試：wood token 材質有 `NearestFilter`／`RepeatWrapping` 的 `map`、同 token 同實例、異 token 異實例、同 hex 共用同一張貼圖、`basic` 無貼圖（`FE-W14-S02`）；無 context 回純色不拋（`FE-W14-S03`）
- [x] 2.5 突變確認：拿掉 `noiseTexture` 的「依 hex 快取」讓每次 new 一張 → `FE-W14-S02`「同 hex 共用同一張貼圖」測試變紅（已驗）

## 3. 實作：像素草地經共用 factory（feat/fe-w14-pixel-restyle--grass）
- [x] 3.1 像素草地貼圖（16×16 多階綠＋草葉痕、`NearestFilter`／`RepeatWrapping`）進 `primitives/grass.ts` 共用 factory（多階綠由 `ground`／`leaf` token 衍生、決定性值噪）；共用底層 `offscreen2d`／`pixelate`／`shadeOf`／`seedOf`／`valueNoise` 抽到 `primitives/pixelTexture.ts`；`WorldShell` 改用 `<mesh geometry={grassGeometry} material={grassMaterial} dispose={null}/>`，不再 `new CanvasTexture`（`FE-W14-S04`；D4）
- [x] 3.2 草地 plane 的 geometry（`grassGeometry`）與材質（`grassMaterial`）都走 factory 的不可變快取；`WorldShell` 用 `dispose={null}` 不釋放
- [x] 3.3 單元測試（`tests/world-grass.test.ts`）：貼圖由 factory 產出且最近鄰／可重複／依 repeat 快取、geometry／material 快取不可變、`createsGpuResources(WorldShell)===false`（不含 `new CanvasTexture`）、factory 實例零 `dispose`（沿用 dispose 事件計數）、無 context 退化純色；`grass.ts` 登記進 leak-harness（`leak-coverage.test.ts` 機械把關 `FE-W07-S06`）

## 4. 實作：像素化渲染（feat/fe-w14-pixel-restyle--pixelate）
- [ ] 4.1 `WorldCanvas.tsx`：`<Canvas dpr={0.25} gl={{antialias:false}}>` ＋ `onCreated` 設 `gl.domElement.style.imageRendering='pixelated'`；背景色與燈光配暖色（`FE-W14-S05`）
- [ ] 4.2 對齊 MODIFIED 的 `world-canvas`（DPR 下限放寬）—— 確認上限 `2` 的既有判準不破（`FE-W01-S02`）

## 5. 實作：角色像素外觀與坐姿（feat/fe-w14-pixel-restyle--character）
- [ ] 5.1 `ChibiPlayer.tsx`：`OutlineBox`（inverted-hull、`BackSide`、深色）套在頭／軀幹／四肢；框臉髮型（頂＋瀏海＋兩側＋後腦）；臉部細節（眼／嘴／腮紅）—— 不動 `CHIBI_PARTS` 名字（`FE-W14-S06`；D5）
- [ ] 5.2 `seated` prop：大腿往前彎（restX 負、+Z 方向）、手往前擱、整體略抬到椅面高；非驅動實例直接生效（`FE-W14-S08`；D6）
- [ ] 5.3 單元測試：頭／軀幹／四肢各有 `BackSide` 深色描邊 mesh ＋髮型部件（`FE-W14-S06`）；`av` 為 `null`／越界照常渲染（`FE-W14-S07`）；`seated` 改變四肢關節角度與整體高度（`FE-W14-S08`）
- [ ] 5.4 突變確認：拿掉描邊 mesh → `FE-W14-S06` 要紅；`seated` 不改角度 → `FE-W14-S08` 要紅

## 6. 真瀏覽器 e2e 與截圖（feat/fe-w14-pixel-restyle--e2e）
- [ ] 6.1 `tests/e2e/*.mjs`（本機自起 `next start`、`NEXT_PUBLIC_APP_ENV=local`）：canvas backing store 每軸 ≈ CSS 尺寸 1/4、`image-rendering: pixelated`、antialias 關（`FE-W14-S05`）；草地貼圖存在（`FE-W14-S04`）
- [ ] 6.2 前後截圖存進 `img/`（色票、木紋家具、草地、角色描邊／髮型／臉、坐姿），PR 附上；可讀性（角色對地面，`FE-W14-S01`）人眼判
- [ ] 6.3 效能一句話：低 DPR 降 GPU 像素負擔約 1/16（弱裝置加分）；數字目標歸 `FE-W13`／`FE-O12`

## 7. 收尾
- [ ] 7.1 全套 `pnpm lint`＋`pnpm test`＋型別綠（不跟 e2e 同跑，`pnpm test` 會清 `.next`）
- [ ] 7.2 各 slice PR CI 綠後手動合併
- [ ] 7.3 archive：tasks 全勾 → 使用者手動跑 archive-review.sh → 綠 → `archive/fe-w14-pixel-restyle` 同步進 `openspec/specs/`
