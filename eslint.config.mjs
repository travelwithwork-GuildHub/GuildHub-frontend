import next from 'eslint-config-next'

// ⚠️ 兩個相依套件**刻意不用最新版**，而且都是實測撞出來的，不是保守。
// 升級之前先讀這段，不然會重踩一次：
//
//   typescript  6.0.3（最新是 7.0.2）
//     TS 7 是 Go 重寫版。`typescript-eslint` 直接拒絕啟動：
//     "typescript-eslint does not support TS 7.0"。
//     它的 peer 是 `typescript >=4.8.4 <6.1.0`。
//     追蹤：https://github.com/typescript-eslint/typescript-eslint/issues/10940
//
//   eslint  9.39.5（最新是 10.10.0）
//     `eslint-config-next@16.3.4` 內含 `typescript-eslint@8.69.0`，
//     它的 peer **宣稱**支援 `^10.0.0`，但實際上 lint 會炸：
//     `TypeError: scopeManager.addGlobals is not a function`
//     —— ESLint 10 改了 ScopeManager 的 API，那份 scope-manager 是為 9 建的。
//     **宣稱的相容性跟實際的相容性是兩件事。**
//
// 解除條件：typescript-eslint 支援 TS >=7 之後放 typescript；
// 它真的能在 ESLint 10 上跑之後放 eslint。兩件事各自獨立。

// ─── 「元件裡不准出現 fetch」（規格 FE-X01-S08 / S09）────────────────────
//
// CONTEXT.md 與 AGENTS.md 都明文寫了這條，但在這個檔案存在之前**沒有任何
// 機器在擋**：一個含 `fetch()` 的元件推 PR 會全綠。依 AGENTS.md
// 〈新增流程閘門的門檻〉328–332 行，可重現的繞法就算證據。
//
// **例外路徑刻意寫成精確的 `src/api/**`，不是 `**/src/api/**`。**
// 寬鬆版實測有洞：`src/components/src/api/sneaky.ts` 會被當成例外放行 ——
// 任何人只要多開一層叫 `src/api` 的目錄就繞過去了，而且完全無聲。
// 測試不需要真的建那些檔案，它用 ESLint 的 `lintText` 帶虛擬 filePath，
// 所以這裡不必為了讓 fixture 適用而放寬 glob。
const DATA_ACCESS_PATHS = ['src/api/**', 'src/app/api/**']
// 契約測試（FE-O05）刻意走真 HTTP、**刻意不經 `src/api/`**（經過的話 `max+1` 在送出前就被 Zod 擋掉，看不到後端）。
// 精確到檔案，不是 `tests/**`：測試檔裡順手 fetch 的那一次還是要被擋。
/** FE-O06：這兩個檔案的 `.min()`／`.max()` 只能接 `LIMITS.*`。精確路徑。 */
const CONTRACT_SCHEMA_PATHS = ['src/api/contract/rest.ts', 'src/api/contract/ws.ts']
const CONTRACT_HTTP_PATHS = ['tests/contract/client.ts', 'tests/contract/harness.ts', 'scripts/contract-guildhub.mjs', 'tests/contract/ws/rooms.contract.ts']
// 本地後端問即時層替身人數（FE-O03 design D5）：伺服器對自己 loopback 的一次 HTTP，跟「元件裡的 fetch」是兩件事。精確到檔案。
const SERVER_LOOPBACK_PATHS = ['src/server/realtime.ts']

const MSG =
  '元件裡不准出現 fetch。所有資料存取走 src/api/，由環境變數決定連本地後端還是真後端。' +
  '散在各處的 fetch 會讓「之後銜接」變成「之後重寫」。見 CONTEXT.md。'

// `self` 是實測補上的 —— 只列 window / globalThis 的話，`self.fetch()` 整個躲過去。
const GLOBAL_OBJECTS = ['window', 'globalThis', 'self']

// 換一個 HTTP client 一樣是繞過這條規則，只是換了個名字。
// 抽成常數是因為 FE-O21 的三條 import 邊界要跟它**組合**進同一條 `no-restricted-imports`
//（flat config 同名規則是後者整條取代前者），見下面的 `restrictedImports()`。
const HTTP_CLIENT_PATHS = ['axios', 'node-fetch', 'got', 'ky', 'superagent', 'undici'].map((name) => ({ name, message: MSG }))

