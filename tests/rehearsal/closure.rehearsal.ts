// 切換演練。規格 `FE-O08`〈閉環的每一步都對照期望表〉（S03／S04）與〈已知行為釘成觀測基線〉（S05）。
//
// 只由 `node scripts/contract-guildhub.mjs --suite rehearsal` 起（真後端是 wrapper 自己起的 loopback；harness 守門）。
// 期望值**全部**從 `expectations.ts` 讀（design D2）：這個檔案的斷言裡沒有數字；每個 `it` 把 `key`／`report`
// 抄進 `task.meta`，報告（`scripts/rehearsal-report.mjs`）就靠它認列。
//
// 閉環：兩張名片（A 發案者、B 隊員）循序十三步、共用狀態接力；前置沒過的步驟丟 `blocked: <根因 key>`（`Relay`）。
// 基線：十條各自登入、各自建專案，互不依賴 —— 一條紅不擋其他條。

import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import * as rest from '../../src/api/contract/rest'
import { ContractClient, baseUrl, type RawResponse } from '../contract/client'
import { expectation, type Expectation, type Schema } from './expectations'
import { Relay } from './relay'

declare module 'vitest' {
  interface TaskMeta {
    key?: string
    report?: boolean
  }
}

type ProjectOut = z.infer<typeof rest.ProjectOut>
type Actor = { c: ContractClient; id: string }

const NICK = { owner: 'o08 發案者', member: 'o08 隊員', third: 'o08 路人' }
const PROJECT = { title: '切換演練', body: '對真後端跑一次閉環。' }
const PASSWORD = { first: 'guild1234', second: 'guild5678' }

/** 期望表的 `schema` 欄 → 真的 zod schema（`Name[]` 是陣列）。 */
function schemaOf(schema: Schema): z.ZodType {
  const name = schema.replace(/\[\]$/, '') as keyof typeof rest
  const base: z.ZodType = rest[name]
  return schema.endsWith('[]') ? base.array() : base
}

/** 狀態碼要等於期望表的 `status`；有 `schema` 就要通過它。訊息一律以 `key` 開頭（報告與 S04 靠它）。回通過 schema 的 body。 */
function checked(e: Expectation, r: RawResponse): unknown {
  expect(r.status, `${e.key}: 期望 ${e.expect.status}、實測 ${r.status}（${r.text.slice(0, 200)}）`).toBe(e.expect.status)
  if (!e.schema) return r.json
  const parsed = schemaOf(e.schema).safeParse(r.json)
  expect(parsed.success, `${e.key}: 回應不符 ${e.schema}：${parsed.success ? '' : parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}`).toBe(true)
  return parsed.data
}

/** 登入一張新名片（基線用；閉環的兩步自己 `checked`）。 */
async function login(nickname: string): Promise<Actor> {
  const c = new ContractClient(baseUrl())
  const me = await c.login(nickname)
  return { c, id: String(me.id) }
}

/** 閉環的共用狀態：前一步沒留下就是被它擋（`Relay` 正常情況下先擋掉，這裡是型別上的最後一道）。 */
function need<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`blocked: ${key}`)
  return value
}

const create = (a: Actor, body: Record<string, unknown> = {}) => a.c.raw('POST', '/api/projects', { body: { ...PROJECT, ...body } })
const formTeam = (a: Actor, id: string, password: string) => a.c.raw('POST', `/api/projects/${id}/form-team`, { body: { password } })
const enter = (a: Actor, id: string, password: string) => a.c.raw('POST', `/api/projects/${id}/enter`, { body: { password } })
const seats = (a: Actor, id: string) => a.c.raw('GET', `/api/projects/${id}/seats`)
const claim = (a: Actor, id: string, seat_index: number) => a.c.raw('POST', `/api/projects/${id}/seats`, { body: { seat_index } })
const close = (a: Actor, id: string) => a.c.raw('POST', `/api/projects/${id}/close`)
const rooms = (a: Actor) => a.c.raw('GET', '/api/rooms')
/** `/api/rooms` 裡有沒有這扇門：回期望表的慣用字 `present`／`absent`。 */
const door = (r: RawResponse, id: string) => (rest.RoomDoorOut.array().parse(r.json).some((d) => d.project_id === id) ? 'present' : 'absent')
/** `room_template` 的型別，回期望表的慣用字（`integer`／`null`／其他 typeof）。 */
const templateKind = (v: unknown) => (Number.isInteger(v) ? 'integer' : v === null ? 'null' : typeof v)

