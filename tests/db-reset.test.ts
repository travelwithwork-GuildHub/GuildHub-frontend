// @vitest-environment node
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DbScriptError, reset, seed } from '../scripts/db.mjs'
import { databaseIdentity, testDatabase } from './support/test-db'

// 規格：openspec/changes/fe-o04-disposable-db/specs/disposable-db/spec.md
//   Requirement: 一個指令回到乾淨狀態 —— S03、S04、S05、S07
//   Requirement: 破壞性操作之前先證明連的是可拋棄的那一份 —— S08、S09
//   Requirement: 測試用另一個資料庫，不動開發資料 —— S10、S11
//
// 連的是 `INTERNAL_TEST_DATABASE_URL` 那個**本機自己起的、可拋棄的** Postgres；沒設就整檔 skip。
// **不連任何團隊共用的位址。**

/** seed 套完的筆數（`db/schema/README.md`；複本改了 `S01` 會先紅）。 */
const SEEDED = { profiles: 28, projects: 24, seats: 4, messages: 4 }
const TABLES = Object.keys(SEEDED) as Array<keyof typeof SEEDED>

const target = testDatabase()
const url = 'url' in target ? target.url : null

async function counts(client: pg.Client): Promise<Record<keyof typeof SEEDED, number>> {
  const out = { profiles: 0, projects: 0, seats: 0, messages: 0 }
  for (const t of TABLES) out[t] = (await client.query(`select count(*)::int as n from ${t}`)).rows[0].n
  return out
}
async function tables(client: pg.Client): Promise<string[]> {
  const r = await client.query("select table_name from information_schema.tables where table_schema = 'public' order by 1")
  return r.rows.map((x: { table_name: string }) => x.table_name)
}

describe.skipIf(url === null)('reset／seed（需要 INTERNAL_TEST_DATABASE_URL）', () => {
  let client: pg.Client
  /** reset 會 `pg_terminate_backend` 其他連線：被終止的 client 會 emit `error`，沒人接就是 unhandled。 */
  function connect(): pg.Client {
    const c = new pg.Client({ connectionString: url ?? '' })
    c.on('error', () => {})
    return c
  }
  beforeAll(async () => {
    client = connect()
    await client.connect()
  })
  afterAll(async () => {
    await client.end().catch(() => {})
  })
  /** reset 會終止其他連線，包含 `client` 自己 —— 之後要重連。 */
  async function reconnect() {
    await client.end().catch(() => {})
    client = connect()
    await client.connect()
  }

  it('[FE-O04-S09] 全空的資料庫可以 --init；之後不帶 --init 也可以', async () => {
    await client.query('drop schema public cascade; create schema public;')
    expect(await tables(client)).toEqual([])
    await reconnect()
    await expect(reset({ url: url ?? '' })).rejects.toThrow(/請用 reset --init/)
    await expect(reset({ url: url ?? '', init: true })).resolves.toEqual(expect.arrayContaining(['001_schema.sql', '002_seed.sql']))
    await reconnect()
    expect(await tables(client)).toContain('_guildhub_disposable')
    await expect(reset({ url: url ?? '' })).resolves.toBeDefined()
  })

  it('[FE-O04-S03] reset 之後是乾淨的、有 seed 的', async () => {
    await reconnect()
    await client.query("insert into profiles (id, display_name) values ('99999999-0000-4000-8000-000000000001', '自己塞的')")
    await reset({ url: url ?? '' })
    await reconnect()
    const mine = await client.query("select 1 from profiles where id = '99999999-0000-4000-8000-000000000001'")
    expect(mine.rowCount, '自己塞的那筆還在').toBe(0)
    expect(await counts(client)).toEqual(SEEDED)
  })

  it('[FE-O04-S04] reset 是冪等的，而且別的連線持鎖也做得完', async () => {
    await reconnect()
    const first = { tables: await tables(client), counts: await counts(client) }
    // 另一條連線鎖住 profiles 不 commit：drop schema 會等它 —— 除非 reset 先把它請走。
    const locker = connect()
    await locker.connect()
    await locker.query('begin; select * from profiles for update;')
    const started = Date.now()
    await reset({ url: url ?? '' })
    await reset({ url: url ?? '' })
    expect(Date.now() - started, 'reset 被別的連線卡住了').toBeLessThan(10_000)
    await locker.end().catch(() => {})
    await reconnect()
    expect({ tables: await tables(client), counts: await counts(client) }).toEqual(first)
  })

  it('[FE-O04-S05] seed 可重複：不會失敗，有 id 的表筆數不變', async () => {
    await reconnect()
    const before = await counts(client)
    await seed({ url: url ?? '' })
    await seed({ url: url ?? '' })
    const after = await counts(client)
    expect(after.profiles).toBe(before.profiles)
    expect(after.projects).toBe(before.projects)
    expect(after.seats).toBe(before.seats)
    // 實測：messages 的 id 是 gen_random_uuid()，`on conflict do nothing` 沒有可衝突的鍵 —— 每套一次多 4 封。
    // 這是後端 seed 的行為，複本不改；這裡記下事實。
    expect(after.messages).toBe(before.messages + 8)
  })

  it('[FE-O04-S04] 中途失敗整個回滾：標記還在、資料不變', async () => {
    await reconnect()
    const before = await counts(client)
    // 一份 schema 目錄：真的 001／002 加一個語法錯誤的 1xx。
    const dir = await mkdtemp(path.join(os.tmpdir(), 'schema-'))
    try {
      await cp(path.resolve(__dirname, '..', 'db', 'schema'), dir, { recursive: true })
      await writeFile(path.join(dir, '150_broken.sql'), `${'-- 前端自己加的，後端沒有：'}故意壞掉\nthis is not sql;`)
      await expect(reset({ url: url ?? '', dir })).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true })
    }
    await reconnect()
    expect(await tables(client), '失敗之後標記不見了 —— 這個庫從此誰都不能 reset').toContain('_guildhub_disposable')
    expect(await counts(client)).toEqual(before)
  })

  it('[FE-O04-S04] 兩個 reset 同時跑：兩個都成功（不互相請走），結束時庫是完整的', async () => {
    await reconnect()
    const results = await Promise.allSettled([reset({ url: url ?? '' }), reset({ url: url ?? '' })])
    expect(results.map((r) => r.status), results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok')).join(' | ')).toEqual(['fulfilled', 'fulfilled'])
    await reconnect()
    expect(await tables(client)).toContain('_guildhub_disposable')
    expect(await counts(client)).toEqual(SEEDED)
  })

  it('[FE-O04-S08] 沒有標記的資料庫不能被 reset、不能被 seed，內容原封不動', async () => {
    await reconnect()
    await client.query('drop table _guildhub_disposable')
    const before = await counts(client)
    await expect(reset({ url: url ?? '' })).rejects.toThrow(/不是這支腳本建立的/)
    await expect(reset({ url: url ?? '', init: true }), '有表的庫不能被 --init').rejects.toThrow(/已經有 .* 張表/)
    await expect(seed({ url: url ?? '' }), 'seed 寫進了沒有標記的庫').rejects.toThrow(/不是這支腳本建立的/)
    expect(await counts(client)).toEqual(before)
    // 還原給後面的測試檔用。
    await client.query('drop schema public cascade; create schema public;')
    await reconnect()
    await reset({ url: url ?? '', init: true })
  })
})

