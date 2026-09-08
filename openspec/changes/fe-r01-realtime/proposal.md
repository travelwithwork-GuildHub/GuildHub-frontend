## Why

W1 里程碑有四個條件，兩個還沒成立：**「看得到別人」與「40 browser gate 過」**。
那兩個都在 `FE-R` 那一組，而整組的第一項是這一個 —— `FE-R02`–`FE-R09`
沒有一項在沒有連線的情況下做得動。

前置條件到齊了：`FE-O01` 給了 WS 訊息的形狀（`api-contract`），
`FE-O09` 給了位址（`runtime-config`）。

**不做會發生的具體事情**：下一個要碰即時層的人會自己開一個 `new WebSocket(...)`。
那件事有兩個後果，都是實測過的：

1. **他會漏掉 `hello`。** 握手成功後 `hello` 與 `snapshot` 相隔 **不到 1 毫秒**
   就一起到。監聽器晚一步掛上去就收不到 `hello`，於是**不知道自己的 id** ——
   而 `snapshot` 裡**包含自己**。少了 id，`FE-R07` 會替使用者自己建一個遠端分身，
   `FE-R05` 也擋不掉自己的回聲。
2. **他會相信 close code。** `docs/WBS.md` 與 `CONTEXT.md` 都寫著「握手失敗
   直接 close 1008」。**客戶端看不到 1008** —— 實測是 `1006`、空 reason，
   而且「不合法 scene」「room 沒帶 token」「路徑根本不存在」**三種的事件序列
   一模一樣**。照文件寫的 `if (code === 1008)` 是一段**永遠不會執行的死碼**。

## What Changes

- 新增 `src/realtime/`：一個 RealtimeClient，負責建立連線、完成握手、
  維護連線狀態、進出 scene、以及關閉時的清理。
- 連線狀態機：`idle → connecting → open → ready → closed`。
  **`ready` 是收到 `hello` 之後** —— 只有在 `ready` 才知道自己的 id，
  也只有在 `ready` 才准送訊息。
- 關閉事件帶**原始事實**（`code` / `reason` / `wasClean` / `opened`），
  且契約**明文不承諾任何原因分類**。`opened` 是客戶端真的分辨得出來的那一件事：
  握手成功過，還是從來沒成功。
- **不做應用層的保活。** 實測靜止 35 秒連線完全沒事、期間零則應用層訊息 ——
  保活在 WebSocket 協定層（伺服器送 ping、瀏覽器自動 pong）。
  這一條寫成規格裡的**否定契約**，並有一條會紅的測試盯著。
- 進出 scene：**一條連線只屬於一個 scene**，切場景等於關掉重開（協定沒有 switch 訊息）。

### 不做什麼（Non-goals）

- **不做訊息驗證政策。** 「驗證每一則進來的訊息、未知 `t` 明顯失敗」是 `FE-R02`。
  這一刀只用 `api-contract` 的 schema **認出 `hello`**，其餘訊息原樣交出去。
- **不送任何位置。** 取樣、`≤10 Hz`、整數像素、靜止停送是 `FE-R03`。
- **不處理頁籤切到背景**（`FE-R04`）、**不處理本地回聲**（`FE-R05`）、
  **不定義多分頁語意**（`FE-R06`）、**不建立任何遠端玩家**（`FE-R07`）。
- **不做重連、退避、或使用者看得見的連線狀態** —— 那是 `FE-R12`（W5）。
  這一刀的狀態機是**下游程式碼要用的**，不是 UI 要顯示的。
- **不做 room token 的取得。** `token` 是傳進來的參數；怎麼拿到它是
  `FE-N07` 房間權限與 `FE-O02` 的事。
- **不宣稱 cookie 有沒有送到。** `FE-O09` 把這件事留給這一刀，
  但**它需要瀏覽器**（Node 的 WebSocket 不帶 cookie）—— 見 `design.md` 的驗證方式。

## Capabilities

### New Capabilities
- `realtime-client`: 與後端即時層之間那條連線的生命週期 —— 建立、握手、
  狀態、進出 scene、關閉與清理，以及**客戶端對失敗原因能說與不能說的話**。

### Modified Capabilities

（無。`api-contract` 與 `runtime-config` 都只是被使用，行為不變。）

## Impact

- 新增 `src/realtime/**`。
- 從 `runtime-config` 讀位址、從 `api-contract` 讀訊息形狀。**兩者都不改**。
- 不影響 `/world` 的現有畫面 —— 這一刀不接上任何渲染。
- 之後 `FE-R02`–`FE-R08` 建在它上面；`FE-R12`（W5）會在它外面包重連。
