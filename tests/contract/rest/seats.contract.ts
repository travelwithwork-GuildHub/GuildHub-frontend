import { afterAll, describe, expect, it } from 'vitest'
import { ProjectOut, SeatOut } from '@/api/contract/rest'
import { ValidationError } from '@/api/contract/errors'
import { closeTrackedProjects, trackProject } from '../cleanup'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-j13-seats/specs/internal-backend/spec.md
//   Requirement: 座位：替身照真後端 —— S06
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// 兩種 409 的 `detail` **逐字釘住**：前端只靠這兩句分（`FE-O08` anomaly `seat-409-detail`），替身跟真後端一個字都不能差。
// `closed` 的房間有票照坐（anomaly `close-keeps-token`）**不釘** —— 真後端修掉那天替身跟著改。

const ZERO = '00000000-0000-4000-8000-000000000000'
const PASSWORD = 'guild1234'
const list = (c: ContractClient, p: string) => c.raw('GET', `/api/projects/${p}/seats`)
const claim = (c: ContractClient, p: string, body: unknown) => c.raw('POST', `/api/projects/${p}/seats`, { body })
const enter = (c: ContractClient, p: string) => c.raw('POST', `/api/projects/${p}/enter`, { body: { password: PASSWORD } })
const detailOf = (r: { json: unknown }) => (r.json as { detail: unknown }).detail

/** owner 建一個 `seat_count = 2` 的案子並成軍。 */
async function activeProject(owner: ContractClient, title: string): Promise<string> {
  const created = await owner.raw('POST', '/api/projects', { body: { title, body: '座位契約測試', needed_skills: [], seat_count: 2 } })
  expect(created.status, created.text.slice(0, 200)).toBe(201)
  const id = ProjectOut.parse(created.json).id
  expect((await owner.raw('POST', `/api/projects/${id}/form-team`, { body: { password: PASSWORD } })).status).toBe(200)
  return trackProject(owner, id)
}

afterAll(closeTrackedProjects)

describe('座位：替身照真後端', () => {
  it('[FE-J13-S06] 沒票 403、空 []、201、一格兩人 409、一人兩格 409、超出座位數 400、型別錯 422、未登入 401、不存在（沒票）403', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('座位的發起人')
    const jia = new ContractClient(baseUrl())
    await jia.login('座位甲')
    const yi = new ContractClient(baseUrl())
    await yi.login('座位乙')
    const id = await activeProject(owner, '座位契約')

    // 沒票：先驗票再查別的
    const noTicket = await list(jia, id)
    expect(noTicket.status, noTicket.text.slice(0, 200)).toBe(403)
    expect(detailOf(noTicket)).toBe('尚未通過房間密碼驗證')
    const noTicketClaim = await claim(jia, id, { seat_index: 0 })
    expect(noTicketClaim.status).toBe(403)

    expect((await enter(jia, id)).status).toBe(200)
    const empty = await list(jia, id)
    expect(empty.status).toBe(200)
    expect(empty.json).toEqual([])

    // 甲坐 0 號：201、形狀、預設 desk_template 0
    const sat = await claim(jia, id, { seat_index: 0 })
    expect(sat.status, sat.text.slice(0, 200)).toBe(201)
    const seat = SeatOut.parse(sat.json)
    expect(seat.seat_index).toBe(0)
    expect(seat.desk_template).toBe(0)
    const jiaId = (await jia.raw('GET', '/api/me')).json as { id: string }
    expect(seat.user_id).toBe(jiaId.id)
    const one = await list(jia, id)
    expect((one.json as unknown[]).length).toBe(1)
    expect(SeatOut.parse((one.json as unknown[])[0]).seat_index).toBe(0)

    // 乙進來搶 0 號：一格兩人
    expect((await enter(yi, id)).status).toBe(200)
    const taken = await claim(yi, id, { seat_index: 0 })
    expect(taken.status, taken.text.slice(0, 200)).toBe(409)
    expect(detailOf(taken)).toBe('這個座位已經有人了')

    // 甲再坐 1 號：一人兩格
    const twice = await claim(jia, id, { seat_index: 1 })
    expect(twice.status, twice.text.slice(0, 200)).toBe(409)
    expect(detailOf(twice)).toBe('你已經在這個房間有座位了')

    // 乙坐 2 號（在 [0,8) 內、≥ seat_count）與 9 號：400
    const beyond = await claim(yi, id, { seat_index: 2 })
    expect(beyond.status, beyond.text.slice(0, 200)).toBe(400)
    expect(String(detailOf(beyond))).toContain('2')
    expect((await claim(yi, id, { seat_index: 9 })).status).toBe(400)

    // 型別錯：422 的形狀
    const typed = await claim(yi, id, { seat_index: '零' })
    expect(typed.status, typed.text.slice(0, 200)).toBe(422)
    const detail = detailOf(typed)
    expect(Array.isArray(detail)).toBe(true)
    for (const item of detail as unknown[]) expect(ValidationError.parse(item).loc[0]).toBe('body')

    // 乙坐 1 號成功：座位滿
    expect((await claim(yi, id, { seat_index: 1 })).status).toBe(201)
    const full = await list(yi, id)
    expect((full.json as unknown[]).map((s) => SeatOut.parse(s).seat_index)).toEqual([0, 1])

    // 未登入 401；不存在的 id 對有票的人也是 403（先驗票，票對不上這個 id）
    const anon = await new ContractClient(baseUrl()).raw('GET', `/api/projects/${id}/seats`)
    expect(anon.status).toBe(401)
    expect(detailOf(anon)).toBe('未登入')
    const missing = await list(jia, ZERO)
    expect(missing.status, missing.text.slice(0, 200)).toBe(403)
  })
})
