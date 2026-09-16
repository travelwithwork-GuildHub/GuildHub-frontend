## Applicability

權限：不適用 —— 本 change 不做授權判斷
併發：不適用 —— 設定在建置時固定，執行期不變
持久資料相容性：不適用 —— 不讀寫持久資料
失敗路徑：適用 —— 位址缺席、資料來源缺席或打錯字、建置在部署環境下失敗
測試連到什麼：不適用 —— 測試不連任何外部服務；位址全是字面值，建置閘門的測試只驗 `next build` 的結束碼

## MODIFIED Requirements

### Requirement: 部署出去的版本缺少設定時要立刻失敗

在 `preview` 與 `production` 環境，系統 MUST NOT 使用任何預設位址。
必要的環境變數缺席時，讀取設定 SHALL 立刻拋出錯誤，
且錯誤訊息 SHALL 指出**是哪一個變數**缺席。

**哪些變數是必要的，由該項設定實際會不會被解析決定**：
WebSocket 位址在即時層資料來源為 `guildhub` 時是必填，為 `none` 時
**MUST NOT 被要求** —— 要求一個永遠不會被讀取的位址，
只會逼人填一個假值進去，而假值會讓設定檔看起來像「有後端」。

REST base 在資料層資料來源為 `guildhub` 時是必填，為 `internal` 時
**MUST NOT 被要求** —— `internal` 打的是同源的 `/api`，那個位址永遠不會被讀取。
規則跟 WebSocket 位址那條是同一條，不另立。

**MUST NOT 安靜地退回本機預設值。**

環境代號本身缺席時，系統 SHALL 用建置模式當守門員：
建置模式是 production 而環境代號缺席時 SHALL 拋錯；不是 production 時
才可以視為本機。**沒有這一層，漏設環境代號的正式站會合法地退回 `localhost`**
—— 那正是這條 Requirement 要防的事，而「只檢查位址缺席」擋不住它。

#### Scenario: [FE-O09-S03] 部署環境缺任一個位址都要拋錯並指出是哪一個

- **WHEN** 在 `production` 環境、即時層資料來源為 `guildhub`、資料層資料來源為 `guildhub`、
  只設定了 WebSocket URL 而沒有 REST base 的情況下讀取 REST base
- **THEN** 拋出錯誤，訊息包含 REST base 的變數名稱
- **AND WHEN** 只設定了 REST base 而沒有 WebSocket URL，並讀取 WebSocket URL
- **THEN** 拋出錯誤，訊息包含 WebSocket URL 的變數名稱
- **AND** 兩種情況都 MUST NOT 回傳任何 `localhost` 位址

#### Scenario: [FE-O09-S04] 同一組缺席在本機是可以的

- **WHEN** 在本機環境、沒有設定任何位址的情況下讀取設定
- **THEN** 不拋錯，回傳本機預設值

> 兩條都要：只驗「部署環境會拋錯」的話，一個「永遠拋錯」的實作也會通過。

#### Scenario: [FE-O09-S07] 環境代號無法辨識，或部署版根本沒給，都要拋錯

- **WHEN** 把環境代號設成一個未列舉的值（例如把 `production` 打成 `prod`）並讀取設定
- **THEN** 拋出錯誤，訊息指出那個代號無法辨識
- **AND** MUST NOT 當成本機處理
- **AND WHEN** 環境代號缺席、而建置模式是 production
- **THEN** 拋出錯誤
- **AND WHEN** 環境代號缺席、而建置模式不是 production
- **THEN** 視為本機，不拋錯

### Requirement: 部署設定的錯誤 SHALL 在建置時失敗

當環境代號是 `preview` 或 `production` 時，系統 SHALL 在**建置期間**驗證
應用程式執行時會解析的每一項設定。任何一項不合法時，建置 SHALL 失敗
並回傳非零的結束碼。

