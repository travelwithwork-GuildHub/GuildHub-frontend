## Context

動機見 `proposal.md`〈Why〉。這裡只放實際量到的、會影響取捨的現況。

**全部是從跑起來的後端與它的原始碼量的，不是文件敘述**
（`CONTEXT.md` 明文：文件的敘述一律不算數）：

| # | 量到的事 | 影響 |
|---|---|---|
| 1 | 後端 `/openapi.json` 裡**沒有任何** `maxLength`／`minLength`／`minimum`／`maximum`。每個字串都是 `{"type":"string"}` | 限制值產不出來，`FE-O06` 的優先序①**一條都不適用** |
| 2 | OpenAPI 只宣告 `200`／`201`／`422`。原始碼實際會丟 400(4 處)／401(3)／403(9)／404(8)／409(1)／422(1) | 產出的型別**描述不了錯誤面** |
| 3 | 所有 `HTTPException` 的 `detail` 是中文字串；框架自動產的 422 的 `detail` 是陣列 | 同一個鍵兩種形狀 |
| 4 | 整合指南 §8：**超長欄位回 500 不是 422**，長度只寫在 DB，「前端自己擋長度」 | 長度是契約的一部分，不是 UI 的裝飾 |
| 5 | `sql/001_schema.sql` 原文：`char_length(display_name) between 1 and 20`、`char_length(bio) <= 300`、`char_length(body) between 1 and 2000`、`seat_index >= 0 and seat_index < 8` | 限制的真實來源 |
| 6 | `presence.py`：`STATUS_MAX_CHARS = 12`，用 Python `len()` | code point，不是 byte 也不是 UTF-16 |
| 7 | `protocol.py`：`status` 與 `chat` **在兩個方向都存在但形狀不同** | `t` 不是全域唯一判別鍵 |
| 8 | 真後端只有 16 個 `/api/*` 端點，已凍結。Role／Application／Invitation／Offer 不存在 | 範圍上界 |

## Goals / Non-Goals

範圍邊界見 `proposal.md`〈不做什麼〉。這裡只補設計層級的：

**Goals**
- 讓「後端的形狀改了」這件事有一個**會紅**的地方，而不是等到執行期炸開。
- 讓長度限制有一個**讀得出來**的來源，`FE-O06` 接 UI 時不需要再寫一次數字。

**Non-Goals**
- 不做即時的後端漂移偵測。CI 裡沒有後端，也不該有（`AGENTS.md`〈測試環境隔離〉
  第 2 條：CI 不提供任何服務）。這一點的代價寫在下面 D2。
- 不消除複述。`limits.ts` 的數字仍然是 `sql/001_schema.sql` 的複製。
  這份設計只是把它**收斂到一個會被測試打臉的地方** —— 這句話照抄 `FE-O06` 的原文，
  因為它就是誠實的說法。

## Decisions

### D1. 產出的型別檔是哨兵，不是型別來源

`FE-O01` 那一列同時要求「用 Zod 定義每一個操作的輸入與輸出」與
「已存在的那一半用產的 `openapi-typescript`」。字面上照做會產生**同一組形狀的兩份定義**，
而同一列的 Alarm 正是「這份被複製到第二個地方的那天，整套就開始漂」。

