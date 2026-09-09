# runtime-config Specification

## Purpose
前端在執行期要連到哪一份後端，以及那些值缺席或寫錯時系統該怎麼失敗。
它集中在一處，因為散在各處的位址會讓「換一份後端」變成搜尋整個 repo；
它的預設一律指向**開發者自己起的那一份**（`CONTEXT.md` 與 `AGENTS.md`
〈測試環境隔離〉的判準）；而部署出去的版本**不給預設值**，因為一個安靜退回
`localhost` 的正式站，症狀是「所有資料都不見了」而不是「設定錯了」。

## Requirements

### Requirement: 環境變數只有一處讀取，而且只能用字面存取

系統 SHALL 把所有環境變數的讀取集中在單一模組。
`src/` 底下**該模組以外的任何檔案 MUST NOT 讀取 `process.env`**，
且這條限制 SHALL 由 lint 規則強制，不是只寫在文件裡。

該模組內的每一次讀取 SHALL 是**完整的字面存取**（`process.env.NEXT_PUBLIC_X`）。
**MUST NOT 使用計算屬性**（`process.env[name]`）**或先把 `process.env`
指派給變數再取用** —— 這兩種寫法 Next.js 不會做建置期替換，
在瀏覽器裡會得到 `undefined`，而且**不會有任何錯誤訊息**。
這條限制同樣 SHALL 由 lint 規則強制。

#### Scenario: [FE-O09-S01] 別處讀 process.env、或用計算屬性讀，都會被 lint 擋下

- **WHEN** 對一個位於設定模組以外、內容讀取 `process.env` 的檔案跑 lint
- **THEN** 回報錯誤，訊息說明環境變數只能從設定模組讀
- **AND WHEN** 對設定模組本身、內容是字面存取的程式碼跑同一份 lint
- **THEN** 不回報那條錯誤
- **AND WHEN** 對設定模組本身、內容用計算屬性讀 `process.env` 的程式碼跑 lint
- **THEN** 回報錯誤 —— 那種寫法不會被建置期替換

### Requirement: 本機預設指向開發者自己起的那一份後端

在本機環境、且沒有設定任何環境變數時，系統 SHALL 提供可直接使用的預設值，
且那些預設值 SHALL 指向 `localhost`。

MUST NOT 把任何共用實例的位址寫成預設值。

REST 的預設 SHALL 是 `http://localhost:8000`，
WebSocket 的預設 SHALL 是 `ws://localhost:8000/ws` —— 這兩個位址是實測過的：
後端 `bash run.sh` 起來之後 `http://localhost:8000/openapi.json` 回 200，
`ws://localhost:8000/ws` 連得上並收到 `hello`。

#### Scenario: [FE-O09-S02] 什麼都沒設定時拿到本機位址

- **WHEN** 在本機環境、沒有設定任何相關環境變數的情況下讀取設定
- **THEN** REST base 是 `http://localhost:8000`
- **AND** WebSocket URL 是 `ws://localhost:8000/ws`

### Requirement: 部署出去的版本缺少設定時要立刻失敗

在 `preview` 與 `production` 環境，系統 MUST NOT 使用任何預設位址。
必要的環境變數缺席時，讀取設定 SHALL 立刻拋出錯誤，
且錯誤訊息 SHALL 指出**是哪一個變數**缺席。

**哪些變數是必要的，由該項設定實際會不會被解析決定**：
WebSocket 位址在即時層資料來源為 `guildhub` 時是必填，為 `none` 時
**MUST NOT 被要求** —— 要求一個永遠不會被讀取的位址，
只會逼人填一個假值進去，而假值會讓設定檔看起來像「有後端」。

REST base 在被讀取時是必填。

**MUST NOT 安靜地退回本機預設值。**

環境代號本身缺席時，系統 SHALL 用建置模式當守門員：
建置模式是 production 而環境代號缺席時 SHALL 拋錯；不是 production 時
才可以視為本機。**沒有這一層，漏設環境代號的正式站會合法地退回 `localhost`**
—— 那正是這條 Requirement 要防的事，而「只檢查位址缺席」擋不住它。

