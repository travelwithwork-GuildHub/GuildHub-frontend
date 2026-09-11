// 執行期設定。規格 FE-O09。
//
// ⚠️ **這是整個 `src/` 底下唯一准許讀 `process.env` 的檔案。**
// 別處要位址就從這裡 import。`eslint.config.mjs` 有一條規則在擋。
//
// ⚠️⚠️ **每一次讀取都必須是完整的字面存取** `process.env.NEXT_PUBLIC_X`。
//
//   MUST NOT   process.env[name]                    ← 計算屬性
//   MUST NOT   const e = process.env; e.NEXT_PUBLIC_X  ← 先指派再取用
//
// Next.js 是在**建置時**把 `NEXT_PUBLIC_*` 靜態替換成字面值的，
// 上面兩種寫法它認不出來，**在瀏覽器裡會得到 `undefined`**。
//
// **而這個 bug 在單元測試裡永遠重現不了** —— 測試跑在 Node，
// 那裡的 `process.env` 是真的物件，兩種寫法都正常。
// 所以 `eslint.config.mjs` 那條 `no-restricted-syntax` 是唯一擋得住它的東西，
// 不要因為「測試都綠」就把它拿掉。
//
// 另一個相關的坑：**漏掉 `NEXT_PUBLIC_` 前綴的變數在 client bundle 裡
// 會被替換成空字串**，不是 `undefined`。所以下面判缺席一律用 falsy，
// 不用 `=== undefined`。

/** 部署目標。**不是** `NODE_ENV`（那講的是建置模式，preview 站也是 production）。 */
export const APP_ENVS = ['local', 'preview', 'production'] as const
export type AppEnv = (typeof APP_ENVS)[number]

/** REST 請求的憑證模式。身分走 session cookie，沒帶的話每個端點都回 401。 */
export const REST_CREDENTIALS: RequestCredentials = 'include'

/**
 * 資料來源。規格 `FE-O02`。
 *
 * ⚠️⚠️ **這跟 `APP_ENVS` 的 `local` 是兩個不同的軸，而且刻意不共用「local」這個字。**
 *
 *     NEXT_PUBLIC_APP_ENV=local        跑在開發者的機器上 → 連 localhost:8000 的**真後端**
 *     NEXT_PUBLIC_DATA_ADAPTER=internal 連**我們自己的** Route Handlers ＋ 可拋棄資料庫
 *
 * 兩個都叫 `local` 的話，「你 local 壞了」會變成一句沒有意義的話 ——
 * 那兩個 local 指向的是**相反的資料來源**。
 * （`docs/WBS.md` 寫的是 `local`，那一列要跟著改。）
 */
export const DATA_ADAPTERS = ['guildhub', 'internal'] as const
export type DataAdapter = (typeof DATA_ADAPTERS)[number]

/**
 * 即時層的資料來源。規格 `FE-O14`。
 *
 * ⚠️ **這是第三個軸，跟 `DATA_ADAPTERS` 刻意分開。**
 * 兩者會分開移動：`FE-O03` 的本地後端做好之後，REST 走 `internal`
 * 而即時層仍然可能是 `none` —— Route Handlers 給不了 WebSocket。
 * 合成一個變數的那天，其中一邊會被迫說謊。
 *
 * `none` 是「這個部署**刻意**沒有即時後端」的明確宣告。
 * **MUST NOT 把「位址缺席」本身當成 `none`** —— 那會讓一個忘了設位址的
 * 正式部署安靜地變成單人模式，症狀是「怎麼都看不到別人」，不是「設定漏了」。
 */
export const REALTIME_ADAPTERS = ['guildhub', 'none'] as const
export type RealtimeAdapter = (typeof REALTIME_ADAPTERS)[number]

/**
 * 本機預設值。**指向開發者自己起的那一份後端** ——
 * 後端 `bash run.sh` 起來就是這兩個位址（實測：`/openapi.json` 回 200、
 * `/ws` 連得上並收到 `hello`）。
 *
 * MUST NOT 把任何共用實例的位址放進來（`AGENTS.md`〈測試環境隔離〉）。
 */
const LOCAL_DEFAULTS = {
  restBase: 'http://localhost:8000',
  wsUrl: 'ws://localhost:8000/ws',
} as const

export class ConfigError extends Error {
  override name = 'ConfigError'
}

