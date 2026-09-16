# tasks：`fe-o14-rest-build-gate`

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o14-rest-build-gate` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-o14-rest-build-gate --strict` 通過且 PR 已合併

## 2. 判準先紅（對應 `S03`／`S13`／`S14`）

- [x] 2.1 `tests/env-config.test.ts`：`S13` 四種情形（缺席 → `guildhub`；本機 `internal` → `internal`；
      `production`／`preview` 的 `internal` → 拋錯含變數名；打錯字 → 拋錯且不回任一值）
- [x] 2.2 `tests/env-config.test.ts`：`S14` 讀設定部分（`guildhub` 缺 REST 在部署環境拋錯；
      本機 `internal` 缺 REST 回 `null`、協定錯誤或合法值都回 `null`）；`S03` 補上「資料來源為 `guildhub`」的前提
- [x] 2.3 `tests/deploy-build-gate.test.ts`：`S05` 的成功案例補合法 REST base；`S14` 建置部分（`production`＋`guildhub`
      缺 REST → 結束碼非零且輸出含變數名；`production`＋`internal` → 結束碼非零且輸出含 `NEXT_PUBLIC_DATA_ADAPTER`；
      `production`＋資料來源缺席＋REST 合法＋`none` → 結束碼零）
- [x] 2.4 `tests/api-transport.test.ts`：`FE-O02-S02` 在 `restBase()` 回 `null` 之後仍然同源
- [x] 2.5 **commit 紅的判準**，再開始 3

## 3. 正式碼（`feat/fe-o14-rest-build-gate--gate`）

- [x] 3.1 `src/config/env.ts`：`dataAdapter()` 在 `preview`／`production` 讀到 `internal` 拋錯；
      `restBase()` 在 `internal` 回 `null`；清單項目 `NEXT_PUBLIC_GUILDHUB_REST` 翻成
      `checkedAtBuild: true`；加 `NEXT_PUBLIC_DATA_ADAPTER` 項目、`checkedAtBuild: false`、
      `skipReason` 寫「缺席合法；部署版 `internal` 在 `restBase()` 解析時驗」（design D1）；
      `INTERNAL_SESSION_SECRET` 的 `skipReason` 改成引用「`internal` 只在本機」，
      `INTERNAL_DATABASE_URL`／`INTERNAL_REALTIME_PORT` 補列、`false`、同一個理由；
      清單旁關於 `S06` 的註解限定為 `checkedAtBuild` 項目
- [x] 3.2 `src/api/transport.ts`：`baseFor` 改成先問 `restBase()`，`null` 才走同源
- [x] 3.3 `docs/DEPLOY.md`：情境三（同源閘道；`guildhub`＋`guildhub` 這個組合是五個變數；
      只能從閘道網址進站）、寫明今天沒有 preview 部署（`vercel.json` 是黑名單）、preview 若要開的前提（design D2）、
      設錯表補 `NEXT_PUBLIC_DATA_ADAPTER` 與 `NEXT_PUBLIC_GUILDHUB_REST` 兩列
- [x] 3.4 `restBase()` 的 doc comment 寫明 `null` ＝「這個 adapter 不適用」，不是「缺席」（design D1）

## 4. 負向驗證（突變前先 commit）

- [ ] 4.1 `checkedAtBuild` 翻回 `false` → `S14` 建置那條紅
- [ ] 4.2 `dataAdapter()` 在 `production` 放行 `internal` → `S13` 紅
- [ ] 4.3 `restBase()` 在本機 `internal` 仍回 `localhost` 預設值 → `S14` 的 internal 那條紅
- [ ] 4.4 執行紀錄貼在 PR 留言

## 5. 收尾

- [ ] 5.0 **合併 feat 之前**：Vercel production 已設好 `NEXT_PUBLIC_GUILDHUB_REST`（`NEXT_PUBLIC_DATA_ADAPTER=guildhub` 可設可不設）
      （不在 repo 裡、要使用者同意），否則合併後 `main` 的自動建置會紅（design D2）
- [ ] 5.1 `pnpm exec tsc --noEmit`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test` 全綠
- [ ] 5.2 `archive/fe-o14-rest-build-gate`
