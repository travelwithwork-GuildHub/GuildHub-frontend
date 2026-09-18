## Why

`docs/WBS.md` 的 `FE-J14`：「Project Room 的資源看板：GitHub / Figma / Notion / Drive / Meeting 外部連結，
含 icon / type / URL 驗證與 External Open」（W11，負責人小玉）。

今天 Project Room 裡**沒有任何地方**放「這個團隊用哪些工具」。成員要找 repo、設計稿、會議連結，只能回到站外問人；
而 `FE-J10` 團隊脈搏在 WBS 上的敘述是「Project Room 現在只有外部連結，那是書籤不是工作脈絡」—— 連那份書籤都還不存在。
資料來源的缺口 `BE-G12`（`docs/WBS.md:395`：「`FE-J14` 專案資源首先是資料來源不存在」）已經有解：
2026-09-11 組長口頭授權後端為這一包做**加法式、受限**的放寬，後端在 `feat/be-g12-project-resources` 新增
`project_resources` 表與四個端點（`GET`／`POST`／`PATCH`／`DELETE /api/projects/{project_id}/resources[/{resource_id}]`）。

**不做會怎樣**：後端的四個端點落地後沒有任何前端讀寫它們；前端的本地後端（`FE-O03`）與契約測試（`FE-O05`）
不知道這四個端點存在，`local` 目標從此跟真後端**不再是同一份契約**（`api-contract` 的範圍敘述已經寫錯一次：寫 16，實際 17）。
而房間裡的人仍然看不出這個專案在用什麼工具 —— `CONTEXT.md`〈3D 憑什麼存在〉要的「看見」在房間裡少一樣可看的東西。

**為什麼規格現在寫**：規格可以跟後端實作同時談（契約已在 `BE-G12-FE-J14-contract-draft.md` v0.3 收斂）；
實作切片依序等後端 PR 合併、`FE-W16` 封存（見 tasks）。

## What Changes

- 新增 capability `project-resources`（使用者行為）：
  - 資源面板：依伺服器順序列出資源；名稱是文字、網址只經 `SafeExternalLink` 外開、type 看得出來
  - 只有 **active 專案的 owner** 有新增／修改／刪除控制項；UI 隱藏不是權限邊界，403／409 照樣處理
  - 送出前擋：名稱 1–100 code point 且不能全是空白、網址 1–2048 code point 且 `safeHref` 放行且不含空白、type 五選一、每專案 50 筆
  - 新增表單讓 owner 在送出前知道「連結會給能進這間房的人看到」
  - 空／載入／失敗三種狀態（沿用 `FE-X04`）
  - **面板開著時專案結案**（沒有 lifecycle WS 事件）：下一次讀／寫拿到 403／409 時，確認一次專案狀態；
    是 `closed` 就換成「已結案」、收掉寫入控制項；**不輪詢**
  - 鍵盤：面板持有世界命令鎖；在欄位裡打字不是走路；Escape 每次只關最上層
  - **房間裡的 3D 資源看板**：看板本身直接顯示前幾筆資源的 type 與名稱（不按 E 也看得到），走過去按 E 開面板
- `api-contract` MODIFIED：範圍「16 個端點」→ 21；長度表加資源名稱與網址兩列
- `internal-backend` MODIFIED＋ADDED：管線涵蓋 `DELETE`／`204`；本地後端實作四個端點，權限、狀態、上限、怪癖複製真後端
- `contract-tests` MODIFIED：成對邊界表加資源名稱與網址（網址的邊界值要是合法的 `https://` 形狀）
- `room-entry-gate` MODIFIED：本地後端的 `enter` 成功後**在伺服器端記住這張票**（今天明寫「本地沒有 server-side `room_tokens`」），
  非 owner 的資源讀取才有東西可驗
- `output-safety` MODIFIED：具名元件清單加資源面板與看板上的名稱節點

