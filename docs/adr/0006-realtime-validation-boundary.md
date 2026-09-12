# 0006. 進來的即時訊息只有一條路：先過驗證，才到下游

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: 實作 `FE-R01`／`FE-R02` 的那個 session；2026-09-12 事後審查
- **邊界狀態**: 已知缺口
- **證據**: src/realtime/client.ts:44、src/world/RemoteWorld.tsx:102、openspec/specs/realtime-protocol/spec.md

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

`realtime-client`（連線、重連、保活）與 `realtime-protocol`（每一則訊息驗證成功
或失敗二選一）拆成兩個 capability。`realtime-protocol` 的 Purpose 寫了它為什麼存在：

> 下游有三項（`FE-R05`／`FE-R07`／`FE-R08`）都要從同一批訊息取值 ——
> 沒有這一層的話，同一份協定會被判斷三次，而**最鬆的那一次決定了實際的信任邊界**。

## 決定

拆開是對的：client 不決定訊息的意義，protocol 不管連線。

## 代價 —— 而且這是目前守不住的

`src/realtime/client.ts:44` 對外交出的是**原始字串**（`onMessage?: (raw: string) => void`）。
目前唯一的消費者 `src/world/RemoteWorld.tsx:102` 有先過 `createMessageValidator`，
所以**現在沒有東西掉得進去**。但 `FE-R05`／`FE-R08` 的實作者可以直接訂 `onMessage`
自己 `JSON.parse`，完全繞過驗證 —— 這正是規格說要防的「判斷三次、最鬆的決定邊界」。

規格自己宣告的限制（「保證不了呼叫端不忽略通報」）是另一件事：那是拿到驗證結果
之後不看；這裡講的是根本不經過驗證。前者宣告過，後者沒有。

**所以這條邊界標「已知缺口」**：規格說有這條邊界、程式碼沒有保證。
不把它標成「僅約定」的理由是：它跟 0007 用的是同一把尺 —— 0007 拒絕「一個 store
加一個不要 setState 的約定」，理由是「那條約定沒有任何東西在擋，違反不會有錯誤訊息」。
這裡一樣。

## 補上的方向（尚未排定）

1. client 收 validator、`onMessage` 只吐 `ValidationResult` —— 依賴變成
   `client → protocol → contract`，仍無環，而且只有一條路進得來。代價是 client 的
   Purpose 要改（它會「知道有驗證這件事」）。
2. 保留 raw 但改名成 `onRawForDiagnostics`，型別與文件上表明不是資料路徑。擋不住，
   但下一個人寫的時候會停一下。

選哪一條由開 change 的人決定。補上之後：狀態改「已強制」，證據改指到那條會在
「繞過驗證」時失敗的測試。**在那之前不要把這份 ADR 的狀態改掉。**

## 什麼情況下要重新考慮

- `FE-R05` 或 `FE-R08` 開始實作 —— 那是補這條最便宜的時間點，等它們落地再收要連它們一起改。
