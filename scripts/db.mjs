// 可拋棄資料庫的 reset／seed。規格 `FE-O04`〈一個指令回到乾淨狀態〉、〈破壞性操作之前先證明連的是可拋棄的那一份〉。
//
//   node scripts/db.mjs reset [--init] [--test]
//   node scripts/db.mjs seed [--test]
//
// `--test` 用 `INTERNAL_TEST_DATABASE_URL`，否則 `INTERNAL_DATABASE_URL`。
//
// ⚠️ **三道守門，順序刻意**：
//   1. 位址不是 loopback → 不連線就失敗（`S07`）。連了再拒等於已經對一個不該碰的位址開過連線。
//   2. 資料庫沒有 `_guildhub_disposable` 標記 → 不動任何東西就失敗（`S08`）。標記只有這支腳本寫過的庫才有 ——
//      這是「證明連的是可拋棄的那一份」，不是「相信環境變數設對了」（AGENTS.md〈測試環境隔離〉第 3 條）。
//   3. `--init` 只在庫裡**沒有任何使用者表**時允許（`S09`）：一個真的庫（有表、沒標記）永遠不會被初始化。
//
// reset 之前先終止這個庫上的其他連線：開著的 GUI client 或背景的 dev server 會讓 `drop schema` 卡住（審查抓到的）。
//
// ⚠️ **drop → schema → seed → 標記在同一個交易裡**（Postgres 的 DDL 是交易的）：任何一個 `.sql` 中途失敗就整個回滾，
// 不會留下一個清空了一半、又沒有標記、之後誰都不能 reset 的庫（審查抓到的）。交易開頭拿 advisory lock，
// 兩個 reset 同時跑時第二個等第一個 commit；被 `pg_terminate_backend` 請走的那個會失敗，但資料是完整的。
//
// 整個 `.sql` 檔當一個 multi-statement query 送（`pg` 的簡單查詢協定）；seed 檔裡沒有 psql 的 `\` 指令（實測過）。

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const SCHEMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema')
const MARKER = '_guildhub_disposable'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
/** advisory lock 的鍵：任意常數，只要兩個 reset 用同一個。 */
const RESET_LOCK = 7_04_2026

export class DbScriptError extends Error {
  name = 'DbScriptError'
}

/** 只接受 loopback。回傳解析過的 URL 物件；不合格就拋，**不建立任何連線**。 */
export function assertLoopback(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new DbScriptError(`連線字串不是合法的 URL：${url}`)
  }
  if (!LOOPBACK.has(parsed.hostname)) {
    throw new DbScriptError(
      `只接受 loopback（localhost／127.0.0.1／::1），拒絕 ${parsed.hostname}。這支腳本會清空資料庫，不對任何非本機的位址動手。`,
    )
  }
  return parsed
}

/** 前端自己加的檔案（`1xx_*.sql`）第一行必須是這個開頭 —— 交給後端時一眼看得出哪些是我們加的。 */
export const FRONTEND_HEADER = '-- 前端自己加的，後端沒有：'

/** `db/schema/` 底下全部 `.sql`，依檔名排序；`1xx_*.sql` 沒有標頭就拋（`S06`）。 */
export async function schemaFiles(dir = SCHEMA_DIR) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()
  const files = names.map((name) => path.join(dir, name))
  for (const file of files) {
    if (!/^1\d\d_/.test(path.basename(file))) continue
    const firstLine = (await readFile(file, 'utf8')).split('\n')[0] ?? ''
    if (!firstLine.startsWith(FRONTEND_HEADER)) {
      throw new DbScriptError(`${path.basename(file)} 的第一行必須是「${FRONTEND_HEADER}」開頭的註解 —— 前端自己加的檔案要標明。`)
    }
  }
  return files
}

async function hasMarker(client) {
  const r = await client.query('select to_regclass($1) as t', [`public.${MARKER}`])
  return r.rows[0].t !== null
}

async function requireMarker(client, what) {
  if (await hasMarker(client)) return
  const n = await userTableCount(client)
  throw new DbScriptError(
    `這個資料庫沒有 ${MARKER} 標記，不是這支腳本建立的 —— ${what}不動它。` +
      (n === 0 ? ' 它是空的：第一次請用 reset --init。' : ` 它有 ${n} 張表，看起來是真的資料。`),
  )
}

async function userTableCount(client) {
  const r = await client.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'")
  return r.rows[0].n
}

/**
 * 回到乾淨狀態。`init` 只給空庫的第一次。
 * 回傳執行過的檔名（給標記與測試用）。
 */
export async function reset({ url, init = false, dir = SCHEMA_DIR }) {
  assertLoopback(url)
  // 檔案先驗（標頭、能不能讀），再碰資料庫：驗不過就什麼都沒動。
  const files = await schemaFiles(dir)
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    if (init) {
      if (await hasMarker(client)) {
        // 已經是我們的庫：--init 多餘但無害，照一般 reset 走。
      } else {
        const n = await userTableCount(client)
        if (n !== 0) throw new DbScriptError(`--init 只給空的資料庫；這個庫已經有 ${n} 張表，不初始化。`)
      }
    } else {
      await requireMarker(client, 'reset ')
    }
    // 其他連線先請走：drop schema 會等它們的鎖。
    await client.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()',
    )
    await client.query('begin')
    try {
      await client.query('select pg_advisory_xact_lock($1)', [RESET_LOCK])
      await client.query('drop schema public cascade; create schema public;')
      for (const file of files) {
        await client.query(await readFile(file, 'utf8'))
      }
      // 帶參數的查詢走 extended protocol，一次只能一句 —— 建表與寫入分開。
      await client.query(`create table ${MARKER} (created_at timestamptz not null default now(), schema_files text[] not null)`)
      await client.query(`insert into ${MARKER} (schema_files) values ($1)`, [files.map((f) => path.basename(f))])
      await client.query('commit')
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    }
    return files.map((f) => path.basename(f))
  } finally {
    await client.end()
  }
}

/** 只套 seed（可重複執行：seed 本身是 on conflict do nothing）。寫進去之前一樣先看標記 —— 設錯的環境變數不該污染別的庫。 */
export async function seed({ url }) {
  assertLoopback(url)
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await requireMarker(client, 'seed ')
    await client.query(await readFile(path.join(SCHEMA_DIR, '002_seed.sql'), 'utf8'))
  } finally {
    await client.end()
  }
}

async function main(argv) {
  const [command, ...flags] = argv
  const test = flags.includes('--test')
  const url = test ? process.env.INTERNAL_TEST_DATABASE_URL : process.env.INTERNAL_DATABASE_URL
  if (!url) {
    throw new DbScriptError(`${test ? 'INTERNAL_TEST_DATABASE_URL' : 'INTERNAL_DATABASE_URL'} 沒設。見 db/schema/README.md。`)
  }
  if (command === 'reset') {
    const files = await reset({ url, init: flags.includes('--init') })
    console.log(`reset 完成：${files.join(', ')}`)
  } else if (command === 'seed') {
    await seed({ url })
    console.log('seed 完成')
  } else {
    throw new DbScriptError('用法：node scripts/db.mjs <reset [--init] | seed> [--test]')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof DbScriptError ? e.message : e)
    process.exit(1)
  })
}