/**
 * 一整條 `no-restricted-imports`：`paths`（HTTP client 那串，或空）＋ 要組合的邊界（`patterns`，FE-O21）。
 * 每個 override 區塊**只決定組合哪幾組**，內容都在常數裡 —— 少帶一組就是無聲的洞。
 */
const restrictedImports = (paths, ...patternGroups) => ['error', { paths, patterns: patternGroups.flat() }]

const noFetchRules = {
  'no-restricted-globals': [
    'error',
    { name: 'fetch', message: MSG },
    { name: 'XMLHttpRequest', message: MSG },
  ],
  'no-restricted-properties': [
    'error',
    ...GLOBAL_OBJECTS.flatMap((object) => [
      { object, property: 'fetch', message: MSG },
      { object, property: 'XMLHttpRequest', message: MSG },
    ]),
  ],
  'no-restricted-imports': restrictedImports(HTTP_CLIENT_PATHS),
}

// **這條規則擋得住什麼、擋不住什麼**（AGENTS.md：高估一個閘門比沒有它更危險）
//
// 實測擋得住：`fetch()`、`window.fetch`、`window['fetch']`、`self.fetch`、
//   `const { fetch } = window`、以及上面列舉的 HTTP client import。
//
// 擋不住：先把 fetch 存進變數再跨檔案傳、動態算出來的屬性名
//   （`window[k]` 其中 k 是變數）、以及沒列進清單的第三方套件。
//   **它擋的是順手寫下去的那一次，不是刻意繞過的人。** 後者只有 review 擋得住。
//
// 沒有限制 `WebSocket`：即時層是 FE-R01 的範圍，那一項還沒談過規格，
//   在這裡先擋會變成替它裁決。

// ─────────────────────────────────────────────────────────────────────────
// 規格 FE-O09：環境變數只有一處讀取，而且只能用字面存取
//
// **刻意用 `no-restricted-syntax`，不是 `no-restricted-properties`。**
// 上面那個 `DATA_ACCESS_PATHS` 的例外區塊會把 `no-restricted-properties`
// **整條關掉** —— 放進去的話，`src/api/**` 底下就能自由讀 `process.env`，
// 而那是一個無聲的洞。`no-restricted-syntax` 不在那個例外裡。

const ENV_ONLY = 'src/config/env.ts'

const ENV_MSG =
  `環境變數只能在 ${ENV_ONLY} 讀取，別處從那裡 import。` +
  '散在各處的位址會讓「換一份後端」變成搜尋整個 repo。見 FE-O09 的規格。'

// **這兩條擋的是「在瀏覽器裡靜默變成 undefined」的寫法。**
//
// Next.js 是在建置時把 `NEXT_PUBLIC_*` 靜態替換成字面值的。官方文件
//〈Environment Variables〉明寫 dynamic property lookups 與「先把 process.env
// 指派給變數再取用」**都不會被替換** —— 在瀏覽器裡得到 `undefined`。
//
// ⚠️ **這個 bug 在單元測試裡永遠重現不了**：測試跑在 Node，那裡的
// `process.env` 是真的物件，兩種寫法都正常。**所以這兩條規則是唯一擋得住
// 它的東西**，不要因為「測試都綠」就把它們拿掉。
const INLINE_MSG =
  'Next.js 只替換完整的字面存取 `process.env.NEXT_PUBLIC_X`。' +
  '計算屬性與「先指派再取用」不會被替換，在瀏覽器裡是 undefined，而且沒有任何錯誤訊息。' +
  '這個 bug 在單元測試裡重現不了（測試跑在 Node）—— 這條規則是唯一擋得住它的東西。'

/** 任何形式的 `process.env`。 */
const ANY_PROCESS_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: ENV_MSG,
}

/** `process.env[name]` —— 計算屬性，不會被替換。 */
const COMPUTED_PROCESS_ENV = {
  selector:
    "MemberExpression[computed=true][object.object.name='process'][object.property.name='env']",
  message: INLINE_MSG,
}

/** `const e = process.env` —— 先指派再取用，同樣不會被替換。 */
const ALIASED_PROCESS_ENV = {
  selector: "VariableDeclarator[init.object.name='process'][init.property.name='env']",
  message: INLINE_MSG,
}

