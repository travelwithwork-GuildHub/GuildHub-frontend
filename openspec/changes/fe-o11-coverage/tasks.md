## 1. 規格

- [x] 1.1 規格已在 PR 上談定：`spec/fe-o11-coverage` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-o11-coverage/proposal.md` 有輸出

## 2. 標註驗證方式（MODIFIED Requirement：World 以 WebGL Canvas 渲染）

- [x] 2.1 `FE-W01-S01`／`FE-W01-S02` 加上 `manual-browser` 的 VERIFY-BY；驗證：`bash .github/scripts/check-scenario-coverage.sh` 不再列出這兩條

## 3. 標註驗證方式（MODIFIED Requirement：燈光與陰影）

- [x] 3.1 `FE-W01-S03` 加上 `manual-browser` 的 VERIFY-BY；驗證：同上

## 4. 標註驗證方式（MODIFIED Requirement：工程品質指令可執行且誠實）

- [x] 4.1 `FE-X01-S10` 加上 `ci-job` 的 VERIFY-BY，證據是 `ci.yml` 的四個步驟名稱；驗證：同上

## 5. 補上四條測得到的測試

- [x] 5.1 `FE-W05-S08`：target 在 ref 上改多次，相機元件的渲染次數不增加；驗證：`npm test` 裡有一條標題含 `[FE-W05-S08]` 的通過測試
- [x] 5.2 `FE-W03-S13`：角色位置改變時相機讀到新的 target，且不觸發重新渲染；驗證：同上
- [x] 5.3 `FE-W04-S08`：位置由 rigid body 持有，連續移動多幀不增加渲染次數；驗證：同上
- [x] 5.4 `FE-X01-S11`：新增一個帶型別錯誤的 fixture，`tsc -p` 以非零結束並指出檔案；驗證：同上
- [x] 5.5 **負向驗證**：把 5.1–5.4 的斷言各自改成恆真一次，該條 Scenario 要從「有通過的測試」掉回「缺」；驗證：記錄四次的輸出

## 6. 完成前的驗收

- [x] 6.1 `bash .github/scripts/check-scenario-coverage.sh` rc=0，而且輸出列出四條豁免與它們的理由
- [x] 6.2 **負向驗證**：把任一條 `VERIFY-BY` 的種類改成不認得的字，閘門要紅；驗證：記錄退出碼與訊息
- [x] 6.3 貼出 `npm run lint && npm run typecheck && npm test && npm run build` 的實際輸出
- [x] 6.4 `npx openspec validate fe-o11-coverage --strict` 通過，且本檔案沒有殘留的未完成項