#### Scenario: [FE-O09-S03] 部署環境缺任一個位址都要拋錯並指出是哪一個

- **WHEN** 在 `production` 環境、即時層資料來源為 `guildhub`、
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

### Requirement: 位址的協定寫錯要在讀設定時就失敗

系統 SHALL 驗證位址的協定：REST base SHALL 是 `http:` 或 `https:`，
WebSocket URL SHALL 是 `ws:` 或 `wss:`。不符合時 SHALL 拋出錯誤。

理由是**失敗的距離**：把 `http://` 填進 WebSocket 變數，錯誤要到真的建立連線
時才出現，而那時的症狀跟「後端沒開」「路徑打錯」「握手被拒」**完全一樣** ——
三種都實測過，客戶端看到的都是 `close code=1006`、`reason=""`、`wasClean=false`。

#### Scenario: [FE-O09-S05] 協定寫錯在讀設定時就拋錯

- **WHEN** 把 WebSocket URL 設成 `http://localhost:8000/ws` 並讀取設定
- **THEN** 拋出錯誤，訊息指出協定不正確
- **AND WHEN** 把 REST base 設成 `ws://localhost:8000`
- **THEN** 同樣拋出錯誤
- **AND WHEN** 兩者都設成正確的協定
- **THEN** 不拋錯

### Requirement: 憑證模式是單一來源

系統 SHALL 匯出一個 REST 請求要用的憑證模式常數，值 SHALL 是 `include`。

**這條 Requirement 只保證「有一個單一來源，而且值是 include」。**
它**不保證**任何資料存取真的用了它 —— 這一刀沒有任何資料存取存在，
證明不了那件事。「每個 adapter 的請求都帶上它」屬於 `FE-O02` 的驗收。

WebSocket 握手用的是同一個 session cookie，由瀏覽器依 cookie 自身的
`SameSite`／`Secure`／`Domain` 政策決定送不送，**與後端的 CORS 設定無關**
（WebSocket 的 `Upgrade` 請求不走 CORS preflight）。**cookie 到底有沒有送到
必須實測**，那是 `FE-R01` 的事，這一刀不做任何宣稱。

#### Scenario: [FE-O09-S06] 憑證模式的值是 include

- **WHEN** 讀取憑證模式常數
- **THEN** 得到 `include`

### Requirement: 即時層的資料來源是一個明確的選擇

系統 SHALL 提供一個環境變數來宣告即時層連到哪裡，值 SHALL 是
`guildhub`（連 WebSocket 位址指定的後端）或 `none`（這個部署沒有即時後端）。

**在本機**缺席時 SHALL 視為 `guildhub`；**在 `preview` 與 `production` 缺席時
SHALL 拋出錯誤**，訊息指出是哪一個變數。這跟位址那兩個變數是同一條規則
（`部署出去的版本缺少設定時要立刻失敗`）：部署出去的版本不給預設值。

無法辨識的值 SHALL 拋出錯誤，且 **MUST NOT 退回任何預設值** ——
打錯字的部署要紅，不是安靜地換一個資料來源。

`none` SHALL 是**唯一**能讓部署合法地沒有 WebSocket 位址的方式。
系統 **MUST NOT 把「WebSocket 位址缺席」本身當成「沒有即時後端」** ——
那會讓一個忘了設位址的正式部署安靜地變成單人模式，
而症狀是「怎麼都看不到別人」，不是「設定漏了」。

值是 `none` 時，系統 SHALL 忽略 WebSocket 位址，**不論它有沒有被設定**。
**MUST NOT 要求那個變數不存在** —— 部署平台的環境變數會被 preview 繼承，
逼人去刪一個被忽略的值只會增加部署摩擦，而摩擦會讓人改用假值繞過。

