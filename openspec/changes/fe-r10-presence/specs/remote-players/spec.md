## Applicability

權限：不適用 —— 本 change 不新增授權判斷；身分與 scene 門禁沿用既有連線結果。

併發：適用 —— WebSocket 訊息會在 React 尚未完成前一次名單重繪時繼續到達，
離場清理與狀態更新不得留下可被下一個同 id 玩家讀到的舊值。

持久資料相容性：不適用 —— Presence 只活在目前 WebSocket session，不讀寫資料庫。

失敗路徑：適用 —— 未知玩家的狀態、重複 join／leave，以及尚未取得 snapshot 的
連線都不得產生鬼影、錯誤人數或殘留資料。payload 形狀不合法由既有 `FE-R02` 拒絕，
本 change 不建立第二套驗證。

測試連線：狀態與計數的單元測試不連外部服務；雙瀏覽器驗收只連當次在 loopback
啟動的前端、可拋棄後端與測試資料庫，MUST NOT 連團隊共用或正式環境。

## ADDED Requirements

### Requirement: 遠端玩家保有目前的狀態文字

每個遠端玩家 SHALL 有一個目前狀態文字，預設為空字串。初次建立名單時 SHALL
採用 `snapshot` 裡該玩家的 `st`；後來從 `presence.join` 加入的玩家 SHALL 採用
該 join payload 的 `st`。

收到已知遠端玩家的 `status` 訊息時，系統 SHALL 只更新該玩家的狀態文字，
MUST NOT 改變名單成員、位置樣本或其他玩家的狀態。收到自己或不在名單裡的 id
時 SHALL 忽略，MUST NOT 因此建立遠端玩家。

狀態文字的線路上限沿用 `api-contract` 已定義的 **12 個 Unicode code point**；
不合契約的 payload 在進入這一層之前已被拒絕，本 capability MUST NOT 再截斷或
改寫已驗證的文字。

#### Scenario: [FE-R10-S01] snapshot 建立每個人的狀態

- **WHEN** 收到一則包含自己與兩個遠端玩家的 `snapshot`，兩人分別帶空白與非空白 `st`
- **THEN** 兩個遠端玩家的目前狀態分別等於各自的 `st`
- **AND** 自己仍不會成為遠端玩家

#### Scenario: [FE-R10-S02] 後來加入的人從 join 取得狀態

- **WHEN** 收到一則 `presence.join`，新玩家的 `st` 已有內容
- **THEN** 該玩家加入名單時就有那份狀態
- **AND** 不需要等待後續 `status` 訊息

#### Scenario: [FE-R10-S03] status 只更新指定玩家

- **WHEN** 名單裡有兩個遠端玩家，收到其中一人的 `status`
- **THEN** 只有指定玩家的狀態改變
- **AND** 名單成員、兩人的位置樣本及另一人的狀態完全不變

#### Scenario: [FE-R10-S04] 未知與自己的 status 不建立鬼影

- **WHEN** 收到不在名單裡的 id 或自己的 id 的 `status`
- **THEN** 遠端名單與所有 per-player 資料完全不變
- **AND** 處理過程不拋錯

### Requirement: 離場與權威重建不留下舊狀態

`presence.leave` SHALL 同步移除該玩家的狀態；後來同一個 id 再加入時，只能讀到
新 join payload 的 `st`。收到新的 `snapshot` 時，系統 SHALL 以該 snapshot
取代整份目前狀態，MUST NOT 保留前一份 snapshot 裡任何玩家的舊狀態。
收到同一個已在名單裡的 id 的 `presence.join`（沒有先收到該 id 的 `leave`）時，
系統 SHALL 以該 join payload 的 `st` 更新這個人的狀態，MUST NOT 因此新增
第二筆名單項目或改變在線人數。

#### Scenario: [FE-R10-S05] leave 後同 id 再加入不會讀到舊狀態