/**
 * 本地後端的資料庫連線字串。規格 `FE-O04`。**只在伺服器端讀**（Route Handlers、`src/server/`），
 * 沒有 `NEXT_PUBLIC_` 前綴 —— 連線字串進 client bundle 就是外洩。
 * 缺席回 `null`：`internal` adapter 沒有資料庫時 `src/server/db.ts` 會拋 `ConfigError`，不是連到某個預設值。
 */
export function internalDatabaseUrl(): string | null {
  return read(process.env.INTERNAL_DATABASE_URL)
}

/** 測試用的另一個庫。**必須跟上面那個不同**；判斷在 `tests/support/test-db.ts`（那裡才是 skip／拒絕的決定點）。 */
export function internalTestDatabaseUrl(): string | null {
  return read(process.env.INTERNAL_TEST_DATABASE_URL)
}

/**
 * 本地後端 session cookie 的 HMAC secret。規格 `FE-O03`〈session 是簽章的 HttpOnly cookie〉。
 * 本機（`local`）缺席用固定的開發值（重啟 dev server 之後 cookie 仍有效）；部署出去的版本缺席 → 第一次用到時拋
 * `ConfigError`（不進 `FE-O14` 的建置閘門，理由見下面 `DEPLOY_CONFIG_ITEMS` 那一項）。
 */
export function internalSessionSecret(): string {
  const raw = read(process.env.INTERNAL_SESSION_SECRET)
  if (raw !== null) return raw
  if (appEnv() === 'local') return 'dev-only-internal-session-secret'
  throw new ConfigError('INTERNAL_SESSION_SECRET 沒設，而這不是 local —— 部署出去的 internal 後端不給預設的 secret。')
}

/** 空字串跟沒設定是同一件事 —— 見檔頭。 */
function read(value: string | undefined): string | null {
  return value ? value : null
}

/**
 * 目前的部署目標。
 *
 * 缺席時**用建置模式當守門員**：`next build` 出來的東西沒有明確代號就起不來，
 * 而 `next dev` 零設定照樣跑得起來。
 *
 * **少了這一層，漏設代號的正式站會合法地退回 `localhost`** ——
 * 症狀是「所有資料都不見了」，不是「設定錯了」。
 */
export function appEnv(): AppEnv {
  const raw = read(process.env.NEXT_PUBLIC_APP_ENV)

  if (raw === null) {
    if (process.env.NODE_ENV === 'production') {
      throw new ConfigError(
        'NEXT_PUBLIC_APP_ENV 沒有設定，而這是一個 production 建置。' +
          `部署出去的版本一定要明確指定環境（${APP_ENVS.join(' / ')}）—— ` +
          '否則它會安靜地連到 localhost。',
      )
    }
    return 'local'
  }

  if (!(APP_ENVS as readonly string[]).includes(raw)) {
    throw new ConfigError(
      `NEXT_PUBLIC_APP_ENV 的值 ${JSON.stringify(raw)} 無法辨識。` +
        `只能是 ${APP_ENVS.join(' / ')}。**打錯字不會退回 local** —— ` +
        '退回去的話，一個把 production 打成 prod 的正式站會連到 localhost。',
    )
  }
  return raw as AppEnv
}

function requireProtocol(url: string, allowed: readonly string[], varName: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ConfigError(`${varName} 不是合法的網址：${JSON.stringify(url)}`)
  }
  if (!allowed.includes(parsed.protocol)) {
    throw new ConfigError(
      `${varName} 的協定是 ${parsed.protocol}，只接受 ${allowed.join(' / ')}。` +
        '這裡不擋的話，錯誤要到真的建立連線時才出現 —— ' +
        '而那時它跟「後端沒開」「路徑打錯」「握手被拒」長得一模一樣' +
        '（三種實測都是 close code=1006、空 reason）。',
    )
  }
  return url
}

function resolve(
  value: string | null,
  fallback: string,
  varName: string,
  allowed: readonly string[],
): string {
  if (value !== null) return requireProtocol(value, allowed, varName)
  if (appEnv() === 'local') return fallback
  throw new ConfigError(
    `${varName} 沒有設定，而目前的環境是 ${appEnv()}。` +
      '部署出去的版本沒有預設位址 —— 安靜退回 localhost 會讓症狀變成' +
      '「所有資料都不見了」，而不是「設定錯了」。',
  )
}

/**
 * 目前的資料來源。
 *
 * 缺席時預設 `guildhub` —— 今天只有它是可用的（`internal` 的後端是 `FE-O03`，W2）。
 *
 * ⚠️ **值無法辨識時拋錯，MUST NOT 退回預設。** 退回去的話，
 * 一個把 `internal` 打成 `intenral` 的環境會安靜地連到真後端 ——
 * 而症狀是「我的本地資料改了沒有反應」，不是「設定錯了」。
 */