**選的解**：Zod 是唯一的定義來源；產出的 `schema.d.ts` 只被一個檔案 import，
用途是一條型別層的**相等**斷言：

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type _ = Expect<Equal<z.infer<typeof ProfileOut>, components['schemas']['ProfileOut']>>
```

產出的檔案因此不是第二份定義，是一個**會打臉的哨兵**。

**這個決定有先量過。** 實測環境 TypeScript 6.0.3、zod 4.5.4、
openapi-typescript 7.13.0，對真的 FastAPI 後端：

- 正向：`ProfileOut` 與**全欄位 optional + nullable** 的 `ProfileUpdate`
  兩條斷言，`tsc` rc=0 完全乾淨。
- 負向：把後端 `avatar_id: int` 改成 `int | None`、重啟、重產，
  `tsc` 紅在 `assert.ts(27,18): error TS2344: Type 'false' does not
  satisfy the constraint 'true'.` —— 紅在正確的那一行。（後端已還原。）

**考慮過並否決的替代方案**：

- **只靠 `FE-O05` 的執行期 `.parse()`。** 否決，兩個理由都是量出來的：
  `FE-O05` 排在 **W2**（中間那段沒有任何偵測），而且它那一列明寫
  「**CI 只跑 `local`**；`guildhub` 那一輪在本機跑」—— 對真後端的執行期驗證
  **不在 CI 上**。執行期 parse 也只涵蓋測試資料實際碰到的欄位；
  型別斷言涵蓋整個形狀，而且每次 CI 都跑。
- **用單向的 `extends` 而不是 `Equal`。** 否決，見 D3。
- **用 `openapi-zod-client` 之類直接產 Zod。** 否決：產出來的 Zod 一樣沒有長度限制
  （量到的事實 #1），而手改產出物就是把產生器變成一次性的模板。

### D2. 哨兵保證的是「契約沒偏離上次產出的形狀」，不是「後端現在沒變」

**這是這份設計最容易被高估的地方，所以寫進 spec 的 Requirement 裡。**

`schema.d.ts` 進版控。CI 拿到的是**兩份都凍住的東西**（產出的型別、手寫的 Zod），
所以斷言在 CI 上證明的是「有人改 Zod 時沒有把它改歪」。
後端真的改了而沒有人重產，這條斷言**永遠是綠的**。

**沒有把它做成 CI 閘門，是刻意的**：那需要 CI 連得到一份後端，而
`AGENTS.md`〈測試環境隔離〉第 2 條寫「CI 不提供任何服務」。
在 CI 裡起一份後端來產 schema，等於把後端 repo 變成前端 CI 的相依。

所以「後端現在變了」由**人為動作**發現：`npm run contract:generate` 重產之後
typecheck 會紅。那個動作的排程在 `FE-O08` 切換演練（W5 起定期跑一次）。
**這一項不假裝自己解決了那件事。**

不進版控的替代方案更糟：CI 上檔案不存在，斷言連跑都不會跑 —— 那是**安靜失效**，
比過期嚴重一個等級。

### D3. `Equal` 用雙向相等，新增欄位會紅，而且那是想要的

`Equal<A, B>` 對「後端新增一個向後相容的欄位」也會紅。實測四種情況：

| 後端改動 | `Equal` |
|---|---|
| 必填欄位變成可為 `null` | 紅 |
| 新增一個欄位 | 紅 |
| 必填變選填 | 紅 |
| 欄位型別變成 `any` | **紅**（`Equal` 分辨得出 `any`，不會被吞掉） |

最後一列是特地去量的 —— 有一種說法是「後端偷懶寫 `Any` 會讓斷言靜默放行」，
`Equal<{a:string},{a:any}>` 實測是 `false`，不成立。

新增欄位會紅**是選定的行為**：新欄位是契約變更，前端應該被逼著看到它。
而且它只在**有人重產**的時候才會紅 —— 那本來就是一個「我要來對一次後端」的動作，
不是 CI 隨機爆炸。單向 `extends` 會讓新欄位靜靜通過，那正是這個 repo 反覆在防的事。

### D4. 長度用 Zod 原生 `.max()`，不用 `.refine()`

一開始的判斷是「JS 的 `.length` 算 UTF-16 code unit，跟後端的 code point 對不上，
所以要自己 refine」。**量過之後這是錯的。**

zod 4.5.4 的 `z.string().max(12)` 對八個案例的結果與 Python `len()` /
PostgreSQL `char_length()` **完全一致**：

```
                          UTF16  codePt  zod.max(12)  後端會
