## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o14-drop-preview-notice` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-o14-drop-preview-notice --strict` 通過且 PR 已合併

## 2. 測試先改（對應 `FE-O14-S11`／`S12`）

- [ ] 2.1 `S09` 改寫成 `S11`：`none` 時**載入中的狀態已經消失**
      （正向控制，design 的 D4）**且**畫面文字不含那三個詞
- [ ] 2.2 `S10` 改寫成 `S12`：`guildhub`、socket 工廠**確實被呼叫過**、
      回報 close 而 `open` 從未觸發 → 文字仍然不含那三個詞
- [ ] 2.3 **MUST NOT 用 `queryByRole('status')` 當判準**（design 的 D2 ——
      `status` 在這個世界已經有兩個合法使用者）
- [ ] 2.4 `S07`／`S08` 兩條**不動**

## 3. 正式碼

- [ ] 3.1 `WorldCanvas` 移除 `<SinglePlayerNotice />` 與那個 import
- [ ] 3.2 刪除 `src/world/SinglePlayerNotice.tsx`
- [ ] 3.3 `grep -rn "SinglePlayerNotice\|single-player-notice" src tests` 回空

## 4. 負向驗證

**驗收條件不是「測試全綠」，是「把防禦拿掉，測試要變紅」。**
**兩條 Scenario 的突變不同**（design 的 D3 —— 初稿在這裡是自我矛盾的）。

- [ ] 4.1 把 `<SinglePlayerNotice />` 加回 `WorldCanvas` → **`S11` 要紅**
      （`S12` 不會紅，因為那個元件在 `guildhub` 時回 `null`）
- [ ] 4.2 在 `WorldCanvas` 加一段**無條件**顯示「目前是單人預覽」的元素
      → **`S12` 要紅**（`S11` 也會紅，沒關係）
- [ ] 4.3 把 `S11` 的正向斷言拿掉、`WorldCanvas` 回傳 `null` → `S11` 仍然綠
      （證明那個正向控制是必要的；做完還原）
- [ ] 4.4 把 `S12` 的「工廠確實被呼叫過」那句拿掉、並讓測試不觸發連線路徑
      → `S12` 仍然綠（證明那句不能省；做完還原）

## 5. 部署

- [ ] 5.1 `npm run lint && npm test && npm run build` 全綠
- [ ] 5.2 `vercel --prod`，然後開 `/world` 確認那段字不見了、世界還在（design 的 V4）