export function dataAdapter(): DataAdapter {
  const raw = read(process.env.NEXT_PUBLIC_DATA_ADAPTER)
  if (raw === null) return 'guildhub'
  if (!(DATA_ADAPTERS as readonly string[]).includes(raw)) {
    throw new ConfigError(
      `NEXT_PUBLIC_DATA_ADAPTER 的值 ${JSON.stringify(raw)} 無法辨識。` +
        `只能是 ${DATA_ADAPTERS.join(' / ')}。**打錯字不會退回預設** —— ` +
        '退回去的話，一個打錯字的環境會安靜地連到另一個資料來源。',
    )
  }
  return raw as DataAdapter
}

/**
 * 即時層的資料來源。規格 `FE-O14-S01`。
 *
 * **本機缺席時是 `guildhub`；`preview` 與 `production` 缺席時拋錯。**
 * 這跟 `restBase()` / `wsUrl()` 是同一條規則（`resolve()` 的那條）——
 * 部署出去的版本不給預設值。
 *
 * ⚠️ 這條刻意不用 `resolve()`：那個函式驗的是**位址**（要 parse URL、
 * 檢查協定），這裡驗的是**列舉值**。硬套進去會讓 `resolve()` 多一個
 * 分支參數，而那個分支只有一個呼叫端。
 */
export function realtimeAdapter(): RealtimeAdapter {
  const raw = read(process.env.NEXT_PUBLIC_REALTIME_ADAPTER)

  if (raw === null) {
    if (appEnv() === 'local') return 'guildhub'
    throw new ConfigError(
      `NEXT_PUBLIC_REALTIME_ADAPTER 沒有設定，而目前的環境是 ${appEnv()}。` +
        `部署出去的版本要明確說出即時層連到哪裡（${REALTIME_ADAPTERS.join(' / ')}）。` +
        '`none` 代表這個部署刻意沒有即時後端。',
    )
  }

  if (!(REALTIME_ADAPTERS as readonly string[]).includes(raw)) {
    throw new ConfigError(
      `NEXT_PUBLIC_REALTIME_ADAPTER 的值 ${JSON.stringify(raw)} 無法辨識。` +
        `只能是 ${REALTIME_ADAPTERS.join(' / ')}。**打錯字不會退回預設** —— ` +
        '退回去的話，一個打錯字的部署會安靜地換掉即時層的資料來源。',
    )
  }
  return raw as RealtimeAdapter
}

/** 後端 REST 的 base URL。 */
export function restBase(): string {
  return resolve(
    read(process.env.NEXT_PUBLIC_GUILDHUB_REST),
    LOCAL_DEFAULTS.restBase,
    'NEXT_PUBLIC_GUILDHUB_REST',
    ['http:', 'https:'],
  )
}

/**
 * 後端 WebSocket 的 URL，**即時層資料來源是 `none` 時是 `null`**。
 *
 * **只有 base，不含查詢參數。** `scene` 與 `token` 由 `FE-R01` 在連線時組上去。
 *
 * ⚠️ **`none` 時回 `null` 而不是拋錯**（規格 `FE-O14-S02`）。
 * 那個位址在 `none` 下永遠不會被使用，所以：
 *
 *   - 殘留一個合法位址 → 忽略它，不拋錯
 *   - 殘留一個**協定錯誤**的位址 → 一樣不拋錯
 *
 * 理由是部署摩擦：Vercel 之類的平台會讓 preview 繼承 production 的環境變數，
 * 逼人去刪一個被忽略的值只會讓人改填假值繞過 —— 而假值會讓設定檔
 * 看起來像「有後端」。
 *
 * 回 `null` 而不是空字串：型別上逼呼叫端表態。忘了處理的話 `tsc` 會紅，
 * 而不是在執行期拿到一個 `new URL('')`。
 */
export function wsUrl(): string | null {
  if (realtimeAdapter() === 'none') return null
  return resolve(read(process.env.NEXT_PUBLIC_GUILDHUB_WS), LOCAL_DEFAULTS.wsUrl, 'NEXT_PUBLIC_GUILDHUB_WS', [
    'ws:',
    'wss:',
  ])
}

// ══════════════════════════════════════════════ 部署設定的清單
//
// 規格 `FE-O14`「要驗哪些設定只有一份清單」。

