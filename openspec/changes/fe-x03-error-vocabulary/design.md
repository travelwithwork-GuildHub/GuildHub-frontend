# `FE-X03` 設計：難逆轉的決定與代價

## D1｜輸出是資料，不是元件

```ts
type UiErrorKind =
  | 'authentication-required' // 401
  | 'permission-denied'       // 403
  | 'not-found'               // 404
  | 'conflict'                // 409
  | 'validation'              // 422、400
  | 'request-rejected'        // 其他 4xx
  | 'server-error'            // 5xx（含 text/plain 的資料庫錯誤 —— 分不開，見 D3）
  | 'network-unavailable'     // fetch 在拿到回應之前 reject
  | 'contract-drift'          // ContractDriftError
  | 'aborted'                 // DOMException AbortError —— 呼叫端自己中止的，不是錯誤
  | 'unexpected'              // 認不得的一切，含 AdapterNotImplementedError

interface UiError {
  kind: UiErrorKind
  /** 唯一一份語彙表裡那一句。**永遠不是後端的字。** */
  message: string
  /** 422 的欄位級錯誤，原樣。給 `FE-X05`。 */
  issues?: ValidationError[]
  /** 後端寫的字串 `detail`。**未經信任的資料** —— 不是語彙，消費者要自己決定要不要用、怎麼用。 */
  detail?: string
  /** HTTP status，有的話。給 log 與除錯，**不給畫面決定用**。 */
  status?: number
  /** 原始的東西。給 log。 */
  cause: unknown
}
```

**代價**：每一個要畫錯誤的地方都要自己畫。這是刻意的 —— `FE-X04`（清單）與
`FE-X05`（表單）的裝幀不同，一個「通用錯誤元件」會是第三種，而且兩邊都不會用它。

## D2｜`kind` 是封閉的，而且對映只在一處

`src/identity/session.ts` 今天有兩個 helper 自己比 `status === 401`／`404`。
它們是控制流（401 = 訪客、404 = 金鑰指向的名片不存在），不是文案 ——
但「status 對種類的對映只有一處」要成立，它們要改成看 `kind`。
**這是這一列唯一會動到別人程式碼的地方。**

`S16` 不掃「跟三位數比較」的運算式（第三輪審查：regex 容易誤判，也容易被
`switch`、集合查找繞過）—— 它守的是 **import 邊界**：`HttpError` 只能被 `src/api/`
與 `src/errors/` 引用。要依 status 分類就得 import 它，而 import 一眼就看得到。

## D3｜500 只有一種

資料庫錯誤實測是 `500 text/plain "Internal Server Error"`；`send()` 把 body
解不出來的情況記成 `detail: null`，**內容型別沒有留下來**。到這一層時它跟任何
其他沒有 body 的 500 一模一樣。

三個選項：

| 做法 | 會不會騙人 |
|---|---|
| 一種 `server-error` | 不會 —— 字句不宣稱知道原因 |
| 依 `detail === null` 猜「資料庫錯誤」 | **會** —— 任何 502／HTML 錯誤頁都會被說成資料庫壞了 |
| 在 `HttpError` 上多帶 content-type 再分 | 可以，但要改 `FE-O02` 已封存的 transport，而且分出來的兩句話對使用者沒有不同的處置 |

選第一個。要分得出來的那天，是後端在 500 上給結構化 body（後端票），
或本地後端（`FE-O03`）自己標記。

## D4｜後端的中文 `detail` 保留，但 `message` 永遠是語彙表的

理由在 proposal。代價：409「這個座位已經有人了」這種後端寫得很好的句子，
畫面上預設看到的是前端的「衝突」那一句。`detail` 是**未經信任的資料**：
消費者要用它，得自己訂規則（哪些 status、哪些操作、要不要截斷），不能直接放上畫面。
`FE-X05`（表單）會是第一個要面對這件事的。

## D5｜`AdapterNotImplementedError` 是開發期缺陷，不是可恢復的錯誤

它落在 `unexpected`，字句是「預期之外」。**不要替它編一句像使用者錯誤的話** ——
那會把「這個 adapter 還沒做」偽裝成「稍後再試」。

## D6｜`aborted` 是一種，而且不是錯誤

`useListPage` 已經在 reducer 之前把 `signal.aborted` 的 rejection 擋掉，所以今天
不會有 `AbortError` 到這裡。但第三輪審查兩邊都指出：下一個沒有擋的消費者
（防抖的搜尋、卸載時的中止）會讓每一次正常取消都變成「預期之外的錯誤」。
所以它有自己的一種，語彙表裡那一句只是為了 `S11`「不多不少」—— 消費者看到
`aborted` 該做的是**什麼都不畫**。

## 待答問題

1. **`request-rejected`（418／429）要不要跟 `server-error` 合併？** 對使用者的處置
   可能一樣（等一下再試）。先分開，因為 429 之後會有節流（`FE-X11`）要認它。

## 這一份怎麼驗

- **全部是單元判準**，輸入直接建構，**不連任何外部服務**。
- `S01`–`S10`、`S17` 對映表（`S06`／`S07` 是掃整段範圍，不是挑幾個數字）；
  `S11`／`S13` 語彙表完整且互異；`S12` 哨兵不外漏；`S14`／`S15` 結構化欄位；
  `S16` import 邊界；`S18` 身分層改看 `kind`。
- **驗收條件不是「測試全綠」**：把 403 併進 401 → `S02` 紅；
  把 `message` 改成 `error.message` → `S12` 紅；
  語彙表少一鍵 → `S11` 紅（型別也紅）；
  翻譯器對 `null` 拋錯 → `S10` 紅；
  `session.ts` 改回 import `HttpError` 比 `status` → `S16`／`S18` 紅；
  只把 418／429 寫死、其餘落到「預期之外」→ `S07` 紅。
