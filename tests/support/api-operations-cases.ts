import * as ops from '@/api/operations'

// `api-operations-coverage.test.ts` 與 `api-contract-endpoints.test.ts` 共用這一份。
//
// **抽出來不是為了整潔** —— `[FE-J14-S26]` 的第二個子句要求「每一個資料存取操作
// 送出的 method 與路徑都在產出型別檔的那 21 組裡」，而那條斷言與「恰好 21 組」
// 必須在**同一條 `it`** 裡（`contract-limits.test.ts` 檔頭：一個 ID 底下拆成兩條，
// 其中一條通過報告就說涵蓋了）。跨檔 import 一份測試檔會把它整個再跑一次，
// 所以清單本身要住在不是測試檔的地方。

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 元件不知道自己連的是誰 —— Scenario FE-O02-S01
//
// **每一個 operation 至少走一次真實路徑。** 只測其中幾個的話，
// 一個路徑打錯字的操作可以一直活到有人真的去用它 ——
// 而那時候的症狀是 404，跟「後端沒開」長得一樣。

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
const RESOURCE = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: UUID,
  label: 'Repo',
  type: 'github',
  url: 'https://github.com/o/r',
  created_at: '2026-09-17T06:00:00Z',
}

/**
 * 第六個欄位是**回應的 status**，省略就是 200。
 * `DELETE` 回 204 且沒有 body —— 用 200 帶一份 body 代跑的話，
 * `transport.ts` 那條「204 不去 `json()`」的分支永遠不會被走到。
 */
export const CASES: Array<[string, () => Promise<unknown>, unknown, string, string, number?]> = [
  ['login', () => ops.login({ nickname: '阿福' }), PROFILE, 'POST', '/api/login'],
  ['register', () => ops.register({ login_id: 'alice', password: 'correct horse', nickname: '愛麗絲' }), PROFILE, 'POST', '/api/register'],
  // ⚠️ 這一列曾經寫成 `/api/profiles/me`，跟被測的程式碼**抄了同一個錯誤** ——
  // 所以它永遠是綠的。抓得到那種錯的是型別層的 `FE-A01-S13`／`S14`，不是這裡。
  ['getMyProfile', () => ops.getMyProfile(), PROFILE, 'GET', '/api/me'],
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
  [
    'listResources',
    () => ops.listResources(UUID),
    [RESOURCE],
    'GET',
    `/api/projects/${UUID}/resources`,
  ],
  [
    'createResource',
    () => ops.createResource(UUID, { label: 'Repo', type: 'github', url: 'https://github.com/o/r' }),
    RESOURCE,
    'POST',
    `/api/projects/${UUID}/resources`,
  ],
  [
    'updateResource',
    () => ops.updateResource(UUID, RESOURCE.id, { label: '改過的名字' }),
    RESOURCE,
    'PATCH',
    `/api/projects/${UUID}/resources/${RESOURCE.id}`,
  ],
  [
    'deleteResource',
    () => ops.deleteResource(UUID, RESOURCE.id),
    null,
    'DELETE',
    `/api/projects/${UUID}/resources/${RESOURCE.id}`,
    204,
  ],
]