#### Scenario: [FE-O14-S01] 四種情形各自的結果

- **WHEN** 在本機、沒有設定即時層資料來源並讀取設定
- **THEN** 得到 `guildhub`
- **AND WHEN** 在 `production`、沒有設定即時層資料來源
- **THEN** 拋出錯誤，訊息包含那個變數的名稱
- **AND WHEN** 明確設成 `none`
- **THEN** 得到 `none`
- **AND WHEN** 設成一個未列舉的值（例如 `nome`）
- **THEN** 拋出錯誤，訊息指出那個值無法辨識
- **AND** MUST NOT 回傳 `guildhub` 或 `none`

#### Scenario: [FE-O14-S02] `none` 時殘留的 WebSocket 位址被忽略而不是被拒絕

- **WHEN** 即時層資料來源為 `none`、同時設定了一個合法的 WebSocket 位址
- **THEN** 讀取設定不拋錯
- **AND** 系統不使用那個位址建立任何連線
- **AND WHEN** 即時層資料來源為 `none`、設定了一個**協定錯誤**的 WebSocket 位址
  （例如 `http://`）
- **THEN** 讀取設定同樣不拋錯 —— 一個不會被讀取的值，它的格式不構成部署錯誤

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
  且 WebSocket 位址合法的情況下執行建置
- **THEN** 建置成功，結束碼為零
- **AND WHEN** 環境代號為 `production`、即時層資料來源為 `none`、
  且**沒有**設定 WebSocket 位址
- **THEN** 建置同樣成功
- **AND WHEN** 完全不設定任何環境變數、以本機開發模式啟動
- **THEN** 不因設定驗證而失敗

> 後兩條不能省。只驗「缺設定會失敗」的話，一個**永遠失敗**的實作也會通過，
> 而那個實作會把本機開發一起擋死。

### Requirement: 要驗哪些設定只有一份清單

設定模組 SHALL 匯出一份清單，列出每一個設定項目、它的變數名稱、
以及它在部署建置時**是否必須被驗證**。建置時的驗證 SHALL 迭代那份清單，
**MUST NOT 逐一列舉個別變數**。

兩份清單會漂，而漂掉的方向必然是建置時比執行時鬆 ——
於是閘門看起來還在、實際上已經漏了。

清單中被標為「建置時不驗」的項目 SHALL 附上理由。

#### Scenario: [FE-O14-S06] 清單裡每一個必驗項目，缺席時建置都要失敗

- **WHEN** 對清單中每一個標為「建置時必驗」的項目，逐一移除它的環境變數
  並執行驗證
- **THEN** 每一個都要失敗，且錯誤訊息包含該項目的變數名稱
- **AND** 這條的測試 SHALL **由那份清單驅動**，不得寫死項目名稱 ——
  寫死的話，新增一個項目時這條會安靜地不涵蓋它

### Requirement: 沒有即時後端時 MUST NOT 建立連線

即時層的資料來源是 `none` 時，系統 **MUST NOT 建立任何 WebSocket 連線**。

`none` 是一個正常狀態，不是錯誤：系統 **MUST NOT 因此產生
錯誤或警告層級的診斷輸出**。

#### Scenario: [FE-O14-S07] `none` 時完全不碰 socket，而且不吵

- **WHEN** 在即時層資料來源為 `none` 的情況下掛載世界
- **THEN** 建立 socket 的工廠一次都沒有被呼叫
- **AND** 沒有任何錯誤或警告層級的診斷輸出
- **AND WHEN** 同一個世界在資料來源為 `guildhub` 的情況下掛載
- **THEN** 那個工廠被呼叫，且拿到的位址來自設定

> 斷言「畫面上沒有別人」是恆真的 —— 沒有後端時本來就沒有別人。
> 唯一量得到的是**有沒有嘗試連線**。

#### Scenario: [FE-O14-S08] `none` 時缺 WebSocket 位址不會讓世界倒掉

