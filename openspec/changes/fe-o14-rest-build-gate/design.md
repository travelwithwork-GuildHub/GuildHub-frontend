## Context

`runtime-config` 的清單 `DEPLOY_CONFIG_ITEMS` 是唯一一份「建置時驗什麼」。
`NEXT_PUBLIC_GUILDHUB_REST` 那一項的 `skipReason` 是一句**過期的量測**
（「沒有任何元件呼叫 REST」）。清單的設計本身是對的 —— 它逼每一個不驗的項目
附理由，而理由過期就是這個 change 要修的事。

## D1｜REST base 的「必填」條件跟 WebSocket 位址同一條規則

**選項 A：無條件必填（`checkedAtBuild: true`，其餘不動）。** 一行 diff。
代價：`internal` 部署被迫填一個永遠不會被讀取的位址。這個 repo 對那種變數的
判斷已經寫進 `runtime-config`（「要求一個永遠不會被讀取的位址，只會逼人填一個
假值進去，而假值會讓設定檔看起來像『有後端』」）—— 選 A 等於對 REST 違反
自己對 WS 立下的規則。

**選項 B（採用）：`restBase()` 在資料來源是 `internal` 時回 `null`，其餘照舊。**
形狀跟 `wsUrl()` 在 `none` 時回 `null` 一模一樣，清單項目不用加條件、
`FE-O14-S06` 的測試（由清單驅動）自動涵蓋它。
代價：`restBase()` 的回傳型別從 `string` 變成 `string | null`，
`src/api/transport.ts` 的 `baseFor` 要改成「先問 `restBase()`，`null` 才走同源」。
那個改法反而拿掉了 `baseFor` 現在那個 `adapter` 參數 —— 兩處判斷 adapter
變成一處。

**`null` 的意思是「這個 adapter 不適用 REST base」，不是「設定缺席」。**
缺席在 `guildhub` 下是拋錯，永遠不會以 `null` 的形式出現；呼叫端拿到 `null`
只有一種解讀。這句話要寫進 `restBase()` 的 doc comment（審查要求）。

**`NEXT_PUBLIC_DATA_ADAPTER` 進清單，但 `checkedAtBuild: false`。** 第三版把它列成
`true`，審查抓到跟 `S06` 矛盾：`S06` 對每個必驗項目「移除變數 → 必須失敗」，而它缺席是合法的。
第四版乾脆不列，審查再抓：「要驗哪些設定只有一份清單」說的是**每一個設定項目**都要在清單上，
不驗的附理由 —— 清單模型本來就有這個格子。所以：列入、`false`、`skipReason` 寫
「缺席合法（預設 `guildhub`）；部署版 `internal` 的限制在 `restBase()` 解析時驗」。
部署版 `internal` 的建置失敗**經由 REST base 那一項**發生，錯誤訊息點名的是
`NEXT_PUBLIC_DATA_ADAPTER`；`S06` 抓不到「`restBase()` 不再問資料來源」這個突變
（REST 缺席照樣拋錯），抓得到的是 `S14` 第二條（production＋`internal`＋REST 合法 → 必須紅）。

**清單的資料模型不變：`checkedAtBuild` 仍是無條件布林，條件一律住在 resolver 裡。**
`wsUrl()` 對 `none` 已經是這樣做，`restBase()` 對 `internal` 照抄。
把「適用條件」搬進清單型別的話，同一個條件會在 resolver 與清單各寫一份，
而兩份會漂 —— 那正是「只有一份清單」那條 Requirement 要防的事。

## D2｜`internal` 只在本機；部署出去的版本只有 `guildhub`，所以不逼人宣告

第一版寫「`NEXT_PUBLIC_DATA_ADAPTER` 在 `preview`／`production` 缺席拋錯、preview 設
`internal`」。兩輪審查各打回一半，而且都對：

- **preview 設一個明知缺 `INTERNAL_DATABASE_URL` 的 `internal`** 是建置綠、部署綠、
  一用就壞 —— 跟「部署設定的錯誤 SHALL 在建置時失敗」直接衝突。
  量了 `vercel.json`：六個分支前綴的 Git preview 全關，今天沒有 preview 部署；
  但那是黑名單，`docs/x` 之類的分支仍會觸發，所以「關著」不能當規格的依據。
