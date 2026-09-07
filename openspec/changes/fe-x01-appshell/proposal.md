## Why

這個 repository 目前**一行產品程式碼都沒有** —— 沒有 `src/`、沒有 Next.js，
`package.json` 的 `lint` / `typecheck` / `test` / `build` 是四個刻意會失敗的佔位。
`docs/WBS.md` 的 W1 有 23 個工作項目，其中每一項都要先有一個能跑的前端骨架
才做得下去。

不做會怎樣：**W1 整週不會有任何一項能開工**。而且 `.github/workflows/ci.yml`
目前把 `Lint` / `Typecheck` / `Test` / `Build` 四關整段註解掉，理由寫在檔案裡 ——
佔位 script 會讓 CI 永遠是紅的，而永遠紅的 CI 等於沒有 CI。這四關要等
scaffold 完成才放得回去（`FE-O10`），所以**骨架晚一天，工程品質閘門就多空轉一天**。

## What Changes

- 建立 Next.js App Router + TypeScript 專案骨架，並把 `package.json` 的四個
  佔位 script 換成真的會執行的指令
- 新增 `/world` 路由，World 內容以 **Client Component 邊界**載入；根路徑 `/`
  以**暫時轉址**（非永久）導到 `/world`
- 建立全域 Layout 與一個 `<Providers>` **組合位置**（本次不放入任何具體
  Provider 實作）
- 建立 Tailwind 與 DOM design token：色票、字級與間距、以及 **z-index 具名分層**
  （canvas / hud / panel / modal / toast）
- ESLint 設定中把「元件裡不准出現 `fetch`」變成一條會失敗的規則，
  例外路徑只有 `src/api/**` 與 `src/app/api/**`
- 建立單元與 component 測試環境，並確保 `npm test` 會回報**測試數量**
- 釘住 Node 版本（`.nvmrc` 與 `engines`），與 CI 使用的版本一致

## Non-goals

**這次明確不做。列在這裡是為了避免實作時順手做掉：**

- **不放任何 3D Canvas。** R3F Canvas、Renderer、Lighting、Soft Shadow、Resize、
  Suspense / Loading fallback 與資源清理**逐字都是 `FE-W01` 的範圍**（同樣是 W1）。
  本次只交出 World 的 Client Component 邊界與一個佔位元件，Canvas 是 `FE-W01`
  來填的縫
- **不做 WebGL2 偵測與不可用時的 fallback 畫面。** 沒有 Canvas 就沒有東西需要
  被保護；這一項隨 `FE-W01` 一起交付
- **不導入 E2E 測試框架，也不把 E2E 放進 CI。** E2E 的分工與比重是 `FE-O11`
  的裁決範圍，而瀏覽器壓測工具同時被 `FE-R09` 牽動。
  **但「不自動化」不等於「不驗」** —— 本 change 是 web-facing，而這個 repo
  對瀏覽器驗證**沒有任何成文規範，也沒有機器在驗**，所以驗什麼、怎麼驗、
  留什麼證據全部寫死在 `design.md` 的〈驗證方式〉：六條具名的人工檢查
  （V1–V6），證據貼在實作 PR 上。本次固定的是**要驗什麼**，
  「誰來跑」留給 `FE-O11`
- **不安裝 TanStack Query 與任何 store。** 那是 `FE-X02`
- **不做登入、暱稱與任何身分。** 那是 `FE-A01`
- **不做手機、觸控與響應式降級。** `FE-X08` 標記為產品範圍決定，尚未裁決
- **不設定 CSP 與安全標頭。** 3D 的 CSP 例外要等 Canvas 存在才知道要開哪些，
  現在設等於猜
- **不做 DOM 路由與面板開關的對應關係**（`FE-X01` 排在 W2 的那一列）

## Capabilities

### New Capabilities

- `app-shell`: 應用程式外殼 —— 路由骨架、根路徑轉址、World 的 Client Component
  邊界、全域 Layout 與 Provider 組合位置、DOM design token（含 z-index 分層），
  以及資料存取路徑的靜態約束

### Modified Capabilities

（無。`openspec/specs/` 目前是空的，本次是第一個 capability。）

## Impact

- **新增**：`package.json`（四個 script 由佔位換成真的指令）、`tsconfig.json`、
  Next.js 設定、ESLint 設定、Tailwind 設定、測試 runner 設定、`.nvmrc`、
  `src/app/**` 的路由與 layout、design token 的樣式來源
- **相依套件**：Next.js、React、TypeScript、Tailwind、ESLint、測試 runner
  與 Testing Library。`package-lock.json` 會大幅變動
- **CI**：本次**不修改** `.github/`。四個品質關卡放回 `ci.yml` 是 `FE-O10`，
  必須是緊接在 scaffold 之後的獨立 `governance/` PR ——
  `ci.yml` 的註記明文要求「不要留下一個沒有工程品質閘門的窗口」
- **後續項目**：`FE-W01`（Canvas）、`FE-X02`（狀態管理）、`FE-O01`/`FE-O02`
  （資料層）都建立在本次的目錄結構與邊界之上
- **不影響**：本次不連任何外部服務，不讀寫任何持久資料，不觸及後端契約
