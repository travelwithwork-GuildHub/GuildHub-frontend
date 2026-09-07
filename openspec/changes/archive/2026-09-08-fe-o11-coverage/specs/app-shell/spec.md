## MODIFIED Requirements

### Requirement: 工程品質指令可執行且誠實

`lint`、`typecheck`、`test`、`build` 四個指令 SHALL 各自實際執行對應的檢查，
並以檢查結果決定退出狀態碼。

`test` 指令 SHALL 回報實際執行的測試數量；當可執行的測試數為 **0** 時，
該指令 SHALL 以非零狀態結束。零個測試而回報成功等同於沒有驗證。

專案 SHALL 將 Node.js 主版本釘在 **24**，與持續整合環境使用的版本一致。

#### Scenario: [FE-X01-S10] 四個指令都真的跑

- **WHEN** 在一份健康的工作區依序執行 `lint`、`typecheck`、`test`、`build`
- **THEN** 四個指令都以狀態碼 `0` 結束
- **AND** `test` 的輸出包含大於 `0` 的測試數量
- **VERIFY-BY** `ci-job`｜ci.yml 的 Lint／Typecheck／Test／Build 四個步驟｜CI 的 job 本身就是這條的執行；在測試裡遞迴跑 npm run build 是沒有意義的

#### Scenario: [FE-X01-S11] 型別錯誤不被放過

- **WHEN** 原始碼中存在一個型別錯誤而執行 `typecheck`
- **THEN** 該指令以非零狀態結束，並指出錯誤的檔案與行

#### Scenario: [FE-X01-S12] 沒有測試不算通過

- **WHEN** 可執行的測試數為 `0` 而執行 `test`
- **THEN** 該指令以非零狀態結束
