## Why

**世界蓋好了，但裡面沒有人。**

`FE-W12` 收完之後，走廊有門、看板可按 E、資料接上了 —— 而世界裡的每一個角色
都叫「訪客」、外觀都是同一隻。原因不在世界那一層，在這裡：**`/world` 從來不登入。**

後端的 `_identify()` 有兩條路。沒有 session 就 `str(uuid.uuid4())` 走匿名，
有 session 才讀得到名字與外觀。前端走的一直是匿名那一條。

三個已經修好的後端缺口因此**在畫面上完全看不出來**：

| 後端 commit | 修了什麼 | 為什麼還是看不到 |
|---|---|---|
| `bfb3609` `BE-G02` | `session["name"] = row["display_name"]` | 沒有人建立過 session |
| `fd8c00f` `BE-G03` | `avatar_id` 傳進 `presence.join()` | 同上 |
| `f278e2c` `BE-G01` | `POST /api/login` 收 `resume_token` | 前端 `LoginIn` 沒有那個欄位 |

**不做會怎樣**：`FE-W08 ProceduralAvatar`（12 點）做完，每個人還是同一隻；
`FE-A04 Profile`、`FE-A05 Avatar`、`FE-A06 首次進入`、`FE-R06 多分頁語意`
全部沒有可依附的身分。這一項是那一整串的**唯一開關**。

## 順便發現的：一個從 `FE-O02` 就打不到的端點

`operations.getMyProfile()` 打的是 `GET /api/profiles/me`。**那個端點從來不存在** ——
後端是 `GET /api/me`；`/api/profiles/me` 只有 `PATCH`，而 `/api/profiles/{profile_id}`
會把 `"me"` 當 UUID 解析，回 422。

它活到今天不是因為沒有測試，是因為**測試把同一個錯字串抄進了斷言**：

```ts
// tests/api-operations-coverage.test.ts:49
['getMyProfile', () => ops.getMyProfile(), PROFILE, 'GET', '/api/profiles/me'],
```

而抓得到它的資訊**一直躺在 repo 裡**。`schema.d.ts`（由後端 OpenAPI 產生）
逐字寫著：

```ts
"/api/profiles/me": { get?: never; patch: operations["update_me_api_profiles_me_patch"]; }
"/api/me":          { get: operations["me_api_me_get"]; }
```

缺的不是資料、不是後端連線，是**沒有人寫那條讀它的斷言**。
`drift.ts` 只對「資料形狀」做型別相等，**從來沒有對 `(method, path)` 做任何斷言**。

`FE-A01` 本來就必須呼叫 `GET /api/me`，所以修在這裡；而那條缺席的判準
一併補上（兩個模型第二輪都同意這一點，理由見 design D3）。

## What Changes

- **匿名暱稱登入**：`POST /api/login` 帶 `nickname`，成功後身分由後端的
  HttpOnly session cookie 持有
- **重整恢復**：每次進入時打 `GET /api/me`；401 是「訪客」這個明確狀態，不是錯誤
- **恢復金鑰**（`resume_token`，`BE-G01`）：**預設不落地**。使用者勾「記住我」
  才寫進 `localStorage`；金鑰本身顯示出來、可複製
- **`/world` 顯示目前身分**（訪客或名字），**但不擋** —— 導流是 `FE-A06`
- 修 `getMyProfile` 的路徑，並補上**約束實際路徑常數**的型別層契約判準
- `LoginIn` 契約補 `resume_token`；重新產生 `schema.d.ts`（後端已前進 6 個 commit）

## Non-goals

**這些刻意不做，寫在這裡是因為每一條都有人會順手做掉：**

- **帳號密碼登入與註冊。** 後端 9/8 已經長出 `POST /api/register` 與
  `login_id`+`password` 模式（L3），但 `docs/WBS.md` 的 `FE-A01` 只寫「匿名暱稱登入」。
  把它做進來是**擴張已估定的範圍**，要走 `governance/` 另開項目（design D1）
- **登出。** 那是 `FE-A02`（8 點），而且**後端今天沒有 logout 端點** ——
  程式碼裡沒有任何 `session.clear()`。見〈已知限制〉
- **進入世界前的導流**（強制先有名字）。那是 `FE-A06`（6 點，同樣是 W2）。
  `FE-A01` 只交付「登入這件事本身」＋「世界裡看得出來你是誰」
- **Avatar 選擇。** `FE-A05`。本 change 不送 `avatar_id`，沿用後端預設
- **多分頁的互斥。** `FE-R06` 的規格已經合併，實作等這一項提供 `user_id` 之後才做
- **哨兵的自動重產。** `schema.d.ts` 是人為產出的，本 change 產一次，
  不建立任何自動機制（另開票，見〈已知限制〉）

## 已知限制

**這兩條是量過的事實，不是預防性的免責：**

1. **前端無法自行終止 session。** 它是 Starlette 簽章的 HttpOnly cookie，
   JS 讀不到也刪不掉，而後端沒有 logout 端點。所以本 change 交付之後，
   「換一個人登入」的唯一辦法是手動清瀏覽器 cookie。
   `FE-A02` 要能完成，**後端必須先補 logout** —— 要開一張後端票。
2. **`resume_token` 不是密碼。** 後端註解逐字寫著「拿到 token 的人就是那張名片的人」。
   存進 `localStorage` 的那一份 **XSS 偷得走**，而這件事無法在前端解決。
   本 change 的處置是「預設不存 ＋ 明說」，不是「解決它」（design D2）。

## Capabilities

- `identity-session`（新）—— 登入、身分恢復、目前身分的可見性
- `api-contract`（既有）—— 新增一條 `(method, path)` 的契約判準

## 影響

- 新增：`src/api/operations.ts` 的 `login`／`getMyProfile` 修正、
  `src/identity/`（新目錄）、`src/app/login/`（新頁面）
- 修改：`src/api/contract/rest.ts`（`LoginIn` 加 `resume_token`）、
  `src/api/contract/schema.d.ts`（重產）、`src/api/contract/drift.ts`（路徑判準）
- 修改：`tests/api-operations-coverage.test.ts`（那條抄錯的斷言）
