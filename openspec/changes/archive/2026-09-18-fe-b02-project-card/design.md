## Context

- `ProjectOut`（`src/api/contract/rest.ts`）：`id`、`owner_id`、`title`、`body`、`needed_skills: string[]`、`status: recruiting|active|closed`、
  `room_template: number|null`、`seat_count`、`expires_at`（ISO）、`updated_at`（ISO）。Zod 解析過，時間一定是合法的。
- 列表來自 `GET /api/projects?page=N`：`updated_at desc`、預設只回 `recruiting`、**過期的（`expires_at <= now()`）不出現**（替身與真後端一致）。
- 人才卡 `TalentCard`（`FE-B04`）與 `TalentFacts`（`FE-A04`）是這個 repo 裡「卡片」的既有形狀：`data-testid`、技能 chip 的樣式、`Missing` 的 `data-missing` 節點。
- `ui-ux-pro-max`（`--domain ux`）給的三條要守：狀態**不能只靠顏色**（Color Only，High，進了 `S02`）；chip 標籤要單行不換行、只把不可預測的值截斷
  （Compact Label Overflow，High —— **這一條沒有 Scenario**，jsdom 量不到換行；實作用 `whitespace-nowrap`，pre-delivery checklist 目視）；對比 4.5:1（沿用既有 token）。

## Decisions

### D1｜卡片是純呈現的 `<article>`，控制項留給 `FE-B03`

`FE-B04` 的人才卡是 `<button>`，因為同一個 change 就做了詳情。這裡詳情還沒有：做成按鈕會是一顆按下去沒反應的控制項，
鍵盤使用者 Tab 到它、按 Enter、什麼都沒發生 —— 比不可聚焦更糟。所以這一份是 `<article>`，`FE-B03` 以 MODIFIED 把
「卡片是可聚焦的控制項、開那一筆的詳情」加上去（照 `FE-B04` 的那條寫）。

這個取捨要能被驗：Requirement 明寫「非互動、不可聚焦、沒有按鈕／連結」，`S08` 驗根節點是 `article` 且卡片內可聚焦元素的查詢為空（否則做成 `div role="button"` 全綠）。
代價：`FE-B03` 要動同一個檔案、同一條 Requirement（以 MODIFIED 拿掉 `S08`、加上事件、焦點、Enter／Space、選中 id 與詳情失敗路徑 —— 不只是換一個 tag）。可接受，那本來就是它的範圍。

### D2｜剩幾天：`ceil` 到天、以呈現時刻算一次、`now` 可注入

`daysLeft(expiresAt, now) = ceil((Date.parse(expiresAt) − now) / 86_400_000)`：
- 剛建的案子 `expires_at = now + 7 天`（差幾秒）→ `ceil` 給 7、`floor` 給 6。「建立後 7 天」的案子第一眼就寫 6 天是錯的，所以是 `ceil`。
- 剩 2 小時 → 1 天。粒度是「天」，不寫「小時」—— 那是倒數計時器的事，看板不是。「天」是 24 小時的期間（`86_400_000` ms），不是日曆日：不看時區、不看 DST。
- `≤ 0` → 「已到期」，**含恰等於 `now`**（寫成 `< 0` 會印「剩 0 天」，`S03` 釘住）。列表本來就過濾掉過期的，但卡片是通用元件（`FE-J03` 我的案件會拿到自己過期的案子），不能印「剩 -3 天」。

`now` 是 prop（預設 `Date.now()`），判準才能把時鐘釘住；不裝計時器（Non-goal）。呈現用 `<time dateTime={expires_at}>` 包住，機器讀得到絕對時間。

### D3｜狀態文字只有一份，而且是文字

`projectStatus.ts` 匯出 `PROJECT_STATUS_LABEL: Record<ProjectStatus, string>`。三個 change 之後要用同一份（`FE-B03` 詳情、`FE-J03` 我的案件、
`FE-J04` 成軍／結案後的回饋）；各寫一份的話「已成軍」在一個地方會變成「進行中」。

只用文字、不用顏色區分（`ui-ux-pro-max` Color Only）。要加顏色的話是**加在文字上**，不是取代。

### D4｜`needed_skills` 為空是「未指定」，不是空白

後端 `needed_skills` 預設 `[]`（`FE-J01-S09`），所以空陣列是常態、不是缺資料。但卡片要讓人一眼判斷「要什麼技能」，
一片空白讀不出是「發案者沒指定」還是「沒載到」。用 `Missing` 的形狀（`data-missing="needed_skills"`）標成「未指定」——
機器可辨識（屬性）而且人讀得到（可見文字）。`Missing` 今天永遠印「未提供」；「未提供」是「這個人沒填」，「未指定」是「發案者沒有指定技能」（只陳述事實，不推論成「不限」——資料證明不了那個語意），兩個意思不同，
所以 `Missing` 多一個 `label` prop（預設仍是「未提供」，人才卡與名片不變），不另寫元件。判準同時驗屬性與文字（codex 抓到「只找屬性」會讓印「未提供」的實作過）。

### D5｜效能

一個純呈現元件加一個常數表，進 `BoardPanel` 已在的 board chunk；不引入新套件、不用 `Intl.RelativeTimeFormat`（算術就夠，而且它的
「7 天後」語意跟這裡的「剩 7 天」不同）。預期 +1 KB gz 以內；量 `/world` 首屏 JS 前後差貼 PR。

## Risks

- `GET /api/projects` 只回 `recruiting`，所以在看板上 `S02` 的三種狀態只有單元判準看得到；真瀏覽器那條只驗得到「招募中」。
  `FE-J04` 成軍後那張卡會從看板消失（不是變成「已成軍」）—— 那是 `FE-J04` 要交代的，這裡的卡片不假設。
- `create-project.mjs` 今天用整個 `li` 的 `textContent` 跟標題比；卡片上有更多字之後那條會紅 —— 改讀卡片的標題節點（`tasks 3.3`）。
