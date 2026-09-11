# `FE-K01` 設計：難逆轉的決定與代價

## D1｜面板殼與 provider 跟名片面板同一個形狀

`InboxPanelProvider` 掛 `page.tsx`（`ProfilePanelProvider` 旁邊），管 `view`（`closed` ｜ `{ kind: 'list' }` ｜ `{ kind: 'thread', with, openedFrom: 'list' | 'talent' }`）、「關閉後焦點回開啟者」、
**以及資料**（已載入的信、頁數、世代、名字快取、送出中的請求）—— 資料放 provider 而不是面板：送出中關掉面板，201 回來還是要合併（`S12`）；名字快取跨開關存活（`S04`）。
`InboxPanel` 跟 `BoardPanel`／`ProfilePanel` 一樣渲染在 `WorldCanvas` 的 `data-focus-anchor` div 裡、掛載時 `holdInputLock('inbox-panel')`。理由同 `FE-A04` design `D1` 的修正。
開啟者不在了（從人才詳情進來、看板面板已關）→ 焦點回世界焦點錨（`[data-focus-anchor="world"]`，`FE-X06-S13`）。

**交接**（人才詳情 → 收件匣）：`listPanel.closePanel()`（它會把焦點放到世界錨、放掉它那把鎖）→ `inbox.openThread(with, 'talent')` → `InboxPanel` 掛載：持自己那把鎖、把焦點拿進來。
鎖有一個 commit 的空窗、焦點抖一次 —— 是滑鼠流程，可觀察的終態（焦點在收件匣、鎖持有）才是判準（`S02`）。不做原子交接 API：要的話是兩個 provider 的重構，今天不值。

## D2｜對話是前端從扁平清單推導出來的

後端一份混合清單（`(sender_id = me or recipient_id = me) order by created_at desc`，20 一頁）。前端 `groupThreads(messages, me)`（純函式，有自己的判準）：
以對方 id 分組、每組依 `created_at` 舊到新（詳情由上往下讀）、組依最新一封新到舊排。「載入更多」拿下一頁後**重新分組整份已載入的信**（不是把新頁接在舊組後面 —— 同一個對方會出現在多頁）。
去重以 `id`；所有 GET／POST 的結果以 `id` 合併、**只增不減**（GET 不會覆寫 POST 已合併的）。**一個對話可能不完整**（舊信在還沒載的頁）：詳情不放「載入更多」，更早的回清單載。

**offset 分頁會位移**：寄出一封之後第 0 頁往後擠一封 —— 不處理的話下一次「載入更多」會漏掉原本第 20 封。處理：201 之後重取第 0 頁、合併；`pagesLoaded` 重設為 1（下一次「載入更多」從第 1 頁起，重疊的以 `id` 去重）；翻到底依這次第 0 頁重算。
別人在兩次載入之間寄來的信會讓位移再發生一次 —— 沒有通知端點，能做的是「每次從關閉打開重取第 0 頁」（世代重來）。

**世代與 in-flight**：分頁請求（開啟的第 0 頁、載入更多、201 後的第 0 頁）共用一個 in-flight 槽（一次一個）並帶 `generation`；回來時 `generation` 不是目前的 → 只合併訊息、不碰 `pagesLoaded`／`exhausted`／錯誤（審查者：舊的 `page=1` 晚回會污染新世代）。
201 後的第 0 頁重取若跟開啟的第 0 頁撞上（S12：關掉、201、重開）→ 同一個槽，後到的等前一個結束再發（或直接沿用它的結果 —— 兩者都是第 0 頁）。
失敗保留既有、頁碼不前進、重試同一頁。**重開時舊資料仍可見**（不閃空白），只是 `aria-busy`、載入更多不可按；401 才清掉（session 沒了不該再看到私訊）——
清掉時 `dataGeneration` 也加一：**所有**在飛的回應（分頁、POST 的 201、名字解析）帶的是舊的 `dataGeneration`，回來一律丟掉，不寫回（審查者：不然 permission-blocked 之後私訊又被放回來）。

