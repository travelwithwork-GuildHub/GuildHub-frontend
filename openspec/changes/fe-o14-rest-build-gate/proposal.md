## Why

後端已經部署上線（`GuildHub-backend` `c6f3928`，Caddy 同源閘道），前端要把
`NEXT_PUBLIC_DATA_ADAPTER=guildhub` ＋ `NEXT_PUBLIC_GUILDHUB_REST=<閘道>` 設進 Vercel
production。做這件事的時候後端指出一個洞，而那個洞查證屬實：

**`NEXT_PUBLIC_GUILDHUB_REST` 在清單上，但沒有標為建置時必驗。** `src/config/env.ts` 的
`DEPLOY_CONFIG_ITEMS` 把它標成 `checkedAtBuild: false`，理由是
「今天沒有任何元件呼叫 REST（`FE-O14` design 的 M3）」。那句話在 2026-09-09
是量過的事實；**從 `FE-B04`（人才列表）、`FE-K01`（Inbox）、`FE-A04`（Profile）
合併之後它就不成立了** —— 今天 `/talent`、`/inbox`、登入畫面全部走 `restBase()`。
那段註解自己也寫著「有人把資料存取接上畫面的那天，這裡要翻成 `true`。
沒有機器擋著這件事」。那一天過了一個星期，沒有人翻。

不做會怎樣（實測的失敗形態，跟 `fe-o14-preview-deploy` 提案裡那條一模一樣）：
一個漏設 `NEXT_PUBLIC_GUILDHUB_REST` 的 production 建置**綠燈、部署成功**，
訪客打開 `/talent` 才在瀏覽器裡拿到 `ConfigError`。`runtime-config` 的
Requirement「部署設定的錯誤 SHALL 在建置時失敗」明寫要驗「執行時會解析的
每一項設定」—— 這條今天對 REST base 是假的。

第二個洞是同一件事的另一半：**`NEXT_PUBLIC_DATA_ADAPTER=internal` 在 `preview`／
`production` 是合法值，但部署出去的 `internal` 沒有契約** —— 它需要
`INTERNAL_DATABASE_URL` 與 `INTERNAL_SESSION_SECRET`；前者今天不在清單上，
後者在清單上但沒有標為建置時必驗（`skipReason`：「今天沒有任何 internal 的部署」）。只要有人把 `internal` 部署出去，
就是建置綠、部署綠、第一個請求 500。「今天沒有」是營運狀態，不是規格擋住的事
（審查抓到的）。

## What Changes

- **`NEXT_PUBLIC_GUILDHUB_REST` 改標為建置時必驗（`checkedAtBuild: true`）**：資料層資料來源是 `guildhub` 時必填、
  缺席建置紅；是 `internal` 時 **MUST NOT 被要求**（`internal` 打同源 `/api`，
  那個位址永遠不會被讀取 —— 跟 WebSocket 位址在 `none` 時的規則同一條）。
- **`internal` 只在本機合法**：`preview`／`production` 讀到 `internal` 時拋錯，
  訊息說明部署版的 `internal` 沒有契約、要開 spec PR。缺席時仍預設 `guildhub`
  （所有環境）—— 部署出去的版本只有一個合法的資料來源，不逼人宣告一個只有
  一個合法值的變數。
- `restBase()` 的契約改成跟 `wsUrl()` 對稱：`internal`（因此只在本機）時回 `null`，
  呼叫端（`src/api/transport.ts`）據此走同源；部署出去的版本永遠是 `guildhub`，
  所以 REST base 在部署建置裡**無條件**必填，`checkedAtBuild: true` 不需要條件。
- `docs/DEPLOY.md` 補「情境三：同源閘道」（`guildhub`＋`guildhub` 這個組合的
  五個變數、只能從閘道網址進站），並寫明 **今天沒有 preview 部署**
  （`vercel.json` 對六個分支前綴 `deploymentEnabled: false`；那是黑名單，別的前綴仍會觸發，
  而觸發了就走同一道閘門），以及 preview 若要開就只能是 `guildhub`＋一個**不是**正式站的
  後端（跨站 cookie 會被 Safari 擋，後端已明講）—— 今天沒有那樣的後端（design D2）。

## Non-goals

- **不做 `NEXT_PUBLIC_DATA_ADAPTER=none`**（「這個部署刻意沒有資料後端」的宣告）。
  今天沒有任何部署需要它：唯一的部署是 production，走閘道、接真後端；
  preview 部署在 `vercel.json` 裡是關的。**MUST NOT 用一個明知缺必要設定的
  `internal` 充當 preview** —— 那是建置綠、部署綠、一用就壞，正是這個 change
  要消滅的失敗方向（審查抓到的，design D2）。要重開 preview 就要先開 spec PR
  談 `none` 或給 preview 一個可拋棄的資料庫。
- 不把 `INTERNAL_DATABASE_URL`／`INTERNAL_SESSION_SECRET`／`INTERNAL_REALTIME_PORT`
  標為**建置時必驗**：`internal` 在部署環境被這個 change 擋掉之後，「沒有 internal 的部署」
  從營運狀態變成規格保證，它們的 `skipReason` 改寫成引用這條規則（`INTERNAL_SESSION_SECRET`
  已在清單上；另外兩個今天不在清單上，依「清單列出每一個設定項目」補列、`false`、附同一個理由）。
  要解禁部署版 `internal` 的 spec PR 要一併把它們翻成必驗（design D2）。
- 不碰 `FE-O08`（切換演練）：那是「在本機起真後端全流程走一遍」，另開 change。
- 不動 Vercel 主控台上的任何設定 —— repo 裡證明不了那份設定，
  `docs/DEPLOY.md` 只能寫「該設什麼」。
- 不重產 `schema.d.ts`：後端 `cd2929c → c6f3928` API 零 diff（自己 diff 過，
  後端也比對過 OpenAPI）。
- 不改 `FE-O02-S02`（`internal` 打同源 `/api`）的義務；只改它讀位址的方式。
