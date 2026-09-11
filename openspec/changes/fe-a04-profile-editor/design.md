# `FE-A04` 設計：難逆轉的決定與代價

## D1｜面板殼從 `ListPanel` 抽出來，不是第二套

`ListPanel` 今天把「阻斷式面板」（section、鎖、focus trap、Escape 層、關閉鈕）跟「清單」綁在一起。這一列需要同一個殼裝別的內容。
抽 `src/panel/PanelShell.tsx`（殼：`aria-label`、`data-testid`、trap、Escape、關閉鈕 → `onClose`）→ `ListPanel` 用它、名片面板也用它。
**抽的時候 `FE-B01`／`FE-X06` 的判準一條都不能動**（那是重構的定義）。
名片面板的開關狀態**不放進 `ListPanelProvider`**（那是看板清單的，塞進去是污染模組邊界 —— 審查抓到的）：`FE-A04` 自己一個
`ProfilePanelProvider`（`open`／`openPanel(opener)`／`closePanel`）。
殼的「關閉意圖」是一個回呼：`onCloseRequest()` —— 名片面板在 dirty／submitting 時攔下它，不是殼自己判斷。

**修正（實作時發現）**：真實頁面裡 `InteractionProvider` 在 `WorldCanvas` **裡面**（client-only、自帶 provider、巢狀會 throw、約 15 個測試直接
`render(<WorldCanvas/>)`），而標題列的 `IdentityBadge` 在它**外面** —— 一個 provider 沒辦法同時被按鈕與鎖看到。兩位審查者一致選：
`ProfilePanelProvider` 放 `page.tsx`（`IdentityProvider` 底下、標題列與 `WorldBoundary` 之上），**只管開關狀態與「關閉後焦點回開啟者」**；
`ProfilePanel` 跟 `BoardPanel` 一樣渲染在 `WorldCanvas` 的 `data-focus-anchor` div 裡（`InteractionProvider` 底下、同一個定位基準），
開著時 `useEffect(() => holdInputLock('profile-panel'))` 持鎖、卸載釋放 —— 鎖晚一個 effect：面板是滑鼠點標題列按鈕開的，不是世界裡的鍵，
沒有「下一個方向鍵」的問題（`ListPanelProvider` 同步持鎖的理由不適用）。拒絕的替代：把 `InteractionProvider` 搬到 `page.tsx`（破壞 `WorldCanvas` 自洽、改 15 個測試）。

## D2｜`TalentDetail` 純呈現，編輯鈕在面板層

`TalentDetail` 不知道「是不是我」；面板知道（它就是「我的」）。別人的名片走 `BoardPanel`，那裡沒有編輯鈕。**不在 `TalentDetail` 加 `editable` prop。**

## D2b｜PATCH 的回應是唯一 canonical

成功後 `adopt(response)` —— 不是把 input 拼進舊身分。`S07` 的「別處更新的 avatar 不被蓋回去」成立的前提是**後端已寫入**那次更新，
所以回應帶的就是最新的 3；兩個寫入真的並行（picker 的 PATCH 還沒回、名片的 PATCH 先回）時後端的 last-write-wins 決定，
前端不做版本合併 —— 今天沒有版本欄位，這是後端票的事（記在 proposal 的不做什麼）。

## D3｜skills 的正規化在 blur／submit（驗證每次輸入都算）

打字中 split 成 chips 會弄壞游標與 IME 組字。一個 input，`onBlur` 與 submit 時 `normalizeSkills()`（純函式，有自己的判準）：
`replace(/，/g, ',').split(',').map(trim).filter(Boolean)`、去重用 NFC ＋ 小寫比、保留第一個的原文。skill 不能含逗號 —— 明寫。
即時那一層（`FE-X05`）對 skills 看的是正規化後的數量與每項長度：Zod schema 對原始字串 `.transform(normalizeSkills)` 再驗 —— 這是純函式，每次輸入算一次便宜；
**替換 input 裡的字串**（把全形逗號、多餘空白洗掉）只在 blur／submit。兩件事分開，不矛盾（審查問到）。

## D4｜payload 是白名單，不是 `dirtyFields`

RHF 有 `dirtyFields` 可以只送改過的欄位；但「送四欄、可空送 null」更簡單也更可測（`S04` 一個形狀）。`avatar_id` 永遠不在裡面（`S07`）。

## D5｜dirty-close 的確認用 `window.confirm` 還是自己的對話？

`window.confirm` 阻斷 event loop、jsdom 裡是 stub、Playwright 要另外接。自己做一個小的確認層（兩個按鈕、Escape 層再疊一層 = 「取消確認」）—— 
Escape 層級剛好處理：確認層在最上，Escape 關它等於「繼續編輯」。

## 待答問題

1. **`PanelShell` 抽出來之後 `ListPanel` 的 diff 有多大** —— 超過 250 行的話拆成「先抽殼（判準不變）」一片。
2. **確認層的文案**（不是規格的一部分，實作時定）。

## 這一份怎麼驗

- `S01`～`S11`：jsdom，整棵樹 `IdentityProvider(mock) > AvatarDraftProvider > ProfilePanelProvider > [ header(IdentityBadge, AvatarPicker), InteractionProvider > ProfilePanel ]`（跟真實頁面同一個形狀），`contract-server` 收 PATCH。
- `S07`：面板開著、表單填好，測試直接 `await saveAvatar(3)`（後端寫入、adopt），再送名片表單，看 body 與最終身分。
- **不連任何外部服務。**
- 驗收不是全綠：payload 帶 `avatar_id` → `S04`／`S07` 紅；成功用 input 不用回應 → `S05` 紅；失敗 reset → `S06` 紅；不確認就關 → `S09` 紅；送出中可關 → `S10` 紅；草稿沿用 → `S11` 紅；去重不分大小寫拿掉 → `S04` 紅。
