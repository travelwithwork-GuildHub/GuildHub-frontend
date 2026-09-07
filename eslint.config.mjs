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

const config = [
  { ignores: ['.next/**', 'node_modules/**'] },

  ...next,

  { rules: noFetchRules },

  {
    files: DATA_ACCESS_PATHS,
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },
]

export default config
