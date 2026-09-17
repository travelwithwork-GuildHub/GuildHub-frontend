# 部署

規格 `FE-O14`。這份寫的是**前端**部署到 Vercel 要設什麼、以及設錯會怎樣。

> ⚠️ **這份文件證明不了 Vercel 主控台上的設定。**
> 那份設定在 repo 裡**沒有任何對應物** —— 沒有測試看得到它，沒有 CI 擋得住它。
> 機器守得住的只有「建置時設定不合法就紅」，而那件事由
> `tests/deploy-build-gate.test.ts` 對真的 `next build` 驗結束碼。

## 三種部署情境

### 一、沒有即時後端（今天就能上線）

訪客會看到一個可以用方向鍵走路的 3D 世界，**只有自己一個人**，
畫面上有一段說明告訴他這是單人預覽。

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_REALTIME_ADAPTER=none
NEXT_PUBLIC_GUILDHUB_REST=https://<後端>
```

`NEXT_PUBLIC_GUILDHUB_WS` 不必填 —— `none` 的時候它會被忽略，
填了也不會有事（連協定寫錯的舊值都不會讓建置失敗）。
**`NEXT_PUBLIC_GUILDHUB_REST` 要填**：`/talent`、`/inbox`、登入畫面都走 REST，
沒有它建置會紅（下面〈設錯會怎樣〉）。「沒有即時後端」不等於「沒有後端」。

### 二、有即時後端

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_REALTIME_ADAPTER=guildhub
NEXT_PUBLIC_GUILDHUB_WS=wss://<後端>/ws
NEXT_PUBLIC_GUILDHUB_REST=https://<後端>
```

### 三、同源閘道（今天的正式站）

後端部署在 Railway，前面一層 Caddy：`/api/*`、`/ws`、`/health`、`/docs` 轉給後端，
其餘轉給 Vercel。**唯一對外網址是閘道**，REST 與 WS 都填它：

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_DATA_ADAPTER=guildhub          # 可省略：缺席就是 guildhub
NEXT_PUBLIC_GUILDHUB_REST=https://<閘道>
NEXT_PUBLIC_REALTIME_ADAPTER=guildhub
NEXT_PUBLIC_GUILDHUB_WS=wss://<閘道>/ws
```

- **只能從閘道網址進站。** 直接開 `*.vercel.app` 會跨站打後端，Safari 擋第三方 cookie，
  登入後每個請求都 401。
- 閘道下前端自己的 `/api/*` Route Handlers（`internal` 用的）**被蓋掉** —— 那正是
  `internal` 只在本機合法的另一個理由。
- 後端每次重新部署 WebSocket 全斷（`FE-R12` 斷線復原之前，demo 期間不要部署後端）。

### `NEXT_PUBLIC_DATA_ADAPTER` 不必宣告、`internal` 只在本機

缺席一律 `guildhub`（所有環境）。部署出去的版本**只有這一個合法值**：
`internal` 在 `preview`／`production` 讀到就**建置失敗** —— 部署版的 `internal`
沒有契約（`INTERNAL_DATABASE_URL`、`INTERNAL_SESSION_SECRET` 都不在建置閘門裡），
放行的話是建置綠、部署綠、第一個請求 500。要部署 `internal` 先開 `spec/` PR
把 `INTERNAL_*` 翻成必驗（`fe-o14-rest-build-gate` design D2）。

### 今天沒有 preview 部署

`vercel.json` 對 `spec/ feat/ fix/ chore/ archive/ governance/` 六個前綴
`deploymentEnabled: false`，只有 `main` 自動建 production。**那是黑名單**：
別的前綴仍會觸發 preview，而觸發了就走同一道閘門（`NEXT_PUBLIC_APP_ENV=preview`，
其餘一樣、一項都不能少 —— preview 也是拿給人看的）。
要開 preview 的話它只能是 `guildhub` ＋ 一個**不是**正式站的後端（跨站 cookie 會被擋，
而 preview 網址永遠跨站）—— 今天沒有那樣的後端。**MUST NOT 用一個明知缺必要設定的
`internal` 充當 preview**，那是這個閘門要消滅的失敗方向。

## 設錯會怎樣

| 漏了什麼 | 結果 |
|---|---|
| `NEXT_PUBLIC_APP_ENV` | **建置失敗**，訊息指名它 |
| `NEXT_PUBLIC_REALTIME_ADAPTER` | **建置失敗**，訊息指名它 |
| `NEXT_PUBLIC_GUILDHUB_WS`（`guildhub` 時） | **建置失敗**，訊息指名它 |
| `NEXT_PUBLIC_GUILDHUB_WS`（`none` 時） | 沒事，它會被忽略 |
| `NEXT_PUBLIC_GUILDHUB_REST` | **建置失敗**，訊息指名它（`FE-O14-S14`） |
| `NEXT_PUBLIC_DATA_ADAPTER` | 沒事，缺席就是 `guildhub` |
| `NEXT_PUBLIC_DATA_ADAPTER=internal`（部署環境） | **建置失敗**，訊息指名它並說只在本機 |

**前四列以前只有 `none` 那一列是對的。** 而 `NEXT_PUBLIC_GUILDHUB_REST` 那一列
到 2026-09-17 之前也是假的：清單上有它但沒標必驗，漏設的 production 建置綠、部署綠，
訪客打開 `/talent` 才在瀏覽器裡拿到 `ConfigError`（後端指出、`fe-o14-rest-build-gate` 補）。 `FE-O14` 之前，什麼都不設的
`next build` 會**成功** —— CI 綠燈、部署成功，然後線上只剩下「GuildHub」
四個字，因為設定錯誤是在訪客的瀏覽器裡才拋出來的。

## 訪客會看到什麼

- `/` 會 **307** 轉到 `/world`（`next.config.ts` 的 `redirects()`，
  刻意不是 308 —— W2 之後 `/` 會變成登入入口，永久轉址會被瀏覽器快取而清不掉）
- 一個 3D 世界：地板、陰影、可以用方向鍵走的角色
- 場景裡**還沒有可以互動的東西**（那是 `FE-W12`，W3）

## 要讓人互相看得見的話

需要一個**常駐的行程**，不是 serverless。原因是在線名單存在那個行程的記憶體裡：

```python
class PresenceStore:
    def __init__(self):
        self._players: dict[str, Player] = {}   # 沒有 Redis
```

Vercel Functions 支援 WebSocket，但官方文件明寫**連線被釘在個別 function
instance 上**，跨實例要靠 Redis。不接 Redis 的話兩個訪客可能落在不同實例，
形成兩個互不相見的房間 —— 而且是**間歇性的**。

所以路徑是把**已經存在的** FastAPI 部署到 Railway／Render／Fly 之類的常駐容器：
它已經是那個形狀，一行程式都不用改。那件事**不在這個 repo 裡**
（`openspec/changes/fe-o14-preview-deploy/tasks.md` 的第 8 節記著它）。

## 本機驗一次

```bash
# 沒有即時後端
NEXT_PUBLIC_APP_ENV=production NEXT_PUBLIC_REALTIME_ADAPTER=none NEXT_PUBLIC_GUILDHUB_REST=https://guildhub.example pnpm run build
pnpm start         # → http://localhost:3101

# 故意漏一個，確認它真的會紅
NEXT_PUBLIC_APP_ENV=production pnpm run build; echo "exit=$?"   # → exit=1
NEXT_PUBLIC_APP_ENV=production NEXT_PUBLIC_REALTIME_ADAPTER=none pnpm run build; echo "exit=$?"   # 缺 REST → exit=1
```