- **更根本的**：規格只要還允許部署出去的 `internal`，就得在建置時驗它的
  `INTERNAL_DATABASE_URL`／`INTERNAL_SESSION_SECRET`，否則同一個假綠燈換個地方出現。
  「今天沒有 internal 的部署」是營運狀態，不解除規格的義務。

**採用：部署出去的版本 MUST NOT 選 `internal`。** 理由是事實：`internal` 是
`FE-O03`／`FE-O04` 給「功能先做完、之後再銜接」用的本機後端，`docs/DEPLOY.md`
從來沒有一個 `internal` 的部署情境，它的資料庫與 secret 在部署平台上也沒有任何
對應物。把它擋在 `dataAdapter()` 裡（`preview`／`production` 讀到 `internal` → 拋錯，
訊息說要開 spec PR）之後，「沒有 internal 的部署」變成規格保證，
`INTERNAL_DATABASE_URL`／`INTERNAL_SESSION_SECRET`／`INTERNAL_REALTIME_PORT` 三項的 `skipReason` 改成引用這條規則。

**連帶：不逼人宣告 `NEXT_PUBLIC_DATA_ADAPTER`。** 部署出去的版本只剩一個合法值，
要求填它就是要求一個「填假的也沒差」的變數 —— 這個 repo 對那種變數的判斷
已經寫在 `runtime-config`。缺席預設 `guildhub`（所有環境），打錯字仍然拋錯。
跟即時層那個軸的不對稱從此有理由：即時層在部署環境是真的二選一（`none`／`guildhub`），
資料層不是。

**連帶：REST base 在部署建置裡無條件必填。** `restBase()` 回 `null` 的唯一路徑是
`internal`，而 `internal` 只在本機 —— 所以 `checkedAtBuild: true` 不需要任何條件，
D1 的 resolver 形狀仍然成立（本機 `internal` 不會被要求 REST base）。

**不加 `none`**：今天沒有部署需要它。它會動到 `DATA_ADAPTERS` 列舉、`transport.ts`
的送出路徑、`FE-X03` 的語彙表（多一個 `kind` 是 `error-vocabulary` 規格的事）。
要重開 preview 的那天，選項是加 `none`（另開 spec PR），或替部署版 `internal`
補契約（資料庫、secret 改標為建置時必驗）—— 兩個都是 spec PR。

**合併順序的副作用**：`main` 會自動建置 production。這個 change 的 feat 合併後，
Vercel 上若還沒設 `NEXT_PUBLIC_GUILDHUB_REST`，那次建置會紅（站不會掛，Vercel
留著上一個成功的部署）。**那是閘門在做它該做的事**；正確順序是先設變數再合併，寫進 tasks。

## D3｜量過的事實

- `grep -rln "@/api/operations\|@/api/transport" src --include=*.tsx`：
  `FE-O14` design M3 量的時候是 0 個檔案；今天不是 0（B04／K01／A04／A01 之後）。
  這是 `skipReason` 過期的直接證據，實作 PR 貼實際數字。
- 後端 `cd2929c → c6f3928`：`app/api/**`、`app/realtime/protocol.py`、schemas
  零 diff；改的是 CORS 預設、`run.sh` LF、廣播失敗的斷線處理、swarm `--url`、
  Caddy 部署文件。所以 `schema.d.ts` 不重產。

## 驗證方式

- 單元：`tests/env-config.test.ts`（`S03`／`S13`／`S14` 的讀設定部分）、
  `tests/api-transport.test.ts`（`FE-O02-S02` 走 `null` 那條路仍然同源）。
- 建置：`tests/deploy-build-gate.test.ts` 對真的 `next build` 驗結束碼
  （`S14` 的建置部分）。**不連任何外部服務**：測試裡的位址是字面值，不會被打。
- 突變：`checkedAtBuild` 翻回 `false` → `S14` 的「缺席建置紅」要紅；
  `dataAdapter()` 在 `production` 放行 `internal` → `S13` 要紅；
  `restBase()` 在本機 `internal` 時仍回 `localhost` 預設值 → `S14` 的「internal 不適用」要紅。
