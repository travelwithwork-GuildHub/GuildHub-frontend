# design：`FE-W14` 走動畫面穩定

## 問題的數學形狀

以固定低有效 DPR（`0.25`，1/16 像素）、**無抗鋸齒**、`image-rendering: pixelated` 渲染一個**連續平移**的 3D 場景：
每幀最近鄰取樣落在低頻格子上，幾何邊界與貼圖高頻細節跨越 sub-pixel 邊界時，取到的樣本會**二元翻動**。這是取樣定理
的必然結果 —— codex 與 gemini 各自獨立給出同一句：`1/16 像素 ＋ 連續移動 ＋ 無 AA` **無法**同時消閃，只能三選一：

1. 提高取樣率（升 DPR）；
2. 讓幾何**不要**連續移動（snap 到像素格）；
3. 把邊界**覆蓋率混合**掉（多重取樣 / mipmap）。

## 選項比較（兩模型輸入）

| 手段 | 治 | 效能（vs 1/16） | 保像素風 | 消閃 | 改規格 |
|---|---|---|---|---|---|
| **① 貼圖 mipmap（min）** | 貼圖爬行 A | 幾乎 0（記憶體 +~33%/圖） | 是（mag 仍 Nearest） | A 幾乎全消 | 是（S02） |
| **② 低解析 buffer 上 MSAA** | 幾何/邊緣/陰影 C | 低（多重取樣 buffer 的頻寬，著色仍 1/16） | 是（格子仍在，格內邊緣漸變） | C 大幅 | 是（S05） |
| ③ 升 dpr 0.5 | A＋C | **×4 fragment**（打 FE-X09） | 像素變小、稀釋 | 只「變細變快」 | 是 |
| ④ grid-snap 相機＋角色 | A＋C | 0 | 是（最純） | **完全消** | 否 |

- **codex**：推「低解析 render target ＋ nearest，dpr 提到 0.5」，並說 MSAA「只軟化邊、不解全域爬行」。
- **gemini**：推「1/16 render target ＋ 在該 FBO 上 MSAA(2–4)」，弱裝置 OK、平滑移動、幾乎全消；反對 dpr 0.5（昂貴半解）。
- **統整判讀**：使用者主訴是「**整個畫面＋人物**在閃」＝主要是**幾何邊緣**的時間性抖動（C）。MSAA 正是對付邊緣覆蓋率
  跨 sub-pixel 跳動的手段 → gemini 的方向直打主訴、又保弱裝置。codex 低估 MSAA 在此的作用，dpr 0.5 兩邊都認較弱。
  MSAA 不管貼圖內部（A），那個用 mipmap 補。**最終＝① ＋ ②**，使用者也在三選項中選了「MSAA-FBO ＋ mipmap」。
- **③／④ 不取**：③ 打弱裝置且只是半解；④ 完全消閃但把平滑移動換成明顯的一格一格跳，使用者要「不閃」非「頓」。
  ④ 保留為未來若 ①＋② 仍不足時的升級路（零成本、不改規格）。

## 實作抉擇：原生 canvas MSAA（選定）vs 手動 MSAA-FBO（後備）

gemini 用**手動 `WebGLRenderTarget` ＋ 全螢幕 pass** 的理由是把 canvas 留在 dpr 1、精準控制像素格。但同一個「在
1/16 低解析 buffer 上做 MSAA、再 nearest 放大」的結果，可以用**更簡單**的方式達成：

- **選定**：`<Canvas dpr={0.25} gl={{ antialias: true }}>` ＋ `image-rendering: pixelated`。瀏覽器直接在那個 1/16 的
  default framebuffer（drawing buffer）上做原生 MSAA，CSS 再 nearest 放大。**零新相依、不動 `world-canvas`、同一顆
  `<Canvas>`、改動面積最小 → demo 風險最低。** 著色仍 1/16，只多多重取樣 buffer 的頻寬。
- **後備（不預先做）**：手動 `WebGLRenderTarget`（1/16 尺寸、`samples≥2`）＋ nearest blit 的全螢幕 pass。只有在真瀏覽器
  量到原生 MSAA 在 dpr 0.25 下 sample 不足／未被實作、消閃不明顯時才上。屆時 canvas 改 dpr 1、低解析移進 RT，
  那才需要一併 MODIFY `world-canvas` 的 DPR 契約 —— 本 change 先不做。

**規格因此只寫可觀察結果**（低解析 buffer 上多重取樣＋最近鄰放大＋貼圖 mipmap），不綁「canvas 原生」或「手動 FBO」
其中一種手法。兩種實作都滿足 `S05`。

## 撤回 MSAA（2026-09-23 部署後修訂）

