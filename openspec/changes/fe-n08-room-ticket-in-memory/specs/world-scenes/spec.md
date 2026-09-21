## Applicability

權限：不適用 —— 持有／讀取／丟棄票不做授權判斷（能不能拿到票是 `/enter` 的事，`FE-N08`）。
併發：適用 —— 模組級記憶體 `Map` 跨「同分頁換 scene」不重置（換場景不該掉票）。
持久資料相容性：**適用（本 change 的核心）** —— `sessionStorage` 從權威降為 best-effort 持久層，被擋不再影響進房。
失敗路徑：適用 —— 取得 storage 與它的每一個操作都可能拋，一律接住回 fallback、不拋。

## MODIFIED Requirements

### Requirement: 票由前端持有，鍵含身分，不進網址

系統 SHALL 提供持有／讀取／丟棄某間房的票的入口。**這一場的權威是模組級記憶體；`sessionStorage` 只是
「重新整理後撿回票」的 best-effort 持久層（不是權威）**。鍵是 `guildhub.roomToken.<profileId>.<projectId>`
（含身分：同一個分頁登出再登入另一個帳號，MUST NOT 讀到前一個帳號的票）；匿名沒有票（後端不會發給匿名）。
MUST NOT 放進 `localStorage`，MUST NOT 出現在 `/world` 的網址裡（含 history 的每一筆）。系統 MUST NOT 解析票的內容。

持有／讀取／丟棄的語意 SHALL 是：

- **持有**：寫記憶體（權威、一定成功）＋ best-effort 寫 `sessionStorage`（寫不進去 MUST NOT 拋、MUST NOT 影響這一場的持有）。
- **讀取**：記憶體知道這個鍵就以它為準（持有過 → 回票；丟過 → 回 `null`）；記憶體沒見過（多半是重新整理後的新一場）
  → 從 `sessionStorage` 撿回，撿到就放進記憶體當這一場的權威。
- **丟棄**：記憶體放**墓碑**（`null`、一定成功）＋ best-effort 清 `sessionStorage`。丟過之後讀取 MUST 回 `null`
  **即使 `sessionStorage` 仍殘留同鍵的舊票**（記憶體墓碑蓋過殘留 —— 舊票 MUST NOT 被拿去撞握手）。

> **為什麼權威在記憶體，不在 `sessionStorage`。** `sessionStorage` 在真實瀏覽器上**會被擋**（隱私擴充套件、站台儲存設定、
> 部分無痕），而 cookie 沒被擋 —— 所以 `POST /enter` 照樣成功、票也拿到了。若把「寫進 storage → 讀回一致」當成進房的
> 必要條件，這些使用者會輸對密碼卻被硬擋在門口（2026-09-22 實測：一整隊在正常視窗都進不了房間，只有無痕能進）。
> 權威放記憶體之後，storage 被擋也照樣進得了這一場的房間。
>
> `sessionStorage` 是**可用性**的選擇（重新整理後撿得回、每分頁一份），**不是安全邊界**：同源 XSS 讀得到它，
> 「複製分頁」、由 opener 開的分頁會帶走初始副本。記憶體同樣不是安全邊界。安全靠 CSP／輸出安全（`FE-T06`）與
> 後端 8 小時 TTL；「一個身分一條連線」靠下面那條的資格，不靠票不共享。**storage 被擋時，另一個分頁／新視窗沒有
> 這份記憶體 `Map`、接不了票** —— 這是此設計的自然限制。

載入 `/world?room=<id>` 時 SHALL 先等身分查詢結束再決定：持有那間房的票（載入時記憶體是空的新一場 →
從 `sessionStorage` 撿回）→ 直接進入（走過場）；沒有 → 網址 canonical 成 `/world`、人在 Guild Hall，
顯示一則 `role="status"`（不是 alert）的說明「這間房需要房間密碼 —— 走到走廊上它的門前按 E。」

怎麼拿到票（密碼、`POST /api/projects/{id}/enter`）不是這裡的事 —— `FE-N08`。

> 拔掉什麼會紅：把 storage 當權威（storage 被擋就讀不到票）→ S22 的「storage 被擋這一場仍持有」；
> 丟票只清 storage 不放記憶體墓碑 → S22 的「墓碑蓋過 storage 殘留」；鍵不含身分 → S14 換身分讀到別人的票；
> 票寫進網址 → S14 的五個時點 `location.href` 不含 `T`。

#### Scenario: [FE-V01-S14] 重新整理仍在房間裡；沒有票就回大廳並說明；票從不進網址

- **GIVEN** 已登入為 P，`sessionStorage` 持有 P 對 `room:<id>` 的票 `T`（重新整理後記憶體是空的新一場，讀取會從 `sessionStorage` 撿回）
- **WHEN** 載入 `/world?room=<id>`
- **THEN** 第一條建立的 socket 位址 SHALL 含 `scene=room:<id>` 與 `token=T`；網址 SHALL 保持 `/world?room=<id>`
- **AND** 在載入時、過場中、`ready` 後、按「回到 Guild Hall」後、上一頁後五個時點，`location.href` SHALL 都不含字串 `T`
- **AND WHEN** 以另一個身分 Q 登入同一個分頁，載入同一個網址
- **THEN** 第一條 socket SHALL 是 `scene=lobby`（Q 沒有票，P 的票不得被讀到）；網址 SHALL 被改成 `/world`；SHALL 有 `role="status"` 的上述說明、SHALL 沒有 `role="alert"`

#### Scenario: [FE-V01-S22] `sessionStorage` 被擋，這一場仍持有票（記憶體）；只有重新整理後才沒有

- **GIVEN** 已登入為 P，取得 `sessionStorage` 或它的 `setItem`／`getItem` 會拋（隱私擴充／站台設定擋掉 DOM storage）
- **WHEN** 持有 P 對 `room:<id>` 的票 `T`
- **THEN** 持有 MUST NOT 拋；讀取 P 對 `room:<id>` SHALL 回 `T`（這一場靠記憶體進得了房 —— 就是修掉「一整隊只有無痕能進」的那一段）
- **AND WHEN** 模擬重新整理（記憶體清空），`sessionStorage` 仍不可用
- **THEN** 讀取 SHALL 回 `null`（撿不回 → 沒有票 → 回大廳、走到門前再拿一次）
- **AND WHEN** storage 正常時持有、記憶體清空（重整）
- **THEN** 讀取 SHALL 從 `sessionStorage` 撿回 `T`；另一個身分 Q 撿不到
- **AND** 丟過票（墓碑）之後，即使 `sessionStorage` 殘留同鍵的舊票，讀取 SHALL 仍回 `null`
- → 驗於：單元（`roomTokens.ts`：storage getter／`setItem`／`getItem`／`removeItem` 拋、記憶體清空、storage 殘留）
