import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRONTEND_HEADER, reset, schemaFiles } from '../scripts/db.mjs'

// 規格：openspec/changes/fe-o04-disposable-db/specs/disposable-db/spec.md
//   Requirement: schema 與 seed 是後端檔案的逐字複本，漂移由機器抓 —— S01、S02
//   Requirement: 一個指令回到乾淨狀態 —— S06（1xx 的標頭；reset 會先驗檔案再碰資料庫）
//
// 純檔案測試，不連資料庫。**不連任何外部服務。**

const ROOT = path.resolve(__dirname, '..')
const COPIES = ['001_schema.sql', '002_seed.sql'] as const

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  )
}

/** 後端 repo 在哪、在不在。`lookedAt` 是 skip 訊息要說出來的路徑。 */
async function backend(env: Record<string, string | undefined> = process.env): Promise<{ present: boolean; lookedAt: string }> {
  const lookedAt = env.GUILDHUB_BACKEND_DIR ?? path.resolve(ROOT, '..', 'GuildHub-backend')
  return { present: await exists(path.join(lookedAt, 'sql', '001_schema.sql')), lookedAt }
}

/** 第一個不同的行號（1-based）；相同回 null。 */
function firstDifference(a: string, b: string): number | null {
  const la = a.split('\n')
  const lb = b.split('\n')
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) if (la[i] !== lb[i]) return i + 1
  return null
}

describe('schema 與 seed 是後端檔案的逐字複本', () => {
  // 不用 `it.each`：它不把 ctx 當最後一個引數傳（skip 要 ctx）。
  for (const name of COPIES)
    it(`[FE-O04-S01] ${name} 與後端一字不差（後端不在本機就 skip，並說出找過的路徑）`, async (ctx) => {
    const { present, lookedAt } = await backend()
    // S02：真的 skip（不是 pass），訊息含路徑 —— 不假綠也不假紅。
    if (!present) ctx.skip(`後端 repo 不在 ${lookedAt}（GUILDHUB_BACKEND_DIR）`)
    const ours = await readFile(path.join(ROOT, 'db', 'schema', name))
    const theirs = await readFile(path.join(lookedAt, 'sql', name))
    const line = firstDifference(ours.toString('utf8'), theirs.toString('utf8'))
    expect(ours.equals(theirs), `db/schema/${name} 與後端不同，第一個不同的行：${line}`).toBe(true)
  })

  it('[FE-O04-S02] 後端不在本機：判定為不在，而且說得出找過哪裡', async () => {
    const missing = path.join(os.tmpdir(), 'no-such-backend')
    const { present, lookedAt } = await backend({ GUILDHUB_BACKEND_DIR: missing })
    expect(present).toBe(false)
    expect(lookedAt).toBe(missing)
  })
})

describe('前端自己的檔案另外標明', () => {
  it('[FE-O04-S06] 1xx 沒有標頭：reset 在建立任何連線之前就拒絕；有標頭：列在清單裡、排在 002 之後', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'schema-'))
    // 一個會數連線的假「資料庫」（loopback，所以過得了 loopback 檢查）：reset 先驗檔案的話它收不到任何連線。
    let connections = 0
    const server = net.createServer((socket) => {
      connections += 1
      socket.destroy()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `postgresql://u:p@127.0.0.1:${(server.address() as net.AddressInfo).port}/x`
    try {
      await writeFile(path.join(dir, '001_schema.sql'), 'select 1;')
      await writeFile(path.join(dir, '002_seed.sql'), 'select 2;')
      await writeFile(path.join(dir, '100_roles.sql'), 'create table roles (id int);')
      await expect(reset({ url, dir })).rejects.toThrow(/100_roles\.sql 的第一行/)
      await new Promise((r) => setTimeout(r, 50))
      expect(connections, '標頭驗不過還去連了資料庫').toBe(0)
      await writeFile(path.join(dir, '100_roles.sql'), `${FRONTEND_HEADER} roles 是 W6 的\ncreate table roles (id int);`)
      const files = (await schemaFiles(dir)).map((f) => path.basename(f))
      expect(files).toEqual(['001_schema.sql', '002_seed.sql', '100_roles.sql'])
    } finally {
      server.close()
      await rm(dir, { recursive: true })
    }
  })
})