// ─────────────────────────────────────────────────────────────────────────
// 規格 FE-X03-S16：`HttpError`／`NetworkError` 只能被建立它們的 `src/api/` 與翻譯它們的
// `src/errors/` 引用。別處要知道「這個失敗是哪一種」，看 `toUiError(error).kind`。
//
// 第二張「status → 該怎麼說」的對照表就是從 `error.status === 401` 這種一行開始長的，
// 而要寫那一行就得先 import `HttpError`。所以擋在 import。
//
// **三種寫法都擋**：具名 import（含 `as` 改名）、整個模組 `import * as`、再匯出。
// 字串掃描擋不住前兩種 —— 這是它變成 lint 規則的理由。
const TRANSPORT = '@/api/transport'
const BOUNDED_ERRORS = ['HttpError', 'NetworkError']
const BOUNDARY_MSG =
  `${BOUNDED_ERRORS.join('／')} 只能在 src/api/ 與 src/errors/ 引用。` +
  '要知道這個失敗是哪一種，用 toUiError(error).kind —— 別處自己比 status 就是第二張對照表。見 FE-X03 的規格。'

const ERROR_BOUNDARY = [
  ...BOUNDED_ERRORS.map((name) => ({
    selector: `ImportDeclaration[source.value='${TRANSPORT}'] ImportSpecifier[imported.name='${name}']`,
    message: BOUNDARY_MSG,
  })),
  {
    selector: `ImportDeclaration[source.value='${TRANSPORT}'] ImportNamespaceSpecifier`,
    message: BOUNDARY_MSG,
  },
  ...BOUNDED_ERRORS.map((name) => ({
    selector: `ExportNamedDeclaration[source.value='${TRANSPORT}'] ExportSpecifier[local.name='${name}']`,
    message: BOUNDARY_MSG,
  })),
  { selector: `ExportAllDeclaration[source.value='${TRANSPORT}']`, message: BOUNDARY_MSG },
]

// ─────────────────────────────────────────────────────────────────────────
// 規格 FE-X04-S12：`ListPanel` 的 `empty`／`exhausted`／`error` 三個插槽裡**直接寫的** JSX 元素
// 只能是 `EmptyState` —— 空狀態的字句與版型標著「唯一一份」，第二份就是從
// `empty={<p>沒有資料</p>}` 這一行開始長的。
//
// **擋得住**：`empty={<p/>}`、`error={({ retry }) => <div>…</div>}`、以及巢狀在
// `<EmptyState>` 之外的任何元素。
// **擋不住**：先把節點存進變數再傳（`const node = <p/>`）—— 那只有 review 擋得住，
// 所以規格的義務只寫到「直接寫的」。
const LIST_PANEL_SLOTS = ['empty', 'exhausted', 'error']
const SLOT_MSG =
  'ListPanel 的 empty／exhausted／error 插槽只能放 <EmptyState>（src/empty-state）—— 空狀態的字句與版型只有一份。見 FE-X04 的規格。'
const SLOT_ATTR = `JSXOpeningElement[name.name='ListPanel'] > JSXAttribute[name.name=/^(${LIST_PANEL_SLOTS.join('|')})$/] > JSXExpressionContainer`
// 看的是插槽裡**最外層**那個元素：`empty={<X/>}` 的 X、`error={(s) => <X/>}` 的 X、
// `error={(s) => { return <X/> }}` 的 X（有大括號的函式本體 —— 審查抓到的漏洞：
// 加一對大括號與 `return` 不該是規格允許的規避方式）。
// 只看最外層是刻意的 —— `<EmptyState action={<Link/>}>` 裡面的 `<Link>` 是合法的。
const SLOT_ROOTS = [
  `${SLOT_ATTR}`,
  `${SLOT_ATTR} > ArrowFunctionExpression`,
  `${SLOT_ATTR} > ArrowFunctionExpression > BlockStatement > ReturnStatement`,
  `${SLOT_ATTR} > FunctionExpression > BlockStatement > ReturnStatement`,
]
const SLOT_RULES = SLOT_ROOTS.flatMap((root) => [
  `${root} > JSXElement > JSXOpeningElement[name.name!='EmptyState']`,
  `${root} > JSXFragment`,
]).map((selector) => ({ selector, message: SLOT_MSG }))

