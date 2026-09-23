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

## ADDED Requirements

### Requirement: World 以低有效 DPR（0.5）做像素化渲染

`/world` 的 WebGL 畫面 SHALL 以固定的**低有效 DPR**（`0.5`）、**關閉 antialias** 渲染，並把 canvas 的 CSS
`image-rendering` 設為 `pixelated`，使低解析度的 backing store 被**最近鄰放大**成點陣外觀。這是像素風的來源。

有效 DPR 由 `0.25` **提高到 `0.5`**（本 change 的最後修訂）：`0.25`（每軸 1/4、共 1/16 像素）下角色臉部細節僅 1–2px，
站定時被相機收斂尾巴／待機浮動的次像素移動洗進洗出、移動中硬邊每幀跨像素跳動 —— 使用者實測回報「糊、會變化、走路閃、
看起來廉價」。提到 `0.5`（每軸 1/2、共 1/4 像素）讓角色像素密度加倍（臉 3–4px 可讀）、移動時邊緣抖動變細約一半，仍保像素風。
代價是 fragment 著色量約 ×4：demo **以視覺品質優先於 `FE-X09` 弱裝置預算**，此權衡經 codex／gemini 與使用者確認。
`world-canvas` 的 DPR 上限 `2` 仍成立（`0.5 ≤ 2`）。

> 徹底消除移動中邊緣抖動需要「固定低解析 RenderTarget ＋ 位置 snap」（兩模型排序 C＞A＞B），屬較大架構改動，留作後續；
> 本 change 取「提高有效 DPR」為快速、明顯的品質提升。`S05`／`S09` 沿用退役前的 ID（低解析 pixelated 渲染／mipmap 失敗退化的核心語意未變）。

#### Scenario: [FE-W14-S05] 畫面以低解析度渲染再最近鄰放大

- **WHEN** 在支援 WebGL2 的真瀏覽器開啟 `/world`
- **THEN** canvas 的 backing store 每一軸 SHALL 約為其 CSS 顯示尺寸的 `0.5`（有效 DPR ≈ `0.5`）
- **AND** canvas 的 `image-rendering` SHALL 是 `pixelated`（最近鄰放大，不是平滑內插）
- **AND** renderer 的 antialias SHALL 關閉
- **AND** 畫面上的邊緣 SHALL 呈現硬邊的點陣外觀（前後截圖為證）

#### Scenario: [FE-W14-S09] 無法建 mipmap 時，畫面照常出、不白屏不拋錯

- **WHEN** 某張像素貼圖在該 WebGL 環境無法產生 mipmap
- **THEN** 該材質 SHALL 退化為原本的最近鄰、無 mipmap 管線，`/world` SHALL 仍然渲染出畫面
- **AND** SHALL NOT 出現白屏，SHALL NOT 拋錯（mipmap 消閃是加分，缺它時退化，不是壞掉）

## REMOVED Requirements

### Requirement: World 以低有效 DPR 做像素化渲染

**退役原因：有效 DPR 由 `0.25` 提高到 `0.5`**（見上方 ADDED 的〈World 以低有效 DPR（0.5）做像素化渲染〉）。
原需求的標題與 `S05` 的標題都寫死「1/4 解析度／`0.25`」，`0.25` 已不再成立 —— 依 OpenSpec，標題不真時 MUST 用
REMOVED ＋ ADDED 換掉，不能用 MODIFIED 保留一個已經不真的標題（沿用 `fe-n08` 的作法）。核心語意（低解析 pixelated
渲染、mipmap 失敗退化）未變，故 `S05`／`S09` 在 ADDED 需求沿用同一個 ID。
