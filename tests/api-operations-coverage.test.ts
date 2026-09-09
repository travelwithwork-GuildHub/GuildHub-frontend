import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as ops from '@/api/operations'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 元件不知道自己連的是誰 —— Scenario FE-O02-S01
//
// **每一個 operation 至少走一次真實路徑。** 只測其中幾個的話，
// 一個路徑打錯字的操作可以一直活到有人真的去用它 ——
// 而那時候的症狀是 404，跟「後端沒開」長得一樣。

let server: ContractServer

const UUID = '11111111-1111-1111-1111-111111111111'
const PROFILE = {
  id: UUID,
  display_name: '阿福',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
}
const PROJECT = {
  id: UUID,
  owner_id: UUID,
  title: '一個專案',
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-09T00:00:00Z',
}
const SEAT = { seat_index: 0, user_id: UUID, desk_template: 0, claimed_at: '2026-09-09T00:00:00Z' }
const MESSAGE = {
  id: UUID,
  sender_id: UUID,
  recipient_id: UUID,
  body: '哈囉',
  created_at: '2026-09-09T00:00:00Z',
  read_at: null,
}

/** 每一個操作：怎麼呼叫、server 要回什麼、預期的 method 與路徑。 */
const CASES: Array<[string, () => Promise<unknown>, unknown, string, string]> = [
  ['login', () => ops.login({ nickname: '阿福' }), PROFILE, 'POST', '/api/login'],
  ['getMyProfile', () => ops.getMyProfile(), PROFILE, 'GET', '/api/profiles/me'],
  ['updateMyProfile', () => ops.updateMyProfile({ bio: 'x' }), PROFILE, 'PATCH', '/api/profiles/me'],
  ['listProfiles', () => ops.listProfiles(), [PROFILE], 'GET', '/api/profiles'],
  ['getProfile', () => ops.getProfile(UUID), PROFILE, 'GET', `/api/profiles/${UUID}`],
  ['listProjects', () => ops.listProjects(), [PROJECT], 'GET', '/api/projects'],
  [
    'createProject',
    () => ops.createProject({ title: '一個專案', body: '內容', needed_skills: [], seat_count: 4 }),
    PROJECT,
    'POST',
    '/api/projects',
  ],
  ['getProject', () => ops.getProject(UUID), PROJECT, 'GET', `/api/projects/${UUID}`],
  [
    'formTeam',
    () => ops.formTeam(UUID, { password: 'pw' }),
    PROJECT,
    'POST',
    `/api/projects/${UUID}/form-team`,
  ],
  ['closeProject', () => ops.closeProject(UUID), PROJECT, 'POST', `/api/projects/${UUID}/close`],
  [
    'enterProject',
    () => ops.enterProject(UUID, { password: 'pw' }),
    { room_token: 'tok' },
    'POST',
    `/api/projects/${UUID}/enter`,
  ],
  ['listSeats', () => ops.listSeats(UUID), [SEAT], 'GET', `/api/projects/${UUID}/seats`],
  [
    'claimSeat',
    () => ops.claimSeat(UUID, { seat_index: 0, desk_template: 0 }),
    SEAT,
    'POST',
    `/api/projects/${UUID}/seats`,
  ],
  ['listMessages', () => ops.listMessages(), [MESSAGE], 'GET', '/api/messages'],
  [
    'sendMessage',
    () => ops.sendMessage({ recipient_id: UUID, body: '哈囉' }),
    MESSAGE,
    'POST',
    '/api/messages',
  ],
  ['listRooms', () => ops.listRooms(), [{ project_id: UUID, title: 'x', online_count: 0 }], 'GET', '/api/rooms'],
]

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})

afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
})

describe('每一個 operation 都走一次真實路徑', () => {
  it('清單涵蓋 operations.ts 匯出的每一個操作', async () => {
    const exported = Object.keys(ops).filter((k) => typeof (ops as Record<string, unknown>)[k] === 'function')
    const covered = CASES.map(([name]) => name)

    // **少了這一條，新增一個操作而忘記加進 CASES 時什麼都不會發生。**
    expect(exported.filter((name) => !covered.includes(name)), '有操作沒被這個檔案涵蓋').toEqual([])
  })

  it.each(CASES)('%s', async (_name, invoke, reply, method, pathname) => {
    server.reply(200, reply)
    await invoke()

    expect(server.calls).toHaveLength(1)
    expect(server.calls[0]?.method).toBe(method)
    expect(server.calls[0]?.pathname).toBe(pathname)
    // 有 body 的端點：那個布林是 server 拿契約算出來的
    if (server.calls[0]?.contractOk !== null) {
      expect(server.calls[0]?.contractOk, 'server 端的契約驗證沒過').toBe(true)
    }
  })
})
