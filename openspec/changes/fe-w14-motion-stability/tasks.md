# tasks：`FE-W14 走動畫面穩定`

**切法**：每一刀帶著直接證明它的判準。產品碼上限 250 行／刀。動 `src/**/*.tsx` 版面／`src/design/`／`globals.css`
前先叫 `ui-ux-pro-max`（本 change 是既有像素風的穩定性修正、方向已與兩模型談定）。**只動兩個渲染旗標**
（貼圖 `minFilter`／mipmap、renderer `antialias`），不改調色盤、貼圖內容、角色、相機、動畫。

## 1. 貼圖走 mipmap，治地面／牆的爬行（A；`FE-W14-S02`）

- [x] 1.1 `pixelate`（`src/world/primitives/pixelTexture.ts`）：`magFilter` 維持 `NearestFilter`；`minFilter` 改成一個
  **使用 mipmap** 的 filter、`generateMipmaps = true`。草地貼圖（`grass.ts`）同步。具體 mipmap 變體（`NearestMipmapNearest`
  vs `NearestMipmapLinear`）由 §4 前後截圖定，先取一個能生 mipmap 的預設。
- [x] 1.2 材質快取契約不破：同 token 同實例、不可變、render loop 不每幀新建 `CanvasTexture`、SSR（無 `document`）退化純色不拋錯 —— 都不動。
- [x] 1.3 判準：`FE-W14-S02` 補斷言 —— `map.magFilter === NearestFilter`、`map.wrapS/T === RepeatWrapping`、
  `map.minFilter` 是 mipmap 變體、`map.generateMipmaps === true`；`carpet` 仍與 `wood` 不同實例。`FE-W14-S03`（SSR 純色不拋錯）不變。

## 2. 開多重取樣，治整片／人物邊緣的閃（C；`FE-W14-S05`）

- [x] 2.1 `WorldCanvas.tsx`：`gl={{ antialias: true }}`（原 `false`）。`dpr={0.25}`、`image-rendering: pixelated` **不動**。
  一行旗標；不引入後處理相依、不加 render target（原生 canvas MSAA，見 `design.md`）。
- [x] 2.2 確認著色預算不退：backing store 仍 dpr `0.25`（≈1/16 fragment），只多多重取樣 buffer 的頻寬 —— MUST NOT 改全解析度。

## 3. 失敗路徑：缺 MSAA／mipmap 不白屏不拋錯（`FE-W14-S09`）

- [ ] 3.1 缺多重取樣（`antialias` 未實作）或某張貼圖無法生 mipmap 時，`/world` 仍出畫面、退化為原本最近鄰無 MSAA／無 mipmap；不白屏、不拋錯。
- [ ] 3.2 判準：`FE-W14-S09` —— 模擬缺能力（stub `gl.getContextAttributes().antialias === false`／貼圖 mipmap 失敗）下畫面照出、無 throw、無白屏。

## 4. 真瀏覽器判準與前後對比（`FE-W14-S05`；web-facing 驗證）

- [x] 4.1 改 `S05` 的既有 e2e：斷言由「`antialias` 關」翻成「drawing buffer 實得 sample 數 `> 1`」；保留「backing store ≈1/4、`image-rendering: pixelated`」。
- [ ] 4.2 走動前後對比：以同一段走位（沿用 `lib/world.mjs` 的 walker）截圖／短錄影，人眼確認「走動時整片＋人物閃」明顯緩解；同時據此定 §1.1 的 mipmap 變體。
  （swiftshader 是否忠實反映 MSAA 由跑的人確認，必要時 headed 真 GPU 覆核 —— 見 `reference` 記憶「headless FPS 不可信用 HEADED=1」。）
- [ ] 4.3 截圖存 `docs/evidence/fe-w14-motion/`（走動前後、桌機寬），自問→**走動不再整片閃、仍是像素風**。

## 5. 收尾

- [ ] 5.1 全套件綠、`typecheck`／`lint` 綠、`openspec validate --strict` 綠、`progress.sh --check` 綠。
- [ ] 5.2 送 codex（gpt-5.6-terra）＋gemini（3.1 Pro）驗成品：原生 canvas MSAA 是否足夠、mipmap 變體選擇、是否需動用手動 FBO 後備。
- [ ] 5.3 部署最新版到正式站（使用者 `vercel --prod`），走查走閘道網址。