describe('守門不需要資料庫', () => {
  it('[FE-O04-S07] 位址不是 loopback：不連線就失敗', async () => {
    const started = Date.now()
    await expect(reset({ url: 'postgresql://u:p@db.example.com:5432/x' })).rejects.toBeInstanceOf(DbScriptError)
    await expect(reset({ url: 'postgresql://u:p@db.example.com:5432/x' })).rejects.toThrow(/只接受 loopback/)
    expect(Date.now() - started, '花太久 —— 像是真的去連了').toBeLessThan(500)
  })

  it('[FE-O04-S10] 測試庫等於開發庫：拒絕 —— 等價的寫法也算同一個庫', () => {
    const dev = 'postgresql://guildhub:guildhub@localhost:5432/guildhub_frontend'
    for (const test of [
      dev,
      'postgresql://guildhub:guildhub@localhost/guildhub_frontend',
      'postgresql://other:pw@LOCALHOST:5432/guildhub_frontend?sslmode=disable',
    ]) {
      expect(() => testDatabase({ INTERNAL_DATABASE_URL: dev, INTERNAL_TEST_DATABASE_URL: test }), test).toThrow(/必須分開/)
    }
    expect(testDatabase({ INTERNAL_DATABASE_URL: dev, INTERNAL_TEST_DATABASE_URL: `${dev}_test` })).toEqual({ url: `${dev}_test` })
    expect(databaseIdentity('postgresql://a@[::1]:5432/x')).toBe('::1:5432/x')
  })

  it('[FE-O04-S11] 沒設測試庫：skip，開發庫沒有收到任何連線', async () => {
    // 假的「開發庫」：一個只數連線的 TCP 監聽。退回開發庫的話它會收到一條。
    let connections = 0
    const server = net.createServer((socket) => {
      connections += 1
      socket.destroy()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as net.AddressInfo).port
    try {
      const decision = testDatabase({ INTERNAL_DATABASE_URL: `postgresql://u:p@127.0.0.1:${port}/dev` })
      expect(decision).toEqual({ skip: expect.stringContaining('不退回') })
      await new Promise((r) => setTimeout(r, 50))
      expect(connections, '沒設測試庫卻連了開發庫').toBe(0)
    } finally {
      server.close()
    }
  })
})
