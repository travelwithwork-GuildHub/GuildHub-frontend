## Context

- 後端 `POST /api/projects`（`ProjectCreate`：`title`、`body`、`needed_skills[]` 預設 `[]`、`seat_count` 預設 4）→ `201 ProjectOut`
  （`status=recruiting`、`room_template=null`、`expires_at` 是資料庫預設 `now()+7 days`）。**不驗任何長度與範圍**
  （`FE-O08` 的 `create-unvalidated`，anomaly、已送回後端）。
- `GET /api/projects` 依 `updated_at desc`、預設 `status=recruiting`、每頁 20、無 total（`FE-B01`／`FE-O08` 的 `list-default-recruiting`）。
- 前端已有：`createProject` operation（`src/api/operations.ts`）、`FORM_LIMITS.projectTitle`／`projectBody`／`skillCount`／`skillLength`
  （`FE-X05` 第二輪定案的數字，當時就為案件訂的）、`useForm`＋`SubmitError`（`FE-X05`）、`normalizeSkills`（`FE-A04`）、
  `DiscardConfirm`（`FE-A04`）、`ListPanel` 的 `overlay` 插槽（`FE-B04` 詳情用的：列表不卸載、`inert`）。
- `internal` 替身有 `GET /api/projects`、沒有 `POST`；契約套件把它列在 `contractUnimplemented`，`FE-O03-S05` 驗它回 Next 的 405。

## Decisions

### D1 入口在案件面板的列表上方，不在世界物件上

「發案」是一顆按鈕，放在專案看板按 E 開出來的 `ListPanel` 裡、列表的上方，只在 `identity.state === 'signed-in'` 時渲染
（訪客按 E 拿到的是 `FE-X04` 的權限阻擋，那裡已經有「先登入」的話；再放一顆按不下去的「發案」是第二個入口）。

不放在 3D 看板上：那是 `FE-W20`（看板摘要、不開面板也看得到）的範圍，它來的時候可以把同一個動作接上去。
**不放在標題列**：標題列今天是身分的地方，發案是看板的事。

### D2 表單住在 `ListPanel` 的 `overlay`，成功後「回第 0 頁重取」，不做樂觀插入

跟 `FE-B04` 的詳情同一個插槽：列表不卸載、`inert`，關掉表單時頁碼與捲動位置都還在（丟棄的那條路要用得到）。

成功之後列表 SHALL **回到第 0 頁、重新向伺服器取**，而不是把 `ProjectOut` 插進目前的畫面：
- 後端依 `updated_at desc`，剛建的案子**一定**在第 0 頁第一筆 —— 重取便宜而且是真相。
- 樂觀插入會讓 `FE-B01` 的「晚到的回應不得覆蓋畫面」（`S15`）多一種例外（一筆不屬於任何 request identity 的項目），
  之後 `FE-B02`／`FE-W20` 都要繞它。
- 使用者在第 3 頁發案：插在第 3 頁是錯的（它屬於第 0 頁）；回第 0 頁才對，而且看得到自己的案子。

實作：`paging.ts` 加一個事件 `{ type: 'reload' }`（identity 換成 `{kind, page: 0}`、`phase: 'loading'`、`shown: null`），
`useListPage` 回 `reload()`，`ListPanel` 用 render-prop 交給 overlay（`overlay: ReactNode | ((slot: { reload }) => ReactNode)`）
或由 `BoardPanel` 經 `page`／`onShownPage` 的既有通道走 —— **實作時二選一，判準只看結果**：成功後列表 `aria-busy`
一次、然後第一筆是新案的標題、`FE-B09` 的網址頁碼是 0。

### D3 四個欄位、上限全部是前端的；座位數的 8 不是拍腦袋

| 欄位 | 送出的鍵 | 上限 | 來源 |
|---|---|---|---|
| 標題 | `title` | 1–60 字（code point） | `FORM_LIMITS.projectTitle`（`FE-X05` 第二輪定案） |
| 內容 | `body` | 1–2000 字 | `FORM_LIMITS.projectBody` |
| 需要的技能 | `needed_skills` | 最多 10 項、每項 1–40 字；逗號分隔、`normalizeSkills` 去空去重 | `FORM_LIMITS.skillCount`／`skillLength` |
| 座位數 | `seat_count` | 整數 1–8，預設 4 | **新** `FORM_LIMITS.seatCount`；`max` 由 `LIMITS.seatIndex.max + 1` 推導 |

座位數的 8：房間模板恰好八個工位（`project-room-layout`：`seat_index` 0–7，`LIMITS.seatIndex` 有後端出處 `seat_in_range`）；
後端 `claim_seat` 對超出 `seat_count` 的格子回 400「這個房間只有 N 個座位」—— 建一個 `seat_count=9` 的案子，第 9 格永遠坐不到。
1 是下限：0 座位的案子成軍後沒有人坐得下（後端不擋，前端擋）。**`max` 寫成 `LIMITS.seatIndex.max + 1`，不寫死 8**：
模板加格子時只改一處。`FORM_LIMITS` 的 `S11` 判準（只覆蓋後端沒有上限的欄位）仍成立：`LIMITS` 沒有 `seatCount`。

