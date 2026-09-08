# Tasks

實作分成兩個 `feat/` slice，各自一個 PR，都在 400 行上限內：

- `feat/fe-o01-contract--rest` —— 1、2、3 節
- `feat/fe-o01-contract--ws` —— 4、5、6 節

## 1. 前置

- [ ] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-o01-contract/` 確認 spec commit 在 main 上
- [ ] 1.2 加入 `zod` 相依（釘死版本，不用 `^`），並確認 `npm ci` 後 `npm run typecheck` 仍然綠

## 2. 限制值的單一來源（Requirement：長度與範圍限制有單一來源，且以 code point 計算）

- [ ] 2.1 建立 `src/api/contract/limits.ts`，把 `display_name` 1–20、`bio` ≤300、站內信 `body` 1–2000、狀態文字 ≤12、`seat_index` 0–7 寫成一份常數表，檔頭標明每個數字出自 `sql/001_schema.sql` 或 `presence.py` 的哪一行；驗證方式是那些數字讀得出來（`limits.displayName.max === 20`）
- [ ] 2.2 `projects.title`／`body`／`skills` 在表裡用一個明確表示「沒有後端上限、前端未定」的值，不是省略；驗證 `FE-O01-S05` 通過
- [ ] 2.3 寫一條釘住長度單位的測試：12 個 BMP 外字元要通過、13 個要失敗（`FE-O01-S04`）
- [ ] 2.4 **負向驗證**：把該欄位的驗證改成用 `.length`（UTF-16）計數，確認 2.3 那條測試變紅；改回來

## 3. REST 契約與哨兵（Requirement：資料形狀只有一份定義／後端形狀改變時 typecheck 要變紅）

- [ ] 3.1 在 `package.json` 加 `contract:generate` script，用 `npx -y openapi-typescript@7.13.0` 從 `http://localhost:8000/openapi.json` 產 `src/api/contract/schema.d.ts`；驗證方式是跑一次它，產出物存在且 `git status` 看得到
- [ ] 3.2 `schema.d.ts` 進版控，檔頭（或旁邊一個 `.md`）記下產生器版本、產生時間、後端 commit —— D2 說的「哨兵會過期」要有地方查
- [ ] 3.3 用 Zod 寫出 16 個 `/api/*` 端點涉及的實體與操作輸入輸出，數字全部從 `limits.ts` 讀，不寫死；驗證 `FE-O01-S01`／`S02`／`S03` 通過
- [ ] 3.4 對每一個 REST 實體寫一條 `Equal` 相等斷言；驗證 `npm run typecheck` 綠，且 `FE-O01-S10` 的「每個實體都有涵蓋」查得出來
- [ ] 3.5 **負向驗證**：手改 `schema.d.ts` 讓某個必填欄位變成可為 `null`，確認 `npm run typecheck` 紅在該實體的斷言那一行；再改成新增一個欄位，確認同樣紅（`FE-O01-S11`）。兩次都還原
- [ ] 3.6 錯誤 envelope：`{detail: string | ValidationError[]}` 與 status code 集合 `400/401/403/404/409/422/500`；驗證 `FE-O01-S09` 通過

## 4. WebSocket 契約（Requirement：WebSocket 兩個方向是兩個獨立的訊息集合）

- [ ] 4.1 client→server 集合：`move`／`status`／`chat`，每一條標明對應 `protocol.py` 的哪一段；驗證 `FE-O01-S07` 通過（浮點 `x` 被拒、`f=4` 被拒、負座標通過）
- [ ] 4.2 server→client 集合：`hello`／`snapshot`／`pos`／`presence`／`status`／`chat`／`err`，`pos` 的 `p` 是 `[id,x,y,f]` 陣列不是物件；驗證 `FE-O01-S06` 通過
- [ ] 4.3 未知的 `t` 明確失敗，不靜默忽略；驗證 `FE-O01-S08` 通過
- [ ] 4.4 **負向驗證**：把兩個方向合併成單一個以 `t` 為判別鍵的 union，確認 `FE-O01-S06` 變紅（證明「分成兩個」這件事真的有人在看）；改回來

## 5. 唯一一份的界線

- [ ] 5.1 確認 `src/api/contract/` 以外沒有任何檔案定義相同形狀或重複那些數字 —— 用 `grep -rn "20\|300\|2000" src/ --include=*.ts --include=*.tsx` 逐條看過，並把結果貼在 PR 上
- [ ] 5.2 確認這一刀**沒有**引入任何 `fetch`、adapter、Route Handler —— `git diff --stat` 的檔案清單全部在 `src/api/contract/` 底下（加 `package.json` 與測試）

## 6. 完成前的驗證

- [ ] 6.1 `openspec validate fe-o01-contract --strict` 通過，貼輸出
- [ ] 6.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 6.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 6.4 archive 之後再跑一次 `bash .github/scripts/check-scenario-coverage.sh`，把缺口清單原文貼上並對每一條說出處置
