## Purpose

前端在執行期要連到哪一份後端，以及那些值缺席或寫錯時系統該怎麼失敗。
它集中在一處，因為散在各處的位址會讓「換一份後端」變成搜尋整個 repo；
它的預設一律指向**開發者自己起的那一份**（`CONTEXT.md` 與 `AGENTS.md`
〈測試環境隔離〉的判準）；而部署出去的版本**不給預設值**，因為一個安靜退回
`localhost` 的正式站，症狀是「所有資料都不見了」而不是「設定錯了」。

## Applicability

權限：不適用 —— 這一刀不做授權判斷。
併發：不適用 —— 讀取是純函式，沒有共享狀態。
持久資料相容性：不適用 —— 不讀寫任何持久資料。
失敗路徑：適用 —— 變數缺席、協定寫錯、環境代號無法辨識、部署版沒有環境代號。
**測試連到什麼**：不適用 —— 測試不連任何外部服務。這一刀不發出任何請求，
測的是「算出來的位址對不對、缺值時會不會失敗」，全部是純函式。

## ADDED Requirements

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
且錯誤訊息 SHALL 指出**是哪一個變數**缺席。REST base 與 WebSocket URL
**兩個都是必填**。

**MUST NOT 安靜地退回本機預設值。**

環境代號本身缺席時，系統 SHALL 用建置模式當守門員：
建置模式是 production 而環境代號缺席時 SHALL 拋錯；不是 production 時
才可以視為本機。**沒有這一層，漏設環境代號的正式站會合法地退回 `localhost`**
—— 那正是這條 Requirement 要防的事，而「只檢查位址缺席」擋不住它。

#### Scenario: [FE-O09-S03] 部署環境缺任一個位址都要拋錯並指出是哪一個

- **WHEN** 在 `production` 環境、只設定了 WebSocket URL 而沒有 REST base 的情況下讀取設定
- **THEN** 拋出錯誤，訊息包含 REST base 的變數名稱
- **AND WHEN** 只設定了 REST base 而沒有 WebSocket URL
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
