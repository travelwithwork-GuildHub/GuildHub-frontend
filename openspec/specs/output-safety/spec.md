# output-safety Specification

## Purpose
React 預設會 escape，一般文字不構成 XSS —— 危險面只有幾個：`dangerouslySetInnerHTML`、Markdown／富文字、URL scheme（`javascript:`）、第三方嵌入。
這份規格在它們出現之前把它們鎖起來：三條正面列舉的 lint（`dangerouslySetInnerHTML` 的三種形狀、四種主動嵌入的靜態標籤、原生 `<a>` 的動態 `href`），
`safeHref` 只放行 `http:`／`https:`、只管 scheme、不拋錯，`SafeExternalLink` 是使用者給的網址唯一的渲染方式（沒過就是純文字，不是一個按了沒反應的連結）。

lint 是語法閘門，不是證明：刻意的繞法（`const Tag = 'iframe'`、`createElement('iframe')`、同名遮蔽）不在它的範圍，規格不宣稱 DOM 裡不會出現。
輸出判準守的是「沒有人繞過 React 的 escape」：`TalentFacts` 的三欄與收件匣的每一封都以文字節點呈現使用者字串。

## Requirements

### Requirement: 危險面在 lint 就被擋下（語法閘門，正面列舉）

repo 的 ESLint 設定對 `src/**` SHALL 報錯：
- 任何 `dangerouslySetInnerHTML` —— JSX 屬性、或物件字面裡的屬性鍵（spread 進 JSX、`createElement` 的 props 都算）；
- 靜態 JSX 標籤 `<iframe>`、`<script>`、`<embed>`、`<object>`；
- **原生 `<a>`** 的 `href` 值不是字串字面、也不是沒有 `${}` 的樣板字面（數字／`null`／布林字面、裸的 `<a href />` 都算不是）；`src/security/SafeExternalLink.tsx` 是這一條的唯一例外檔，但前兩條在那個檔裡仍然生效。

字串字面、沒有 `${}` 的樣板字面 SHALL NOT 報錯；自訂元件（`<Link href={…}>`）、`src` 屬性 SHALL NOT 在這三條裡。
這是語法閘門：`const Tag = 'iframe'; <Tag />`、`createElement('iframe')`、同名遮蔽的元件不在它的範圍，規格不宣稱 DOM 裡不會出現。三條是 CI 的 `lint` job 的一部分。

#### Scenario: [FE-T06-S01] `dangerouslySetInnerHTML` 三種形狀都被擋

- **WHEN** 以 repo 的 ESLint 設定 lint 三段放在 `src/x.tsx` 路徑下的程式碼：`<div dangerouslySetInnerHTML={{ __html: s }} />`、`<div {...{ dangerouslySetInnerHTML: { __html: s } }} />`、`createElement('div', { dangerouslySetInnerHTML: { __html: s } })`
- **THEN** 三段 SHALL 各報錯；`<div data-html={s} />` SHALL NOT

#### Scenario: [FE-T06-S02] 嵌入標籤被擋

- **WHEN** lint `<iframe src="https://example.com" />`、`<script />`、`<embed />`、`<object />`（各一段）
- **THEN** 四段 SHALL 各報錯；`<div />`、`<video src="/x.mp4" />` SHALL NOT

#### Scenario: [FE-T06-S03] 原生 `a` 的動態 `href` 被擋；字面、無 `${}` 的樣板、自訂元件、`src` 不擋

- **WHEN** lint `<a href={profile.url} />`、`` <a href={`${profile.url}`} /> ``、`` <a href={`/profiles/${id}`} /> ``、`<a href={safeHref(profile.url)} />`、`<a href={123} />`、`<a href={null} />`、`<a href />`
- **THEN** 七段 SHALL 各報錯（`safeHref(...)` 直接放進 `<a>` 也報：要畫使用者網址只能用 `SafeExternalLink`）
- **WHEN** lint `<a href="/world" />`、`` <a href={`/world`} /> ``、`<Link href={`/profiles/${id}`} />`、`<img src={logo} />`
- **THEN** 四段 SHALL NOT 報錯
- **WHEN** 把 `<a href={safe} />` 放在 `src/security/SafeExternalLink.tsx` 路徑下 lint
- **THEN** SHALL NOT 報錯；同一個路徑下的 `<div dangerouslySetInnerHTML={{ __html: s }} />` 與 `<iframe />` SHALL 仍然報錯（例外只放行第 3 條）

