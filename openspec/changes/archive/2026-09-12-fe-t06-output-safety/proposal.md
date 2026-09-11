# `FE-T06` 輸入與輸出安全：把危險面鎖起來，在它們出現之前

## Why

React 預設會 escape，一般文字不構成 XSS。盤點今天 `src/` 裡使用者字串的輸出點（名字、技能、自介：`TalentFacts`；站內信 body：收件匣的對話）都是 JSX 文字節點，沒有發現 HTML 注入路徑；
`src/` 裡沒有 `dangerouslySetInnerHTML`、沒有 `iframe`／`script`／`embed`／`object`，`href` 只有兩個字面的站內 `<Link>`。
危險面只有幾個（WBS 這一列自己列的）：`dangerouslySetInnerHTML`、Markdown／富文字、**URL scheme**（`javascript:`）、第三方嵌入。
現在 `src/` 裡一個都沒有 —— 這是把它們鎖起來最便宜的時候：`FE-T02`（W11：作品集連結、GitHub／Figma／LinkedIn）會第一次把**使用者給的網址**畫成連結，
那一天如果沒有一個唯一的安全連結元件與 lint，`javascript:alert(1)` 就是一個合法的作品集連結。

不做會怎樣：第一個渲染使用者網址的人（W11）得自己想起要擋 scheme；第一個想用 `dangerouslySetInnerHTML` 畫「富文字」的人不會被任何東西擋下。
這一項的代價是 4 點，而 WBS 把它排在 W2 就是要它在那些功能之前。

## What Changes

- **`SafeExternalLink`**（`src/security/SafeExternalLink.tsx`）：使用者給的網址**唯一**的渲染方式。裡面 `safeHref(raw)` 過 scheme 白名單（只有 `http:`／`https:`）；過了畫 `<a href rel="noopener noreferrer" target="_blank">`、
  沒過（`javascript:`、`data:`、相對路徑、解析不了⋯⋯）**不建 `<a>`**，把 children 畫成純文字 —— 使用者看得見它不是連結，不是一個按了沒反應的連結。
- **`safeHref(raw)`**（`src/security/safeHref.ts`）：純函式、不拋錯；只檢查 scheme（XSS 的範圍），不檢查網址在產品上合不合理（那是 `FE-T02` 的事）。
- **lint（正面列舉、窄，走既有 `no-restricted-syntax`）**，`src/**` 內：
  1. 任何 `dangerouslySetInnerHTML`（JSX 屬性、物件屬性 —— 含 spread 與 `createElement` 的 props 物件）；
  2. `<iframe>`／`<script>`／`<embed>`／`<object>` 的靜態 JSX 標籤；
  3. **原生 `<a>`** 的 `href` 若不是字串字面、也不是**沒有 `${}` 的**樣板字面 → 報錯（要畫使用者網址就用 `SafeExternalLink`）。`SafeExternalLink.tsx` 自己是唯一的例外檔。
  自訂元件（`<Link>`、`<Foo href>`）不在第 3 條裡：它們的契約自己管；`src` 不在裡面：`<img src={importedAsset}>` 是 Next 的常態、而且 `<img src="javascript:">` 在現代瀏覽器不執行。
- **輸出判準**：`TalentFacts` 的三欄與收件匣對話的每一封，含 HTML 的使用者字串 SHALL 以文字節點呈現、對應元素 SHALL NOT 出現。今天就綠（React 的預設），寫下來是讓「有人改成 innerHTML」那一天變紅。

## ⚠️ 討論談定的取捨

- **lint 是語法閘門，不是證明**：它擋的是列出來的語法形狀；`const A = 'iframe'; <A />`、同名遮蔽的 `SafeExternalLink` 這種刻意繞法不在它的範圍（兩位審查者都指出）。規格只宣稱它擋什麼，不宣稱「DOM 裡不會有」。
- **樣板字面只放行沒有 `${}` 的**：`` href={`${user.url}`} `` 是直接的繞法（審查抓到）。站內動態路徑用 `<Link>`（不是原生 `a`），不受這條管。
- **只有 `http:`／`https:`**：`mailto:` 沒有任何已合併的需求要它；要的時候跟需求一起加。
- **`safeHref` 回 `null` 不回 `#`**：呼叫端要看得見它被拒絕。`SafeExternalLink` 是那個「看得見」的實作，本 change 自己負責（不推給 `FE-T02`）。

## ⚠️ 不做什麼

- **本 change 不新增 Markdown／富文字**（要的時候另立規格處理 sanitizer 與允許的標籤）。
- **本 change 不處理 CSP**。
- **不做第三方嵌入的白名單政策**：只擋四種主動嵌入的靜態 JSX 標籤；`img`／`video`／CSS `url()` 等被動載入不在範圍。
- **不改任何既有畫面**：今天沒有使用者網址被渲染；`FE-T02` 會用 `SafeExternalLink`。
- **不追蹤 import 來源**（`no-restricted-syntax` 做不到）；lint 的邊界寫在 design `D1`。