12 個 😀                    24      12      接受        接受
13 個 😀                    26      13      拒絕        拒絕
12 個 é（e + U+0301）        24      24      拒絕        拒絕
6 個 🇹🇼（各 2 code point）   24      12      接受        接受
12 個 👩‍👩‍👦（各 5 code point） 96      60      拒絕        拒絕
```

而且這是**文件保證**，不是實作細節：zod 官方文件有一節 "Unicode Length
Validation"，明寫 "Zod measures length based on Unicode code points"，
範例正是 `z.string().length(1).parse("😀")`。

用原生 `.max()` 而不是 `.refine()` 的關鍵好處：**`maxLength` 保持可內省**
（實測 `.max(20)` 讀得到 `20`，加了 `.refine()` 之後讀到 `null`）。
`FE-O06` 要「真的拿到那些數字」接到 UI，refine 會讓它拿不到，
然後那個人只好在元件裡再寫一次 `20` —— 正是 `FE-O06` 那條 Alarm 說的事。

**但仍然要留一條釘住單位的測試。** 它是文件保證，不是型別保證：
zod 換版把單位改掉的話，畫面上不會有任何錯誤，只會有使用者打不進去的字。
`FE-O01-S04` 就是那條測試。

### D5. `openapi-typescript` 用 `npx` 跑，版本釘在 script 裡

`openapi-typescript@7.13.0` 的 peer 是 `typescript@^5.x`，
本 repo 釘死 `typescript@6.0.3`（理由在 `eslint.config.mjs` 的檔頭：
TS 7 會讓 typescript-eslint 拒絕啟動）。實測 `npm install` 直接 ERESOLVE 失敗。

**選的解**：不裝進 `devDependencies`，在 `package.json` 的 script 裡寫
`npx -y openapi-typescript@7.13.0 ...`，**版本釘在指令字串裡**。
產出物進版控，所以它是一個一次性的產生器，不是執行期相依。

考慮過 `--legacy-peer-deps`（讓一個宣告不相容的組合躺在 lockfile 裡）
與 `overrides`（同樣是在說謊，只是換個地方說）—— 都否決。

**代價**：`npx` 每次要下載。以及若哪天要升級產生器，要記得同時改 script 裡的版本
與重產產物 —— 沒有機器會提醒，`schema.d.ts` 的檔頭要寫上是哪個版本產的。

### D6. WS 兩個方向分成兩個 union

理由與後果寫在 spec 的 Requirement 裡（量到的事實 #7）。這裡只記替代方案：
考慮過用 `t` 加方向前綴（`s:status`）合成一個 union —— 否決，
那會讓契約裡的字串跟線路上的字串不一樣，第一個要序列化的人就得再對映一次。

## Risks / Trade-offs

- **哨兵過期而沒有人發現** → 已知且已寫進 Requirement（D2）。緩解是 `FE-O08`
  的定期切換演練，以及 `schema.d.ts` 檔頭記下產生時間與後端 commit。
  **不宣稱這一項解決了它。**
- **`limits.ts` 的數字與 `sql/001_schema.sql` 漂開** → 型別哨兵驗不到（後端 OpenAPI
  沒有這些數字）。真正會抓到的是 `FE-O05` 的成對邊界測試對真後端跑那一輪（W2）。
  在那之前這是一個**人工維護的複製**，而且 spec 有寫明。
- **契約只涵蓋今天存在的 16 個端點** → W6–W9 的能力要各自擴充契約。
  風險是有人在那時候另外開一份定義；緩解只有 review。
- **`projects.title`／`body` 現在沒有上限** → 使用者可以貼進任意長度的內容，
  後端會收下。這是後端的現況（沒有 DB 限制），前端上限由 `FE-X05` 決定。
  契約把它記成「未定」而不是省略，讓那件事看得見。

## Open Questions

- `hours_per_week` 與 `avatar_id` 在後端是 `smallint` 且**沒有 CHECK**。
  要不要在前端給一個語意上合理的範圍（例如 `hours_per_week` 0–168）？
  這不影響本 change 的形狀或任務分解 —— 契約先照後端的型別記錄，
  範圍留給 `FE-X05` 與 `FE-A04` Profile 表單決定。
- 錯誤 envelope 之外，後端偶爾會回非 JSON 的 500（資料庫錯誤直接冒出來）。
  那要在哪一層歸一化，是 `FE-O02` 的 adapter 還是 `FE-X03`？
  這一刀只定義 JSON 的形狀，不影響本 change。
