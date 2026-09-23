## MODIFIED Requirements

### Requirement: 場景材質帶依 color token 生成的像素貼圖，且不破壞材質快取

`materialFor` 產生的每個 `MeshStandardMaterial` SHALL 帶一張**依該材質 color token 程序生成**的像素貼圖當 `map`：
`wood`／`woodDark` SHALL 用**橫向木紋**貼圖，其餘 token SHALL 用同色系的雜訊貼圖。
`MeshBasicMaterial`（自發光體）SHALL NOT 加貼圖。

貼圖的 `magFilter` SHALL 是 `NearestFilter`（近看仍是硬邊像素、放大不平滑），`wrapS`／`wrapT` SHALL 是 `RepeatWrapping`。
貼圖的 `minFilter` SHALL 是一個**會使用 mipmap** 的 filter，且 `generateMipmaps` SHALL 為真 ——
低有效 DPR 下，不用 mipmap 的 minification 會讓地面／牆的貼圖在相機移動時**爬行、閃爍**（近取樣每幀落在不同 texel）；
mipmap 預先把縮小的高頻細節濾掉，讓遠處與移動中的貼圖穩定。**只動 `minFilter`／mipmap，`magFilter` 維持 `NearestFilter`
—— 近看的硬像素外觀不變。**

貼圖 SHALL **只依 color token 的 hex 決定**（同一個 token 永遠拿到同一張快取貼圖），因此
`world-design-system` 的材質快取契約不變：同一組參數 SHALL 仍回同一個材質實例、不同參數回不同實例，
且回傳的材質實例仍是**不可變**的（貼圖在建構時掛上，不事後改寫）。貼圖本身 SHALL 依 hex 快取，
render loop **MUST NOT** 每幀新建 `CanvasTexture`。

沒有 `document` 的環境（伺服器端渲染、jsdom 測試）取不到 canvas 2D context，此時 `map` SHALL 退化為
**無貼圖**（純色 `MeshStandardMaterial`），MUST NOT 拋錯。

#### Scenario: [FE-W14-S02] 木頭 token 的材質帶橫向木紋、同 token 同實例

- **GIVEN** 有 `document`（瀏覽器／jsdom 有 canvas 2D context）
- **WHEN** 用 `{kind:'standard', color:'wood'}` 取兩次材質
- **THEN** 兩次 SHALL 得到同一個材質實例（快取不因加貼圖／mipmap 而失效）
- **AND** 該材質的 `map` 的 `magFilter` SHALL 是 `NearestFilter`、`wrapS`／`wrapT` SHALL 是 `RepeatWrapping`
- **AND** 該 `map` 的 `minFilter` SHALL 是一個使用 mipmap 的 filter，且 `generateMipmaps` SHALL 為真（治移動時的貼圖爬行）
- **AND WHEN** 改用 `{kind:'standard', color:'carpet'}` 取用
- **THEN** SHALL 得到不同的材質實例，其 `map` 是雜訊貼圖（非木紋）、同樣 mag 最近鄰、min 走 mipmap

#### Scenario: [FE-W14-S03] 沒有 document 時退化為無貼圖純色、不拋錯

- **WHEN** 在沒有 `document` 的環境（SSR／測試）用 `{kind:'standard', color:'wood'}` 取材質
- **THEN** SHALL 回一個純色 `MeshStandardMaterial`、其 `map` 為未設定（`null`）
- **AND** SHALL NOT 拋錯

### Requirement: World 以低有效 DPR 做像素化渲染

`/world` 的 WebGL 畫面 SHALL 以固定的**低有效 DPR**（`0.25`）渲染，並把 canvas 的 CSS `image-rendering` 設為
`pixelated`，使低解析度的 backing store 被**最近鄰放大**成點陣（方塊）外觀。這是像素風的來源，也把 GPU 要**著色**
的像素數維持在約 1/16（與 `FE-X09`「弱裝置」同一目標）—— 本 change **MUST NOT** 為了消閃把場景改以全解析度著色。