// ─────────────────────────────────────────────────────────────────────────
// 規格 FE-T06：危險面在 lint 就被擋下 —— 語法閘門，正面列舉、窄。
//
// 三條：`dangerouslySetInnerHTML`（JSX 屬性、物件屬性 —— spread 進 JSX、`createElement` 的 props 都是物件屬性）、
// 四種主動嵌入的靜態 JSX 標籤、**原生 `<a>`** 的 `href` 只放行字串字面與沒有 `${}` 的樣板字面
//（`` `${user.url}` `` 是直接的繞法；數字／null／布林字面與裸的 `<a href />` 也報）。
// 要畫使用者給的網址只能用 `src/security/SafeExternalLink.tsx`（那個檔案是第三條的唯一例外，見下面的 override）。
//
// **擋得住**：上面列的語法形狀。**擋不住**（規格明寫不宣稱）：`const Tag = 'iframe'; <Tag />`、`createElement('iframe')`、
// 同名遮蔽的元件、把 `<a>` 包成自訂元件再傳 href —— 那些是刻意繞法，靠 review。
// 自訂元件（`<Link href={…}>`）與 `src` 屬性不在裡面：站內動態路徑走 `<Link>`；`<img src={asset}>` 是 Next 的常態。
const OUTPUT_SAFETY_MSG = (what) => `${what} —— 規格 FE-T06〈危險面在 lint 就被擋下〉。`
const DANGEROUS_HTML = [
  { selector: "JSXIdentifier[name='dangerouslySetInnerHTML']", message: OUTPUT_SAFETY_MSG('不得使用 dangerouslySetInnerHTML') },
  { selector: "Property[key.name='dangerouslySetInnerHTML'], Property[key.value='dangerouslySetInnerHTML']", message: OUTPUT_SAFETY_MSG('不得使用 dangerouslySetInnerHTML（物件屬性、spread、createElement 都算）') },
]
const EMBED_TAGS = {
  selector: 'JSXOpeningElement[name.name=/^(iframe|script|embed|object)$/]',
  message: OUTPUT_SAFETY_MSG('不得直接寫 <iframe>／<script>／<embed>／<object>'),
}
const RAW_ANCHOR_HREF_MSG = OUTPUT_SAFETY_MSG('原生 <a> 的 href 只能是字串字面或沒有 ${} 的樣板字面；使用者給的網址用 <SafeExternalLink>（src/security）')
const RAW_ANCHOR_HREF = [
  {
    selector:
      // `Literal.value` 是原始值、沒有 `.type` —— 要分「字串字面」只能看 `raw`（以引號開頭）；審查抓到 `[value.type='string']` 永遠不匹配、會誤擋 `href={'/world'}`。
      "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'] > JSXExpressionContainer > :not(Literal[raw=/^[\"']/], TemplateLiteral[expressions.length=0])",
    message: RAW_ANCHOR_HREF_MSG,
  },
  { selector: "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'][value=null]", message: RAW_ANCHOR_HREF_MSG },
]
const OUTPUT_SAFETY = [...DANGEROUS_HTML, EMBED_TAGS, ...RAW_ANCHOR_HREF]
const SAFE_EXTERNAL_LINK = 'src/security/SafeExternalLink.tsx'

/** 「這個 override 帶著除了那幾條以外的全部」—— 比對的是 selector 物件本身，不是字串。 */
const except = (rules, excluded) => rules.filter((rule) => !excluded.includes(rule))

