# Tasks

一個 `feat/fe-o09-env--config` slice 就夠了（估計 250 行內，含測試）。

## 1. 前置

- [ ] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-o09-env/` 確認
- [ ] 1.2 確認 `.gitignore` 已涵蓋 `.env*.local`；沒有就補上（`create-next-app` 預設有，要親眼看到）

## 2. 設定模組（Requirement：本機預設／非本機失敗／協定驗證／憑證）

- [ ] 2.1 建立 `src/config/env.ts`，匯出讀取函式而不是模組載入時算好的常數（design 的 D2）；驗證方式是測試改 `process.env` 後再呼叫就拿得到新值
- [ ] 2.2 環境代號用獨立變數決定，**未列舉的值一律拋錯**；缺席時看建置模式（`NODE_ENV === 'production'` 就拋錯，否則視為本機）（design 的 D6）；驗證 `FE-O09-S07` 三個方向都通過
- [ ] 2.2b 缺席的判準用 falsy，不是 `=== undefined` —— 漏掉 `NEXT_PUBLIC_` 前綴的變數在 client bundle 裡是**空字串**（D3）；驗證：把變數設成 `''` 要跟沒設一樣被當成缺席
- [ ] 2.3 本機預設值 `http://localhost:8000` 與 `ws://localhost:8000/ws`；驗證 `FE-O09-S02` 通過
- [ ] 2.4 `preview`／`production` 沒有預設值，**REST base 與 WebSocket URL 兩個都是必填**，缺任一個都拋錯且訊息帶那個變數名稱；驗證 `FE-O09-S03`／`S04` 兩條都通過（兩個方向都要，否則「永遠拋錯」也會過）
- [ ] 2.5 協定驗證：REST 只收 `http:`／`https:`，WS 只收 `ws:`／`wss:`；驗證 `FE-O09-S05` 通過
- [ ] 2.6 匯出憑證模式常數 `include`；驗證 `FE-O09-S06` 通過。**不宣稱任何資料存取用了它** —— 那是 `FE-O02` 的驗收
- [ ] 2.7 **負向驗證**：把「非本機缺變數就拋錯」改成退回本機預設，確認 `S03` 變紅、`S04` 仍綠；還原

## 3. lint 規則（Requirement：環境變數只有一處讀取）

- [ ] 3.1 在 `eslint.config.mjs` 加**兩條**規則（design 的 D4）：① 設定模組以外不得讀 `process.env`（例外只給 `src/config/env.ts`，**用完整路徑不用萬用字元**）② **任何地方**不得用計算屬性讀 `process.env`；驗證 `FE-O09-S01` 三個方向都通過
- [ ] 3.1b 在 `env.ts` 檔頭寫明：計算屬性那個 bug **在單元測試裡永遠重現不了**（測試跑在 Node，那裡的 `process.env` 是真的），所以那條 lint 規則是唯一擋得住它的東西
- [ ] 3.2 **負向驗證**：把例外的 glob 放寬成 `**/env.ts`，確認能造出一個「不該通過卻通過」的路徑（例如 `src/world/env.ts`）；還原成完整路徑
- [ ] 3.3 測試用 `lintText` 帶虛擬 `filePath`，不建真的 fixture 檔案 —— 照 `tests/no-fetch-rule.test.ts` 的做法與它檔頭寫的理由；每條測試各自設逾時（第一次 `lintText` 要載整份 flat config）

## 4. `.env.example`

- [ ] 4.1 列出所有變數、預設值、以及每一個「在哪個環境是必填」；驗證方式是逐一對照 `env.ts` 讀的變數名稱，不多不少
- [ ] 4.2 檔頭寫明 `NEXT_PUBLIC_*` **會被編進 bundle，只能放位址不能放密鑰**（design 的 D1）

## 5. 界線

- [ ] 5.1 確認這一刀**沒有**發出任何請求 —— 用 `git diff --stat` 的**檔案清單**當界線證據（只有 `src/config/`、`eslint.config.mjs`、`.env.example` 與測試），不用文字搜尋（那擋不住包一層函式或換副檔名）
- [ ] 5.2 確認 `src/config/env.ts` 以外沒有第二處讀 `process.env` —— 靠 3.1 的 lint 規則，跑 `npm run lint` 是綠的

## 6. 完成前的驗證

- [ ] 6.1 `openspec validate fe-o09-env --strict` 通過，貼輸出
- [ ] 6.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 6.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 6.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 要寫在 `it` 標題上，不是 `describe`** —— 寫在 `describe` 上等於沒寫（`FE-O01` 踩過，12 條有 10 條被算成沒覆蓋）