沒有的欄位（Open Role、期程、預算、截止日）**不出現在表單上**，連 disabled 的都不放（WBS 順序節的規則 3）。

驗證時機照 `FE-X05`：超上限即時（`too_big`／`custom`）且送出禁用；必填／太短（`too_small`）送出才說；
座位數的範圍用 `refine`（即時），跟 `hours_per_week` 同一個理由（`.min()` 是 `too_small`、會被延後）。

### D4 技能欄沿用 `normalizeSkills`，不搬檔

`src/projects/projectRules.ts` 直接 `import { normalizeSkills, joinSkills } from '@/profile/normalizeSkills'`。
搬到 `src/forms/` 會動 `FE-A04` 的檔案與判準；兩份會漂。`FE-O21` 的邊界只管 `src/server`／契約／`src/api`，這個相依不在禁止之列。
名片與案件的技能是同一種字串（人才頁比對用的就是它們），正規化規則一致是對的。

### D5 未送出就關要確認：三種關閉意圖走同一條路

取消鈕、Escape、殼的關閉鈕都會關掉表單。有輸入（任一欄跟預設值不同，座位數 4 不算）時 SHALL 先開確認層
（`DiscardConfirm`，殼的 overlay 換成它、表單 `inert`）：「丟棄」回列表、「繼續編輯」回表單。乾淨時直接關。
送出中三種關閉都無效（`FE-A04-S10` 同一條規則）。

實作照 `FE-A04` 的形狀，**dirty 與送出中的判斷留在表單裡**：`CreateProjectForm` 收 `closeIntentRef`（殼的 Escape／關閉鈕與自己的取消鈕都走它的 `requestClose`：送出中 → 無效；dirty → `askDiscard()`；否則 → `onDone()`），
`BoardPanel` 的 `onClose` 只做顯式分支 —— `const requestClose = closeIntentRef.current; if (requestClose) requestClose(); else closePanel()` ——
並持有「確認層開著沒有」這一個布林。**不得寫成 `closeIntentRef.current?.() ?? closePanel()`**：`requestClose()` 回 `void`，`??` 右邊照樣執行，
dirty 確認與送出中不可關全部被繞過（codex 審查抓到的；`S07` 對殼的關閉鈕有判準）。
不把 dirty 提升到 `BoardPanel`：那會讓每打一個字整個 `ListPanel` 重繪（Gemini 審查抓到的，跟 3.5 的 `closeIntentRef` 形狀也矛盾）。`PanelShell` 不改。

### D6 替身補 `POST`，跟真後端一樣不驗；但「不驗」不進契約套件

`src/server/projects.ts` 加 `insertProject(owner, input)`；route 用既有的 `handle()`＋`contract.ProjectCreate` 解析
（型別錯 → 422，形狀 `S03`）。**不多驗長度與範圍** —— `internal-backend` 既有規則「handler SHALL NOT 自行檢查長度上限」，
而且契約套件同一份測試對兩個目標各跑一次，替身多驗一條就分岔。`create-unvalidated` 仍是送回後端的 anomaly；
前端不依賴它（表單守住），也不開放它（使用者送不出空標題）。`expires_at`：資料庫預設值（`db/schema/001_schema.sql:40` 已有 `now() + interval '7 days'`），跟真後端一樣不在應用層算。

`contractUnimplemented`（`internal`）拿掉 `POST /api/projects`；`FE-O03-S05` 的清單改成只剩 `GET /api/projects/{id}/seats`。

**刻意不寫「空 title／`seat_count` 0 或 9 → 201」的契約 Scenario**（codex 建議加、這裡拒絕）：契約套件在 CI 對 `internal` 跑，
那條會把 anomaly 釘成替身的**義務**；`FE-O08` 的決定是 anomaly 只住在演練帳（`create-unvalidated`，對真後端跑、後端改了會紅、
紅的意思是重新分類），不進替身。所以 Requirement 裡**沒有**「SHALL NOT 驗長度與範圍」這句（codex 第二輪指出：寫成 SHALL 又不給判準是自相矛盾）——
替身「只解析型別」是這裡的實作決定，不是規範義務；使用者面向的保護在表單（`S03`），跟替身驗不驗無關。

`expires_at`：Requirement 只寫行為（建立時刻 ＋7 天 ±5 分），資料庫預設值是實作位置、不是判準。

### D7 效能

表單＋schema 進 `/world` 的 board chunk（`BoardPanel` 已經是 client component）。預期 +2～4 KB gz（react-hook-form 與 zod 已在
名片編輯那裡載了）。量 `/world` 首屏 JS 前後差貼 PR；超過 +10 KB 就改 `next/dynamic` 延後載表單。

## Risks

- 真後端 `GET /api/projects` 只回 `recruiting`：新案一定是 recruiting，沒問題；但之後 `FE-J04` 成軍後它會從這個列表消失 —— 那是 `FE-J04` 要交代的。
- 房間模板 8 格與 `seat_count` 上限的耦合寫在 `FORM_LIMITS.seatCount` 的推導與註解裡；模板改格數時 `S11` 判準會提醒。