// ─────────────────────────────────────────────────────────────────────────
// 規格 FE-O21：三條 import 邊界（`docs/adr/0005`、`docs/adr/0006`）由 lint 強制，正式碼零行。
//
//   ① `src/**` 只有 `src/world/RemoteWorld.tsx` 可以 import `src/realtime/client` 的**值**（type 放行）；
//      `src/realtime/**` 內部不得以值再匯出 `./client`（barrel 擋在源頭）
//   ② `src/config/env.ts` 不得 import `src/api/` 的任何東西（**含 type**）
//   ③ `src/api/contract/**` 不得 import `src/config/` 的任何東西（**含 type**）
//
// **比對的是 import 字串，不解析檔案系統**（design D1 量過：`import/no-restricted-paths` 在這個 repo
// 解析不了 `@/` 別名、分不出 type、漏 `import x = require()`）。靜態 import 全部交給 core
// `no-restricted-imports` 的 `patterns[].regex`（含 `import x = require()`；`allowTypeImports` 逐條設 ——
// 0006 放行 type、0005 不放行）；動態 `import('字面')`／`require('字面')` 那條規則不看，
// 用 `no-restricted-syntax` 的兩個 selector 補。閉集以外的寫法（變數路徑、字串拼接）擋不住 ——
// 規格 Non-goals 明寫；它擋的是順手寫下去的那一次。
//
// 訊息要說「為什麼」，不只說「不准」（design D4）。
const REMOTE_WORLD = 'src/world/RemoteWorld.tsx'
const CLIENT_MSG =
  '即時訊息只有一條路：RemoteWorld → realtime-protocol 驗證 → 下游。別處拿到 client 就是第二條路。見 docs/adr/0006。'
const ENV_TO_API_MSG =
  '設定模組是依賴樹的葉子，不依賴 src/api/：契約 —— 換後端位址與後端改形狀是兩個變更理由（docs/adr/0005）；' +
  '傳輸層 —— 它 import 設定，反過來就是循環。'
const CONTRACT_TO_CONFIG_MSG =
  '契約不知道後端在哪；接兩邊的是 src/api/transport.ts／src/realtime/client.ts。見 docs/adr/0005。'

// `client.ts` 不是 `.tsx`，閉集只寫 `.ts`。相對路徑不限深度：`(^|/)` 讓 `../../realtime/client` 也中。
const CLIENT_RE = '(^|/)realtime/client(\\.ts)?$'
const CLIENT_INTERNAL_RE = '^\\./client(\\.ts)?$'
const ENV_TO_API_RE = '^@/api/|(^|/)\\.\\./api/'
const CONTRACT_TO_CONFIG_RE = '^@/config/|(^|/)\\.\\./config/'

const CLIENT_IMPORT_PATTERNS = [{ regex: CLIENT_RE, message: CLIENT_MSG, allowTypeImports: true }]
const CLIENT_INTERNAL_PATTERNS = [{ regex: CLIENT_INTERNAL_RE, message: CLIENT_MSG, allowTypeImports: true }]
const ENV_TO_API_PATTERNS = [{ regex: ENV_TO_API_RE, message: ENV_TO_API_MSG }]
const CONTRACT_TO_CONFIG_PATTERNS = [{ regex: CONTRACT_TO_CONFIG_RE, message: CONTRACT_TO_CONFIG_MSG }]

/** 動態 `import('字面')` 與 `require('字面')`。esquery 的 regex 字面用 `/` 圍起來，所以裡面的 `/` 要跳脫。 */
const dynamicImport = (regex, message) => {
  const escaped = regex.replaceAll('/', '\\/')
  return [
    { selector: `ImportExpression > Literal[value=/${escaped}/]`, message },
    { selector: `CallExpression[callee.name='require'] > Literal[value=/${escaped}/]`, message },
  ]
}
const DYNAMIC_CLIENT = dynamicImport(CLIENT_RE, CLIENT_MSG)
const DYNAMIC_CLIENT_INTERNAL = dynamicImport(CLIENT_INTERNAL_RE, CLIENT_MSG)
const DYNAMIC_ENV_TO_API = dynamicImport(ENV_TO_API_RE, ENV_TO_API_MSG)
const DYNAMIC_CONTRACT_TO_CONFIG = dynamicImport(CONTRACT_TO_CONFIG_RE, CONTRACT_TO_CONFIG_MSG)

// `src/**` 的 `no-restricted-syntax` 分兩層：這一組是**每個** `src/**` 區塊都要帶的；
// `src/api/**`／`src/errors/**` 以外再加 `ERROR_BOUNDARY`＋`SLOT_RULES`（見下面）。
// 抽出來是因為 FE-O21 讓 override 區塊變多，每一塊都手抄一次就會有一塊漏。
const SRC_SYNTAX = [ANY_PROCESS_ENV, COMPUTED_PROCESS_ENV, ALIASED_PROCESS_ENV, ...OUTPUT_SAFETY, ...DYNAMIC_CLIENT]
const SRC_APP_SYNTAX = [...SRC_SYNTAX, ...ERROR_BOUNDARY, ...SLOT_RULES]

