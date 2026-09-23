# `FE-W14` 走動時的畫面穩定：像素風不再整片閃

## Why

**使用者（視覺主導、demo 前）回報：在 `/world` 走動時「整個畫面會閃爍，人物也會閃」，站著不閃、一動就閃。**
`FE-W14` 的像素化渲染是**固定低有效 DPR `0.25` ＋ 關 antialias ＋ `image-rendering: pixelated`**（1/16 像素、服務
`FE-X09` 弱裝置）。這組合在**連續移動**下有兩個必然的鋸齒：(A) 貼圖 `minFilter` 無 mipmap，地面／牆在移動時
每幀取到不同 texel → 爬行閃；(B) 無抗鋸齒下，角色／物件與陰影的**幾何邊緣**在粗像素格上每幀二元跳動 → 整片閃。

**不做會怎樣**：視覺是這個 demo 的主軸（`FE-W14` 的存在理由）。一個一走動就整片閃爍的世界，跟「登入畫面也太醜」
同一種傷害 —— 使用者不會想待在裡面，前面所有功能都掛在一個看了難受的畫面上。這是使用者主動回報、要求「想辦法
解決」的具體病灶，不是預防性優化。

**為什麼要動規格**：`S02` 明訂貼圖 `NearestFilter`（未區分 min／mag）。治 (A) 需要**貼圖走 mipmap**（只動 `minFilter`），
與現行 locked 規格的字面衝突 —— 依 rule 4，先改規格談定，才碰產品碼。

**（B）怎麼收：一度開 MSAA、實測後撤回。** 這個 change 曾把 `S05` 的「antialias 關閉」改述成「開啟多重取樣」來治 (B)，
部署後發現在 `dpr 0.25` 下 MSAA 把**角色的硬像素邊緣軟化成柔邊**（角色純方塊、無貼圖，靜止看起來糊、臉部 1–2px 細節被抹）。
取捨評估（codex gpt-5.6-terra ＋ gemini 3.1 Pro 一致）後**撤回 MSAA、`S05` 維持既有「antialias 關閉」不變**：造成頭暈的主因
是 (A) 大面積貼圖爬行、已由 mipmap 治好；(B) 殘留的幾何邊緣抖動在 (A) 消失後不足以致暈，而靜止時角色讀成清晰硬邊像素
才是不可退讓的。詳見 `design.md`〈撤回 MSAA〉。

## What Changes

- **MODIFIED `world-visual-polish` 的〈場景材質⋯像素貼圖〉**：貼圖 `magFilter` 維持 `NearestFilter`（近看硬像素不變），
  但 `minFilter` 改成**走 mipmap** 的 filter、`generateMipmaps` 為真 —— 治 (A) 貼圖爬行。材質快取契約（同 token 同實例、
  不可變、不每幀新建、SSR 退化純色）**完全不變**；`S02` 補上 min／mag／mipmap 的斷言。
- **〈以低有效 DPR 做像素化渲染〉：有效 DPR `0.25` → `0.5`**（REMOVE 舊 1/4 需求＋ADD 新 1/2 需求，`S05`／`S09` 沿用 ID）。
  `antialias` 維持關閉、`pixelated` 不動。`0.25` 下角色臉僅 1–2px、移動邊緣每幀跳格 → 使用者回報「糊、走路閃、廉價」；`0.5`
  讓角色像素加倍（臉可讀）、邊緣抖動變細。代價 fragment ×4，demo **以品質優先於 `FE-X09` 弱裝置預算**（兩模型＋使用者確認）。
  （更早一度改述為「開啟 MSAA」治 (B)、實測後撤回，見「為什麼要動規格」與 `design.md`〈撤回 MSAA〉；徹底消閃的 RT 方案留作後續。）

## Non-goals

- **~~不提高有效 DPR~~（已推翻）→ 有效 DPR `0.25` 提高到 `0.5`。** 原本的立場是「不提高：`dpr 0.5` 只把閃變細、
  fragment ×4 打 `FE-X09` 弱裝置預算」。但實測部署後使用者回報 `0.25` 下角色臉糊/走路閃/看起來廉價 —— **demo 以視覺品質
  優先於弱裝置預算**，故提到 `0.5`（見〈What Changes〉與 spec 的 ADDED 需求）。不改全解析度渲染（`0.5` 仍是低解析像素風）。
- **不做 grid-snap（相機／角色 snap 到像素格）。** 它能完全消閃且零成本，但把平滑移動換成一格一格跳（`0.25` 下一格＝
  螢幕 4px，很明顯）。使用者要的是不閃、不是頓；本 change 選「保平滑移動」的路。grid-snap 留作未來若仍不足時的選項。
- **不換渲染架構、不引入後處理相依。** (A) 的解是純貼圖旗標（`minFilter`／mipmap），零新相依、同一顆 `<Canvas>`。
  (B) 曾試原生 canvas MSAA（`antialias:true`）後撤回；不上手動 MSAA-FBO、不上任何後處理 pass —— 殘留幾何邊緣抖動
  在 (A) 消失後可接受，清晰的靜止角色優先。若未來仍不足，grid-snap 或 motion-gated AA 是**後備**（見 `design.md`），非本 change。
- **不改 `world-canvas` 的 DPR 契約。** canvas 的有效 dpr 提到 `0.5`（上限 `2` 仍成立、下限已放寬）；低解析仍在 canvas 自己的
  backing store，不搬到 render target，所以 `world-canvas` 一字不動。
- **不改調色盤、貼圖內容、角色外觀、相機、動畫、坐姿。** 只動 `minFilter`／mipmap、`antialias`、`dpr` 三個渲染旗標。
- **不做效能數字目標。** 40 人 instancing／LOD 與數字門檻歸 `FE-W13`／`FE-O12`。本 change 只確保著色預算不退（維持 1/16）。