/**
 * 一個設定項目。
 *
 * ⚠️ **`checkedAtBuild: false` 一定要附理由，而那是型別逼出來的**，
 * 不是慣例 —— 少寫 `skipReason` 是編譯錯誤。
 */
export type DeployConfigItem =
  | { readonly name: string; readonly resolve: () => unknown; readonly checkedAtBuild: true }
  | {
      readonly name: string
      readonly resolve: () => unknown
      readonly checkedAtBuild: false
      readonly skipReason: string
    }

/**
 * 部署建置要驗哪些設定。**這是唯一一份清單。**
 *
 * ⚠️ **`next.config.ts` 迭代這份清單，MUST NOT 逐一列舉變數。**
 * 兩份清單會漂，而漂掉的方向必然是建置時比執行時鬆 ——
 * 於是閘門看起來還在、實際上已經漏了。
 *
 * `FE-O14-S06` 的測試也**由這份清單驅動**：對每個 `checkedAtBuild` 的項目
 * 逐一移除它的變數，斷言驗證失敗且訊息含變數名。所以新增一個項目時，
 * 那條測試自動涵蓋它 —— 而如果新項目缺席時不會失敗，測試會紅，
 * 那時要回來想清楚它到底該不該是必驗的。
 */
export const DEPLOY_CONFIG_ITEMS: readonly DeployConfigItem[] = [
  { name: 'NEXT_PUBLIC_APP_ENV', resolve: appEnv, checkedAtBuild: true },
  {
    name: 'INTERNAL_SESSION_SECRET',
    resolve: internalSessionSecret,
    checkedAtBuild: false,
    // 這份清單的項目是**無條件**的（`FE-O14-S06`：每一個必驗項目缺席都要失敗）。而這把 secret 只有
    // `internal` adapter 的本地後端用；`guildhub` 的部署被要求它，就是一個「填假的也沒差」的變數 ——
    // 這個 repo 明文拒絕那種變數（上面 `NEXT_PUBLIC_GUILDHUB_REST` 的理由）。
    // 所以不進建置閘門：非 local 缺席時，`internalSessionSecret()` 在**第一次被用到**時拋 `ConfigError`
    // （那一個請求是 500，伺服器 log 有訊息）。今天沒有任何 internal 的部署，本地後端只在本機跑。
    skipReason: '只有 internal adapter 用；清單是無條件的，不該要求 guildhub 部署填一把沒用的 secret',
  },
  { name: 'NEXT_PUBLIC_REALTIME_ADAPTER', resolve: realtimeAdapter, checkedAtBuild: true },
  { name: 'NEXT_PUBLIC_GUILDHUB_WS', resolve: wsUrl, checkedAtBuild: true },
  {
    name: 'NEXT_PUBLIC_GUILDHUB_REST',
    resolve: restBase,
    checkedAtBuild: false,
    // 量過（`FE-O14` design 的 M3）：`src/` 底下沒有任何元件 import
    // `@/api/operations` 或 `@/api/transport`，所以 `restBase()` 今天
    // 一次都不會被呼叫。把它列成必驗等於要求一個什麼都不做的變數，
    // 而那種變數會教人「這些設定填假的也沒差」。
    //
    // ⚠️ **有人把資料存取接上畫面的那天，這裡要翻成 `true`。**
    // 沒有機器擋著這件事 —— 它靠的是這行理由被讀到。
    skipReason: '今天沒有任何元件呼叫 REST（FE-O14 design 的 M3）',
  },
]

/**
 * 部署建置的設定驗證。規格 `FE-O14`「部署設定的錯誤 SHALL 在建置時失敗」。
 *
 * 不合法時**讓 `ConfigError` 往外拋** —— 呼叫端是 `next.config.ts`，
 * 那個錯會讓 `next build` 以非零結束碼收場。
 *
 * ⚠️ **MUST NOT 在這裡 catch 之後只 log。** 那樣建置會綠燈，
 * 而這整條 Requirement 存在的理由就是「不要產出一個綠燈但壞掉的 bundle」。
 *
 * 本機不受影響：`appEnv()` 用 `NODE_ENV` 當守門員，`next dev` 時它回 `local`，
 * 每一項都走本機預設值那條路。實測（design 的 M4）：
 * `next dev` 載入 config 時 `NODE_ENV=development`。
 */
export function validateDeployConfig(): void {
  for (const item of DEPLOY_CONFIG_ITEMS) {
    if (item.checkedAtBuild) item.resolve()
  }
}