const config = [
  { ignores: ['.next/**', 'node_modules/**'] },

  ...next,

  { rules: noFetchRules },

  // FE-O21 ①：`src/**` 底下 client 邊界（HTTP ＋ client）。`RemoteWorld.tsx` 的例外在下面自己一個區塊。
  {
    files: ['src/**'],
    rules: { 'no-restricted-imports': restrictedImports(HTTP_CLIENT_PATHS, CLIENT_IMPORT_PATTERNS) },
  },

  // no-fetch 的例外區，**拆成兩塊**：
  // `src/` 裡的資料層與 loopback —— fetch 的家，HTTP 那串 off；但 client 邊界**不是** no-fetch 的例外
  //（第二輪兩位審查者各自抓到：整條 off 會讓 `transport.ts`／`operations.ts`／`server/realtime.ts` 漏網）。
  {
    files: [...DATA_ACCESS_PATHS, ...SERVER_LOOPBACK_PATHS],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': restrictedImports([], CLIENT_IMPORT_PATTERNS),
    },
  },
  // `src/` 外的契約測試與腳本 —— 整條 off，跟以前一樣。
  {
    files: CONTRACT_HTTP_PATHS,
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },

  // `src/**` 底下不准讀 `process.env`。
  //
  // **範圍是 `src/**`，不是全部** —— 規格的字面就是「`src/` 底下該模組以外」。
  // 測試檔本來就要設環境變數才能驗「缺變數會怎樣」；把它們一起擋住的話，
  // 這條規則第一天就會被關掉。`next.config.ts` 同理，它是建置期的檔案。
  {
    files: ['src/**'],
    rules: {
      'no-restricted-syntax': ['error', ...SRC_SYNTAX],
    },
  },

  // `src/**` 底下、`src/api/**` 與 `src/errors/**` 以外：不准 import 資料層的錯誤型別。
  //
  // ⚠️ **同一條 `no-restricted-syntax` 要把上面的三個 env selector 一起帶著** ——
  // flat config 是後者整條覆蓋前者，不是合併；少帶的話這些檔案就沒有人擋 `process.env` 了。
  // `ignores` 是精確路徑不是 `**/src/api/**`，理由同 no-fetch。
  {
    files: ['src/**'],
    ignores: ['src/api/**', 'src/errors/**', ENV_ONLY, SAFE_EXTERNAL_LINK],
    rules: {
      'no-restricted-syntax': ['error', ...SRC_APP_SYNTAX],
    },
  },

  // FE-O21 ①：`RemoteWorld.tsx` 是「import client 的值」那條的**唯一**例外 —— 完整路徑不是萬用字元
  //（`src/components/world/RemoteWorld.tsx` 不是例外，S03）。這個 override 帶著除了 client 那條以外的全部：
  // HTTP 那串照擋、`SRC_APP_SYNTAX` 去掉動態 client 的兩個 selector。
  {
    files: [REMOTE_WORLD],
    rules: {
      'no-restricted-imports': restrictedImports(HTTP_CLIENT_PATHS),
      'no-restricted-syntax': ['error', ...except(SRC_APP_SYNTAX, DYNAMIC_CLIENT)],
    },
  },

  // FE-O21 ①：`src/realtime/**` 內部另擋 `./client` 的值 import／再匯出（S06）——
  // barrel 擋在源頭，`import { … } from '@/realtime'` 就拿不到值，不用對別名本身再加規則。
  {
    files: ['src/realtime/**'],
    rules: {
      'no-restricted-imports': restrictedImports(HTTP_CLIENT_PATHS, CLIENT_IMPORT_PATTERNS, CLIENT_INTERNAL_PATTERNS),
      'no-restricted-syntax': ['error', ...SRC_APP_SYNTAX, ...DYNAMIC_CLIENT_INTERNAL],
    },
  },

  // 規格 FE-T06：`SafeExternalLink.tsx` 是「原生 `<a>` 的動態 href」那一條的**唯一**例外（它裡面就是 `<a href={safe}>`）。
  // 不是整個 block 的 `ignores`（那會連 process.env、dangerouslySetInnerHTML、嵌入標籤一起放掉 —— 審查抓到的）：
  // 這個 override 帶著除了那一條以外的全部。**完整路徑不是萬用字元**，理由同 `ENV_ONLY`。
  {
    files: [SAFE_EXTERNAL_LINK],
    rules: {
      'no-restricted-syntax': ['error', ...except(SRC_APP_SYNTAX, RAW_ANCHOR_HREF)],
    },
  },

  // FE-O21 ③：`src/api/contract/**`（含子目錄）不得 import `src/config/`，**含 type**（S05）。
  // 契約是純 zod，沒有 fetch 的需求 —— HTTP 那串一起開回來。
  //
  // ⚠️ design D3：這裡的 `no-restricted-syntax` **要帶著 `SRC_SYNTAX`**。FE-O06 那個區塊原本只列 LIMITS 那一條，
  // 整條蓋掉了 `src/**` 的 selector，於是 `rest.ts`／`ws.ts` 讀 `process.env` 不會被擋（`FE-O09-S01` 的無聲例外）。
  // `tests/boundary-lint-rule.test.ts` 有一條標 `FE-O09-S01` 的斷言釘住它。
  {
    files: ['src/api/contract/**'],
    rules: {
      'no-restricted-imports': restrictedImports(HTTP_CLIENT_PATHS, CLIENT_IMPORT_PATTERNS, CONTRACT_TO_CONFIG_PATTERNS),
      'no-restricted-syntax': ['error', ...SRC_SYNTAX, ...DYNAMIC_CONTRACT_TO_CONFIG],
    },
  },

  // 規格 FE-O06：契約 schema 的 `.min()`／`.max()` 不接數字字面 —— 數字只能來自 `LIMITS`。
  //
  // **窄的規則，不是「元件不得出現 20／300／2000」那種 magic-number lint**（兩位審查者第二輪一致：那種誤報多、
  // `19 + 1` 就繞過、證明不了 UI 用對欄位；repo 原則是沒有事故不加閘門）。這裡只掃**契約 schema 這兩個檔案**：
  // 那是「數字第二次出現」最可能的地方，而且那裡沒有任何合法理由寫數字字面（連分頁大小都在 `limits.ts`）。
  // 這個區塊**只有**這兩個檔案；它帶著上面 contract 區塊的全部（flat config 是整條取代，不是合併 —— design D3），
  // 再加 LIMITS 這一條。
  {
    files: CONTRACT_SCHEMA_PATHS,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SRC_SYNTAX,
        ...DYNAMIC_CONTRACT_TO_CONFIG,
        {
          // 引數（callee 之後的第一個 child）**只能是** `LIMITS.<欄位>.<min|max>` 這種 member expression。
          // 不是「禁止數字字面」—— 那擋不住 `Number("20")`、`10 + 10`、本地常數（審查抓到的）；正面列舉才擋得住。
          selector:
            'CallExpression[callee.property.name=/^(min|max)$/] > :first-child:not(MemberExpression[object.object.name="LIMITS"])',
          message: '契約 schema 的 .min()/.max() 只能接 LIMITS.<欄位>.min／.max（src/api/contract/limits.ts），規格 FE-O06。',
        },
      ],
    },
  },

  // 唯一的例外，而且是**完整路徑**不是萬用字元。
  //
  // 既有的 no-fetch 規則踩過那個洞：寬鬆的 glob 會讓
  // `src/components/src/api/sneaky.ts` 被當成例外。這裡不重蹈覆轍 ——
  // `**/env.ts` 會讓任何人多開一個 `src/world/env.ts` 就繞過去。
  //
  // 注意這裡**只放行「讀 process.env」，計算屬性與先指派再取用仍然擋著** ——
  // 那兩條在這個檔案裡才最需要，因為它就是唯一會讀的地方。
  //
  // FE-O21 ②：設定模組是依賴樹的葉子 —— 不得 import `src/api/` 的任何東西，**含 type**（S04）。
  {
    files: [ENV_ONLY],
    rules: {
      'no-restricted-imports': restrictedImports(HTTP_CLIENT_PATHS, CLIENT_IMPORT_PATTERNS, ENV_TO_API_PATTERNS),
      'no-restricted-syntax': ['error', COMPUTED_PROCESS_ENV, ALIASED_PROCESS_ENV, ...DYNAMIC_CLIENT, ...DYNAMIC_ENV_TO_API],
    },
  },
]

export default config
