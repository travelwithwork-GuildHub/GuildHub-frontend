# `FE-A05` 外觀變多、首次進入隨機發一款 —— 設計

## D1｜八款仍是顏色組合，色票住在 `src/design/world.ts`

`ChibiPlayer` 的 mesh 結構不動（`FE-W19-S12`），八款＝八組 `{skin, body, limb, ink}`。前兩款原封不動（`avatarBody`／`avatarLimb`、
`avatarBodyAlt`／`avatarLimbAlt`），新增六組軀幹／四肢的 token（`avatarBody3`～`avatarBody8`、`avatarLimb3`～`avatarLimb8`），
色相繞色環分開（藍、綠、紅、琥珀、紫、青、粉、棕），四肢一律是同色系深一階（跟 `av=1` 的做法一樣）。
皮膚與眼睛八款共用 —— 差異落在軀幹與四肢（主要部位），符合〈差異落在主要視覺部位〉。
**不選**「改皮膚色」：膚色的變化在這個尺寸的 chibi 上跟軀幹比不夠顯眼，而且會踩到「膚色當作差異化手段」的敏感區。
**代價**：八款只靠軀幹色分，兩款相鄰色相（例如紅與粉）在遠處的辨識度靠像素判準守（`S16`）。

## D2｜隨機指派寫在 `signInWithNickname`／`registerAccount` 裡，亂數注入

`src/identity/session.ts` 的這兩個函式在 `login`／`register` 成功後、回傳 `Identity` 之前，呼叫 `assignRandomAvatar(random)`：
`Math.floor(random() * AVATAR_COUNT)` → 既有的 `saveAvatar(av)`（它已經做值域檢查、無條件帶 `avatar_id`、不送 null）。
成功 → 回傳更新後的 profile；失敗 → 回傳原 profile（`S20`），不重試、不拋。`random` 是 `SignInOptions` 的選項，預設 `Math.random`
—— 單元判準注入固定序列（`S21`）。
**為什麼在這裡而不是在 UI**：兩個入口（首次進入流程、`/login`）都走同一個函式，UI 各做一次會漏一邊。
**為什麼不改後端讓 login 收 `avatar_id`**：後端不在這個 repo；多一次 `PATCH` 的代價是一個 RTT（本機 ~5 ms、正式站 ~100 ms），
發生在「按下進入世界」之後、導向之前，使用者感覺不到（金鑰交接畫面本來就在那裡）。
`signInWithRecoveryKey`／`signInWithPassword` **不碰**（`S19`）。

## D3｜導向等儲存結束

呼叫端本來就是 `await signInWithNickname(...)` 之後才導向 —— 把 `PATCH` 放在函式裡面就自然成立（〈併發〉那一條）。
判準：`S17` 在真瀏覽器記錄請求順序（`PATCH` 的回應先於 `/world` 的導覽）。

## D4｜選擇器換行

`AvatarPicker` 的選項容器從 `flex gap-2` 改 `flex flex-wrap gap-2`、選擇器 `max-w-full`；不改結構。`S23` 在 1280 與 1024 寬各量一次矩形（審查提醒 `left-0` 可能往右超出：紅了就改對齊）。

## 驗證方式（不進 Requirement）

- `S16`：沿用 `FE-W19` design V1 的像素法（`tests/e2e/avatar-pixels.mjs` 的 `burst`／`stableDiff`、`SIGNAL_FLOOR = 500`）：
  八個 `av` 各抓一組穩定幀，二十八對兩兩 `stableDiff ≥ SIGNAL_FLOOR`；主要部位那一句用「差異像素的包圍盒高度 ≥ 角色高度的 1/3」（眼睛只佔 0.13）。
- `S14`／`S15`：jsdom 對 `avatarLook()`；`S15` 的「擴充前」用兩款的色碼快照（從 `worldColor` 讀，不寫字面色碼）。
- `S17`～`S20`：真瀏覽器 `page.route` 記 `PATCH` 的次數與 body（`first-entry.mjs` 那套偽造）；`S21`／`S22` jsdom。

## 待答（實作量出來）

- 八款在 swiftshader 下的 28 對 `stableDiff` 最小值是多少 —— 低於 `SIGNAL_FLOOR` 的那一對要換色，不是調門檻。
