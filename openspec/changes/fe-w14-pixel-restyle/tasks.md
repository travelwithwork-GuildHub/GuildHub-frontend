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
- [x] 4.1 `WorldCanvas.tsx`：`<Canvas dpr={0.25} gl={{antialias:false}}>` ＋ `onCreated` 設 `gl.domElement.style.imageRendering='pixelated'`；背景色與燈光配暖色（`FE-W14-S05`）—— 暖背景與暖陽光都取 `worldColor('wall')` token（不硬寫 hex，過 `dom-token-scan`）；`onCreated` 的 DOM 副作用對沒有 renderer 元素的環境（jsdom 殼／SSR，`state` 為 undefined）防禦跳過、不炸（真值由 slice 6 真瀏覽器 e2e 驗）
- [x] 4.2 對齊 MODIFIED 的 `world-canvas`（DPR 下限放寬）—— 上限 `2` 由建構保證不破：有效 DPR 現在是固定 `0.25`（`0.25 ≤ 2`），沒有任何路徑會超過 `2`；真瀏覽器的 backing store ≈ 1/4 判準在 slice 6（`FE-W01-S02`／`FE-W14-S05`）

## 5. 實作：角色像素外觀與坐姿（feat/fe-w14-pixel-restyle--character）
- [x] 5.1 `ChibiPlayer.tsx`：`OutlineBox`（inverted-hull、`BackSide`、`meshBasicMaterial` 深色）套在頭／軀幹／四肢；框臉髮型（頂＋瀏海＋兩側鬢角＋後腦）；臉部細節（眼／嘴／腮紅）—— 不動 `CHIBI_PARTS` 名字（`FE-W14-S06`；D5）。描邊色＝`worldColor('ink')`、髮＝新 token `hair`、腮紅＝新 token `blush`（world.ts 明訂色票集合可增長、不需改規格）；body／limb 仍由 `avatarLook(av)` 決定
- [x] 5.2 `seated` prop：大腿往前彎（`restX` 負、+Z 方向 ~75°）、手往前擱（~17°）、整體略抬到椅面高（`position.y` +0.05）；非驅動實例（`RemotePlayer`／靜態）直接生效（`FE-W14-S08`；D6）。驅動端的「seated 時跳過每幀擺動」是給 `FE-J13` 接線的契約，本 change 無 caller 設 `seated=true`，不動 `LocalPlayer`
- [x] 5.3 單元測試（`tests/world-character.test.tsx`，`@react-three/test-renderer` 讀真 three 場景圖）：6 個 `BackSide` 深色描邊 mesh＋框臉髮型多部件＋腮紅＋眼嘴（`FE-W14-S06`）；`av` 為 `null`／`9999`／`1.5`／字串照常渲染且 body 是預設款（不取模，`FE-W14-S07`）；`seated` 使大腿 `rotation.x < -0.5`、整體 `y > 0`，站姿回 0（`FE-W14-S08`）
- [x] 5.4 突變確認（已驗）：拿掉一個 `OutlineBox` → `FE-W14-S06`「共 6 個 BackSide mesh」變紅；`seated` 的 `legRest` 改成 0 → `FE-W14-S08`「大腿往前彎」變紅

## 6. 真瀏覽器 e2e 與截圖（feat/fe-w14-pixel-restyle--e2e）
- [x] 6.1 `tests/e2e/pixelation.mjs`（對本機 `next start` 建置產物、`NEXT_PUBLIC_APP_ENV=local`、swiftshader WebGL2、REST／WS 全偽造只打 loopback）：實測 **有效 DPR = 0.250×0.250**（backing 360×206 / CSS 1440×825）、`image-rendering: pixelated`、antialias 關、且未超上限 2（`FE-W14-S05`／`FE-W01-S02`）全綠。草地貼圖存在（`FE-W14-S04`）改由截圖人眼判（避免脆弱的像素探針；截圖裡地面是多階綠點陣草地）
- [x] 6.2 「after」截圖存進本機 `img/fe-w14-world-pixel-after.png`（**不進版控**：img/ 無追蹤檔、archive-review 有體積閘；committed 的可重現證據是 `pixelation.mjs`）—— 畫面確認：暖色像素草地、木紋家具、角色深色描邊＋框臉棕髮＋藍身，**角色對地面清楚分得出來**（可讀性 `FE-W14-S01` 人眼判）
- [x] 6.3 效能一句話：有效 DPR 0.25 → backing store 面積約為 1/16，GPU 著色像素負擔同比降低（服務 `FE-X09` 弱裝置）；絕對數字目標歸 `FE-W13`／`FE-O12`

## 7. 收尾
- [ ] 7.1 全套 `pnpm lint`＋`pnpm test`＋型別綠（不跟 e2e 同跑，`pnpm test` 會清 `.next`）
- [ ] 7.2 各 slice PR CI 綠後手動合併
- [ ] 7.3 archive：tasks 全勾 → 使用者手動跑 archive-review.sh → 綠 → `archive/fe-w14-pixel-restyle` 同步進 `openspec/specs/`
