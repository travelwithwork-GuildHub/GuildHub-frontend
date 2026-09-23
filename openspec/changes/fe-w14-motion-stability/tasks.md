# tasks：`FE-W14 走動畫面穩定`

**切法**：每一刀帶著直接證明它的判準。產品碼上限 250 行／刀。動 `src/**/*.tsx` 版面／`src/design/`／`globals.css`
前先叫 `ui-ux-pro-max`（本 change 是既有像素風的穩定性修正、方向已與兩模型談定）。

**淨效果 = 只動一個渲染旗標**：貼圖 `minFilter`／mipmap。renderer `antialias` 曾一度改開（治幾何邊緣閃），
實測部署後 MSAA 在 `dpr 0.25` 下把角色硬像素邊緣軟化成柔邊（靜止糊），兩模型一致後**撤回、改回 `antialias: false`** ——
見 §2 與 `design.md`〈撤回 MSAA〉。不改調色盤、貼圖內容、角色、相機、動畫。

## 1. 貼圖走 mipmap，治地面／牆的爬行（A；`FE-W14-S02`）

- [x] 1.1 `pixelate`（`src/world/primitives/pixelTexture.ts`）：`magFilter` 維持 `NearestFilter`；`minFilter` 改成一個
  **使用 mipmap** 的 filter、`generateMipmaps = true`。草地貼圖（`grass.ts`）同步。取 `NearestMipmapLinear` 為預設。
- [x] 1.2 材質快取契約不破：同 token 同實例、不可變、render loop 不每幀新建 `CanvasTexture`、SSR（無 `document`）退化純色不拋錯 —— 都不動。
- [x] 1.3 判準：`FE-W14-S02` 補斷言 —— `map.magFilter === NearestFilter`、`map.wrapS/T === RepeatWrapping`、
  `map.minFilter` 是 mipmap 變體、`map.generateMipmaps === true`；`carpet` 仍與 `wood` 不同實例。`FE-W14-S03`（SSR 純色不拋錯）不變。
- [x] 1.4 判準：`FE-W14-S09`（改framed 為純 mipmap fallback）—— 某張像素貼圖無法產生 mipmap 時，該材質退化為最近鄰、
  無 mipmap 管線，`/world` 照常出畫面、不白屏不拋錯。`S03`（無 `document` 純色退化）已涵蓋同一條優雅退化路徑。

## 2. 撤回 MSAA：`antialias` 改回關閉（`FE-W14-S05`，維持既有規格不變）

- [x] 2.1 曾一度 `gl={{ antialias: true }}`（治走動時幾何邊緣閃）。實測回報：`dpr 0.25` 下 MSAA 把**角色的硬像素邊緣**
  軟化成柔邊（角色純方塊、無貼圖，靜止看起來糊、臉部 1–2px 細節被抹）。兩模型（codex／gemini）一致：造成頭暈的主因
  是大面積貼圖爬行、已由 §1 mipmap 治好；殘留幾何邊緣抖動不足以致暈，靜止角色清晰才不可退讓。
- [ ] 2.2 `WorldCanvas.tsx`：`gl={{ antialias: true }}` 改回 `gl={{ antialias: false }}`；`dpr={0.25}`、`image-rendering: pixelated`
  **不動**。同步改回檔頭 `S05` 註解（不再宣稱開 MSAA）。一行旗標，不引入任何相依。
- [ ] 2.3 確認著色預算不退：backing store 仍 dpr `0.25`（≈1/16 fragment）—— 一直不變。

## 3. 真瀏覽器判準與前後對比（`FE-W14-S05`／`S02`；web-facing 驗證）

- [ ] 3.1 改回 `S05` 的 e2e（`tests/e2e/pixelation.mjs`）：斷言由「drawing buffer sample 數 `> 1`」**改回**「`antialias` 關閉
  （`getContextAttributes().antialias === false`）」；保留「backing store ≈1/4、`image-rendering: pixelated`」。
- [ ] 3.2 走動前後對比：以同一段走位（沿用 `lib/world.mjs` 的 walker）截圖／短錄影，人眼確認 (a) 靜止時角色是清晰硬邊像素、
  (b) 走動時地面／牆不再爬行（mipmap 生效）、(c) 殘留的幾何邊緣抖動不致暈。
  （swiftshader headless 不忠實反映邊緣時間性，必要時 headed 真 GPU 覆核 —— 見 `reference` 記憶「headless FPS 不可信用 HEADED=1」。）
- [ ] 3.3 截圖存 `docs/evidence/fe-w14-motion/`（走動前後、桌機寬），自問→**靜止角色清晰、走動地面不爬、仍是像素風**。

## 4. 收尾

- [ ] 4.1 全套件綠、`typecheck`／`lint`（含 `.mjs`）綠、`openspec validate --strict` 綠、`progress.sh --check` 綠。
- [ ] 4.2 送 codex（gpt-5.6-terra）＋gemini（3.1 Pro）驗成品：撤回 MSAA 後靜止清晰度與走動穩定度的取捨是否成立、mipmap 變體選擇。
  （已於本輪諮詢，兩模型一致選撤回 MSAA；成品走查後回填結論。）
- [ ] 4.3 部署最新版到正式站（使用者 `vercel --prod`），走查走閘道網址：走動看地面不爬、站著看角色清晰。
