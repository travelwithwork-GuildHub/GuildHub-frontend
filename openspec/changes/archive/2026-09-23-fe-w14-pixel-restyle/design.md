# 設計：像素／寶可夢風的視覺統一

原型已在工作區驗證通過使用者驗收（截圖在 `img/寶可夢化-*.png`）。以下是把配方正式化時的決定。
決策依據：codex（gpt-5.6）互審三個核心決定、結論一致；gemini 這輪不可用（auto-mode 分類器擋
`--dangerously-skip-permissions`）。原型是**丟棄的 hack**（magic number、程序貼圖直接寫在元件裡），
正式實作要走乾淨版，見各決定的「實作注意」。

## D1：像素化用全域低有效 DPR，不是 render-target pixel pass

**決定**：像素化用 `<Canvas dpr={0.25} gl={{antialias:false}}>` ＋ `image-rendering: pixelated`
（低解析度 backing store ＋ 最近鄰放大），**不用** render-to-low-res-target ＋ upscale pass。

**理由**：低 DPR 是最少新機制的做法，backbuffer 降到約 1/16 解析度，對弱裝置反而更省 ——
正好服務 `FE-X09`／`FE-W14` 同組的「弱裝置」目標。render-target pixel pass 雖然不碰 `world-canvas`
的 DPR 判準，但要多寫一個 post-processing pass、多一份 render target 的資源生命週期與釋放 ——
在 demo 關頭引入那個風險不划算。

**代價（正面承認）**：低 DPR `0.25` 破 `world-canvas`「1 到 2 之間」的**下限**（上限 `2` 沒破，`0.25 ≤ 2`）。
所以一併 MODIFIED `world-canvas` 那條 Requirement，把下限交由渲染面決定。**現行程式其實已經是
`dpr={0.25}`，也就是目前的 main 之外的工作區已違反該規格** —— 正式化就是讓規格追上事實。

## D2：像素風開新 capability `world-visual-polish`，不塞進既有 spec

**決定**：像素調色盤、程序貼圖、草地、像素化渲染、角色外觀、坐姿都放進新 capability `world-visual-polish`；
`world-canvas` 只收 DPR 的 MODIFIED。

**理由**：像素風同時跨 renderer（DPR）、材質、環境（草地）與角色 —— 硬塞進 `world-design-system`、
`world-environment` 或 `world-player` 任何一個，都會把「既有元件的契約」跟「整個世界的視覺成果」混在一起。
新 capability 以 `FE-W14` 的**可觀察成果**為中心，delta 再分別碰既有 spec（只有 `world-canvas` 要 MODIFIED）。

## D3：貼圖依 color token 生成，所以不用改 `world-design-system`

**決定**：像素貼圖在 `materialFor` 的 `build()` 裡、**依材質 color token 的 hex** 程序生成當 `map`，
依 hex 快取；**不改** `world-design-system` 的材質快取 Requirement。

**理由**：那條 Requirement 管三件事 —— 依（類別、color token、影響行為的參數）快取、回傳實例不可變、
消費者不得 `dispose`。貼圖是 color token 的純函式（同 hex 同貼圖）、在建構時掛上不事後改寫、
材質快取鍵不變（同參數同實例）—— 三條都守住。所以這是**相容的擴充**，不是規格衝突。
（原型的 `pixelTexture` 用 `Math.random()` 產雜訊內容，但每個 hex 只產一次、快取起來，實例仍是決定性的。）

**實作注意**：沒有 `document` 的環境（SSR／jsdom）取不到 canvas 2D context，`map` 要退化為 `null`（純色），
不能拋錯 —— 見 `FE-W14-S03`。

## D4：草地貼圖要收進共用 resource factory

**決定**：像素草地的貼圖（與其 plane 的 geometry）要**經 `world-design-system` 的共用 factory** 取得，
`WorldShell` 不自己 `new CanvasTexture`。

**理由**：`world-environment` 已明訂「場景元件 MUST NOT 直接建立 GPU 資源」「誰負責釋放」。原型為了快
把草地貼圖直接寫在 `WorldShell` 裡 `new CanvasTexture` —— 那是原型 hack，正式版要搬進 factory，
讓草地跟其他材質走同一條快取／不可變／不釋放的路。這是 `FE-W14-S04` 明訂的一條。

## D5：描邊用 inverted-hull，不用後處理

**決定**：角色描邊用 inverted-hull（每個部位後疊一個放大的 `BackSide` 深色 box），不用 outline post-processing pass。

**理由**：跟 D1 同一個取捨 —— 不引入 post-processing pass 的生命週期。inverted-hull 是純幾何、
在固定俯視相機下穩定、每個部位一個額外 mesh 的成本可接受，且不需要碰 render pipeline。

## D6：坐姿只做姿勢，坐在椅子上歸 `FE-J13`

**決定**：`ChibiPlayer` 的 `seated` 只負責**姿勢**（大腿前彎、手前擱、抬到椅面高）。坐在正確座位上的定位、
面向桌子、走動起身、跟後端座位權威接軌，都留給 `FE-J13`。

**理由**：3/4 俯視下「漂亮地坐在椅子上」是**框景與空間互動**問題（角色會把椅子擋掉、要坐在真工位上、
面向桌子、相機角度要露出椅背），那是 `FE-J13` 座位（目前「走到站位站著」）的範圍，不是視覺姿勢。
硬把定位塞進視覺 change 會動到座位權威（`LocalPlayer` 的一次性就位、relocation），風險不對等。
本 change 交付可重用的姿勢能力，`FE-J13` 之後接上。

**驅動端的交互**：`LocalPlayer` 每幀寫四肢 `rotation.x`（走路擺動）會蓋掉靜態坐姿。所以驅動端在 seated 時
要跳過那次寫入（`FE-W14-S08` 註明）—— 但「什麼時候 seated」的訊號來自座位狀態，那條線是 `FE-J13` 接。
非驅動實例（`RemotePlayer`、靜態）不寫四肢，姿勢直接生效。

## 驗證方式（web-facing 自定義）

這是看得見的 change，這個 repo 沒有現成的瀏覽器驗證規範，缺口逐條寫出來：

- **jsdom 判準**（`pnpm test`）：材質快取不因加貼圖失效（`FE-W14-S02`）、沒有 document 退化純色不拋錯
  （`FE-W14-S03`）、角色有 `BackSide` 描邊 mesh 與髮型部件（`FE-W14-S06`）、`av` 越界照常渲染（`FE-W14-S07`）、
  `seated` 改變四肢關節角度與整體高度（`FE-W14-S08`）。
- **真瀏覽器判準**（`tests/e2e/*.mjs`，本機自起 `next start`、`NEXT_PUBLIC_APP_ENV=local`）：
  canvas backing store ≈ CSS 尺寸的 1/4、`image-rendering: pixelated`、antialias 關（`FE-W14-S05`）；
  草地貼圖存在（`FE-W14-S04`）。
- **前後截圖**：色票、木紋家具、草地、角色（描邊／髮型／臉）、坐姿 —— 存進 `img/`，PR 附上。
  可讀性（角色對地面、`FE-W14-S01`）靠截圖人眼判。這是像素風「看起來對不對」唯一的真判準。
