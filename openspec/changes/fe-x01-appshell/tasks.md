## 1. 規格

- [ ] 1.1 規格已在 PR 上談定：`spec/fe-x01-appshell` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-x01-appshell/proposal.md` 有輸出（`feat/` 的閘門就是去 main 上找這個檔案）

## 2. 專案骨架與四個品質指令（`feat/fe-x01-appshell--scaffold`｜Requirement: 工程品質指令可執行且誠實）

- [ ] 2.1 建立 Next.js App Router ＋ TypeScript 專案，把 `package.json` 的四個佔位 script 換成真的指令；驗證：`npm run lint && npm run typecheck && npm test && npm run build` 四個都以狀態碼 `0` 結束（Scenario `FE-X01-S10`）
- [ ] 2.2 四個 script 的**名稱**必須與 `ci.yml` 註記裡那四步（`npm run lint` / `npm run typecheck` / `npm test` / `npm run build`）逐字一致；驗證：對照 `.github/workflows/ci.yml` 檔尾的註解區塊，逐字比對。名稱對不上的話 `FE-O10` 那個 governance PR 接不上去
- [ ] 2.3 安裝並設定 Vitest ＋ Testing Library ＋ jsdom，**不得加 `--passWithNoTests`**；驗證：`npm test` 的輸出包含大於 `0` 的測試數量（Scenario `FE-X01-S10`）
- [ ] 2.4 驗證零測試時 `npm test` 以非零結束：暫時把測試檔移開跑一次，確認紅，再放回來；驗證：記錄該次的退出碼（Scenario `FE-X01-S12`）
- [ ] 2.5 新增 `.nvmrc` 與 `package.json` 的 `engines`，Node 主版本釘在 `24`；驗證：與 `.github/workflows/ci.yml` 的 `node-version` 一致
- [ ] 2.6 驗證 `typecheck` 真的會擋：暫時放入一個型別錯誤跑一次，確認以非零結束並指出檔案與行，再移除；驗證：記錄該次輸出（Scenario `FE-X01-S11`）

## 3. 資料存取的靜態約束（`feat/fe-x01-appshell--scaffold`｜Requirement: 資料存取只有一條路）

- [ ] 3.1 在 ESLint 設定中禁止取用全域 `fetch`，並將 `src/api/**` 與 `src/app/api/**` 明確放行；驗證：一個放在元件路徑的 `fetch` fixture 使 `npm run lint` 以非零結束並指出檔案與行（Scenario `FE-X01-S08`）
- [ ] 3.2 驗證放行路徑確實不被擋：一個放在 `src/api/**` 的 `fetch` fixture 通過 lint（Scenario `FE-X01-S09`）
- [ ] 3.3 **把防禦拿掉，檢查要變綠**：暫時移除該規則，確認 3.1 的 fixture 從紅變綠，再放回來；驗證：記錄兩次的退出碼。一個從來沒紅過的檢查等於沒有檢查

## 4. 路由與外殼（`feat/fe-x01-appshell--layout`）

- [ ] 4.1 在 `next.config` 的 `redirects()` 加入 `/` → `/world`、`permanent: false`；驗證：測試 import 該設定、呼叫 `redirects()`、斷言該筆的 `permanent` 為 `false`（＝307）（Requirement: 根路徑導向世界，Scenario `FE-X01-S01`）
- [ ] 4.2 建立 not-found 頁面；驗證：測試直接 render 該元件並斷言可辨識的找不到內容；並確認未定義路徑不會被 4.1 的規則吃掉（Scenario `FE-X01-S02`）
- [ ] 4.3 建立 `/world` 路由、全域 Layout，以及 World 的 client 邊界薄殼（`'use client'` ＋ `next/dynamic` 的 `ssr: false`），殼裡放佔位元件；驗證：測試 render 頁面並斷言 Layout 與佔位內容都在（Requirement: World 區域的 client 邊界，Scenario `FE-X01-S03`）
- [ ] 4.4 在該邊界加上錯誤呈現（`next/error` 的 `catchError`），fallback 顯示可辨識訊息並提供 `retry()`；驗證：測試讓動態載入失敗，斷言錯誤訊息與重試操作出現、且頁面其餘部分仍在（Scenario `FE-X01-S04`）
- [ ] 4.5 建立唯一一個 `<Providers>` 組合位置，本次不掛載任何具體 Provider；驗證：測試斷言 children 內容與順序不因經過它而改變（Requirement: 全域 Provider 的單一組合位置，Scenario `FE-X01-S05`）
- [ ] 4.6 確認組合位置不多包任何元素；驗證：測試比對「經過組合位置」與「未經過」兩次渲染的 DOM 結構完全相同（Scenario `FE-X01-S13`）

## 5. DOM design token（`feat/fe-x01-appshell--layout`｜Requirement: DOM design token 的單一事實來源）

- [ ] 5.1 以 Tailwind 的 `@theme` 定義色票、字級與間距刻度，放在單一檔案；驗證：`npm run build` 產出的樣式包含這些變數
- [ ] 5.2 以 TypeScript 常數表定義 5 個具名堆疊層（`canvas` / `hud` / `panel` / `modal` / `toast`），並提供型別受限的存取函式；驗證：測試依序取用五層並斷言數值嚴格遞增（Scenario `FE-X01-S06`）
- [ ] 5.3 未定義的層名必須讓型別檢查失敗；驗證：建立一份取用未定義層名的 fixture，測試斷言對它執行型別檢查會以非零結束（與 3.1 的 lint fixture 同一個模式）（Scenario `FE-X01-S07`）
- [ ] 5.4 確認堆疊層級沒有被複製到樣式層；驗證：測試斷言 `@theme` 的 token 檔案裡不含任何堆疊層級定義（Scenario `FE-X01-S14`）

## 6. 完成前的驗收

- [ ] 6.1 交出一張 Scenario ID ↔ 測試的對照表，`FE-X01-S01` 到 `S14` 每一個都指得出對應的測試；驗證：表格中沒有空格
- [ ] 6.2 貼出 `npm run lint` / `typecheck` / `test` / `build` 四個指令的**實際輸出**，`test` 要看得到測試數量
- [ ] 6.3 走完 `design.md`〈驗證方式〉的 **V1–V6**，證據貼在 `feat/fe-x01-appshell--layout` 的 PR 上；驗證：六列都有對應的輸出或截圖，沒有空格。**只連本機 `localhost:3000` 自己起的 dev server**
- [ ] 6.3.1 V1：`curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/`；驗證：輸出逐字為 `307` 與 `.../world`。這是「斷言設定 ≠ 斷言回應」那個缺口唯一的補法
- [ ] 6.3.2 V6：`curl` 取 `/world` 的伺服器端 HTML；驗證：其中**不含** World 佔位元件的內容，證明 `ssr: false` 真的生效
- [ ] 6.3.3 V4／V5：以 DevTools 阻斷 World 的 chunk 請求後重新載入，再解除並按重試；驗證：兩張截圖 —— 錯誤訊息與重試操作都在且頁面其餘部分仍在（`FE-X01-S04`）、重試後內容載入成功
- [ ] 6.4 `npm run build` 之後確認 `.gitignore` 有涵蓋建置產物，PR 的 diff 裡沒有生成檔；驗證：`git status --short` 乾淨
- [ ] 6.5 `npx openspec validate fe-x01-appshell --strict` 通過，且本檔案沒有殘留的 `- [ ]`
