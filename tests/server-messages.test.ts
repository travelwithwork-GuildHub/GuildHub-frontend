// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// `server-only` 在 node 環境 import 會拋，這裡 mock 掉。**不連任何外部服務**：`db()` 換成記錄 SQL 的假物件 —— 這裡守的是資料層發出的 SQL 的形狀。

vi.mock('server-only', () => ({}))
// 規格：openspec/changes/fe-k01-inbox/specs/inbox/spec.md
//   Requirement: 本地後端與契約測試補上 messages —— 主體條件在 SQL 的 WHERE（黑箱契約證不了，這裡守形狀）
describe('messages 的資料層：主體條件在 SQL', () => {
  it('listMessages 只發一道 SQL、WHERE 含 sender_id = $1 or recipient_id = $1、帶 limit/offset（取全部再過濾的版本會被抓）', async () => {
    vi.resetModules()
    const queries: Array<{ sql: string; params: unknown[] }> = []
    vi.doMock('@/server/db', () => ({
      db: () => ({
        query: async (sql: string, params: unknown[]) => {
          queries.push({ sql, params })
          return { rows: [], rowCount: 0 }
        },
      }),
    }))
    const { listMessages } = await import('@/server/messages')
    await listMessages('11111111-0000-4000-8000-000000000001', 2)
    expect(queries).toHaveLength(1)
    const sql = queries[0]!.sql.replace(/\s+/g, ' ').toLowerCase()
    expect(sql).toContain('where (sender_id = $1 or recipient_id = $1)')
    expect(sql).toMatch(/limit \$2 offset \$3/)
    expect(queries[0]!.params).toEqual(['11111111-0000-4000-8000-000000000001', 20, 40])
    vi.doUnmock('@/server/db')
  })

  it('insertMessage：no_self_send 的 23514 → self-send；23503 → no-recipient；別的原樣拋', async () => {
    vi.resetModules()
    let thrown: unknown = Object.assign(new Error('check'), { code: '23514', constraint: 'no_self_send' })
    vi.doMock('@/server/db', () => ({
      db: () => ({
        query: async () => {
          throw thrown
        },
      }),
    }))
    const { insertMessage } = await import('@/server/messages')
    const me = '11111111-0000-4000-8000-000000000001'
    await expect(insertMessage(me, me, 'x')).resolves.toEqual({ ok: false, reason: 'self-send' })
    thrown = Object.assign(new Error('fk'), { code: '23503', constraint: 'messages_recipient_id_fkey' })
    await expect(insertMessage(me, me, 'x')).resolves.toEqual({ ok: false, reason: 'no-recipient' })
    thrown = Object.assign(new Error('fk'), { code: '23503', constraint: 'messages_sender_id_fkey' })
    await expect(insertMessage(me, me, 'x'), 'sender 的 FK 不是「收件人不存在」').rejects.toMatchObject({ code: '23503' })
    thrown = Object.assign(new Error('other check'), { code: '23514', constraint: 'messages_body_check' })
    await expect(insertMessage(me, me, 'x'), 'body 的 check 不是「寄給自己」').rejects.toMatchObject({ code: '23514' })
    vi.doUnmock('@/server/db')
  })
})
