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
 * 後端 WebSocket 的 URL。
 *
 * **只有 base，不含查詢參數。** `scene` 與 `token` 由 `FE-R01` 在連線時組上去。
 */
export function wsUrl(): string {
  return resolve(read(process.env.NEXT_PUBLIC_GUILDHUB_WS), LOCAL_DEFAULTS.wsUrl, 'NEXT_PUBLIC_GUILDHUB_WS', [
    'ws:',
    'wss:',
  ])
}
