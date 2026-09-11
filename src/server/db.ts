import 'server-only'
import { Pool } from 'pg'
import { ConfigError, internalDatabaseUrl } from '@/config/env'

// 可拋棄資料庫的連線池。規格 `FE-O04`〈連線只在伺服器端〉。
//
// ⚠️ **`server-only` 在第一行。** 這個模組被任何會進 client bundle 的東西 import，`next build` 就失敗；
// 在 jsdom 裡 import 它也在 import 那一刻就拋（`FE-O04-S12`）—— 不是等到第一次查詢。
// 連線字串只從 `src/config/env.ts` 來（`FE-O09`），這裡不讀 `process.env`。

let pool: Pool | null = null

/** 連線池（lazy）。沒設 `INTERNAL_DATABASE_URL` 就拋 `ConfigError`，不連任何預設位址。 */
export function db(): Pool {
  if (pool !== null) return pool
  const url = internalDatabaseUrl()
  if (url === null) {
    throw new ConfigError('INTERNAL_DATABASE_URL 沒設 —— internal adapter 需要一個可拋棄的 Postgres（db/schema/README.md）。')
  }
  pool = new Pool({ connectionString: url })
  return pool
}
