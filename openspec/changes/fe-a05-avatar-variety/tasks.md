# `FE-A05` 外觀變多、首次進入隨機發一款 —— 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-a05-avatar-variety` 合併進 main）
      → PR #526，三輪雙審（codex 三輪 APPROVE、Gemini 一／二／三輪 APPROVE），合併 `893aa8c`

## 2. 判準先紅

- [x] 2.1 `tests/avatar-look.test.ts` 補 `S14`（八組兩兩不同、`av=7` 有效、`av=8` 回預設）與 `S15`（前兩款色碼不變，從 `worldColor` 讀）（Requirement〈`av` 決定角色的外觀…〉）
      → `tests/avatar-look.test.ts` 加兩條
- [x] 2.2 `tests/e2e/avatar-pixels.mjs` 擴成八個 `av`、二十八對 `stableDiff ≥ SIGNAL_FLOOR`＋差異包圍盒高度 ≥ 角色高 1/3（`S16`）（Requirement〈兩款外觀之間的差異…〉）
      → `avatar-pixels.mjs` 加 S16 段：八個 av 各抓穩定幀、28 對 stableDiff ≥ 500 ＋ 包圍盒高 ≥ 角色高 1/3（角色高拿「沒鄰居 vs 一個鄰居」的包圍盒 88 px）
- [x] 2.3 jsdom `tests/identity-random-avatar.test.ts`：`S21`（注入亂數 0／0.999／0.5 → 0／7／4；款數 3 → 0／2／1；沒注入時 spy `Math.random` 回 0.5 → 呼叫一次、送 4）、`S19`（金鑰／密碼登入不呼叫 `updateMyProfile`）、`S20`（`PATCH` 失敗回原 profile、只送一次）（Requirement〈首次建立身分時隨機指派一款外觀〉）
      → `tests/identity-random-avatar.test.ts` 6 條（真的契約 server）；款數 3 用 `vi.doMock` 換映射再載入 session
- [x] 2.4 真瀏覽器 `tests/e2e/first-entry.mjs`（或新 `avatar-assign.mjs`）：`S17`（暱稱建立 → 恰好一次 `PATCH`、body 只含 `avatar_id` 0～7、`PATCH` 回應先於 `/world` 導覽、進世界後自己的外觀是那一款）、`S18`（註冊，同一組斷言）、`S19`（金鑰回來零次 `PATCH`）、`S20`（500 仍進世界、無錯誤視窗、不重送）
      → 新 `tests/e2e/avatar-assign.mjs`（真 internal 後端）15 綠：S17 建立那一步就 PATCH、回應早於 /world 導覽、/api/me 對得上；S18 註冊；S19 金鑰與帳號密碼各零次；S20 500 仍進世界、只算有字的 alert、不重送
- [x] 2.5 `tests/avatar-picker.test.tsx`（既有）把「恰好兩個」的斷言改讀映射的款數；補 `S22`（選項數＝款數、色票＝軀幹色、選第八款送 7）；`tests/e2e/avatar-picker.mjs` 補 `S23`（1280 與 1024 寬選擇器與八個選項都在視窗內）（Requirement〈選擇器列出每一款〉）
      → `avatar-picker.test.tsx` 加 S22；`avatar-picker.mjs` 加 S23（1280／1024 各一次，八個選項與選擇器都在視窗內，右緣 989）

## 3. 實作

- [x] 3.1 `src/design/world.ts`：`avatarBody3`～`avatarBody8`、`avatarLimb3`～`avatarLimb8`（色相繞色環；四肢同色系深一階）；`src/design/avatar.ts`：`LOOKS` 八組、`AVATAR_COUNT = 8`
      → 第八款原本石板灰，跟綠只差 510 像素 → 換天藍；最小對變 1071（藍／紫）
- [x] 3.2 `src/identity/session.ts`：`SignInOptions.random`（預設 `Math.random`）；`assignRandomAvatar()`；`signInWithNickname`／`registerAccount` 成功後呼叫，失敗回原 profile；金鑰／密碼路徑不動
- [x] 3.3 `src/app/world/AvatarPicker.tsx`：選項容器 `flex-wrap`、選擇器 `max-w-full`

## 4. 驗證

- [x] 4.1 突變：`AVATAR_COUNT` 改回 2 → `S14`／`S22` 紅；某兩款同色 → `S14`＋`S16` 紅；亂數來源不呼叫（固定 0）→ `S21` 的「恰好呼叫一次」紅；預設來源改成 `() => 0`（保留注入路徑）→ `S21` 的 spy 那一半紅；金鑰路徑也 `PATCH` → `S19` 紅；失敗時重試 → `S20` 紅；`Math.floor(r × 8)` 寫死 8 → `S21` 的款數 3 那一半紅；拿掉 `flex-wrap` → `S23` 紅；`PATCH` 不 await 就導向 → `S17` 的順序紅
      → 9 個突變：8 個紅（見 PR 留言）；拿掉 `flex-wrap` **綠** —— 八個選項在 1024 寬只佔 ~770 px，不換行也放得下；規格的兩個寬度量不到它，留著當更窄視窗的防禦，PR 內文明說
- [x] 4.2 `S16` 二十八對的最小 `stableDiff` 貼 PR（design 待答）
      → 28 對最小 stableDiff：1071（av 0／4）；換色前 510（av 1／7）
- [x] 4.3 截圖 `docs/evidence/fe-a05-variety/`：八款並排（八個遠端玩家各一款）、選擇器 1280 與 1024
      → `docs/evidence/fe-a05-variety/`：eight-looks（八個遠端各一款）、picker-1280、picker-1024、assigned
- [x] 4.4 效能影響（`/world` JS／CSS gz；首次進入多一個 `PATCH` 的 RTT）貼 PR