/**
 * 每一條的失敗訊息都要以 `key` 開頭（S05：報告只取第一行，要指得出是哪一條變了）。`checked` 已經加了；
 * 前置動作（登入、建案、zod parse）拋的沒有 —— 這裡補上，並把多行的 zod 訊息壓成一行。`blocked:` 的原樣放行。
 */
async function withKey(key: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith(`${key}:`) || message.startsWith('blocked: ')) throw err
    throw new Error(`${key}: ${message.replace(/\s*\n\s*/g, ' ').slice(0, 300)}`, { cause: err })
  }
}

/** 基線用：A 建案並成軍（各自的專案）。 */
async function activeProject(a: Actor, body: Record<string, unknown> = {}): Promise<ProjectOut> {
  const created = rest.ProjectOut.parse((await create(a, body)).json)
  return rest.ProjectOut.parse((await formTeam(a, created.id, PASSWORD.first)).json)
}

// ── 閉環十三步 ──

describe('閉環', () => {
  const relay = new Relay()
  const state: { owner?: Actor; member?: Actor; project?: ProjectOut } = {}
  const owner = () => need(state.owner, 'login-owner')
  const member = () => need(state.member, 'login-member')
  const project = () => need(state.project, 'create')

  /** 登入一張新名片、留下 client（cookie jar）與 id。 */
  async function loginStep(e: Expectation, nickname: string): Promise<Actor> {
    const c = new ContractClient(baseUrl())
    const me = checked(e, await c.raw('POST', '/api/login', { body: { nickname } })) as z.infer<typeof rest.ProfileOut>
    return { c, id: me.id }
  }

  /** 一步一個 `it`：標題含 key 與 Scenario ID；`meta` 給報告；前置由 `Relay` 守。 */
  function step(key: string, deps: readonly string[], run: (e: Expectation) => Promise<void>) {
    const e = expectation(key)
    it(`[FE-O08-S03] ${key} —— ${e.title}`, async ({ task }) => {
      task.meta.key = e.key
      task.meta.report = e.report
      await relay.run(key, deps, () => withKey(key, () => run(e)))
    })
  }

  step('login-owner', [], async (e) => {
    state.owner = await loginStep(e, NICK.owner)
  })
  step('login-member', [], async (e) => {
    state.member = await loginStep(e, NICK.member)
  })
  step('create', ['login-owner'], async (e) => {
    const before = Date.now()
    const p = checked(e, await create(owner(), { seat_count: e.expect.seatCount })) as ProjectOut
    expect(p.status, `${e.key}: status`).toBe(e.expect.projectStatus)
    expect(p.seat_count, `${e.key}: seat_count`).toBe(e.expect.seatCount)
    const days = (Date.parse(p.expires_at) - before) / 86_400_000
    const tolerance = Number(e.expect.toleranceMinutes) / (24 * 60)
    expect(Math.abs(days - Number(e.expect.expiresDays)), `${e.key}: expires_at 在建立後 ${days.toFixed(3)} 天，期望 ${e.expect.expiresDays} ± ${e.expect.toleranceMinutes} 分`).toBeLessThanOrEqual(tolerance)
    state.project = p
  })
  step('list-contains', ['login-member', 'create'], async (e) => {
    const list = checked(e, await member().c.raw('GET', '/api/projects')) as ProjectOut[]
    expect(list.map((p) => p.id), `${e.key}: 清單沒有剛建的 ${project().id}`).toContain(project().id)
  })
  step('get', ['login-member', 'create'], async (e) => {
    const p = checked(e, await member().c.raw('GET', `/api/projects/${project().id}`)) as ProjectOut
    expect(p.id, `${e.key}: id`).toBe(project().id)
  })
  step('form-team', ['create'], async (e) => {
    const p = checked(e, await formTeam(owner(), project().id, PASSWORD.first)) as ProjectOut
    expect(p.status, `${e.key}: status`).toBe(e.expect.projectStatus)
    expect(templateKind(p.room_template), `${e.key}: room_template 的型別（實測 ${JSON.stringify(p.room_template)}）`).toBe(e.expect.roomTemplate)
    state.project = p
  })
  step('rooms-contains', ['login-member', 'form-team'], async (e) => {
    const r = await rooms(member())
    checked(e, r)
    expect(door(r, project().id), `${e.key}: /api/rooms 有沒有 ${project().id}`).toBe(e.expect.door)
  })
  step('enter', ['login-member', 'form-team'], async (e) => {
    checked(e, await enter(member(), project().id, PASSWORD.first))
  })
  step('seats-empty', ['enter'], async (e) => {
    const list = checked(e, await seats(member(), project().id)) as unknown[]
    expect(list.length, `${e.key}: 座位數`).toBe(e.expect.count)
  })
  step('seat-claim', ['enter'], async (e) => {
    const seat = checked(e, await claim(member(), project().id, Number(e.expect.seatIndex))) as z.infer<typeof rest.SeatOut>
    expect(seat.user_id, `${e.key}: user_id 要是 B`).toBe(member().id)
  })
  step('message', ['login-owner', 'login-member'], async (e) => {
    checked(e, await member().c.raw('POST', '/api/messages', { body: { recipient_id: owner().id, body: '演練的站內信' } }))
  })
  step('close', ['form-team'], async (e) => {
    const p = checked(e, await close(owner(), project().id)) as ProjectOut
    expect(p.status, `${e.key}: status`).toBe(e.expect.projectStatus)
  })
  step('rooms-excludes', ['close'], async (e) => {
    const r = await rooms(member())
    checked(e, r)
    expect(door(r, project().id), `${e.key}: /api/rooms 有沒有 ${project().id}`).toBe(e.expect.door)
  })
})

