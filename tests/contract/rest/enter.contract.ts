import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { EnterOut, ProfileOut } from '@/api/contract/rest'
import { HttpError } from '@/api/transport'
import { toUiError } from '@/errors/uiError'
import { closeTrackedProjects, trackProject } from '../cleanup'
import { ContractClient, baseUrl, databaseUrl, roomGrantPrefix, wsUrl } from '../client'
import { connect, expectRefused } from '../ws/socket'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下 —— S12（矩陣、票的效力、座位不影響）、S13（兩個目標同一份）
//     以及〈伺服器端記住票〉—— S34（enter 之後 REST 認得，兩個目標）、S37（本地怎麼記的：cookie 的屬性與不可偽造，本地獨有）
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

/**
 * 塞一個專案，回它的 id。`active`／`closed` 給雜湊；`recruiting` 沒有（`room_ready` check 只管 active）。
 * `c` 是這個專案的發起人（用來收拾）—— `active` 的跑完要結案，不然會跟 seed 的兩間房搶走廊的 12 個門位（`cleanup.ts` 檔頭）。
 */
async function project(c: ContractClient, owner: string, status: 'recruiting' | 'active' | 'closed', withPassword: boolean): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into projects (owner_id, title, body, status, room_template, password_hash, seat_count)
     values ($1, $2, '契約測試用', $3, 0, $4, 4) returning id`,
    [owner, `enter 測試（${status}）`, status, withPassword ? GUILD1234 : null],
  )
  const id = rows[0]!.id
  return status === 'active' ? trackProject(c, id) : id
}

const enter = (c: ContractClient, id: string, password: string) => c.raw('POST', `/api/projects/${id}/enter`, { body: { password } })
/** 這個回應經 `send()` 會變成的 `HttpError`，再經 `toUiError` 變成的 `kind`（S13：兩個目標翻成同一個 `kind`）。 */
const kindOf = (r: { status: number; json: unknown }) => toUiError(new HttpError('enterProject', r.status, (r.json as { detail?: string } | undefined)?.detail ?? null)).kind
const cookieHeader = (c: ContractClient) => [...c.cookies()].map(([k, v]) => `${k}=${v}`).join('; ')
const roomUrl = (id: string, token: string) => `${wsUrl()}?scene=room:${id}&token=${encodeURIComponent(token)}`

afterAll(closeTrackedProjects)

describe('POST /api/projects/{project_id}/enter', () => {
  it('[FE-N08-S12] 矩陣：未登入 401、不存在 404、未成軍 404、密碼錯 403、密碼對 200（EnterOut）、closed 但有密碼 200；座位空與滿都 200', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('要進房的人'))
    const recruiting = await project(c, me.id, 'recruiting', false)
    const active = await project(c, me.id, 'active', true)
    const closed = await project(c, me.id, 'closed', true)

    const anon = await new ContractClient(baseUrl()).raw('POST', `/api/projects/${active}/enter`, { body: { password: 'guild1234' } })
    expect(anon.status, '未登入').toBe(401)
    expect(anon.json).toEqual({ detail: '未登入' })
    expect(kindOf(anon)).toBe('authentication-required')

    const missing = await enter(c, ZERO, 'guild1234')
    expect(missing.status, '專案不存在').toBe(404)
    expect(missing.json).toEqual({ detail: '專案不存在或房間尚未開啟' })
    expect(kindOf(missing)).toBe('not-found')

    const notReady = await enter(c, recruiting, 'guild1234')
    expect(notReady.status, 'recruiting：沒有 password_hash，跟不存在同一句').toBe(404)
    expect(notReady.json).toEqual({ detail: '專案不存在或房間尚未開啟' })

    const wrong = await enter(c, active, 'not-the-password')
    expect(wrong.status, '密碼錯').toBe(403)
    expect(wrong.json).toEqual({ detail: '房間密碼錯誤' })
    expect(kindOf(wrong)).toBe('permission-denied')

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
    const room = await project(c, me.id, 'active', true)
    const other = await project(c, me.id, 'active', true)
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

  it('[FE-N08-S13] 兩個目標同一份：body 是 EnterIn（缺 password 是 422）；成功形狀是 EnterOut、沒有多的鍵；401／403／404 翻成同一個 kind（上一條的 kindOf）', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('看形狀的人'))
    const room = await project(c, me.id, 'active', true)
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

// ── 伺服器端記住票（`room-entry-gate` 的〈伺服器端記住票〉、design D4）──
// 用票的是資源端點：`GET /api/projects/{id}/resources` 對「active、非 owner」只有持票才 200（`internal-backend` 的矩陣）。
// **前端的請求上不帶票**：兩個目標都是「enter 過的那個 session 自己被認得」，測試這裡也只是照常送 cookie jar。

const resources = (c: ContractClient, id: string) => c.raw('GET', `/api/projects/${id}/resources`)

describe('enter 之後，這個 session 在 REST 上持票', () => {
  it('[FE-J14-S34] 對 A enter 成功只換到 A 的讀取權；B 要自己 enter；同一個 jar 換人登入就不算', async () => {
    const owner = new ContractClient(baseUrl())
    const ownerId = ProfileOut.parse(await owner.login('兩間房的發起人')).id
    const a = await project(owner, ownerId, 'active', true)
    const b = await project(owner, ownerId, 'active', true)

    const jia = new ContractClient(baseUrl())
    await jia.login('甲（要進房讀資源的人）')

    const before = await resources(jia, a)
    expect(before.status, '還沒 enter 就讀得到').toBe(403)
    expect(before.json).toEqual({ detail: '尚未通過房間密碼驗證' })

    expect((await enter(jia, a, 'guild1234')).status).toBe(200)
    const afterA = await resources(jia, a)
    expect(afterA.status, afterA.text.slice(0, 200)).toBe(200)
    expect(Array.isArray(afterA.json), '200 了但回的不是清單').toBe(true)
    expect((await resources(jia, b)).status, '對 A 的票讓 B 也讀得到了 —— 票沒有綁房間').toBe(403)

    expect((await enter(jia, b, 'guild1234')).status).toBe(200)
    expect((await resources(jia, a)).status, '拿到 B 的票之後 A 就不算了 —— 一間房一份記錄，後來的不覆蓋先前的').toBe(200)
    expect((await resources(jia, b)).status).toBe(200)

    // 同一個 cookie jar 改以乙登入（沒有 enter 過）：兩個後端都不清舊記錄，但記錄綁的是甲。
    await jia.login('乙（沒有 enter 過的人）')
    const asYi = await resources(jia, a)
    expect(asYi.status, '換人登入之後，還讀得到甲進過的房間 —— 記錄沒有綁身分').toBe(403)
    expect(asYi.json).toEqual({ detail: '尚未通過房間密碼驗證' })
  })
})

// 本地怎麼記的（cookie 的名稱、屬性、簽章）只對 `local` 有意義：真後端把票放在它自己的 session 裡，
// 格式不是前端的事（ADR 0008）。門檻是**能力**（`roomGrantPrefix()`）而不是目標的名字（`FE-O05-S02`）。
describe.skipIf(roomGrantPrefix() === null)('本地的票記錄：cookie', () => {
  const PREFIX = roomGrantPrefix() as string

  it('[FE-J14-S37] 屬性跟 session cookie 同級；簽章壞的、換人的、換房間名稱的都不算；並行 enter 兩間各自算數', async () => {
    const owner = new ContractClient(baseUrl())
    const ownerId = ProfileOut.parse(await owner.login('票記錄的發起人')).id
    const [a, b, roomC, roomD] = [
      await project(owner, ownerId, 'active', true),
      await project(owner, ownerId, 'active', true),
      await project(owner, ownerId, 'active', true),
      await project(owner, ownerId, 'active', true),
    ]

    const jia = new ContractClient(baseUrl())
    const loggedIn = await jia.raw('POST', '/api/login', { body: { nickname: '甲（看 cookie 的人）' } })
    expect(loggedIn.status).toBe(200)
    const entered = await enter(jia, a, 'guild1234')
    expect(entered.status, entered.text.slice(0, 200)).toBe(200)

    const lineFor = (r: { headers: Headers }, name: string) => r.headers.getSetCookie().find((l) => l.startsWith(`${name}=`))
    const grantLine = lineFor(entered, `${PREFIX}${a}`)
    const sessionLine = lineFor(loggedIn, 'session')
    expect(grantLine, `enter 成功卻沒有發 ${PREFIX}${a} —— 這個 session 的票沒有被記住`).toBeDefined()
    expect(sessionLine).toBeDefined()

    // 「屬性跟 session cookie 同級」是規格的字面：拿登入那一個來比，不是自己抄一份清單。
    const attrsOf = (line: string) => line.split(';').slice(1).map((s) => s.trim().toLowerCase()).sort()
    expect(attrsOf(grantLine as string), '票記錄的 cookie 屬性跟 session 的不一樣').toEqual(attrsOf(sessionLine as string))
    // 兩邊都空的話上面那一條是恆真的，所以三個屬性各自也要在（`Secure` 只在非 local，這一輪是 local）。
    expect(attrsOf(grantLine as string)).toEqual(['httponly', 'path=/', 'samesite=lax'])

    const value = (line: string) => (line.split(';')[0] as string).slice(line.indexOf('=') + 1)
    const grant = value(grantLine as string)
    const jiaSession = jia.cookies().get('session') as string
    expect(jiaSession).toBeDefined()

    // 自己組 cookie header 要用沒有 jar 的 client：有 jar 的話 `raw()` 會拿 jar 蓋掉我們帶的 header。
    const bare = jia.forgetful()
    const readAs = (cookie: string, id = a) => bare.raw('GET', `/api/projects/${id}/resources`, { headers: { cookie } })

    // 對照組先來：原封的值帶進去是 200。少了這一條，下面每個 403 都可能只是「cookie 根本沒送到」。
    expect((await readAs(`session=${jiaSession}; ${PREFIX}${a}=${grant}`)).status, '原封的票記錄自己就不管用 —— 下面的 403 都不算數').toBe(200)

    // 偽造：內容看起來對（就是那個 profile id），但簽章壞掉或整個沒有。
    const profileId = ProfileOut.parse(loggedIn.json).id
    for (const forged of [`${grant}x`, profileId, `${profileId}.`]) {
      const r = await readAs(`session=${jiaSession}; ${PREFIX}${a}=${forged}`)
      expect(r.status, `偽造的票記錄被收下了（${forged.slice(0, 24)}…）`).toBe(403)
    }

    // 甲的票記錄搬到乙的 session 上。
    const yi = new ContractClient(baseUrl())
    await yi.login('乙（借別人票記錄的人）')
    const yiSession = yi.cookies().get('session') as string
    expect((await readAs(`session=${yiSession}; ${PREFIX}${a}=${grant}`)).status, '甲的票記錄在乙的 session 上生效了').toBe(403)

    // 甲把自己對 A 有效的值，原封改放到 B 那一間的 cookie 名稱下（沒有對 B enter 過）。
    expect((await readAs(`session=${jiaSession}; ${PREFIX}${b}=${grant}`, b)).status, '換個 cookie 名稱就讀得到別間房 —— 簽章沒有蓋住 project_id').toBe(403)

    // 並行 enter 兩間：一間房一個 cookie，瀏覽器以名稱合併，兩次 `Set-Cookie` 不互相覆寫（design D4）。
    const both = new ContractClient(baseUrl())
    await both.login('同時進兩間房的人')
    const [ec, ed] = await Promise.all([enter(both, roomC, 'guild1234'), enter(both, roomD, 'guild1234')])
    expect(ec.status, ec.text.slice(0, 200)).toBe(200)
    expect(ed.status, ed.text.slice(0, 200)).toBe(200)
    expect((await resources(both, roomC)).status, '並行 enter 的兩間，後回來的那一次把先回來的蓋掉了').toBe(200)
    expect((await resources(both, roomD)).status, '並行 enter 的兩間，後回來的那一次把先回來的蓋掉了').toBe(200)
  })
})
