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

`/world` 的 WebGL 畫面 SHALL 以固定的**低有效 DPR**（`0.25`）、**關閉 antialias** 渲染，
並把 canvas 的 CSS `image-rendering` 設為 `pixelated`，使低解析度的 backing store 被**最近鄰放大**
成點陣外觀。這是像素風的來源，也把 GPU 要著色的像素數降到約 1/16（與 `FE-X09`「弱裝置」同一目標）。

此有效 DPR **刻意低於** `world-canvas` 原本「1 到 2 之間」的下限；`world-canvas` 的 DPR Requirement
已放寬下限、把像素模式的低 DPR 交由此處決定（上限 `2` 仍成立，`0.25 ≤ 2`）。

> **本 change 一度把「關閉 antialias」改述為「開啟多重取樣（MSAA）」**來治「走動時幾何邊緣閃」，部署後實測發現：
> `dpr 0.25` 下 MSAA 把**角色的硬像素邊緣軟化成柔邊**（角色純方塊、無貼圖，靜止看起來糊、臉部 1–2px 細節被抹）。
> 兩模型（codex gpt-5.6-terra ＋ gemini 3.1 Pro）一致後**撤回、`antialias` 維持關閉**：致暈主因是大面積地面／牆的
> **貼圖爬行**、已由本 change 的 mipmap（`S02`／`S04`）治好；殘留的幾何邊緣抖動在貼圖爬行消失後不足以致暈，靜止時
> 角色清晰不可退讓。詳見 `design.md`〈撤回 MSAA〉。**本 change 對這條需求的淨效果＝維持 antialias 關閉不變（`S05` 同 base）**，
> 只在其下補一條 mipmap 生成失敗的退化保證（`S09`）。

#### Scenario: [FE-W14-S05] 畫面以 1/4 解析度渲染再最近鄰放大

- **WHEN** 在支援 WebGL2 的真瀏覽器開啟 `/world`
- **THEN** canvas 的 backing store 每一軸 SHALL 約為其 CSS 顯示尺寸的 1/4（有效 DPR ≈ `0.25`）
- **AND** canvas 的 `image-rendering` SHALL 是 `pixelated`（最近鄰放大，不是平滑內插）
- **AND** renderer 的 antialias SHALL 關閉
- **AND** 畫面上的邊緣 SHALL 呈現硬邊的點陣外觀（前後截圖為證）

#### Scenario: [FE-W14-S09] 無法建 mipmap 時，畫面照常出、不白屏不拋錯

- **WHEN** 某張像素貼圖在該 WebGL 環境無法產生 mipmap
- **THEN** 該材質 SHALL 退化為原本的最近鄰、無 mipmap 管線，`/world` SHALL 仍然渲染出畫面
- **AND** SHALL NOT 出現白屏，SHALL NOT 拋錯（mipmap 消閃是加分，缺它時退化，不是壞掉）

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
