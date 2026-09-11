import 'server-only'
import { Pool } from 'pg'
import { ConfigError, internalDatabaseUrl } from '@/config/env'

// 可拋棄資料庫的連線池。規格 `FE-O04`〈連線只在伺服器端〉。
//
// ⚠️ **`server-only` 在第一行。** 這個模組被任何會進 client bundle 的東西 import，`next build` 就失敗；
// 在 jsdom 裡 import 它也在 import 那一刻就拋（`FE-O04-S12`）—— 不是等到第一次查詢。
// 連線字串只從 `src/config/env.ts` 來（`FE-O09`），這裡不讀 `process.env`。

// ⚠️ **池掛在 `globalThis`。** `next dev` 每次重新編譯伺服器模組都會重跑這個檔案；模組層級的變數會變成一個新池、
// 舊池沒人關 —— 幾次 HMR 之後 Postgres 回 `too many clients already`（審查抓到的）。
// ⚠️ **池要接 `error`。** `db:reset` 會 `pg_terminate_backend` 其他連線，被切斷的閒置連線會 emit `error`，沒人接就是
// unhandled rejection，dev server 直接掛。接了之後 `pg` 會丟掉那條、下次查詢再開一條。
const KEY = Symbol.for('guildhub.internal-db-pool')
type Holder = { [KEY]?: Pool }

/** 連線池（lazy）。沒設 `INTERNAL_DATABASE_URL` 就拋 `ConfigError`，不連任何預設位址。 */
export function db(): Pool {
  const holder = globalThis as Holder
  const existing = holder[KEY]
  if (existing !== undefined) return existing
  const url = internalDatabaseUrl()
  if (url === null) {
    throw new ConfigError('INTERNAL_DATABASE_URL 沒設 —— internal adapter 需要一個可拋棄的 Postgres（db/schema/README.md）。')
  }
  const pool = new Pool({ connectionString: url })
  pool.on('error', (error) => {
    console.warn('[internal-db] 閒置連線被切斷（db:reset？），下次查詢會重開：', error.message)
  })
  holder[KEY] = pool
  return pool
}
