## Context

- `formTeam(id, { password })`、`closeProject(id)` 已在 `src/api/operations.ts`（回 `ProjectOut`）。**替身 `internal` 沒有這兩個端點**（只有 `enter`；規格第一版誤寫「已有」，`--actions` 的 e2e 第一次跑才發現）—— `--backend` 片補上，照真後端。
- `ProjectDetail`（`FE-B03`）：owner 推導 `owner_id === me.id`、`ownerActions` 插槽只在 owner 時渲染；`useProjectDetail` 的 `ready` 狀態是 `GET /api/projects/{id}` 的回應。
- `useRooms`（`FE-W12`）：30 秒輪詢、背景停、單飛（`inFlight` 同時是鎖與中止把手）、失敗退 `stale`。在 `WorldCanvas` 裡呼叫；`BoardPanel` 在同一棵樹底下。
- 收件匣（`FE-K01`）：`openThreadFromTalent(withId)` 直接進對話；`ComposeForm` 的 `body` 是 `useForm` 的 `defaultValues`。
- 表單慣例 `FE-X05`：`useForm`（兩層驗證時機、連按只送一次、失敗留值、`SubmitError`）；`DiscardConfirm` 是「確認層」的既有形狀（疊在 overlay 裡、Escape 層、焦點到安全的那顆）。
- `FE-O08` 量到：`form-team` 不驗密碼長度、非 owner 403、重複 form-team 會換密碼；`close` 冪等、座位整批刪、`/api/rooms` 只回 active。

## Decisions

### D1｜動作住在 `FE-B03` 留的 `ownerActions` 插槽；狀態機是 `project.status` 本身

不另設「成軍中／已成軍」的前端狀態：`recruiting` → 顯示「成軍」；`active` → 顯示「結案」；`closed` → 沒有動作。
成功後**詳情拿回應更新**（`useProjectDetail` 多 `replace(project)`，把 `ready` 的資料換成 form-team／close 的回應；不重打 `GET /api/projects/{id}` —— 回應就是伺服器的真相，多一個請求只是多一次可能失敗）。
`FE-J03`（我的案件）之後重用同一個 `OwnerActions` 元件。

### D2｜密碼上限是前端的：4–64 字，`FORM_LIMITS.roomPassword`

後端不驗（`FE-O08` `form-team` 3 字也 200）。太短的密碼讓「走到門前猜密碼」變得可行；太長的密碼隊員貼不進去。4–64：不是帳號密碼，
不做強度規則。跟 `FE-X05` 一樣：`FORM_LIMITS` 裡的數字要說是「本站的上限」，契約不看它。

### D3｜密碼只在成軍成功的那一次詳情裡呈現；不落地、不再顯示

後端不會回密碼（`ProjectOut` 沒有它），所以能呈現的只有 owner 剛剛打的那一串。呈現在成功之後的詳情裡（「複製密碼」、「用私訊寄出」），
**關掉詳情就沒了**：不進網址、不進 storage、不進列表狀態（`FE-N08-S05` 同一條線，`S08` 判準）。忘了密碼的 owner 今天沒有路可以找回
（後端沒有「看密碼」的端點；重複 form-team 會換密碼 —— 不開放，見 Non-goals）—— 這是誠實的限制，寫在畫面上的提示裡。

### D4｜「寄給隊員」= 草稿進剪貼簿 ＋ 開收件匣清單；**不改收件匣、密碼不進 provider**

隊員沒有模型（`BE-G10`），owner 自己知道要寄給誰。第一版設計是把草稿放進 `InboxPanelProvider`、進任一對話時自動填進輸入框 ——
兩位審查者都擋下：「感染下一次點擊」的隱式狀態會把密碼貼給點錯的人；密碼在全域 context 裡活得太久（錯誤回報工具會撈到）；而且要 MODIFIED `inbox` 規格。
改成：把 `「<title>」的房間密碼：<password>` 寫進剪貼簿（`ClipboardPort`），成功才關看板、開收件匣**清單**（既有的 `openList(null)`；開啟者已不在，關閉後焦點回世界錨）；
寫入失敗就不開、說出來、密碼文字留著可選取。密碼只活在 `OwnerActions` 的 local state，詳情一關就沒了。
代價：owner 要自己貼一次（Ctrl+V）；「一鍵」少了半鍵，但貼給誰是 owner 明確的動作。

### D5｜門立即重取：`useRooms` 多 `refresh()`，經 context 交給詳情

`RoomsRefreshContext`（`WorldCanvas` 提供、預設 no-op）：成軍／結案成功後呼叫。`refresh()` 遵守單飛：沒有在飛就立刻 `load()`；有在飛就記 `pendingRefresh`，
那一次**真的結束**（成功或失敗）後再 `load()` 一次 —— 不疊加（`FE-W12-S21` 不變）、不會漏（在飛的那一次可能是成軍之前送出的，回來的是舊的清單）。
**被中止的不算結束**（審查抓到）：切到背景、卸載、`enabled` 變 false 都會 `abort()` 在飛的那一次，它的 `finally` SHALL NOT 消費 pending（否則背景分頁會多打一次、卸載後會 setState）；
這三種情況 SHALL 一併清掉 pending。分頁不可見時呼叫 `refresh()` 是 no-op（回到可見時既有的「立即更新」會打）。重取失敗照既有的 `failed`／`stale`，不回滾成軍／結案。
不用 30 秒輪詢等：demo 的「成軍 → 門長出來」要在一秒內看得到。

### D6｜結案要確認，成軍不用；三個副作用互相獨立

成功之後的順序：先同步 `replace(response)`（詳情、密碼呈現、動作列都從它推導），再各自啟動列表 `reload()` 與 `refreshRooms()`；
兩個重取不互相等待、不互相取消；任一失敗只影響自己（列表照 `FE-B01` 的失敗狀態、門照 `stale`），不回滾詳情、不收回密碼、不重新顯示表單。


結案不可逆（座位整批刪；後端雖然能復活但這裡不開放）→ 確認層（沿用 `DiscardConfirm` 的形狀，文字不同：獨立元件 `CloseConfirm`，不把 `DiscardConfirm` 參數化 —— 兩處文案、兩個安全鍵的方向不同）。
成軍要填密碼本身就是一個明確的動作，不再多一層。

### D7｜效能

`OwnerActions`（表單＋確認層）＋ `FormTeamSchema` 進 board chunk；`useForm`、`zod` 都已載。預期 +2 KB gz 以內；量前後差貼 PR。

## Risks

- 成軍後案子從 `recruiting` 清單消失：列表回第 0 頁重取，詳情仍開著（`selected` 不變）—— 返回列表時那張卡不在了，焦點回不到卡（`ListPanel` 會把焦點放回列表本身，`FE-X06-S13` 的兜底）。判準 `S03` 驗這一點。
  之後要再開那筆詳情（結案）只剩深連結 `?panel=projects&project=<id>`（`FE-B09-S14`），直到 `FE-J03` 我的案件給 owner 一個入口 —— `S09` 就走深連結。
- `refresh()` 打的是 `GET /api/rooms`，跟輪詢同一個端點：`RoomsNotice` 的 `stale` 語意不變。
- 「寄給隊員」的草稿含密碼，只進剪貼簿（使用者授權的例外）；`S08` 用攔截寫入的方式驗 storage、cookie、網址整段流程都沒碰到它（原文與 URL-encoded 都不行）；不得把密碼送進 logging／錯誤回報。