- **WHEN** 在即時層資料來源為 `none`、環境代號為 `production`、
  且沒有設定 WebSocket 位址的情況下掛載世界
- **THEN** 不拋出任何錯誤
- **AND** 世界的容器元素存在於畫面上

> 「世界的容器存在」是刻意寫得這麼窄的。斷言「世界正常呈現」量不到東西 ——
> 只要沒拋錯，元件本來就會掛載，那是同義反覆。

### Requirement: 世界不解釋「為什麼看不到別人」

世界 **MUST NOT** 呈現任何告訴訪客「這裡刻意沒有即時後端」或
「看不到其他人是正常的」的說明，不論即時層的資料來源是什麼。

這條 **MUST NOT** 的理由要留在規格裡而不是只留在提案裡：
一條「畫面上刻意什麼都沒有」的規格，沒有理由的話，
下一個人只會讀成「有人忘了做提示」然後把它補回來。
理由是**這個部署對外的用途是展示世界**，
而一段技術狀態說明會先於世界被讀到。

**這條 MUST NOT 禁止呈現真正的連線失敗。** 有位址但連不上的呈現由
`FE-R12`（W5）決定，可以用任何角色與任何措辭 —— 唯一的限制是
**MUST NOT 借用「一切正常」性質的措辭**（例如「單人預覽」）。
那正是退場的 `FE-O14-S10` 守的東西：兩個狀態使用者該做的事相反
（前者沒事，後者要回報或稍後再試），共用同一段文字
等於在真的壞掉的那天告訴使用者一切正常。

判準 SHALL 下在**訪客真的會讀到的文字**上，
**MUST NOT** 只用測試專用的識別碼（`data-testid` 之類）——
換一個識別碼就繞過去了。禁止出現的措辭至少包含
「單人預覽」、「看不到其他人」、「即時伺服器」。

> **MUST NOT 用「畫面上沒有任何 `status` 角色的元素」當判準。**
> 那條看起來更嚴，實際上是錯的：`status` 在這個世界已經有兩個合法
> 使用者（載入中、互動提示），而 `FE-R12` 大機率會是第三個。
> 寫成那樣的話這條規格今天就是假的，而且會擋掉未來正確的實作。

驗證這條的 Scenario SHALL 包含一個**正向斷言，證明世界真的渲染完成了**
—— 具體是「載入中的狀態已經消失」。只斷言容器存在不夠：
一個內部出錯只剩空殼容器的世界也會有容器，
而在空白畫面上「沒有那段文字」恆真。

#### Scenario: [FE-O14-S11] 資料來源是 `none` 時世界渲染完成，但沒有任何說明

- **WHEN** 在即時層資料來源為 `none` 的情況下呈現世界
- **THEN** 載入中的狀態不存在於畫面上（世界渲染完成了）
- **AND** 畫面上的文字不含「單人預覽」、「看不到其他人」、「即時伺服器」

#### Scenario: [FE-O14-S12] 連線失敗之後也不出現「一切正常」的措辭

- **WHEN** 在即時層資料來源為 `guildhub` 的情況下呈現世界
- **THEN** 載入中的狀態不存在於畫面上（世界渲染完成了）
- **AND WHEN** socket 工廠**確實被呼叫過**，且該 socket 回報關閉、
  而 `open` 從來沒有觸發過
- **THEN** 畫面上的文字仍然不含「單人預覽」、「看不到其他人」、「即時伺服器」

> 中間那句「工廠確實被呼叫過」是從退場的 `FE-O14-S10` 原封搬過來的。
> 少了它，一個根本沒走到連線路徑的測試也會綠 ——
> 而那正是這條要防的情況。
>
> `S11` 與 `S12` 在今天的結果一樣，但它們防的是不同的未來：
> `S11` 防「有人把單人預覽的說明加回來」，
> `S12` 防「`FE-R12` 做出來時借用了那段措辭」。
> **兩條的突變測試不同**，見 tasks 的第 4 節。
