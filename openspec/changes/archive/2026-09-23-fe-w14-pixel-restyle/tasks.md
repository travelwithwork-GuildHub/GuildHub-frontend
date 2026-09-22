# Tasks —— fe-w14-pixel-restyle

## 1. 規格（本 PR）
- [x] 1.1 `spec/fe-w14-pixel-restyle` 分支，只動 `openspec/changes/fe-w14-pixel-restyle/`（新 capability `world-visual-polish`＋MODIFIED `world-canvas` 的 DPR）
- [x] 1.2 `pnpm exec openspec validate fe-w14-pixel-restyle --strict` 綠
- [x] 1.3 規格 PR 合併到 main（#626；governance 改 charter 的 #625 已先合併）

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
- [x] 5.2 `seated` prop：大腿往前彎（`restX` 負、+Z 方向 ~75°）、手往前擱（~17°）、整體略抬到椅面高（`position.y` +0.05）；非驅動實例（`RemotePlayer`／靜態）直接生效（`FE-W14-S08`；D6）。**驅動端 `LocalPlayer` 也接 `seated`**：為真時跳過每幀對四肢 `rotation.x` 與身體 `position.y`（bounce）的寫入（否則靜態坐姿被覆蓋），並把 `seated` 傳給它的 `ChibiPlayer`；何時 `seated=true`（真的入座、面向、起身）仍歸 `FE-J13`，本 change 無 caller 設真值、站姿不變（archive-review r1 codex／gemini 指出「不能把這段契約延後」→補上機制與測試）
- [x] 5.3 單元測試：`tests/world-character.test.tsx`（`@react-three/test-renderer` 讀真 three 場景圖）—— 6 個 `BackSide` 深色描邊 mesh＋框臉髮型多部件＋腮紅＋眼嘴（`FE-W14-S06`）；`av` 為 `null`／`9999`／`1.5`／字串照常渲染且 body 是預設款（不取模，`FE-W14-S07`）；`seated` 使大腿 `rotation.x < -0.5`、整體 `y > 0`，站姿回 0（`FE-W14-S08`）。`tests/world-local-seated.test.tsx` —— 驅動端 `LocalPlayer` `seated` 時推進 10 幀後大腿仍 `< -0.5`（沒被每幀擺動覆蓋，`FE-W14-S08`）
- [x] 5.4 突變確認（已驗）：拿掉一個 `OutlineBox` → `FE-W14-S06`「共 6 個 BackSide mesh」變紅；`ChibiPlayer` 的 `legRest` 改成 0 → `FE-W14-S08`「大腿往前彎」變紅；`LocalPlayer` 拿掉「seated 時跳過擺動」的 `if (!seated)` → `world-local-seated` 的「大腿維持前彎」變紅

## 6. 真瀏覽器 e2e 與截圖（feat/fe-w14-pixel-restyle--e2e）
- [x] 6.1 `tests/e2e/pixelation.mjs`（對本機 `next start` 建置產物、`NEXT_PUBLIC_APP_ENV=local`、swiftshader WebGL2、REST／WS 全偽造只打 loopback）：實測 **有效 DPR = 0.250×0.250**（backing 360×206 / CSS 1440×825）、`image-rendering: pixelated`、antialias 關、且未超上限 2（`FE-W14-S05`／`FE-W01-S02`）全綠。草地貼圖存在（`FE-W14-S04`）改由截圖人眼判（避免脆弱的像素探針；截圖裡地面是多階綠點陣草地）
- [x] 6.2 「after」截圖存進本機 `img/fe-w14-world-pixel-after.png`（**不進版控**：img/ 無追蹤檔、archive-review 有體積閘；committed 的可重現證據是 `pixelation.mjs`）—— 畫面確認：暖色像素草地、木紋家具、角色深色描邊＋框臉棕髮＋藍身，**角色對地面清楚分得出來**（可讀性 `FE-W14-S01` 人眼判）
- [x] 6.3 效能一句話：有效 DPR 0.25 → backing store 面積約為 1/16，GPU 著色像素負擔同比降低（服務 `FE-X09` 弱裝置）；絕對數字目標歸 `FE-W13`／`FE-O12`

## 7. 收尾
- [x] 7.1 全套 `pnpm lint`＋`pnpm test`＋型別綠（main 8cc205f：eslint rc0、tsc rc0、vitest 1531 綠｜7 skip；兩個非本 change 的紅是環境／flake：`db-schema-copy`（本機後端 clone 過期、CI 無後端會 skip）、`server-auth`（全套並行下的計時 flake、單獨跑 8/8 綠））
- [x] 7.2 各 slice PR CI 綠後手動合併：材質 #628、草地 #629、像素化 #630、角色 #631、e2e #632（squash＋刪分支）
- [x] 7.3 archive：tasks 全勾 → 使用者手動跑 `archive-review.sh fe-w14-pixel-restyle`（r1 codex＋gemini 完成）→ 修正合併（#634）→ **r2 作廢**（使用者在 #634 合併前就跑了 `--rereview`，`r2/main.sha == r1/main.sha == 658f431`，diff 當時不存在、兩模型都回「未修」；#634 之後才合併，現 main `65be93c`）→ 依 codex＋gemini 一致採腳本明訂的「人工處理」出口（**不重置已用掉的「只准一次」以免削弱閘門**）逐條收尾 → `archive/fe-w14-pixel-restyle` 同步進 `openspec/specs/`。四條 r1 findings 對已合併 main（`65be93c`）逐條驗證：**S08 已修**（#634，突變驗證）／**S04 草地 geometry leak 誤報**（`span = PHYSICS.halfExtent*2 = 24` 常數、`grassGeometry(24)` 恆命中快取；隨長寬比變動的 `outside` 去的是別的 `<Floor>`）／**S05 背景＋燈光色 可接受風險**（task 4.1 明訂、取 token）／**像素化有效 DPR 已修**（#634 拿掉 `* m.dpr`）。無機器 `--report`（單次 `--rereview` 在合併前用掉）→ 證據與逐條判定寫在 archive PR 說明；另開 governance change 讓 `archive-review.sh` 在 r2 base 未前進時直接拒絕（codex 建議）。
