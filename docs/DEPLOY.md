# 部署

規格 `FE-O14`。這份寫的是**前端**部署到 Vercel 要設什麼、以及設錯會怎樣。

> ⚠️ **這份文件證明不了 Vercel 主控台上的設定。**
> 那份設定在 repo 裡**沒有任何對應物** —— 沒有測試看得到它，沒有 CI 擋得住它。
> 機器守得住的只有「建置時設定不合法就紅」，而那件事由
> `tests/deploy-build-gate.test.ts` 對真的 `next build` 驗結束碼。

## ⚠️ 2026-09-10：線上曾經停在 17 小時前的版本，而沒有任何東西講

查證的方式是這一行：

```bash
gh api repos/travelwithwork-GuildHub/GuildHub-frontend/deployments
```

**它是空的。** Vercel 的 Git 整合連上的話，每一次 push 都會在那裡留一筆。
主控台上看得到的那幾筆全部是**本機 `vercel deploy` 推的** ——
作者欄是人不是 bot，而「wip」那種標題是 CLI 的預設值。

期間合併了五十幾個 PR，線上一次都沒有更新。
**PR 上不會少一個 check，CI 全綠，只有打開網站的人看得到。**

處置是 `.github/workflows/deploy.yml`（要一個 `VERCEL_TOKEN` secret）。
**那支 workflow 是暫時的** —— Git 整合接上之後就該刪掉，
判斷的方式就是上面那一行 `gh api` 開始有東西。

### 為什麼 workflow 裡是 `vercel build` ＋ `vercel deploy --prebuilt` 兩步

一步的 `vercel deploy` 是把原始碼送上去、在 Vercel 那邊建置 ——
**建置失敗時 GitHub 這邊是綠的**，失敗只出現在 Vercel 主控台上。
分兩步的話，上面那個「設定不合法就建置失敗」的閘門**會在 PR 上紅**。

## 兩種部署情境

### 一、沒有即時後端（今天就能上線）

訪客會看到一個可以用方向鍵走路的 3D 世界，**只有自己一個人**，
畫面上有一段說明告訴他這是單人預覽。

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_REALTIME_ADAPTER=none
```

**就這兩個。** `NEXT_PUBLIC_GUILDHUB_WS` 不必填 —— `none` 的時候它會被忽略，
填了也不會有事（連協定寫錯的舊值都不會讓建置失敗）。

### 二、有即時後端

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_REALTIME_ADAPTER=guildhub
NEXT_PUBLIC_GUILDHUB_WS=wss://<後端>/ws
```

**`NEXT_PUBLIC_GUILDHUB_REST` 今天不需要。** 前端還沒有任何元件呼叫 REST
（`FE-O14` design 的 M3）—— 所以它也不在建置閘門裡。
有人把資料存取接上畫面的那天，`src/config/env.ts` 的 `DEPLOY_CONFIG_ITEMS`
要把它的 `checkedAtBuild` 翻成 `true`，而**沒有機器擋著那件事**。

preview 部署用 `NEXT_PUBLIC_APP_ENV=preview`，其餘一樣。
**preview 不能少設任何東西** —— 它跟 production 走同一個建置閘門，
因為 preview 部署也是拿給人看的。

## 設錯會怎樣

| 漏了什麼 | 結果 |
|---|---|
| `NEXT_PUBLIC_APP_ENV` | **建置失敗**，訊息指名它 |
| `NEXT_PUBLIC_REALTIME_ADAPTER` | **建置失敗**，訊息指名它 |
| `NEXT_PUBLIC_GUILDHUB_WS`（`guildhub` 時） | **建置失敗**，訊息指名它 |
| `NEXT_PUBLIC_GUILDHUB_WS`（`none` 時） | 沒事，它會被忽略 |

**這四列以前只有最後一列是對的。** `FE-O14` 之前，什麼都不設的
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
NEXT_PUBLIC_APP_ENV=production NEXT_PUBLIC_REALTIME_ADAPTER=none npm run build
npm start          # → http://localhost:3101

# 故意漏一個，確認它真的會紅
NEXT_PUBLIC_APP_ENV=production npm run build; echo "exit=$?"   # → exit=1
```