**MUST NOT 產出一個「建置成功、但一載入就因設定錯誤而拋出」的 bundle。**
理由是失敗的方向：那種產物會讓 CI 綠燈、部署成功，
而訪客看到的是一片空白 —— 沒有任何一層會發出訊號。

`preview` 不得被排除在外。preview 部署是拿給人看的，
它壞掉的方式跟 production 完全一樣。

本機開發 **MUST NOT 被這個驗證擋住**：環境代號在本機缺席時仍然視為 `local`，
而 `local` 有安全的預設值。

#### Scenario: [FE-O14-S03] 缺少必要設定的部署建置會失敗

- **WHEN** 在環境代號為 `production`、即時層資料來源為 `guildhub`、
  但沒有設定 WebSocket 位址的情況下執行建置
- **THEN** 建置失敗，結束碼非零
- **AND** 輸出包含缺席的變數名稱
- **AND WHEN** 把環境代號換成 `preview`、其餘相同
- **THEN** 建置同樣失敗

#### Scenario: [FE-O14-S04] 環境代號缺席的 production 建置會失敗

- **WHEN** 在建置模式為 production、而環境代號完全沒有設定的情況下執行建置
- **THEN** 建置失敗，結束碼非零

#### Scenario: [FE-O14-S05] 設定齊全、以及本機開發，建置都要成功

- **WHEN** 在環境代號為 `production`、即時層資料來源為 `guildhub`、
  WebSocket 位址合法、且 REST base 合法的情況下執行建置
- **THEN** 建置成功，結束碼為零
- **AND WHEN** 環境代號為 `production`、即時層資料來源為 `none`、
  REST base 合法、且**沒有**設定 WebSocket 位址
- **THEN** 建置同樣成功
- **AND WHEN** 完全不設定任何環境變數、以本機開發模式啟動
- **THEN** 不因設定驗證而失敗

> 後兩條不能省。只驗「缺設定會失敗」的話，一個**永遠失敗**的實作也會通過，
> 而那個實作會把本機開發一起擋死。

## ADDED Requirements

### Requirement: 資料層的資料來源是一個明確的選擇

系統 SHALL 提供一個環境變數來宣告資料層連到哪裡，值 SHALL 是
`guildhub`（打 REST base 指定的後端）或 `internal`（打同源的 `/api`，
即前端自己的 Route Handlers）。缺席時 SHALL 視為 `guildhub`，**所有環境都一樣**；
無法辨識的值 SHALL 拋出錯誤，且 **MUST NOT 退回任何預設值**。

**`internal` 只在本機合法。** 在 `preview` 與 `production` 讀到 `internal` 時，
系統 SHALL 拋出錯誤，訊息指出是哪一個變數、並說明部署出去的 `internal` 沒有契約
（它的資料庫連線字串今天不在清單上，session secret 在清單上但**沒有標為建置時必驗**）。
這條的理由是**不讓「建置綠、部署綠、第一個請求就因設定缺席而失敗」換個地方出現**：
`部署設定的錯誤 SHALL 在建置時失敗` 要求驗「執行時會解析的每一項設定」，
而部署版 `internal` 會解析的那兩項今天沒有人驗。擋掉它，「沒有 internal 的部署」
就從營運狀態變成規格保證。要解禁的 spec PR SHALL 一併把 `INTERNAL_*` 各項改標為建置時必驗。

因此部署出去的版本只有一個合法的資料來源，系統 **MUST NOT 要求宣告它** ——
一個只有一個合法值的必填變數，是「填假的也沒差」的變數。
資料層與即時層是兩個獨立的軸，**MUST NOT 由其中一個推導另一個**。

值是 `internal`（因此只在本機）時，系統 SHALL 忽略 REST base，**不論它有沒有被設定、
格式對不對** —— 一個不會被讀取的值，它的格式不構成部署錯誤。
在 `preview`／`production` 讀 REST base 而資料來源是 `internal` 時，
先因 `internal` 非法而拋錯，永遠走不到「忽略」這一步。
讀到的結果 SHALL 表示「這個資料來源不適用 REST base」，
**MUST NOT 與「缺席」共用同一種表示**（缺席在 `guildhub` 下是拋錯，不是一個值）。