renderer SHALL **開啟多重取樣（MSAA，`antialias` 為真）**，讓那個低解析 backing store 上的**幾何邊緣覆蓋率**被
多重取樣（不是二元的中／不中）。原因：`0.25` 有效 DPR ＋ 連續移動 ＋ 無抗鋸齒時，角色與物件的邊緣、陰影邊會在
粗像素格上**每幀二元跳動**（走動時整個畫面在閃）；在低解析 buffer 上做 MSAA 讓邊緣像素呈漸變覆蓋，移動時是平滑
過渡而不是跳動。**像素格本身不變**：最近鄰放大照舊，畫面仍是硬邊方塊；被平滑的是方塊**內**的邊緣覆蓋值，不是把整張
畫面內插放大。多重取樣只在低解析 buffer 上做，著色仍是約 1/16 —— 弱裝置的預算不破。此有效 DPR（`0.25`、上限 `2`）
與 `world-canvas` 的 DPR 契約不變（低解析仍在 canvas 自己的 backing store，不搬到 render target）。

> 此需求把原文的「renderer 的 antialias SHALL 關閉」翻成「SHALL 開啟多重取樣」。理由與量測見本 change 的
> `design.md`（codex／gemini 一致：`1/16 像素 ＋ 連續移動 ＋ 無 AA` 數學上必然閃，只能靠「把幾何 snap 到格」或
> 「把邊界覆蓋率混合掉」二選一；選後者以保住平滑移動與弱裝置效能）。

#### Scenario: [FE-W14-S05] 畫面以 1/4 解析度渲染再最近鄰放大

- **WHEN** 在支援 WebGL2 的真瀏覽器開啟 `/world`
- **THEN** canvas 的 backing store 每一軸 SHALL 約為其 CSS 顯示尺寸的 1/4（有效 DPR ≈ `0.25`）
- **AND** canvas 的 `image-rendering` SHALL 是 `pixelated`（最近鄰放大，不是平滑內插）
- **AND** renderer 的 drawing buffer SHALL 啟用多重取樣（`antialias` 為真、實得 sample 數 `> 1`）
- **AND** 放大後畫面 SHALL 仍是硬邊方塊點陣（像素格不因 MSAA 消失），而移動中的邊緣不再逐幀二元跳動（前後截圖／錄影為證）

#### Scenario: [FE-W14-S09] 缺多重取樣或無法建 mipmap 時，畫面照常出、不白屏不拋錯

- **WHEN** WebGL 環境不提供多重取樣（`antialias` 未被實作），或某張像素貼圖無法產生 mipmap
- **THEN** `/world` SHALL 仍然渲染出畫面（該面向退化為原本的最近鄰、無 MSAA／無 mipmap 管線）
- **AND** SHALL NOT 出現白屏，SHALL NOT 拋錯（消閃是加分，缺它時退化，不是壞掉）

### Requirement: 地面疊一張像素草地，且經共用 resource factory 取得

Guild Hall 的地面 SHALL 在主地板上疊一張**像素草地** plane（`magFilter` 為 `NearestFilter`、`wrap` 為 `RepeatWrapping`，
tiling 隨物理範圍縮放），讓地面看起來是草而不是一塊平色。草地貼圖的 `minFilter` SHALL 是一個**會使用 mipmap** 的
filter、`generateMipmaps` SHALL 為真 —— 草地是地板主表面，低有效 DPR 下不用 mipmap 的 minification 會讓它在相機移動時
爬行、閃（與 `S02` 的一般像素貼圖同因）；`magFilter` 維持 `NearestFilter`，近看的硬像素外觀不變。

草地貼圖 SHALL **經 `world-design-system` 的共用 resource factory 取得**，場景元件（`WorldShell`）
**MUST NOT** 自己 `new CanvasTexture` —— 沿用 `world-environment`「場景元件 MUST NOT 直接建立 GPU 資源」
與「誰負責釋放」的既有契約；貼圖與草地 plane 共用的 geometry SHALL 是 factory 擁有的不可變快取實例，
場景元件 MUST NOT 對它 `dispose()`。

#### Scenario: [FE-W14-S04] 地面有像素草地、貼圖來自共用 factory

- **WHEN** 進入 Guild Hall
- **THEN** 主地板上 SHALL 疊一張像素草地 plane，其貼圖的 `magFilter` 是 `NearestFilter`、`minFilter` 走 mipmap（`generateMipmaps` 為真）、`wrap` 是 `RepeatWrapping`
- **AND** 該貼圖 SHALL 由共用 resource factory 產生（`WorldShell` 不直接 `new CanvasTexture`）
- **AND** `WorldShell` 卸載時 SHALL NOT 對草地貼圖或其 geometry 呼叫 `dispose()`（factory 擁有）