**上面②的 MSAA 決策，部署後由實測推翻，本 change 撤回。保留原分析作為決策紀錄。**

- **新證據**：MSAA 上線後，使用者回報**站著不動時角色看起來糊**（附截圖）。診斷：角色（`ChibiPlayer`）**純由方塊組成、
  完全沒有貼圖**（`meshStandardMaterial`／`meshBasicMaterial` 描邊），mipmap 不碰它；糊來自 MSAA 把方塊的**幾何邊緣**
  做覆蓋率漸變 → 靜止時硬像素邊變柔邊。在 `dpr 0.25` 下角色只有 ~30px 高（眼／嘴 1–2px），nearest 放大把 MSAA 的
  部分覆蓋邊緣像素變成柔邊方塊 → 讀成糊，不是硬邊像素風。
- **原分析漏了什麼**：①②當時聚焦「走動時的**時間性**閃」，沒有評估 MSAA 對**靜止空間清晰度**的代價。在這個極低
  backing 解析度下，那個代價很大 —— 而它只在部署、真人站著看角色時才顯現（單元／e2e 量 sample 數量不到「糊」）。
- **兩模型一致（本輪諮詢，codex gpt-5.6-terra ＋ gemini 3.1 Pro）**：選**撤回 MSAA、`antialias` 改回關閉、保留 mipmap**。
  兩邊同一判讀：造成頭暈的主因是 (A) 大面積地面／牆的**貼圖爬行**，已由 mipmap（①）治好；(B) 殘留的幾何邊緣抖動在
  (A) 消失後**不足以致暈**，只會讀成正常的復古像素風；而靜止時角色清晰是不可退讓的。兩邊唯一但書：**部署後要在
  實際走動路徑上人眼確認**殘留抖動確實可接受（見 tasks §3.2）。
- **後備（若走查發現殘留抖動仍不適）**：grid-snap（相機／角色 snap 到像素格，完全消閃、換成一格一格跳）或 motion-gated
  AA（只在移動時開）。兩者都不在本 change；本 change 先取「清晰靜止 ＋ mipmap 穩定地面」這個對 demo 最安全的組合。
- **淨結果**：`S05` 維持既有「antialias 關閉」不變（本 change 對它淨效果為零，只在其下補 `S09`）；`S09` 從原本的
  「缺 MSAA／mipmap 退化」**改framed 成純「無法建 mipmap 時退化」**（拿掉 MSAA 那半，ID 保留 —— 依 branch-gate，
  main 上有的 Scenario ID 不得靜默刪除）。本 change 淨效果 = 只動 mipmap（＋一條 mipmap 失敗的退化保證）。

## mipmap filter 的選擇（實作層，S02 不綁死）

`magFilter` 維持 `NearestFilter`（近看硬像素）。`minFilter` 走 mipmap，具體用哪個由實作與前後截圖定：
- `NearestMipmapNearest`（codex 傾向）：每階仍硬，可能有階間跳線；
- `NearestMipmapLinear`（gemini 傾向）：階間混合、消爬行、遠處略軟。
兩者只差一個 enum，屬純視覺差 —— 依「分歧去量不裁決」，實作時用走動前後截圖對比二選一，規格只要求「一個使用 mipmap
的 filter ＋ generateMipmaps」。

## 驗證

- **可機器驗的**（單元／真瀏覽器）：貼圖 `minFilter` 是 mipmap 變體、`magFilter` 仍 `NearestFilter`、`generateMipmaps`
  為真（S02）；`antialias` 關閉、backing store ≈1/4、`image-rendering: pixelated`（S05，維持既有）。
- **半主觀的**（前後截圖／短錄影）：靜止時角色是清晰硬邊像素、走動時地面／牆不再爬行 —— 沿用前後截圖 review（web-facing
  的可觀察成果）。殘留幾何邊緣抖動的可接受度由部署後真人走查確認（swiftshader headless 不忠實反映邊緣時間性，必要時
  headed 真 GPU）。

## 對既有判準的影響

- `S05`「antialias SHALL 關閉」：**維持既有不變**（曾一度改述開 MSAA、後撤回，見〈撤回 MSAA〉）。impl 端把 `antialias`
  改回 `false`、e2e 斷言改回「antialias 關」。
- `S02` 補 min／mag／mipmap 斷言：材質單元測試要加對應斷言。
- `S09` 改framed：從「缺 MSAA／mipmap 退化」改成純「無法建 mipmap 時退化」（拿掉 MSAA 那半，ID 保留）。
- 材質快取契約、SSR 退化、每幀不新建 texture、`world-canvas` DPR：**全部不動**。
