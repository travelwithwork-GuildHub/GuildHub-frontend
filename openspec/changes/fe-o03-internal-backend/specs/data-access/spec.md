## Applicability

權限：**不適用** —— 只改 transport 組網址的方式
併發：**不適用**
持久資料相容性：**不適用**
失敗路徑：**適用** —— `internal` 下同源 `/api` 不存在的端點回 Next 的 404／405，仍走 `FE-X03` 的翻譯

測試連到什麼：jsdom 裡攔 `fetch` 看送出的 URL；**不連任何外部服務。**

## MODIFIED Requirements

### Requirement: 元件不知道自己連的是誰

資料存取 SHALL 走 domain operations；呼叫端 MUST NOT 知道背後是哪一個 adapter。

adapter 由 `NEXT_PUBLIC_DATA_ADAPTER` 決定，值是 `guildhub`（真後端，請求打 `NEXT_PUBLIC_GUILDHUB_REST`）
或 `internal`（我們自己的 Route Handlers，請求打**同源**的 `/api/...`，不帶主機名）。
兩個 adapter 走**同一份** operation 與契約；差別只在 `transport` 組出來的網址。

> ⚠️ **刻意不叫 `local`。** `NEXT_PUBLIC_APP_ENV` 已經有一個 `local`，
> 意思是「跑在開發者的機器上，連 localhost:8000 的**真後端**」——
> 跟 adapter 的 `local`（連我們自己的後端）是**相反的資料來源**。

**設定值無法辨識時 MUST 明顯失敗，MUST NOT 退回任何預設值。**
退回去的話，一個打錯字的正式站會安靜地連到錯的資料來源。

#### Scenario: [FE-O02-S01] 設定選 guildhub 時，請求打到後端的位址

- **WHEN** `NEXT_PUBLIC_DATA_ADAPTER` 是 `guildhub`
- **AND** 呼叫任何一個 domain operation
- **THEN** 請求送到 `restBase()` 給的位址
- **AND** 送出的請求 MUST 以 `credentials: 'include'` 建構

> ⚠️ **這一條刻意不寫成「請求帶上 session cookie」。** 那件事在
> 單元測試的環境裡**驗不了**：實測 `document.cookie` 設得進去，
> 但 `fetch(url, { credentials: 'include' })` 之後測試 server 收到的
> `req.headers.cookie` 是 `null` —— jsdom 的 cookie jar 跟 Node 的 fetch
> 沒有連通。
>
> 驗得到的是 `Request` 物件上的 `credentials`，而它的**預設值是
> `same-origin` 不是 `include`** —— 所以「有沒有寫那一行」是量得出來的。
>
> **端到端的 cookie 只有瀏覽器驗得到**（`FE-O08` 切換演練，W5）。

#### Scenario: [FE-O02-S02] 設定選 internal 時，請求打同源的 Route Handlers

- **WHEN** `NEXT_PUBLIC_DATA_ADAPTER` 是 `internal`
- **AND** 呼叫任何一個 domain operation
- **THEN** 送出的請求 URL SHALL 是同源的 `/api/...`（不含 `NEXT_PUBLIC_GUILDHUB_REST` 的主機名）
- **AND** 回應 SHALL 經過同一份契約解析（`FE-O02-S05`～`S07` 對兩個 adapter 都成立）

> 這條原本寫「每個操作明顯失敗、不得送出任何網路請求」—— 那是 `FE-O03` 還沒做的時候，讓切換邏輯不是一段只走一邊的程式碼。
> `FE-O03` 之後 `internal` 是真的後端。ID 不改：判準對回來的是「選 internal 會怎樣」這件事。

#### Scenario: [FE-O02-S03] 設定值無法辨識時，明顯失敗

- **WHEN** `NEXT_PUBLIC_DATA_ADAPTER` 的值不是 `guildhub` 也不是 `internal`
- **THEN** MUST 拋錯並列出合法的值
- **AND** MUST NOT 退回任何一個 adapter
