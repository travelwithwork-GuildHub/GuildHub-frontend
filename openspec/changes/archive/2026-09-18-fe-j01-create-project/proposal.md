## Why

後端 `c6f3928` 有 `POST /api/projects`，前端 `src/api/operations.ts` 也接了 `createProject`，
但**畫面上沒有任何地方能發案**。今天世界裡的案件全部是 seed 灌的：demo 的閉環
（取名 → 發案 → 看板 → 詳情 → 成軍 → 門 → 進房坐位 → 結案）第一步就走不動。
這是 `docs/WBS.md`〈demo 之前的核准順序〉的 #3，`FE-B02`（卡片）、`FE-B03`（詳情）、
`FE-J04`（成軍／結案）、`FE-J03`（我的案件）都要有「自己發的案」才演得出來。

不做會怎樣：demo 只能拿 seed 的案子演「看」，演不出「發」；`FE-J04` 的 owner 判斷
（只有發起人看得到成軍／結案）沒有任何一張是 demo 帳號發的、永遠測不到。

`FE-O08` 演練（2026-09-17）量到兩件這份規格必須照著寫的事：
- **真後端建案完全不驗**：空 `title`、`seat_count` 0 或 9、`title` 300 字都 201（`create-unvalidated`，
  已分類為 anomaly、送回後端）。所以上限**只能由前端守**，而且不能把「後端會擋」當假設。
- `GET /api/projects` 依 `updated_at desc`、預設只回 `recruiting` —— 剛建的案子一定在第 0 頁第一筆。

還有一件 `FE-O05` 帶來的：`internal` 替身沒有 `POST /api/projects`，契約套件對真後端的 11 個 `todo`
全是因為它（到不了 `title`／`body`／`needed_skills`／`seat_count` 這些欄位）。替身補上這個端點，
契約套件才能對兩個目標各跑一次建案。

## What Changes

- 新 capability **`project-posting`**：案件面板（專案看板按 E 開出來的 `ListPanel`）在列表上方多一個
  **「發案」**入口，只給已登入的人。按下去在面板的 overlay 開表單（列表不卸載、變 `inert`）：
  標題、內容、需要的技能、座位數 —— **只有後端有的四個欄位**（Open Role、期程、預算、截止日
  沒有模型，`BE-G10`／`BE-G20`／`BE-G21`，表單上不放、連灰掉的都不放）。
  上限全部是前端的（`FORM_LIMITS`）：標題 1–60、內容 1–2000、技能最多 10 項每項 40 字、
  座位數整數 1–8 預設 4。機制沿用 `FE-X05`（`useForm`：兩層驗證時機、連按只送一次、失敗留值）。
  成功後表單關閉、列表**回到第 0 頁重新向伺服器取**，新案在第一筆；不做樂觀插入。
  有輸入時關閉要確認（沿用 `FE-A04` 的 `DiscardConfirm`）。
- `internal` 替身補 `POST /api/projects`（`internal-backend` 的 ADDED 一條）：跟真後端一樣**不驗長度與範圍**
  （`handle()` 的既有規則「handler SHALL NOT 自行檢查長度上限」），`expires_at` 用資料庫預設值。
  `FE-O03-S05` 的「宣稱沒做的端點」清單拿掉 `POST /api/projects`（MODIFIED）。
- 契約套件新增 `tests/contract/rest/projects.contract.ts`：建案的形狀、預設值、7 天到期、出現在列表第一筆
  —— 對 `internal` 與 `guildhub` 各跑一次。
- 真瀏覽器 e2e：對 `next start`＋本機 `internal` 走一次「登入 → 開看板 → 發案 → 列表看到 → 重新整理仍在 →
  另一個人也看到」。

## Non-goals

- **不畫卡片**（標題、技能、狀態、剩幾天、座位數的呈現）—— 那是 `FE-B02`。這裡列表上的新案仍是
  今天的一行標題。
- **不做詳情、不做編輯、不做刪除** —— 後端沒有 `PATCH`／`DELETE /api/projects/{id}`；詳情是 `FE-B03`。
- **不做「我的案件」** —— `FE-J03`。
- **不做世界看板上的摘要**（不開面板就看得到有沒有案子）—— `FE-W20`。「送出後立刻出現在看板」
  在這一份的意思是**面板裡的列表**；`FE-W20` 來的時候看板摘要吃同一個列表狀態。
- **不驗後端不驗的東西的伺服器端**：替身不多加驗證（會讓契約套件兩個目標分岔）；
  `create-unvalidated` 仍是送回後端的 anomaly，這份規格**不依賴**它、也不把它開放給使用者
  （表單守住上限，所以使用者送不出空標題）。
- **不做草稿保存**：表單關掉就沒了（跟名片編輯一樣，`FE-A04-S11`）。
- 不動 `ListPanel` 的翻頁狀態機語意（只加一個「回第 0 頁重取」的動作）。

## Impact

- `src/list-panel/BoardPanel.tsx`（發案入口、overlay、確認層）、`src/list-panel/paging.ts`／`useListPage.ts`／`ListPanel.tsx`（`reload`）
- 新 `src/projects/CreateProjectForm.tsx`、`src/projects/projectRules.ts`（schema、payload）
- `src/forms/limits.ts`：`FORM_LIMITS.seatCount`
- `src/server/projects.ts`（`insertProject`）、`src/app/api/projects/route.ts`（`POST`）
- `tests/contract/harness.ts`（`internal` 的 `contractUnimplemented` 拿掉 `POST /api/projects`）、新 `tests/contract/rest/projects.contract.ts`
- 新 `tests/create-project.test.tsx`、`tests/e2e/create-project.mjs`
- 效能：表單與 Zod schema 進 `/world` 的 board chunk；量 `/world` 首屏 JS 前後差，貼 PR（基線 1.25 MB gz）
