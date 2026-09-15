import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { EnterOut, ProfileOut } from '@/api/contract/rest'
import { ContractClient, baseUrl, databaseUrl, wsUrl } from '../client'
import { connect, expectRefused } from '../ws/socket'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下 —— S12（矩陣、票的效力、座位不影響）、S13（兩個目標同一份）
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// 專案是**自己塞的**（每次新的 id），不動 seed 那兩間房：別的案例（rooms 的人數）在看它們。
// 「名片已刪」那一列**刻意不在這裡**：真後端照簽 200、本地管線 401，是已知差異（Requirement 的清單、design D7）。

const ZERO = '00000000-0000-4000-8000-000000000000'
/** seed 兩間房的密碼 `guild1234` 的 scrypt 雜湊（`db/schema/002_seed.sql`）—— 兩個後端都用同一種格式驗。 */
const GUILD1234 = 'scrypt$THdPfPxgRchYAlAiaebIsw==$smoltv9+X0+Oea3ozgocJ3qKIDvO6sLGD5YFoRo9qJcUR1F6GGnitsXoMUtV+cVu8ePDMADAZDlcf8VP2gwRdg=='

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    return (await client.query<T>(text, params)).rows
  } finally {
    await client.end()
  }
}

/** 塞一個專案，回它的 id。`active`／`closed` 給雜湊；`recruiting` 沒有（`room_ready` check 只管 active）。 */
async function project(owner: string, status: 'recruiting' | 'active' | 'closed', withPassword: boolean): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into projects (owner_id, title, body, status, room_template, password_hash, seat_count)
     values ($1, $2, '契約測試用', $3, 0, $4, 4) returning id`,
    [owner, `enter 測試（${status}）`, status, withPassword ? GUILD1234 : null],
  )
  return rows[0]!.id
}

const enter = (c: ContractClient, id: string, password: string) => c.raw('POST', `/api/projects/${id}/enter`, { body: { password } })
const cookieHeader = (c: ContractClient) => [...c.cookies()].map(([k, v]) => `${k}=${v}`).join('; ')
const roomUrl = (id: string, token: string) => `${wsUrl()}?scene=room:${id}&token=${encodeURIComponent(token)}`

describe('POST /api/projects/{project_id}/enter', () => {
  it('[FE-N08-S12] 矩陣：未登入 401、不存在 404、未成軍 404、密碼錯 403、密碼對 200（EnterOut）、closed 但有密碼 200；座位空與滿都 200', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('要進房的人'))
    const recruiting = await project(me.id, 'recruiting', false)
    const active = await project(me.id, 'active', true)
    const closed = await project(me.id, 'closed', true)

    const anon = await new ContractClient(baseUrl()).raw('POST', `/api/projects/${active}/enter`, { body: { password: 'guild1234' } })
    expect(anon.status, '未登入').toBe(401)
    expect(anon.json).toEqual({ detail: '未登入' })

    const missing = await enter(c, ZERO, 'guild1234')
    expect(missing.status, '專案不存在').toBe(404)
    expect(missing.json).toEqual({ detail: '專案不存在或房間尚未開啟' })

    const notReady = await enter(c, recruiting, 'guild1234')
    expect(notReady.status, 'recruiting：沒有 password_hash，跟不存在同一句').toBe(404)
    expect(notReady.json).toEqual({ detail: '專案不存在或房間尚未開啟' })

    const wrong = await enter(c, active, 'not-the-password')
    expect(wrong.status, '密碼錯').toBe(403)
    expect(wrong.json).toEqual({ detail: '房間密碼錯誤' })

    const ok = await enter(c, active, 'guild1234')
    expect(ok.status, ok.text.slice(0, 200)).toBe(200)
    expect(ok.contentType).toMatch(/application\/json/)
    const ticket = EnterOut.parse(ok.json)
    expect(ticket.room_token.length).toBeGreaterThan(0)

    // 不看 status：closed 但還留著 password_hash 的照樣簽（真後端亦然；design D4 說這不是產品義務，是 parity）。
    const stale = await enter(c, closed, 'guild1234')
    expect(stale.status, 'closed 但有 password_hash').toBe(200)
    EnterOut.parse(stale.json)

    // 座位表對 enter 沒有影響：上面 active 那一間座位是空的；把 seat_count（4）格全部佔滿再進一次，仍是 200。
    expect(await sql('select 1 from seats where project_id = $1', [active])).toEqual([])
    const others = await Promise.all(['甲', '乙', '丙', '丁'].map(async (n) => ProfileOut.parse(await new ContractClient(baseUrl()).login(n)).id))
    for (const [i, user] of others.entries()) {
      await sql('insert into seats (project_id, seat_index, user_id, desk_template) values ($1, $2, $3, 0)', [active, i, user])
    }
    const full = await enter(c, active, 'guild1234')
    expect(full.status, '滿座仍然簽票').toBe(200)
    EnterOut.parse(full.json)
  })

  it('[FE-N08-S12] 票的效力：同房同人握手成功；另一間房、另一個人的 cookie、沒有 cookie 都拒絕', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('拿票的人'))
    const room = await project(me.id, 'active', true)
    const other = await project(me.id, 'active', true)
    const ok = await enter(c, room, 'guild1234')
    expect(ok.status, ok.text.slice(0, 200)).toBe(200)
    const { room_token } = EnterOut.parse(ok.json)

    const s = await connect(roomUrl(room, room_token), { cookie: cookieHeader(c) })
    try {
      const hello = await s.waitFor((m) => m.t === 'hello', 3_000)
      const snapshot = await s.waitFor((m) => m.t === 'snapshot', 3_000)
      // 進來的是**這個人**，不是訪客：票綁的身分要跟 cookie 解析出來的一致（替身先解析身分再驗票才做得到）。
      expect(hello.t === 'hello' && hello.you).toBe(me.id)
      expect(snapshot.t === 'snapshot' && snapshot.players.find((p) => p.id === me.id)?.name).toBe(me.display_name)
    } finally {
      await s.close()
    }

    const elsewhere = await expectRefused(roomUrl(other, room_token), { cookie: cookieHeader(c) })
    expect(elsewhere.opened, '同一張票進了另一間房').toBe(false)
    expect(elsewhere.messages).toBe(0)

    const q = new ContractClient(baseUrl())
    await q.login('拿別人票的人')
    const someoneElse = await expectRefused(roomUrl(room, room_token), { cookie: cookieHeader(q) })
    expect(someoneElse.opened, '別人拿著這張票進了房').toBe(false)
    expect(someoneElse.messages).toBe(0)

    const nobody = await expectRefused(roomUrl(room, room_token))
    expect(nobody.opened, '沒有 cookie（訪客）拿著這張票進了房').toBe(false)
  })

  it('[FE-N08-S13] 兩個目標同一份：body 是 EnterIn（缺 password 是 422）；成功形狀是 EnterOut、沒有多的鍵', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('看形狀的人'))
    const room = await project(me.id, 'active', true)
    const bad = await c.raw('POST', `/api/projects/${room}/enter`, { body: {} })
    expect(bad.status, '沒有 password 欄位').toBe(422)
    const ok = await enter(c, room, 'guild1234')
    expect(ok.status).toBe(200)
    expect(Object.keys(ok.json as object).sort()).toEqual(['room_token'])
    // 密碼是空字串也照送、照驗（前端不加長度規則，design D6）：空字串不是這間房的密碼 → 403，不是 422。
    const empty = await enter(c, room, '')
    expect(empty.status, '空字串密碼').toBe(403)
  })
})