⚠️ **這份規格刻意不動 `world-scenes` 與 `project-room-layout`。** 看板「掛進房間、擺在哪」會撞到現行
`FE-V01-S03`（「`room` 場景的互動系統裡 SHALL 沒有任何看板的註冊」），而 `world-scenes` 同時被未封存的
`fe-w16-project-room` 以 MODIFIED 改著同一條 Requirement（`AGENTS.md`〈平行開發〉）。
那兩個 capability 的 delta 等 `FE-W16` 封存後**另開 `spec/` PR**：把 `FE-V01-S03` 的範圍收成「Guild Hall 的兩塊看板與門」，
並加上「房間裡恰好有一塊資源看板」—— **不靠換識別字前綴繞過**（測試會綠、規格字面仍被違反）。
在那份 PR 合併、看板真的掛進 Project Room 之前，`FE-J14` SHALL NOT 被宣稱完成（tasks 7）。

## Non-goals

- 不做排序調整、`sort_order`、拖拉重排：順序固定 `created_at ASC, id ASC`。
- 不做 `FE-N03` 洽談用的一次性 Meeting URL，也不做它成軍時自動轉存；這裡的 `meeting` 是 owner 手動新增的一般資源。
- 不做 `FE-J10` 團隊脈搏、通知、活動紀錄、稽核。
- 不做成員制或角色：寫入只給 owner；room token 只給讀取。
- 不做第三方 API 整合、連結預覽、favicon 抓取、依網址自動判斷 type、檢查網址 host 跟 type 是否相符。
- 不正規化、不去重網址（同一專案允許重複網址，後端也不設 unique）；名稱不 trim。
- 不做 `other` type。
- 不做樂觀更新：寫入以伺服器回應為準。
- 不做任何輪詢或 lifecycle 推播；不發明後端沒有的 WS 事件。
- 不在這份規格改 `world-scenes`、`project-room-layout`、`FE-V01-S03`（見上）。
- 不動 `docs/WBS.md`：BE-G12 那一列等實作與部署完成後由一個 `governance/` PR 一次改；`FE-J14` 列的狀態是算出來的，不手寫。
- 不動後端 repo；不對 Railway 做任何 schema 變更。
- **不做觸控裝置的 DOM-only 入口**：`CONTEXT.md:216` 的決定是觸控不載 3D，而 DOM-only 那一面今天沒有 Project Room；
  等 `FE-X08` 把房間納進來時再一起補（design 的風險那一節寫了觸發條件）。

## Capabilities

### New Capabilities

- `project-resources`: Project Room 的專案資源 —— 面板的清單、新增、修改、刪除、送出前驗證、權限與結案的失敗呈現、鍵盤，以及 3D 資源看板上的摘要與開面板

### Modified Capabilities

- `api-contract`: 範圍敘述改 21 個端點；長度表加 `resourceLabel`、`resourceUrl`
- `internal-backend`: 管線涵蓋 `DELETE`／`204`；新增本地資源四端點的等價行為
- `contract-tests`: 成對邊界表加資源名稱與網址
- `room-entry-gate`: 本地 `enter` 成功後在伺服器端記住票，供非 owner 讀取資源時驗證
- `output-safety`: 具名元件清單加資源名稱節點

## Impact

- **依賴**：後端 `feat/be-g12-project-resources` 合併（契約重產、`LIMIT_SOURCES` 指向後端 `sql/001_schema.sql` 的行號、`db/schema/001_schema.sql` 逐位元組複本）；
  `FE-N08`（已封存：非 owner 拿票）；`FE-W16`（未封存，0/15）與其後的 `world-scenes`／`project-room-layout` 規格 PR（看板掛進房間）。
- **程式碼**：`src/api/contract/`（`schema.d.ts` 重產、`rest.ts`、`drift.ts`、`limits.ts`）、`src/api/transport.ts`（`METHODS` 加 `DELETE`）、
  `src/api/operations.ts`、`db/schema/001_schema.sql`、`src/app/api/projects/[project_id]/resources/**`、`src/app/api/projects/[project_id]/enter/route.ts`、
  `src/server/`、新的面板與看板元件、`tests/contract/**`。
- **測試連線**：單元與 jsdom 不連任何服務；契約測試只打本機自己起的可拋棄後端（`local` 由 harness 起、`guildhub` 由 wrapper 起）；
  e2e 只打 `next start` 的 loopback。MUST NOT 連 Railway 或任何共用實例。
- **整合風險**：`BE-G33`（換 scene 時新連線可能被舊連線的斷線清掉）會影響「進房之後看得到看板」的 e2e，不影響本規格的契約。
