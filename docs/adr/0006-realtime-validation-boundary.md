# 0006. 進來的即時訊息只有一條路：先過驗證，才到下游

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: 實作 `FE-R01`／`FE-R02` 的那個 session；2026-09-12 事後審查
- **邊界狀態**: 已強制
- **證據**: tests/boundary-lint-rule.test.ts:68、eslint.config.mjs:265、src/world/RemoteWorld.tsx:105

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

`src/realtime/client.ts:44` 對外交出的是**原始字串**（`onMessage?: (raw: string) => void`，
`client.ts:237` 吐出來）。目前 `src/` 裡唯一訂它的是 `src/world/RemoteWorld.tsx:105`，
而且接法是對的（先 `validate(raw)`、`!result.ok` 就 return）—— 所以**現在沒有東西掉得進去**。

這件事 2026-09-08 第一次報的時候，`FE-R05`／`FE-R08` 還沒開始，報告說「它們的實作者可以
直接訂 `onMessage` 自己 `JSON.parse`」。到 2026-09-12（main = `8479410`）兩項都封存了
（#127、#122），**沒有出現第二個消費者** —— 兩項都走 `RemoteWorld` → `applyMessage`。
缺口沒有變大；但守住它的仍然是「大家都走 `RemoteWorld`」這條約定，不是任何會變紅的東西。
下一個要碰即時訊息的是 `FE-R10`（presence；design 也走 `RemoteWorld`）與 `FE-R04`
（background-tab；delta 動到 `realtime-client`）。

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
3. **不動 client，鎖住「誰可以訂它」**：`eslint.config.js` 加一段 `no-restricted-imports`，
   `src/**` 只有 `src/world/RemoteWorld.tsx` 可以 import `@/realtime/client` 的值
   （`src/world/PositionSync.tsx:6` 只 `import type`，要嘛列進例外，要嘛用會放行
   type import 的寫法），配一條 `tests/env-lint-rule.test.ts` 那種 `lintText` 的測試。
   這條**一行正式碼都不改**，也不改 `realtime-client` 的 Purpose；它把邊界從
   「大家都走 `RemoteWorld`」變成「不走 `RemoteWorld` 會變紅」。跟 `docs/adr/0005`
   要的是同一段規則。代價：它鎖的是 import，不是「進 `RemoteWorld` 之後有沒有先驗證」——
   那半截還是 review 在守；但至少「第二條路」開不出來。

四天下來的觀察：**沒有人繞，但也沒有東西擋** —— 這是第 3 條的價值，它最便宜，
而且不用等哪個 change 順路。選哪一條由開 change 的人決定。補上之後：狀態改「已強制」，
證據改指到那條會在「繞過驗證」時失敗的測試。**在那之前不要把這份 ADR 的狀態改掉。**

## 什麼情況下要重新考慮

- 2026-09-08 版寫的是「`FE-R05` 或 `FE-R08` 開始實作前」—— 已經過了，兩項都封存了，
  而且沒有加消費者。現在的觸發點：**`FE-R04` 動 `realtime-client` 的時候**（同一份 spec、
  同一個 client，方向 1 順路）；或者不等 —— 方向 3 隨時可以做，不依賴任何 change 的排程。
- `src/` 裡出現第二個 `new RealtimeClient(` —— 那一刻缺口從「理論上」變成「有兩條路」。
