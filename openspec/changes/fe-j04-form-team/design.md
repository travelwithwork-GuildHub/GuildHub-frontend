## Context

- `formTeam(id, { password })`、`closeProject(id)` 已在 `src/api/operations.ts`（回 `ProjectOut`）。替身 `internal` 也有這兩個端點（`FE-O05`）。
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

### D4｜「用私訊寄出」帶草稿開收件匣**清單**，不替 owner 選收件人

隊員沒有模型（`BE-G10`），owner 自己知道要寄給誰。收件匣多一個入口 `openListWithDraft(text)`：關看板（跟「私訊發案者」同一種交接）、開清單、
`draft` 放在 provider；進任一對話時 `ComposeForm` 的初始值是草稿；寄出成功或面板關閉時清掉。草稿內容：`「<title>」的房間密碼：<password>`。
代價：`inbox` spec 要 MODIFIED 一條（入口從兩個變三個）。不做的話「一鍵私訊」就只是「複製密碼」——那樣 WBS 的「一鍵私訊給隊員」是假的。

### D5｜門立即重取：`useRooms` 多 `refresh()`，經 context 交給詳情

`RoomsRefreshContext`（`WorldCanvas` 提供、預設 no-op）：成軍／結案成功後呼叫。`refresh()` 遵守單飛：沒有在飛就立刻 `load()`；有在飛就記 `pendingRefresh`，
那一次結束（成功或失敗）後再 `load()` 一次 —— 不疊加（`FE-W12-S21` 不變）、不會漏（在飛的那一次可能是成軍之前送出的，回來的是舊的清單）。
不用 30 秒輪詢等：demo 的「成軍 → 門長出來」要在一秒內看得到。

### D6｜結案要確認，成軍不用

結案不可逆（座位整批刪；後端雖然能復活但這裡不開放）→ 確認層（沿用 `DiscardConfirm` 的形狀，文字不同：獨立元件 `CloseConfirm`，不把 `DiscardConfirm` 參數化 —— 兩處文案、兩個安全鍵的方向不同）。
成軍要填密碼本身就是一個明確的動作，不再多一層。

### D7｜效能

`OwnerActions`（表單＋確認層）＋ `FormTeamSchema` 進 board chunk；`useForm`、`zod` 都已載。預期 +2 KB gz 以內；量前後差貼 PR。

## Risks

- 成軍後案子從 `recruiting` 清單消失：列表回第 0 頁重取，詳情仍開著（`selected` 不變）—— 返回列表時那張卡不在了，焦點回不到卡（`ListPanel` 會把焦點放回列表本身，`FE-X06-S13` 的兜底）。判準 `S03` 驗這一點。
- `refresh()` 打的是 `GET /api/rooms`，跟輪詢同一個端點：`RoomsNotice` 的 `stale` 語意不變。
- 「用私訊寄出」的草稿含密碼，收件匣關閉就清；`S08` 驗 storage 與網址沒有它。
