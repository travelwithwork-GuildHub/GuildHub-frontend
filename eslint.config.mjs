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
  // 換一個 HTTP client 一樣是繞過這條規則，只是換了個名字。
  'no-restricted-imports': [
    'error',
    { paths: ['axios', 'node-fetch', 'got', 'ky', 'superagent', 'undici'].map((name) => ({ name, message: MSG })) },
  ],
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

const config = [
  { ignores: ['.next/**', 'node_modules/**'] },

  ...next,

  { rules: noFetchRules },

  {
    files: [...DATA_ACCESS_PATHS, ...CONTRACT_HTTP_PATHS, ...SERVER_LOOPBACK_PATHS],
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
      'no-restricted-syntax': ['error', ANY_PROCESS_ENV, COMPUTED_PROCESS_ENV, ALIASED_PROCESS_ENV],
    },
  },

  // `src/**` 底下、`src/api/**` 與 `src/errors/**` 以外：不准 import 資料層的錯誤型別。
  //
  // ⚠️ **同一條 `no-restricted-syntax` 要把上面的三個 env selector 一起帶著** ——
  // flat config 是後者整條覆蓋前者，不是合併；少帶的話這些檔案就沒有人擋 `process.env` 了。
  // `ignores` 是精確路徑不是 `**/src/api/**`，理由同 no-fetch。
  {
    files: ['src/**'],
    ignores: ['src/api/**', 'src/errors/**', ENV_ONLY],
    rules: {
      'no-restricted-syntax': [
        'error',
        ANY_PROCESS_ENV,
        COMPUTED_PROCESS_ENV,
        ALIASED_PROCESS_ENV,
        ...ERROR_BOUNDARY,
        ...SLOT_RULES,
      ],
    },
  },

  // 規格 FE-O06：契約 schema 的 `.min()`／`.max()` 不接數字字面 —— 數字只能來自 `LIMITS`。
  //
  // **窄的規則，不是「元件不得出現 20／300／2000」那種 magic-number lint**（兩位審查者第二輪一致：那種誤報多、
  // `19 + 1` 就繞過、證明不了 UI 用對欄位；repo 原則是沒有事故不加閘門）。這裡只掃**契約 schema 這兩個檔案**：
  // 那是「數字第二次出現」最可能的地方，而且那裡沒有任何合法理由寫數字字面（連分頁大小都在 `limits.ts`）。
  // `src/api/**` 在上面那條 `no-restricted-syntax` 的 ignores 裡，所以這條要自己一個區塊；
  // 這個區塊**只有**這兩個檔案，不會覆蓋別人的規則。
  {
    files: CONTRACT_SCHEMA_PATHS,
    rules: {
      'no-restricted-syntax': [
        'error',
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
  {
    files: [ENV_ONLY],
    rules: {
      'no-restricted-syntax': ['error', COMPUTED_PROCESS_ENV, ALIASED_PROCESS_ENV],
    },
  },
]

export default config
