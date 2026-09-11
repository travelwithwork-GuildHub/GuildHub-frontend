# `FE-A04` 設計：難逆轉的決定與代價

## D1｜面板殼從 `ListPanel` 抽出來，不是第二套

`ListPanel` 今天把「阻斷式面板」（section、鎖、focus trap、Escape 層、關閉鈕）跟「清單」綁在一起。這一列需要同一個殼裝別的內容。
抽 `src/panel/PanelShell.tsx`（殼：`aria-label`、`data-testid`、trap、Escape、關閉）→ `ListPanel` 用它、名片面板也用它。
**抽的時候 `FE-B01`／`FE-X06` 的判準一條都不能動**（那是重構的定義）。持鎖的地方仍是 `ListPanelProvider`（改名 `PanelProvider`？先不改名，多一個 `openProfile`）。

## D2｜`TalentDetail` 純呈現，編輯鈕在面板層

`TalentDetail` 不知道「是不是我」；面板知道（它就是「我的」）。別人的名片走 `BoardPanel`，那裡沒有編輯鈕。**不在 `TalentDetail` 加 `editable` prop。**

## D3｜skills 的正規化在 blur／submit

打字中 split 成 chips 會弄壞游標與 IME 組字。一個 input，`onBlur` 與 submit 時 `normalizeSkills()`（純函式，有自己的判準）：
`replace(/，/g, ',').split(',').map(trim).filter(Boolean)`、去重用 NFC ＋ 小寫比、保留第一個的原文。skill 不能含逗號 —— 明寫。
即時那一層（`FE-X05`）對 skills 看的是正規化後的數量與每項長度（每次輸入算一次，便宜）。

## D4｜payload 是白名單，不是 `dirtyFields`

RHF 有 `dirtyFields` 可以只送改過的欄位；但「送四欄、可空送 null」更簡單也更可測（`S04` 一個形狀）。`avatar_id` 永遠不在裡面（`S07`）。

## D5｜dirty-close 的確認用 `window.confirm` 還是自己的對話？

`window.confirm` 阻斷 event loop、jsdom 裡是 stub、Playwright 要另外接。自己做一個小的確認層（兩個按鈕、Escape 層再疊一層 = 「取消確認」）—— 
Escape 層級剛好處理：確認層在最上，Escape 關它等於「繼續編輯」。

## 待答問題

1. **`PanelShell` 抽出來之後 `ListPanel` 的 diff 有多大** —— 超過 250 行的話拆成「先抽殼（判準不變）」一片。
2. **確認層的文案**（不是規格的一部分，實作時定）。

## 這一份怎麼驗

- `S01`～`S11`：jsdom，整棵樹 `InteractionProvider > ListPanelProvider > IdentityProvider(mock) > AvatarDraftProvider > header(IdentityBadge, AvatarPicker) + ProfilePanel`，`contract-server` 收 PATCH。
- `S07`：先 `AvatarPicker` 選第 3 款（走 `saveAvatar`），再送名片表單，看 body 與最終身分。
- **不連任何外部服務。**
- 驗收不是全綠：payload 帶 `avatar_id` → `S04`／`S07` 紅；成功用 input 不用回應 → `S05` 紅；失敗 reset → `S06` 紅；不確認就關 → `S09` 紅；送出中可關 → `S10` 紅；草稿沿用 → `S11` 紅；去重不分大小寫拿掉 → `S04` 紅。