### Requirement: `safeHref` 只放行白名單的 scheme，只管 scheme

`src/security/safeHref.ts` 的 `safeHref(raw: string): string | null`：解析後的 scheme 是 `http:` 或 `https:` 時回正規化後的網址，其餘 scheme（`javascript:`、`data:`、`vbscript:`、`file:`、`blob:`、`mailto:`）與解析不了的（相對路徑、空字串、只有空白）回 `null`。
SHALL NOT 拋錯（解析器拋錯 → `null`）。**只檢查 scheme**：`http://user:pw@host`、超長、Unicode host 都會過 —— 產品上合不合理是 `FE-T02` 的事。

#### Scenario: [FE-T06-S04] 白名單、變體、解析不了、不拋錯

- **WHEN** 呼叫 `safeHref`
- **THEN** `https://example.com/a?b=1` → `https://example.com/a?b=1`；`HTTP://EXAMPLE.com` → `http://example.com/`；`http://user:pw@example.com/` → 過（只管 scheme）
- **AND** `javascript:alert(1)`、`JaVaScRiPt:alert(1)`、`java\tscript:alert(1)`、` javascript:alert(1)`（前面帶空白）、`data:text/html,x`、`vbscript:x`、`file:///etc/passwd`、`blob:https://x/y`、`mailto:a@b.c` → 都是 `null`
- **AND** `/world`、`example.com`、``、`   `、`http://` → 都是 `null`，而且每一次呼叫 SHALL NOT 拋錯（`expect(() => safeHref(x)).not.toThrow()`）

### Requirement: `SafeExternalLink` 是使用者網址唯一的渲染方式，沒過就是純文字

`src/security/SafeExternalLink.tsx` 的 `<SafeExternalLink href={raw}>{children}</SafeExternalLink>`：`safeHref(raw)` 過了 SHALL 畫 `<a href={safe} rel="noopener noreferrer" target="_blank" data-testid="safe-link">`；
沒過 SHALL NOT 建立 `<a>`，SHALL 以 `<span data-testid="unsafe-link">` 畫 children（使用者看得見它不是連結）。

#### Scenario: [FE-T06-S05] 過與沒過

- **WHEN** 渲染 `<SafeExternalLink href="https://example.com">作品集</SafeExternalLink>`
- **THEN** SHALL 有 `a[href="https://example.com/"]`，`rel` 含 `noopener` 與 `noreferrer`、`target="_blank"`
- **WHEN** 渲染 `<SafeExternalLink href="javascript:alert(1)">作品集</SafeExternalLink>`
- **THEN** SHALL 沒有任何 `a` 元素，`unsafe-link` 的文字是「作品集」

### Requirement: 使用者提供的字串以文字呈現（具名元件）

`TalentFacts` 的名字、技能、自介與收件匣對話（`InboxPanel` 的對話畫面）每一封的 body 節點（`[data-testid="inbox-message-body"]`）SHALL 以文字節點呈現使用者提供的字串；字串含 HTML 時，該欄位的節點 SHALL NOT 有任何子元素。

#### Scenario: [FE-T06-S06] 含 HTML 的名片與信，逐欄定位

- **WHEN** 以 `display_name`＝`<b onclick=alert(1)>x</b>`、`skills`＝`['<img src=x onerror=alert(2)>']`、`bio`＝`<script>alert(3)</script><i>y</i>` 渲染 `TalentFacts`
- **THEN** `h3` 的 `textContent` SHALL 等於 `<b onclick=alert(1)>x</b>` 且 SHALL 沒有子元素；`[data-testid="talent-skill"]` 的 `textContent` SHALL 等於那段 `<img …>` 且沒有子元素；`[data-testid="talent-bio"]` 的 `textContent` SHALL 等於那段 `<script>…` 且沒有子元素；整個 `talent-facts` 容器裡 SHALL 沒有 `b`、`img`、`script`、`i` 元素
- **WHEN** 收件匣的對話裡有兩封：body＝`<img src=x onerror=alert(4)><u>z</u>`、body＝`<svg onload=alert(5)></svg><a href="javascript:alert(6)">w</a>`
- **THEN** 兩封 `[data-testid="inbox-message-body"]` 的 `textContent` SHALL 各等於原字串、各 SHALL 沒有子元素；整個對話裡 SHALL 沒有 `img`、`u`、`svg`、`a[href^="javascript"]` 元素
