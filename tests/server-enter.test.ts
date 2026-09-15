// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 本地後端的 enter 在下列語意上與真後端相同 —— S16（本地獨有：session 指向已刪的名片 → 401、回應不含票）
//
// 這一條**不進**兩個目標共用的契約檔：真後端對已刪名片的 session 照簽 200（`get_current_user` 不查名片），本地走管線 401，
// 是已知差異（design D7）。這裡直接呼叫本地 handler、資料層換成記錄 SQL 的假物件 —— **不連任何外部服務**。
// `server-only` 在 node 環境 import 會拋，mock 掉。

vi.mock('server-only', () => ({}))

const SECRET = 'unit-test-secret'
const ME = '11111111-0000-4000-8000-0000000000ab'
const PROJECT = '22222222-0000-4000-8000-0000000000f1'
/** 跟 `src/server/session.ts` 同一種 cookie：`session=<id>.<HMAC(secret, id)>` —— 簽章**正確**，名片卻查不到。 */
const cookie = `session=${ME}.${createHmac('sha256', SECRET).update(ME).digest('base64url')}`

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@/server/db')
})

describe('POST /api/projects/{project_id}/enter（本地 handler）', () => {
  it('[FE-N08-S16] 簽章正確但名片查不到 → 401 未登入；沒有 room_token；資料層只收到查名片那一道 SQL', async () => {
    vi.resetModules()
    vi.stubEnv('INTERNAL_SESSION_SECRET', SECRET)
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'local')
    const queries: string[] = []
    vi.doMock('@/server/db', () => ({
      db: () => ({
        query: async (sql: string) => {
          queries.push(sql.replace(/\s+/g, ' ').toLowerCase())
          // 名片不在；要是 handler 真的往下查 password_hash，這裡也給它一個「有雜湊」的列，讓錯誤的實作有機會簽出票來。
          if (sql.includes('profiles')) return { rows: [], rowCount: 0 }
          return { rows: [{ password_hash: 'scrypt$x$y' }], rowCount: 1 }
        },
      }),
    }))
    const { POST } = await import('@/app/api/projects/[project_id]/enter/route')
    const request = new Request(`http://127.0.0.1/api/projects/${PROJECT}/enter`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'guild1234' }),
    })
    const response = await POST(request, { params: Promise.resolve({ project_id: PROJECT }) })
    expect(response.status).toBe(401)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ detail: '未登入' })
    expect('room_token' in body).toBe(false)
    expect(queries, '只准查名片那一道；查了 password_hash 就是繞過管線').toEqual(['select 1 from profiles where id = $1'])
  })
})
