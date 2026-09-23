# `FE-W14` 走動時的畫面穩定：像素風不再整片閃

## Why

**使用者（視覺主導、demo 前）回報：在 `/world` 走動時「整個畫面會閃爍，人物也會閃」，站著不閃、一動就閃。**
`FE-W14` 的像素化渲染是**固定低有效 DPR `0.25` ＋ 關 antialias ＋ `image-rendering: pixelated`**（1/16 像素、服務
`FE-X09` 弱裝置）。這組合在**連續移動**下有兩個必然的鋸齒：(A) 貼圖 `minFilter` 無 mipmap，地面／牆在移動時
每幀取到不同 texel → 爬行閃；(B) 無抗鋸齒下，角色／物件與陰影的**幾何邊緣**在粗像素格上每幀二元跳動 → 整片閃。

**不做會怎樣**：視覺是這個 demo 的主軸（`FE-W14` 的存在理由）。一個一走動就整片閃爍的世界，跟「登入畫面也太醜」
同一種傷害 —— 使用者不會想待在裡面，前面所有功能都掛在一個看了難受的畫面上。這是使用者主動回報、要求「想辦法
解決」的具體病灶，不是預防性優化。

**為什麼要動規格**：`FE-W14-S05` 明訂「antialias SHALL 關閉」、`S02` 明訂貼圖 `NearestFilter`（未區分 min／mag）。
消閃需要**開多重取樣**與**貼圖走 mipmap**，兩者都與現行 locked 規格的字面衝突 —— 依 rule 4，先改規格談定，才碰
產品碼。

## What Changes

- **MODIFIED `world-visual-polish` 的〈場景材質⋯像素貼圖〉**：貼圖 `magFilter` 維持 `NearestFilter`（近看硬像素不變），
  但 `minFilter` 改成**走 mipmap** 的 filter、`generateMipmaps` 為真 —— 治 (A) 貼圖爬行。材質快取契約（同 token 同實例、
  不可變、不每幀新建、SSR 退化純色）**完全不變**；`S02` 補上 min／mag／mipmap 的斷言。
- **MODIFIED `world-visual-polish` 的〈以低有效 DPR 做像素化渲染〉**：DPR `0.25` ＋ `pixelated` ＋ 1/16 著色預算
  **全部不變**，但 renderer 的 `antialias` 由**關改開** —— 在低解析 backing store 上做 MSAA，讓移動中的幾何邊緣覆蓋率
  漸變而非二元跳動，治 (B) 整片閃。像素格（最近鄰放大的方塊）不因 MSAA 消失。`S05` 改述、並加 `S09` 失敗路徑
  （缺 MSAA／mipmap 時退化、不白屏不拋錯）。

## Non-goals

- **不提高有效 DPR、不改全解析度渲染。** 兩模型一致：`dpr 0.5` 只把閃「變細變快」、fragment ×4 直接打 `FE-X09`
  弱裝置預算，是昂貴的半解。著色維持 1/16。
- **不做 grid-snap（相機／角色 snap 到像素格）。** 它能完全消閃且零成本，但把平滑移動換成一格一格跳（`0.25` 下一格＝
  螢幕 4px，很明顯）。使用者要的是不閃、不是頓；本 change 選「保平滑移動」的路。grid-snap 留作未來若仍不足時的選項。
- **不換渲染架構、不引入後處理相依。** 選定實作是**原生 canvas 多重取樣**（`antialias:true` 在既有 dpr 0.25 canvas 上，
  同一顆 `<Canvas>`），非手動 render target ＋ 全螢幕 pass。手動 MSAA-FBO 是**後備**（原生 MSAA 不足時才上），記在
  `design.md`。規格只寫可觀察結果（低解析 buffer 上多重取樣＋最近鄰放大＋貼圖 mipmap），不綁實作手法。
- **不改 `world-canvas` 的 DPR 契約。** canvas 仍 dpr `0.25`、上限 `2`；低解析在 canvas 自己的 backing store，不搬到
  render target，所以 `world-canvas` 一字不動。
- **不改調色盤、貼圖內容、角色外觀、相機、動畫、坐姿。** 只動 `minFilter`／mipmap 與 `antialias` 兩個渲染旗標。
- **不做效能數字目標。** 40 人 instancing／LOD 與數字門檻歸 `FE-W13`／`FE-O12`。本 change 只確保著色預算不退（維持 1/16）。
