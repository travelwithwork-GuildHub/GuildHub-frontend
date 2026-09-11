# `FE-A04` 我的名片：顯示與編輯

## Why

名片是媒合的基礎（人才看板上的每一張都是一張名片），而今天**沒有任何地方能改自己的名片**：暱稱在登入時填、外觀在 `AvatarPicker` 選，
技能、每週時數、自介一律是 `null`／`[]`。人才看板上自己那張永遠寫著「未提供」。

不做會怎樣：發表日人才看板上全是空卡；`FE-B04` 的詳情頁沒有內容可看。

## What Changes

- **入口**：標題列 `IdentityBadge` 的名字變成一個按鈕「我的名片」→ 開一個**阻斷式**的 DOM 面板（跟 `ListPanel` 同一套：持世界輸入鎖、focus trap、Escape 層級；關閉後焦點回按鈕）。
- **顯示**：重用 `TalentDetail`（純呈現，`FE-B04`）呈現我的四欄；面板加「編輯」按鈕。**別人的名片沒有編輯鈕**（`TalentDetail` 自己不判斷「是不是我」）。
- **編輯**：`FE-X05` 的 `useForm` ＋ Zod；四欄 `display_name`（1–20）、`skills`（逗號分隔，含全形逗號、trim、去空、去重，≤10 項、每項 ≤40）、
  `hours_per_week`（整數 0–80 或空）、`bio`（≤300）。送 `PATCH /api/profiles/me`，**payload 白名單四欄**（不送 `avatar_id`：`AvatarPicker` 中途改的不被覆蓋）；
  可空欄清空送 `null`、`skills` 清空送 `[]`。**悲觀更新**：成功才 `adopt(identity)`、回到顯示、呈現伺服器回傳的值；失敗留在表單、值不清、可重試。
- **未儲存就關**：有修改時按 Escape／關閉 SHALL 先確認；送出中不可關。面板重開從目前 identity 初始化。

## ⚠️ 討論談定的取捨

- 面板不另開 `/profile` 頁：編輯名片是世界裡的身分操作，跳頁切斷上下文；DOM 負責產品操作。
- skills 用逗號分隔的一個 input（MVP），不做 chips；正規化在 blur／submit，不在打字中 split（游標與 IME）。skill 本身不能含逗號 —— 明寫的限制。
- 錯誤呈現不用 `EmptyState`（那是「整塊內容載不到」）：送出失敗用 `FE-X05` 的 alert；**初次載入名片失敗**才用 `EmptyState failure + retry`。

## ⚠️ 不做什麼

- **SHALL NOT 改 `avatar_id`**（`FE-A05` 的 picker 管）。
- **SHALL NOT 做別人名片的編輯、檢舉、封鎖。**
- **SHALL NOT 做名片的公開／隱藏設定**（`FE-T07`，W13+）。
- **SHALL NOT 樂觀更新。**
- **SHALL NOT 做 skills 的 chips／自動完成。**
