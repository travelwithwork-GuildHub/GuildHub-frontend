import { describe, expect, it } from 'vitest'
import { MessageOut, ProfileOut } from '@/api/contract/rest'
import { ContractClient, baseUrl } from '../client'
import { checkGolden } from '../golden'

// 規格：openspec/changes/fe-k01-inbox/specs/inbox/spec.md
//   Requirement: 本地後端與契約測試補上 messages —— S13、S14、S15
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// 每條測試用新登入的名片（`login(nickname)` 建新的），資料庫跨重跑累積不會互相干擾。

const ZERO = '00000000-0000-4000-8000-000000000000'

async function person(nickname: string) {
  const c = new ContractClient(baseUrl())
  const me = ProfileOut.parse(await c.login(nickname))
  return { c, me }
}
const send = (c: ContractClient, to: string, body: string) => c.raw('POST', '/api/messages', { body: { recipient_id: to, body } })
const page = async (c: ContractClient, p: number | string | null) => {
  const r = await c.raw('GET', p === null ? '/api/messages' : `/api/messages?page=${p}`)
  return { status: r.status, list: r.status === 200 ? (r.json as unknown[]).map((m) => MessageOut.parse(m)) : [], raw: r }
}

describe('messages', () => {
  it('[FE-K01-S13] 201 形狀；分頁套用在授權後的集合：丙丁 21 封時甲的第 0 頁仍正好是甲乙那兩封', async () => {
    const [a, b, c, d] = await Promise.all([person('甲'), person('乙'), person('丙'), person('丁')])
    const ab = await send(a.c, b.me.id, '甲→乙')
    expect(ab.status, ab.text.slice(0, 200)).toBe(201)
    expect(ab.contentType).toMatch(/application\/json/)
    const first = MessageOut.parse(ab.json)
    expect(first.sender_id).toBe(a.me.id)
    expect(first.recipient_id).toBe(b.me.id)
    expect(first.read_at).toBeNull()
    const ba = await send(b.c, a.me.id, '乙→甲')
    expect(ba.status).toBe(201)
    // 別人的信超過一頁：取前 20 筆再過濾的實作會讓甲的第 0 頁變空。
    for (let i = 0; i < 21; i += 1) expect((await send(c.c, d.me.id, `丙→丁 ${i}`)).status).toBe(201)

    const mine = await page(a.c, 0)
    expect(mine.status).toBe(200)
    expect(mine.list.map((m) => m.body).sort()).toEqual(['乙→甲', '甲→乙'])
    for (let i = 1; i < mine.list.length; i += 1) {
      expect(mine.list[i - 1]!.created_at >= mine.list[i]!.created_at, 'created_at 要非遞增').toBe(true)
    }
    expect(mine.list.some((m) => m.body.startsWith('丙→丁')), '別人的信出現在我的清單裡').toBe(false)

    const theirs0 = await page(d.c, 0)
    const theirs1 = await page(d.c, 1)
    expect(theirs0.list).toHaveLength(20)
    expect(theirs1.list).toHaveLength(1)
    expect([...theirs0.list, ...theirs1.list].every((m) => m.body.startsWith('丙→丁'))).toBe(true)
  })

  it('[FE-K01-S14] 寄給自己 400、收件人不存在 404、未登入 401（GET 與 POST）', async () => {
    const a = await person('甲')
    const self = await send(a.c, a.me.id, '給自己')
    expect(self.status).toBe(400)
    expect(self.json).toEqual({ detail: '不能寄信給自己' })
    const nobody = await send(a.c, ZERO, '給不存在的人')
    expect(nobody.status).toBe(404)
    expect(nobody.json).toEqual({ detail: '收件人不存在' })
    const anon = new ContractClient(baseUrl())
    expect((await anon.raw('GET', '/api/messages')).status).toBe(401)
    expect((await anon.raw('POST', '/api/messages', { body: { recipient_id: a.me.id, body: 'x' } })).status).toBe(401)
  })

  it('[FE-K01-S15] 422 的形狀（golden）；超長 body 是資料庫 check → 500；分頁參數', async () => {
    const a = await person('甲')
    const b = await person('乙')
    checkGolden('messages {}', await a.c.raw('POST', '/api/messages', { body: {} }))
    checkGolden('messages bad recipient', await a.c.raw('POST', '/api/messages', { body: { recipient_id: 'not-a-uuid', body: 'x' } }))
    checkGolden('messages page=abc', await a.c.raw('GET', '/api/messages?page=abc'))
    const tooLong = await send(a.c, b.me.id, '字'.repeat(2001))
    expect(tooLong.status, '2001 字：Pydantic 沒有長度，是資料庫 check').toBe(500)
    // 分頁參數：省略、-1 都等於 0；翻過尾頁是 []。三個 GET 都要是 200（不然 `list` 都是 [] 會恆真 —— 審查抓到的）。
    expect((await send(a.c, b.me.id, '一封')).status).toBe(201)
    const p0 = await page(a.c, 0)
    const omitted = await page(a.c, null)
    const negative = await page(a.c, -1)
    for (const r of [p0, omitted, negative]) expect(r.status, r.raw.text.slice(0, 120)).toBe(200)
    expect(p0.list.some((m) => m.body === '一封')).toBe(true)
    expect(omitted.list).toEqual(p0.list)
    expect(negative.list).toEqual(p0.list)
    const far = await page(a.c, 5)
    expect(far.status).toBe(200)
    expect(far.list).toEqual([])
  })
})
