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

// 「元件裡不准出現 `fetch`」—— CONTEXT.md 與 AGENTS.md 都明文寫了這條，
// 但在這個檔案存在之前**沒有任何機器在擋**：一個含 `fetch()` 的元件推 PR 會全綠。
//
// 依 AGENTS.md〈新增流程閘門的門檻〉328–332 行，證據可以是**可重現的繞法**，
// 不必等它真的污染 main。上面那句就是繞法本身。
//
// 例外只有兩個路徑，而且用 `**/src/api/**` 而不是 `src/api/**` ——
// 這樣測試用的 fixture 放在 `tests/fixtures/src/api/` 底下也適用同一條規則，
// 不必為了測試另外寫一份設定（**同一件事寫在兩個地方一定會漂**）。
const DATA_ACCESS_PATHS = ['**/src/api/**', '**/src/app/api/**']

const NO_FETCH_MESSAGE =
  '元件裡不准出現 fetch。所有資料存取走 src/api/，由環境變數決定連本地後端還是真後端。' +
  '散在各處的 fetch 會讓「之後銜接」變成「之後重寫」。見 CONTEXT.md。'

const noFetchRules = {
  'no-restricted-globals': ['error', { name: 'fetch', message: NO_FETCH_MESSAGE }],
  'no-restricted-properties': [
    'error',
    { object: 'window', property: 'fetch', message: NO_FETCH_MESSAGE },
    { object: 'globalThis', property: 'fetch', message: NO_FETCH_MESSAGE },
  ],
}

const config = [
  // fixture 是**故意違規**的，不能讓專案的 lint 因為它而紅。
  // 測試會用 ESLint 的 Node API 帶 `ignore: false` 直接對它們跑。
  { ignores: ['.next/**', 'node_modules/**', 'tests/fixtures/**'] },

  ...next,

  { rules: noFetchRules },

  {
    files: DATA_ACCESS_PATHS,
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
]

export default config
