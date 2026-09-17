## Why

專案看板按 E 開出來的面板（`FE-B01`）今天的案件列項是一個佔位：`BoardPanel.tsx` 的 `projectLine` 只印 `title` 一行
（註解逐字：「案件那一支的列項仍是佔位（`FE-B02`）」）。`FE-J01` 之後使用者能發案了，可是看板上看得到的
仍然只有標題 —— 二十個標題排在一起，判斷不了任何事：這個案子要什麼技能、還在招人嗎、還剩幾天、幾個座位。
而看板的存在理由正是「找案子」。

這是 `docs/WBS.md`〈demo 之前的核准順序〉的 #4。後面 `FE-B03`（詳情）要有一張能點的卡；`FE-J03`（我的案件）
要拿同一張卡呈現「各自的狀態」；`FE-J04`（成軍／結案）改掉的 `status` 要有地方看得到 —— 三項都吃這一張卡。

不做會怎樣：demo 走到看板那一步，畫面上是一排標題，講不出「這是一個能判斷的看板」；`FE-J04` 成軍之後
狀態變 `active`，看板上沒有任何東西會變。

後端能給的欄位是固定的：`ProjectOut` 十個鍵（`id`、`owner_id`、`title`、`body`、`needed_skills`、`status`、`room_template`、
`seat_count`、`expires_at`、`updated_at`）。WBS 2026-09-17 已把這一列縮成後端有的欄位：沒有 Open Role、預算、期程、應徵數。

## What Changes

- 新 capability **`project-directory`**：案件卡（`src/projects/ProjectCard.tsx`）—— 標題、需要的技能、狀態（招募中／已成軍／已結案，
  **以文字呈現，不靠顏色**）、剩幾天到期（由 `expires_at` 與呈現時刻算出：`ceil` 到天；已過期不印負數）、座位數。
  `body`、`updated_at`、`owner_id`、`room_template` **不上卡片**：`body` 長度不定會把卡片高度弄亂；`updated_at` 會被讀成
  「最近活躍」；`owner_id` 是一個 UUID，人看不懂，發案者是誰歸詳情（`FE-B03`）。
- 狀態的中文只有一份：`src/projects/projectStatus.ts`（`recruiting → 招募中`、`active → 已成軍`、`closed → 已結案`），
  `FE-J03`／`FE-J04`／`FE-B03` 都吃它。
- `BoardPanel` 案件那一支的 `renderItem` 換成 `ProjectCard`（佔位 `projectLine` 拿掉）。
- 真瀏覽器 e2e：`tests/e2e/board-panel.mjs` 案件那一段多驗卡片上的欄位；`tests/e2e/create-project.mjs` 讀「第一筆的標題」改讀卡片的標題節點。

## Non-goals

- **卡片不是控制項**：這一份不開詳情。點卡片做什麼、`?project=<id>` 的網址狀態、詳情的載入與失敗，全部是 `FE-B03`。
  `FE-B03` 會以 MODIFIED 把「卡片是可聚焦的控制項」加回來（跟 `FE-B04` 人才卡同一種形狀）—— 這裡先做成 `<article>`，
  不做成一顆按下去沒反應的按鈕。
- **不做排序、不做篩選**（WBS 同一項的第二列：`BE-G05` 待銜接，「demo 之前不做」）。列表的順序就是後端給的 `updated_at desc`。
- **不切換 `status`**：`GET /api/projects` 預設只回 `recruiting`，`listProjects` 刻意沒開 `status` 參數（`FE-B01` design D3）；
  所以今天看板上的每一張卡都會是「招募中」。卡片仍照 `status` 畫，因為 `FE-J03` 我的案件會拿同一張卡呈現三種狀態。
- **不做倒數的即時更新**：剩幾天以呈現時刻算一次，不裝計時器（粒度是「天」，重新整理或重開面板就會更新）。
- **不改** `ListPanel`／`useListPage`／`paging.ts` 的任何語意；不動 `FE-X04` 的空狀態與錯誤文案。
- **不放世界看板上的摘要**（`FE-W20`）。

## Impact

- 新 `src/projects/ProjectCard.tsx`、`src/projects/projectStatus.ts`；`src/talent/Missing.tsx` 的 `field` 多一個值（`needed_skills`）
- `src/list-panel/BoardPanel.tsx`（`renderItem`）
- 新 `tests/project-card.test.tsx`；`tests/board-panel-wiring.test.tsx`（案件列項是卡片）
- `tests/e2e/board-panel.mjs`、`tests/e2e/create-project.mjs`
- 效能：一個純呈現元件進 `/world` 的 board chunk，預期 +1 KB gz 以內；量前後差貼 PR
