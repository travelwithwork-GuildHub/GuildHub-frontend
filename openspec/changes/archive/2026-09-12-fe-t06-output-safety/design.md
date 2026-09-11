# `FE-T06` 設計：難逆轉的決定與代價

## D1｜三條 lint，全部是正面列舉，走既有的 `no-restricted-syntax`；邊界寫清楚

`eslint.config.mjs` 已經有 `no-restricted-syntax` 的區塊（process.env、錯誤型別、slot、契約 `.min/.max`）。加三個 selector：
- `JSXIdentifier[name="dangerouslySetInnerHTML"], Property[key.name="dangerouslySetInnerHTML"], Property[key.value="dangerouslySetInnerHTML"]` —— 直接屬性、spread 的物件、`createElement` 的 props 物件都抓（審查抓到只擋 JSX 屬性）。
- `JSXOpeningElement[name.name=/^(iframe|script|embed|object)$/]` —— 靜態標籤。
- `JSXOpeningElement[name.name="a"] > JSXAttribute[name.name="href"] > JSXExpressionContainer > :not(Literal[value.type="string"], TemplateLiteral[expressions.length=0])`
  ＋ `JSXOpeningElement[name.name="a"] > JSXAttribute[name.name="href"][value=null]` —— 原生 `a` 的動態 `href`；`Literal` 只放行**字串**（`href={123}`、`href={null}`、`href={true}` 都報），裸的 `<a href />` 也報（審查抓到）。

**邊界（lint 擋不到、規格不宣稱）**：`const Tag = 'iframe'; <Tag />`、`React.createElement('iframe')`、同名遮蔽的元件、把 `<a>` 包成自訂元件再傳 `href`。這些是刻意繞法，靠 code review。
`src/security/SafeExternalLink.tsx` 的例外**不是**整個 config block 的 `ignores`（那會把 `process.env`、`dangerouslySetInnerHTML`、嵌入標籤的限制一起拿掉 —— 審查抓到）：
是一個 `files: ['src/security/SafeExternalLink.tsx']` 的 override 區塊，帶著**除了第 3 條以外**的全部 selector；測試裡有 fixture 證明那個檔案裡的 `dangerouslySetInnerHTML` 仍然報錯。
⚠️ flat config 後者整條覆蓋前者：這三個 selector 要跟既有的一起帶著（跟 `ERROR_BOUNDARY`／`SLOT_RULES` 同一個做法）；負向 fixture 在測試裡（不是手改正式碼）。

## D2｜`safeHref`：解析後看 `protocol`，`try/catch`，只管 scheme

`javascript:` 的變體太多（`JaVaScRiPt:`、`java\tscript:`、前面帶空白）；用 URL 解析器把 scheme 正規化之後看 `protocol` 是不是封閉白名單裡的，比正則可靠。
`new URL(raw)` 對相對路徑、空字串會**拋 `TypeError`** —— 一定包 `try/catch`，拋了就 `null`（審查提醒）。回的是解析後的 `href`（正規化過）。
**只管 scheme**：`http://user:pw@host`、超長、Unicode host 都會過 —— 那是「網址在產品上合不合理」，`FE-T02` 的規格管。這裡是 XSS 的那一道。

## D3｜`SafeExternalLink` 是唯一的渲染方式；`null` 的 fallback 在這裡

`<SafeExternalLink href={raw}>{label}</SafeExternalLink>`：`safeHref(raw)` 過了 → `<a href={safe} rel="noopener noreferrer" target="_blank" data-testid="safe-link">`；沒過 → `<span data-testid="unsafe-link">{label}</span>`。
lint 只放行這個檔案裡的 `<a href={…}>`；別處要畫使用者網址只能用它。`rel="noopener noreferrer"` 與 `target="_blank"` 是外部連結的既定做法（`noopener`：新分頁拿不到 `window.opener`）。

## D4｜輸出判準測的是真的元件、逐欄定位

`TalentFacts`：名字（`h3`）、技能（`[data-testid="talent-skill"]`）、自介（`[data-testid="talent-bio"]`）各用**不同**的 payload（含不同標籤與事件屬性），逐欄斷言該節點的 `textContent` 等於原字串、子樹沒有元素。
收件匣：渲染真的 `InboxPanel`（跟 `tests/inbox-panel.test.tsx` 同一棵樹）、進對話，**兩封**不同 payload 的 `[data-testid="inbox-message"]` 各自的 body 節點（`[data-testid="inbox-message-body"]`）逐封斷言。不寫一個「escape 函式」再測它 —— React 就是那個函式；判準守的是「沒有人繞過它」。

## 待答問題

（無。`mailto:` 在有需求時跟需求一起加。）

## 這一份怎麼驗

- lint（`S01`～`S03`）：用 repo 的 ESLint 設定對一段放在 `src/` 路徑下的程式碼 lint（`tests/limit-lint-rule.test.ts` 的做法），正向與負向 fixture 都在測試裡。
- `safeHref`（`S04`）、`SafeExternalLink`（`S05`）：純函式與 jsdom。
- 輸出（`S06`）：jsdom 渲染真的元件。**不連任何外部服務。**
- 驗收不是全綠：selector 拿掉 → `S01`～`S03` 紅；`safeHref` 改 `startsWith('http')` → `S04` 紅（`httpx:` 會過、`HTTP://` 會被拒）；`SafeExternalLink` 沒過也畫 `<a>` → `S05` 紅；`TalentFacts` 的 bio 改 `dangerouslySetInnerHTML` → lint 紅（先）＋ `S06` 紅。