## D3｜名字解析：一個小快取，失敗不擋

對方名字用 `getProfile(id)`；快取在 provider（面板開關不丟）：成功的存活到頁面卸載；失敗只在**這一次開啟**內去重（下一次從關閉打開會再試）、失敗時顯示縮短 id `xxxx…xxxx`。不是 `TalentDetail`（那是一整片詳情）。
**不批次端點**（後端沒有）；一頁 20 封最多 20 個對方，通常遠少於此。

## D4｜寄信是對話裡的一個表單；從人才詳情進來是「開一個還沒有信的對話」

`view = { kind: 'thread', with, openedFrom }`，對話沒有任何已載入的信也成立（第 0 頁載完才顯示 `first-empty`；載入中是 `aria-busy`）。`sendMessage({ recipient_id: with, body })`，201 回來以 `id` 合併、依 `created_at` 重排（不是無條件 append）。
`FE-X05` 的 `useForm`；成功清空 body（這是刻意的 reset：送出成功、內容已在對話裡）；失敗留值。404（收件人不存在）→ 領域錯誤文案「這個人已經不在了。」（`describeError`，只在這一次請求）；400（寄給自己，UI 走不到）、401、422、5xx、連不上都走 `toUiError`（`FE-X05` 的預設就是 `describeError(cause) ?? toUiError(cause).message`）。
送出中**只擋第二次送出**（`FE-X05` 的 guard）；返回、Escape、關閉都可以 —— 請求在 provider 裡，結果照樣合併（審查者：把導航鎖成送出中會把人困在懸住的請求裡）。

## D5｜「摘要」是 body 的前 N 個 code point

清單每個對話顯示最新一封的前 40 個 code point（超過加「…」）＋ 誰寄的（「你：」前綴表示最新一封是我寄的）。純函式 `preview(body)`：先把連續空白（含換行、tab）壓成一個空格、trim，再取 40 個 code point（超過加「…」）—— 不然多行 body 會把清單撐開。

## 待答問題

1. 時間顯示格式：跟 `TalentFacts` 的 `updated_at` 一樣用 `toLocaleString('zh-TW')`；不做「3 分鐘前」。
2. 收件匣按鈕要不要顯示未讀數 —— 不做（`BE-G06`）。

## 這一份怎麼驗

- 純函式（`groupThreads`、`preview`）：`S03`。
- 面板與資料互動（`S01`、`S02`、`S04`～`S12`、`S16`）：jsdom，整棵樹 `IdentityProvider(真的，contract-server 給 /api/me) > ProfilePanelProvider > InboxPanelProvider > [ header(IdentityBadge, InboxButton), InteractionProvider > ListPanelProvider > BoardPanel? + InboxPanel ]`，`contract-server` 回 `/api/messages`、`/api/profiles/{id}`。**不連任何外部服務。**
- 本地後端與契約（`S13`～`S15`）：`test:contract:internal`（CI）、`test:contract:guildhub`（本機）。
- 真瀏覽器：登入兩個人（兩個 context）、A 從人才看板寄信給 B、B 開收件匣看到 A 的對話（截圖 `docs/evidence/fe-k01/`）。
- 驗收不是全綠：不分組（每封一列）→ `S04` 紅；不去重／排序反了 → `S03` 紅；第二頁接在後面不重分組 → `S05` 紅；樂觀接上 → `S08` 紅；寄信後不重取第 0 頁 → `S08` 紅；失敗清 body → `S09` 紅；名字解析失敗擋住清單 → `S04` 紅；送出中鎖導航 → `S12` 紅；對話裡放載入更多 → `S07` 紅；主體條件在應用層過濾（取前 20 再過濾）→ 契約 `S13`（別人 21 封時我的第 0 頁變空）紅；取全部再過濾 → 本地後端資料層形狀判準紅（黑箱契約證不了這個）。