- **WHEN** 一名有非空白狀態的玩家離場，之後以同一個 id、空白 `st` 再加入
- **THEN** 再加入後的狀態是空白
- **AND** 離場前的文字沒有重新出現

#### Scenario: [FE-R10-S06] 新 snapshot 取代仍在線玩家的舊狀態

- **WHEN** 一名玩家目前有非空白狀態，後來收到仍包含他的 snapshot，但其中 `st` 已改為空白
- **THEN** 他的目前狀態變成空白
- **AND** 舊狀態沒有被合併或保留

#### Scenario: [FE-R10-S11] 重複 join 不建立第二筆，但刷新該 id 的狀態

- **WHEN** 名單裡已有一個帶非空白狀態的玩家，收到同一個 id 的 `presence.join`，
  其中的 `st` 是空白
- **THEN** 該玩家的狀態變成空白
- **AND** 名單裡仍然只有這一筆，在線人數不變

### Requirement: 使用者看得到目前 scene 的在線人數

WebSocket 完成初始 `snapshot` 後，系統 SHALL 顯示目前伺服器 scene 的在線人數。
人數 SHALL 等於權威 Presence 名單裡不同玩家 id 的數量，**包含目前使用者自己**；
MUST NOT 直接採用已排除自己的遠端角色數量。同一 user id 同時有多條
WebSocket 連線時 SHALL 只計一人；匿名連線因各自取得不同 id，所以各自計一人。

後續 `presence.join`／`presence.leave` SHALL 更新人數；重複 join、未知 id 的 leave、
`status` 與 `pos` MUST NOT 改變人數。在初始 snapshot 尚未到達或連線已卸載時，
系統 SHALL 把在線人數視為尚未就緒，MUST NOT 顯示任何數字作為目前在線人數。

#### Scenario: [FE-R10-S07] 初始在線人數包含自己

- **WHEN** 初始 snapshot 含自己與另外兩個不同 id 的玩家
- **THEN** 顯示的在線人數是 3
- **AND** 畫面上的遠端角色仍只有另外兩個人

#### Scenario: [FE-R10-S08] join 與 leave 更新在線人數

- **WHEN** 初始在線人數是 3，之後一個新 id 加入、同一 id 因另一條連線重複
  join，再有一個現有 id 離開
- **THEN** 顯示的人數依序變成 4、維持 4、再變成 3
- **AND** status、pos 與未知 id 的 leave 都不改變人數

#### Scenario: [FE-R10-S09] 新連線取得 snapshot 前不顯示舊人數

- **WHEN** 前一條連線曾顯示非零人數，之後該連線卸載並建立新的連線
- **THEN** 新連線取得自己的 snapshot 前，畫面不顯示任何在線人數數字
- **AND** 新 snapshot 到達後才顯示它所代表的人數

### Requirement: 兩個獨立登入身分互相看得到姓名

當兩個不同登入身分位於同一個伺服器 scene 時，每一方 SHALL 在另一方的遠端角色
上看見後端 Presence payload 所帶的姓名。這條是 `FE-R10` 的端到端整合驗收；
角色旁姓名的渲染能力由 `FE-W08` 提供，該能力尚未合併時本 Scenario 尚不具備
執行前提，MUST NOT 用假標籤或測試專用 UI 代替。

驗收 MUST 使用兩個隔離 cookie 的瀏覽器 context 或兩個瀏覽器，MUST NOT 使用
共用 cookie 的兩個普通分頁冒充兩個登入身分。

#### Scenario: [FE-R10-S10] 兩個瀏覽器互見對方姓名

- **WHEN** 兩個隔離 cookie 的瀏覽器分別登入「甲」與「乙」，並進入同一個 scene
- **THEN** 甲的畫面在乙的遠端角色上看得到「乙」
- **AND** 乙的畫面在甲的遠端角色上看得到「甲」
- **AND** 兩邊看到的姓名都不是共用 fallback，也不是自己的姓名
