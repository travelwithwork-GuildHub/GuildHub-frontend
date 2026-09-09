## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o14-preview-deploy` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-o14-preview-deploy --strict` 通過且 PR 已合併

## 2. 即時層的資料來源（`src/config/env.ts`）

- [x] 2.1 `FE-O14-S01`：新增 `REALTIME_ADAPTERS` 與 `realtimeAdapter()`，
      缺席回 `guildhub`，無法辨識拋 `ConfigError`。
      驗證：三種值各一條，第三條檢查錯誤訊息含那個值
- [x] 2.2 `FE-O14-S02`：`none` 時殘留的位址被**忽略**而不是被拒絕 ——
      含「協定錯誤的位址在 `none` 下也不拋錯」那一條。
      理由：preview 會繼承環境變數，逼人去刪只會讓人改填假值
- [x] 2.3 `FE-O09-S03`（MODIFIED）：`wsUrl()` 在 `none` 時 MUST NOT 被要求。
      驗證：`none` + 無位址 + `production` → 不拋錯；
      `guildhub` + 無位址 + `production` → 拋錯且訊息含變數名

## 3. 設定清單（`src/config/env.ts`）

- [x] 3.1 `FE-O14-S06`：匯出設定項目清單 —— 變數名稱、解析函式、
      「部署建置時要不要驗」、以及不驗的理由
- [x] 3.2 `restBase()` 標為不驗並寫理由（今天沒有元件呼叫它，design 的 M3）
- [x] 3.3 驗證方式 V3：測試**由清單產生案例**，不得寫死變數名稱。
      驗收：加一個假項目進清單，案例數要跟著增加

## 4. 建置時驗證（`next.config.ts`）

- [x] 4.1 `FE-O14-S03`／`S04`：一行呼叫，迭代 3.1 那份清單。
      **MUST NOT 在這裡逐一列舉變數**（design 的 D3）
- [x] 4.2 `FE-O14-S03` 後半：`preview` 與 `production` 都要擋
- [x] 4.3 `FE-O14-S05`：三個成功情境 —— `guildhub` + 合法位址、
      `none` + 無位址、**以及本機開發不被擋住**
- [x] 4.4 驗證方式 V1：對真的 `next build` 跑，**用 exit code 判定**。
      每次建置用**獨立輸出目錄與乾淨環境變數** —— 共用 `.next` 會給出假綠
- [x] 4.5 驗證方式 V2（**驗收條件**）：把 `next.config.ts` 那一行拿掉，
      4.4 的測試必須變紅。紅了才算數

## 5. 單人預覽不連線（`src/world/RemoteWorld.tsx`）

- [ ] 5.1 `FE-O14-S07`：`none` 時不建立 client。
      驗證：注入 socket 工廠替身，斷言**呼叫次數**（`none` → 0、`guildhub` → 1）
- [ ] 5.2 `FE-O14-S07` 後半：`none` 時沒有任何錯誤或警告層級的診斷輸出
- [ ] 5.3 `FE-O14-S08`：`none` + `production` + 無位址 → 掛載不拋錯，
      且世界的容器元素存在。**不要斷言「正常呈現」**（那是同義反覆）

## 6. 單人預覽的說明（DOM）

- [ ] 6.1 `FE-O14-S09`：說明是 DOM、**可以用可存取名稱取得**、
      內容提到單人預覽、範圍內沒有任何按鈕或可點擊元素
- [ ] 6.2 `FE-O14-S10`：`guildhub` 時不出現 —— 驗證方式 V5，
      **先斷言工廠被呼叫過**，再從替身觸發 `close`（不觸發 `open`），
      然後斷言說明不存在。少了第一步這條會恆真

## 7. 文件

- [ ] 7.1 `.env.example` 補上 `NEXT_PUBLIC_REALTIME_ADAPTER`，
      附兩種部署情境的完整範例（有後端／沒有後端）
- [ ] 7.2 `docs/DEPLOY.md`：Vercel 上要設哪些變數、兩種情境各自設什麼。
      **明寫這份文件證明不了 Vercel 主控台上的設定**

## 8. 不在這個 change 裡（不要順手做）

- [ ] 8.1 開一張後續工作：把現有的 FastAPI 部署到常駐容器，
      讓 `NEXT_PUBLIC_REALTIME_ADAPTER=guildhub` 真的有東西可連。
      **需要帳號與帳單決策，不是程式碼**
