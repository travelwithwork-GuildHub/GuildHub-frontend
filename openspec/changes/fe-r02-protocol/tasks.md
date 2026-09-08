# Tasks

一個 `feat/fe-r02-protocol--validate` slice（估計 200 行內，含測試）。

## 1. 前置

- [x] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-r02-protocol/` 確認
- [x] 1.2 確認訊息形狀從 `api-contract` 的 `ws.ts` 來，**不改它**；驗證方式是 `git diff --stat` 的檔案清單不含 `src/api/`

## 2. 驗證（Requirement：結果二選一／違規要有人被通知／訊息級失敗／新增類型也是違規）

- [x] 2.1 建立驗證器：吃 raw string，回傳 `{ok:true,message}` 或 `{ok:false,reason,raw}`；違規通報是**必填參數**
- [x] 2.2 用 `api-contract` 的 `ServerMessage` 驗證，**不在這一層重新定義任何形狀**；驗證 `FE-R02-S01` 通過
- [x] 2.3 非 JSON、不是物件、缺 `t` 都失敗且不交出訊息；驗證 `FE-R02-S02` 通過
- [x] 2.4 未知 `t` 通報恰好一次並帶原文；驗證 `FE-R02-S03` 通過
- [x] 2.5 壞掉的一則不影響下一則，通報只被呼叫一次；驗證 `FE-R02-S04` 通過
- [x] 2.6 形狀對但欄位不合的也失敗（`pos` 的 `p` 是物件、`hello` 少了 `you`）；驗證 `FE-R02-S05` 通過
- [x] 2.7 在程式碼註解寫明**這一層保證不了呼叫端有沒有在看** —— 傳空函式就等於靜默忽略（design 的 D1）
- [x] 2.8 **負向驗證**：把「未知 `t` 要失敗」改成「未知的就原樣放行」，確認 `S03` 與 `S05` 變紅；還原
- [x] 2.9 **負向驗證**：把違規通報改成不呼叫，確認 `S03` 變紅；還原

## 3. 界線

- [x] 3.1 確認這一刀**沒有做分派**、沒有碰連線狀態機、沒有錯誤 UI —— 用 `git diff --stat` 的檔案清單當證據

## 4. 完成前的驗證

- [x] 4.1 `openspec validate fe-r02-protocol --strict` 通過，貼輸出
- [x] 4.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [x] 4.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [x] 4.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 寫在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個 WHEN/THEN 子句都跑過**

  archive 前：**91 條規格、87 條有通過的測試指著、4 條缺口**，四條全部是既有的
  （`FE-W01-S01/S02/S03` 人工瀏覽器驗證、`FE-X01-S10` CI job），維持原判。
  本 change 的 5 條要 archive 之後才會進報告。