REST base 已在那份清單上（`要驗哪些設定只有一份清單`），SHALL 改標為**建置時必驗**；
因為部署出去的版本永遠是 `guildhub`，它在部署建置裡是**無條件**必填。
**清單裡「今天沒有任何元件呼叫 REST」那條理由 SHALL 退場** ——
它在寫下時是量過的事實，現在不是。

資料層資料來源本身 SHALL 列入那份清單，但標為**建置時不驗**並附理由：
清單對必驗項目的判準是「移除變數，驗證必須失敗」（`FE-O14-S06`），
而這個變數缺席是合法的。它在建置時仍然會被讀到 —— 解析 REST base 必須先問
資料來源才知道適不適用 —— 所以部署版 `internal` 在建置時失敗這件事，
由 REST base 那一項的解析承擔；`FE-O14-S06` 只保證**建置時必驗**項目的入口被執行，
不驗的項目不在它的迴圈裡 —— 這條相依關係由 `FE-O14-S14` 的 `internal` 建置案例保障。

#### Scenario: [FE-O14-S13] 資料層資料來源的四種情形

- **WHEN** 沒有設定資料層資料來源並讀取設定（本機與 `production` 各一次）
- **THEN** 兩次都得到 `guildhub`
- **AND WHEN** 在本機明確設成 `internal`
- **THEN** 得到 `internal`
- **AND WHEN** 在 `production`（以及 `preview`）設成 `internal`
- **THEN** 拋出錯誤，訊息包含那個變數的名稱，且說明 `internal` 只在本機
- **AND WHEN** 設成一個未列舉的值（例如 `intenral`）
- **THEN** 拋出錯誤，訊息指出那個值無法辨識
- **AND** MUST NOT 回傳 `guildhub` 或 `internal`

#### Scenario: [FE-O14-S14] REST base 的必填跟著資料層資料來源走，建置也是

- **WHEN** 在 `production`、資料層資料來源缺席（即 `guildhub`）、即時層資料來源為 `none`、
  **沒有設定** REST base 的情況下執行建置
- **THEN** 建置失敗，結束碼非零，輸出包含 REST base 的變數名稱
- **AND WHEN** 在 `production`、資料層資料來源設成 `internal`、其餘設定齊全的情況下執行建置
- **THEN** 建置失敗，結束碼非零，輸出包含資料層資料來源的變數名稱
- **AND WHEN** 在 `production`、資料層資料來源缺席、即時層資料來源為 `none`、
  REST base 設成合法位址的情況下執行建置
- **THEN** 建置成功，結束碼為零 —— 缺席預設 `guildhub` 不只是讀設定的行為，建置也認
- **AND WHEN** 在本機、資料層資料來源為 `internal`、REST base 設成一個
  **協定錯誤**的值（例如 `ws://`）並讀取 REST base
- **THEN** 不拋錯，且讀到的結果表示「這個資料來源不適用 REST base」（不是任何位址，
  也不是本機預設值）
- **AND WHEN** 同上，但 REST base 設成一個**合法**的位址、以及完全不設，各讀一次
- **THEN** 結果相同 —— 合法、錯誤、缺席都被忽略，不是只有錯誤值走特殊分支
- **AND WHEN** 資料層資料來源為 `internal` 並呼叫任何一個 domain operation
- **THEN** 送出的請求 URL 仍然是同源的 `/api/...`（`FE-O02-S02` 的義務不變）

> 第三、四條不能省：只驗「缺席建置紅」的話，一個「`restBase()` 不看資料來源」的實作也會通過，
> 而那會讓本機 `internal` 拿到 `localhost:8000` —— 打到一個不存在的後端，
> 症狀是「連不上」而不是「設定錯了」。