// ── 十條基線（各自登入、各自建專案）──

describe('基線', () => {
  /** 一條一個 `it`：各自的名片與專案，互不依賴。 */
  function baseline(key: string, run: (e: Expectation, a: Actor, b: Actor) => Promise<void>) {
    const e = expectation(key)
    it(`[FE-O08-S05] ${key} —— ${e.title}`, async ({ task }) => {
      task.meta.key = e.key
      task.meta.report = e.report
      await withKey(key, async () => {
        const [a, b] = await Promise.all([login(NICK.owner), login(NICK.member)])
        await run(e, a, b)
      })
    })
  }

  baseline('create-unvalidated', async (e, a) => {
    checked(e, await create(a, { title: e.expect.title }))
    checked(e, await create(a, { seat_count: e.expect.seatCountLow }))
    checked(e, await create(a, { seat_count: e.expect.seatCountHigh }))
  })
  baseline('list-default-recruiting', async (e, a, b) => {
    const recruiting = rest.ProjectOut.parse((await create(a)).json)
    const active = await activeProject(a)
    const byDefault = rest.ProjectOut.array().parse(checked(e, await b.c.raw('GET', '/api/projects')))
    expect(byDefault.map((p) => p.id), `${e.key}: 不帶 status 要含剛建的 ${recruiting.id}`).toContain(recruiting.id)
    expect(byDefault.map((p) => p.status).filter((s) => s !== e.expect.defaultStatus), `${e.key}: 不帶 status 只該回 ${e.expect.defaultStatus}`).toEqual([])
    const filtered = rest.ProjectOut.array().parse(checked(e, await b.c.raw('GET', `/api/projects?status=${e.expect.filter}`)))
    expect(filtered.map((p) => p.id), `${e.key}: ?status=${e.expect.filter} 要含成軍的 ${active.id}`).toContain(active.id)
  })
  baseline('form-team-repeat', async (e, a, b) => {
    const p = await activeProject(a)
    checked(e, await formTeam(a, p.id, PASSWORD.second))
    expect((await enter(b, p.id, PASSWORD.first)).status, `${e.key}: 舊密碼 enter`).toBe(e.expect.oldPasswordEnter)
    expect((await enter(b, p.id, PASSWORD.second)).status, `${e.key}: 新密碼 enter`).toBe(e.expect.newPasswordEnter)
  })
  baseline('form-team-after-close', async (e, a, b) => {
    const p = await activeProject(a)
    rest.ProjectOut.parse((await close(a, p.id)).json)
    const revived = rest.ProjectOut.parse(checked(e, await formTeam(a, p.id, PASSWORD.second)))
    expect(revived.status, `${e.key}: status`).toBe(e.expect.projectStatus)
    expect(door(await rooms(b), p.id), `${e.key}: /api/rooms 有沒有 ${p.id}`).toBe(e.expect.door)
  })
  baseline('seat-409-detail', async (e, a, b) => {
    const p = await activeProject(a)
    const c = await login(NICK.third)
    await enter(b, p.id, PASSWORD.first)
    await enter(c, p.id, PASSWORD.first)
    rest.SeatOut.parse((await claim(b, p.id, Number(e.expect.seatIndex))).json)
    // 同一人坐**另一格**：只可能撞 user_id 的唯一鍵，訊息才分得出來（同一格會兩個鍵都撞，看哪個先查）。
    const own = checked(e, await claim(b, p.id, Number(e.expect.otherSeatIndex))) as { detail?: string }
    expect(own.detail, `${e.key}: 同一人再坐`).toBe(e.expect.ownSeat)
    const taken = checked(e, await claim(c, p.id, Number(e.expect.seatIndex))) as { detail?: string }
    expect(taken.detail, `${e.key}: 坐別人的位`).toBe(e.expect.taken)
  })
  baseline('seat-out-of-range', async (e, a, b) => {
    const p = await activeProject(a, { seat_count: e.expect.seatCount })
    await enter(b, p.id, PASSWORD.first)
    const r = checked(e, await claim(b, p.id, Number(e.expect.seatIndex))) as { detail?: string }
    expect(r.detail ?? '', `${e.key}: 訊息要含座位數 ${e.expect.seatCount}`).toContain(String(e.expect.seatCount))
  })
  baseline('owner-needs-enter', async (e, a) => {
    const p = await activeProject(a)
    checked(e, await seats(a, p.id))
  })
  baseline('close-idempotent', async (e, a) => {
    const p = await activeProject(a)
    checked(e, await close(a, p.id))
    checked(e, await close(a, p.id))
  })
  baseline('close-clears-seats', async (e, a, b) => {
    const p = await activeProject(a)
    await enter(b, p.id, PASSWORD.first)
    rest.SeatOut.parse((await claim(b, p.id, Number(e.expect.seatIndex))).json)
    rest.ProjectOut.parse((await close(a, p.id)).json)
    const list = rest.SeatOut.array().parse(checked(e, await seats(b, p.id)))
    expect(list.length, `${e.key}: 結案後的座位數`).toBe(e.expect.count)
  })
  baseline('close-keeps-token', async (e, a, b) => {
    const p = await activeProject(a)
    await enter(b, p.id, PASSWORD.first)
    rest.ProjectOut.parse((await close(a, p.id)).json)
    rest.SeatOut.parse(checked(e, await claim(b, p.id, Number(e.expect.seatIndex))))
  })
})
