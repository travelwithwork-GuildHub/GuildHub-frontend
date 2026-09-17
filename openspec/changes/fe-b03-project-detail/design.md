## Context

- `GET /api/projects/{id}` → `ProjectOut`（closed 也 200；不存在 `404 {"detail":"專案不存在"}`；未登入 401）。替身與真後端一致（`FE-O08`）。
- `GET /api/profiles/{owner_id}` → `ProfileOut`（既有；`TalentFacts` 是「一張名片的純呈現」，`FE-A04` 抽出來的）。
- 人才那一支已經有整套形狀：`useProfileDetail`（identity = id、中止前一個、失敗不冒充成功）、`TalentDetail`（overlay、返回鈕、Escape 層、焦點）、
  `ListPanelProvider.selected`／`selectProfile`、`urlState` 的 `profile`、`PanelUrlSync` 的層數（世界 0、清單 1、詳情 2）。
- 收件匣 `FE-K01`：`InboxPanelProvider.openThreadFromTalent(withId)`、`SendMessageButton`（只在 signed-in、對方不是我、有 provider 時長出來）。
- 案件卡 `FE-B02`：`<article>`、`now` 必填；`ListPanel.renderItem(item, { fetchedAt })`。

## Decisions

### D1｜詳情的載入沿用 `useProfileDetail` 的形狀，但**不**抽成泛型 hook

`useProjectDetail(id, preview)`：identity = `id`、`id` 換了在繪製期間重來、effect 清理中止前一個、被中止的 rejection 不進狀態、`phase` 決定畫面。
跟 `useProfileDetail` 是同一套紀律，**刻意複製一份而不是抽 `useDetail<T>(fetch)`**：兩個 hook 各 80 行，抽泛型要把 `getProfile`／`getProject`
的簽名、預覽型別、錯誤型別都參數化，而第三個消費者還沒有。等 `FE-J03`（我的案件）或 `FE-K05` 出現第三份再抽（Rule of three）。

### D2｜發案者名片是獨立的載入單元，不併進案子本體的 phase

詳情要打兩個端點（案子、發案者）。兩種併法：
- 合成一個 phase：任一失敗整份詳情畫成失敗 —— 發案者名片載不到（例如那張名片被移除 → 404）會讓**案子本身明明拿到了**卻看起來像壞了。
- **各自獨立（選這個）**：案子本體先到先畫；發案者那一塊有自己的 `data-phase`，失敗時只有那一塊是 `FE-X04` 的失敗狀態、可重試。

`OwnerCard`（`src/projects/OwnerCard.tsx`）：拿 `owner_id`，內部用 `useProfileDetail(owner_id, undefined)`（**直接重用**，不複製），成功畫 `TalentFacts`
的精簡版（名字＋外觀色＋技能；`bio`、時數、更新時間不放 —— 那是人才詳情的事，這裡要回答的是「誰發的」）。

### D3｜動作列：owner 給標示與插槽，不給按下去沒反應的按鈕

WBS 逐字：「owner 看到成軍／結案的入口（動作本身在 `FE-J04`）」。「入口」在這一份的解釋是：**owner 看得出這是自己的案子**（`owner_id === me.id` 的推導，
不另設狀態），而且詳情有一個 `ownerActions` 插槽讓 `FE-J04` 把成軍／結案接進來。這一份不渲染成軍／結案按鈕 —— 跟 `FE-B02` D1 同一個理由：
沒有 handler 的控制項對鍵盤與螢幕閱讀器使用者是騙人的。判準驗「owner 看到標示、非 owner 看不到；這一份沒有成軍／結案／應徵／收藏／檢舉的控制項」。

非 owner 且已登入：「私訊發案者」= `SendMessageButton`（`FE-K01`）換標籤（`label` prop，預設仍是「寄信給他」）；它自己會處理「訪客／自己不長出來」。

### D4｜網址：`project=<id>` 跟 `profile=<id>` 平行，一次只會有一個

`PanelUrlState` 多 `project: string | null`（只在 `panel === 'projects'` 時非 null）。canonical 規則對稱於 `profile`：`panel=projects` 帶 `profile` → 去掉 `profile`；
`panel=profiles` 帶 `project` → 去掉 `project`；單獨的 `project` → 視為 `panel=projects`；同時單獨帶兩個 → `profile` 贏（`panel=profiles`，去掉 `project`）—— 要有一個確定的答案，選既有的那個。
`depthOf` 把 `project` 算成第 2 層。`ListPanelProvider.selected` 的語意改成「開著的面板裡選中的那一筆」（人才或案件），`selectProfile` 保留、
多 `selectProject`（各自只在對應的面板下有效）。

### D5｜卡片變控制項：`FE-B02-S08` 被取代

`ProjectCard` 的根從 `<article>` 換成 `<button type="button">`，`onOpen(id)`；`FE-B02` 的「非互動」句子由 MODIFIED 換掉；`S08` 的標題是不改的鍵（validator 拒絕在 MODIFIED 裡丟掉既有 Scenario），
內容改成「整張卡是唯一的控制項、裡面不能再有第二個」；「卡片是控制項」另立 Requirement（照 `FE-B04`〈卡片是控制項〉那條寫）。`data-testid`／`data-project-id` 不變 —— 既有 e2e 與 `create-project.test.tsx` 讀的節點都還在。

### D6｜效能

詳情＋發案者名片＋hook 進 board chunk（`BoardPanel` 已在）；`TalentFacts`、`EmptyState`、`useProfileDetail` 都已載。預期 +2 KB gz 以內；量前後差貼 PR。

## Risks

- `GET /api/projects` 只回 `recruiting`；深連結 `?panel=projects&project=<closed 的 id>` 詳情仍會開（closed 也 200）而列表裡沒有它 —— 這是對的（詳情一律打 id，不依賴列表）。
- 兩個端點各自獨立，判準要成對：發案者 404 時案子本體仍是 `ready`（`S07`）；案子 404 時發案者**不打**（沒有 `owner_id`）。
