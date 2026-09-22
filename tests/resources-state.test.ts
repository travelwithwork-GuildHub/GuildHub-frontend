import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOut, ProjectResourceOut, ProjectStatus } from '@/api/contract/rest'
import { HttpError } from '@/api/transport'
import { createResourcesStore, type ResourcesState } from '@/resources/resourcesStore'

// 規格：openspec/changes/fe-j14-project-resources/specs/project-resources/spec.md
//   Requirement: 讀取的時機是封閉的；晚到的回應不得覆蓋較新的結果 —— S36、S24 的「第一次開啟共用」那半
//   Requirement: 結案與權限失敗：確認一次專案狀態，是 closed 才說已結案；不輪詢 —— S05、S06 的狀態那半
//   Requirement: 空、載入、失敗三種狀態 —— S04 的「哪一種失敗」那半
//
// 這一支量的是**共享資源狀態自己**（看板與面板都訂閱它，design D1）：讀取的時機、確認的次數、
// 晚到的淘汰。全部不需要 DOM —— 直接呼叫 store、直接讀 `getState`。
// 同一批 Scenario 的**畫面**那半在 `tests/resources-panel.test.tsx`（面板那一片）。
//
// ⚠️ **`listResources`／`getProject` 換掉，不連任何服務**（規格 Applicability 明文）。
// 換 operation 而不是起 HTTP server，是因為這裡的判準幾乎全是**請求次數與回應先後**：
// S05「恰好一次 `GET /api/projects/{id}`」、S06「各只送出一次」、S36 的交錯 —— 那在 mock 上直接讀得到。

const listResources = vi.hoisted(() => vi.fn())
const getProject = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/operations')>()),
  listResources,
  getProject,
}))

const P = '22222222-2222-4222-8222-222222222222'
const Q = '44444444-4444-4444-8444-444444444444'

let seq = 0
const resource = (label: string): ProjectResourceOut => ({
  id: `${(seq += 1).toString().padStart(8, '0')}-0000-4000-8000-000000000000`,
  project_id: P,
  label,
  type: 'github',
  url: 'https://github.com/guildhub/app',
  created_at: '2026-09-10T01:00:00Z',
})
const many = (n: number) => Array.from({ length: n }, (_, i) => resource(`第 ${i + 1} 筆`))
const project = (status: ProjectStatus): ProjectOut => ({
  id: P,
  owner_id: '11111111-1111-1111-1111-111111111111',
  title: '專案',
  body: '',
  needed_skills: [],
  status,
  room_template: null,
  seat_count: 4,
  expires_at: '2026-12-01T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
})
const http = (status: number) => new HttpError('listResources', status, null)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
/** 把 microtask 排乾（store 沒有 React，不需要 `act`）。 */
async function settle(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

const listCalls = () => listResources.mock.calls.length
const confirmCalls = () => getProject.mock.calls.length
const itemsOf = (state: ResourcesState) => ('items' in state ? state.items : null)

beforeEach(() => {
  seq = 0
  listResources.mockReset()
  getProject.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('讀取的時機是封閉的', () => {
  it('[FE-J14-S24] 看板掛載讀一次；第一次開啟面板共用那一次；之後每一次開啟都重讀', async () => {
    listResources.mockResolvedValue(many(2))
    const store = createResourcesStore()

    store.read(P) // 看板掛載
    await settle()
    expect(listCalls()).toBe(1)

    store.openRead(P) // 面板第一次開啟 —— 共用上面那一次
    await settle()
    expect(listCalls(), '第一次開啟多讀了一次 —— 該跟看板共用').toBe(1)

    store.openRead(P) // 第二次開啟
    await settle()
    expect(listCalls(), '第二次開啟沒有重讀 —— 那是唯一能發現結案的時機').toBe(2)

    store.openRead(P) // 第三次
    await settle()
    expect(listCalls()).toBe(3)
  })

  it('[FE-J14-S24] 沒有看板時，面板第一次開啟自己讀一次（不是靜默不讀）', async () => {
    listResources.mockResolvedValue(many(2))
    const store = createResourcesStore()

    store.openRead(P)
    await settle()

    expect(listCalls()).toBe(1)
    expect(itemsOf(store.getState(P))).toHaveLength(2)
  })

  it('[FE-J14-S24] 狀態以 project_id 隔離：一個專案的讀取不會變成另一個專案的狀態', async () => {
    // 防的是「一份沒有以 project_id 隔離的全域狀態」——那種實作在只有一個專案的判準裡全綠。
    listResources.mockImplementation((id: string) => Promise.resolve(id === P ? many(2) : many(5)))
    const store = createResourcesStore()

    store.read(P)
    store.read(Q)
    await settle()

    expect(itemsOf(store.getState(P))).toHaveLength(2)
    expect(itemsOf(store.getState(Q))).toHaveLength(5)
  })

  it('[FE-J14-S05] 沒有任何計時器：讀完之後推進 10 分鐘，一個請求都不送', async () => {
    vi.useFakeTimers()
    listResources.mockResolvedValue(many(2))
    const store = createResourcesStore()
    store.openRead(P)
    await settle()
    // 防恆真：先確認「真的讀過一次」—— 一個什麼都不做的實作也會讓下面兩行是 0。
    expect(listCalls(), '連第一次讀取都沒送出，下面兩行就恆真了').toBe(1)
    listResources.mockClear()
    getProject.mockClear()

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    expect(listCalls(), '自己去讀了 —— 那是輪詢').toBe(0)
    expect(confirmCalls(), '自己去確認專案狀態了 —— 那是輪詢').toBe(0)
  })
})

describe('結案與權限失敗：確認一次專案狀態', () => {
  it('[FE-J14-S06] 只有 403／409 走確認；500 與 401 直接照 kind 呈現、不確認', async () => {
    for (const [status, kind, confirms] of [
      [403, 'permission-denied', 1],
      [409, 'conflict', 1],
      [500, 'server-error', 0],
      [401, 'authentication-required', 0],
      [404, 'not-found', 0],
    ] as const) {
      listResources.mockReset()
      getProject.mockReset()
      listResources.mockRejectedValue(http(status))
      getProject.mockResolvedValue(project('active'))
      const store = createResourcesStore()

      store.read(P)
      await settle()

      const state = store.getState(P)
      expect(state.phase, `${status}：狀態不是 failed`).toBe('failed')
      expect(state.phase === 'failed' && state.error.kind, `${status}：kind 不對`).toBe(kind)
      expect(confirmCalls(), `${status}：確認的次數不是 ${confirms}`).toBe(confirms)
    }
  })

  it('[FE-J14-S06] 確認的五種結果：只有 closed 說已結案，其餘照規格各自呈現', async () => {
    for (const c of [
      { name: 'closed', confirm: () => Promise.resolve(project('closed')), phase: 'closed', kind: null },
      { name: 'active', confirm: () => Promise.resolve(project('active')), phase: 'failed', kind: 'permission-denied' },
      { name: 'recruiting', confirm: () => Promise.resolve(project('recruiting')), phase: 'failed', kind: 'permission-denied' },
      { name: '確認自己 500', confirm: () => Promise.reject(http(500)), phase: 'failed', kind: 'permission-denied' },
      { name: '確認回 401', confirm: () => Promise.reject(http(401)), phase: 'failed', kind: 'authentication-required' },
      { name: '確認回 404', confirm: () => Promise.reject(http(404)), phase: 'failed', kind: 'not-found' },
    ] as const) {
      listResources.mockReset()
      getProject.mockReset()
      listResources.mockRejectedValue(http(403))
      getProject.mockImplementation(c.confirm)
      const store = createResourcesStore()

      store.read(P)
      await settle()

      const state = store.getState(P)
      expect(state.phase, `${c.name}：狀態不對`).toBe(c.phase)
      if (c.kind !== null) expect(state.phase === 'failed' && state.error.kind, `${c.name}：kind 不對`).toBe(c.kind)
      expect(confirmCalls(), `${c.name}：確認的次數不是一次`).toBe(1)
    }
  })

  it('[FE-J14-S05] 每一次失敗各確認一次：先前確認到的 active 不得被快取起來當成下一次的答案', async () => {
    // 快取的話結案**永遠**發現不了 —— 那正是這條 Requirement 要解的問題。
    listResources.mockRejectedValue(http(403))
    getProject.mockResolvedValueOnce(project('active')).mockResolvedValueOnce(project('closed'))
    const store = createResourcesStore()

    store.openRead(P)
    await settle()
    expect(store.getState(P).phase).toBe('failed')
    expect(confirmCalls()).toBe(1)

    store.openRead(P) // 第二次開啟 → 第二次失敗
    await settle()

    expect(confirmCalls(), '第二次失敗沒有再確認 —— 那是把 active 快取起來了').toBe(2)
    expect(store.getState(P).phase, '第二次確認是 closed，狀態卻不是已結案').toBe('closed')
  })

  it('[FE-J14-S05] 結案時留著最後一次讀到的清單（closed 專案的 owner 仍可讀）', async () => {
    listResources.mockResolvedValueOnce(many(2)).mockRejectedValueOnce(http(403))
    getProject.mockResolvedValue(project('closed'))
    const store = createResourcesStore()

    store.openRead(P)
    await settle()
    expect(itemsOf(store.getState(P))).toHaveLength(2)

    store.openRead(P)
    await settle()

    const state = store.getState(P)
    expect(state.phase).toBe('closed')
    // 要不要顯示是呼叫端的事（owner 留著、非 owner 不顯示）—— store 這一層不丟掉它。
    expect(itemsOf(state), '結案之後把已經讀到的清單丟掉了').toHaveLength(2)
  })
})

describe('晚到的回應不得覆蓋較新的結果', () => {
  // ⚠️ 下面兩條量的是**較新的那一個還在飛的時候**：舊的先回來就不准上畫面。
  // 「較新的已經套用之後才回來」是同一件事比較晚的一刻 —— 只驗那一刻的話，
  // 「比已套用的新就套用」這種守衛會全綠，而它會讓舊資料閃現在畫面上。
  it('[FE-J14-S36] 較新的讀取還在飛：較早發出的先回來也不上畫面', async () => {
    const r1 = deferred<ProjectResourceOut[]>()
    const r2 = deferred<ProjectResourceOut[]>()
    listResources.mockReturnValueOnce(r1.promise).mockReturnValueOnce(r2.promise)
    const store = createResourcesStore()

    store.openRead(P) // R1
    store.openRead(P) // R2 —— 還在飛
    await settle()
    expect(listCalls()).toBe(2)

    r1.resolve(many(2)) // 比較早發出、帶舊資料
    await settle()

    expect(store.getState(P).phase, '較新的讀取還沒回來，舊的就把畫面變成 ready 了').toBe('loading')

    r2.resolve(many(3))
    await settle()
    expect(itemsOf(store.getState(P))).toHaveLength(3)
  })

  it('[FE-J14-S36] 較新的狀態確認還在飛：較早發出的 active 先回來也不上畫面', async () => {
    const c1 = deferred<ProjectOut>()
    const c2 = deferred<ProjectOut>()
    listResources.mockRejectedValue(http(403))
    getProject.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise)
    const store = createResourcesStore()

    store.openRead(P) // 失敗一 → C1
    await settle()
    store.openRead(P) // 失敗二 → C2，還在飛
    await settle()
    expect(confirmCalls()).toBe(2)

    c1.resolve(project('active')) // 比較早發出
    await settle()

    expect(store.getState(P).phase, '較新的確認還沒回來，舊的就把畫面變成 failed 了').toBe('loading')

    c2.resolve(project('closed'))
    await settle()
    expect(store.getState(P).phase).toBe('closed')
  })

  it('[FE-J14-S36] 較新的讀取還在飛：較早發出的那一次**失敗**也不上畫面、也不去確認狀態', async () => {
    // 成功與失敗是兩條路徑，各有各的守衛。只驗成功那條的話，「舊的讀取失敗了」仍然會
    // 蓋掉 loading——403 的話還會多送一次 `GET /api/projects/{id}`（S05 數的就是那個次數）。
    let reject1!: (cause: unknown) => void
    const pending1 = new Promise<ProjectResourceOut[]>((_, rej) => {
      reject1 = rej
    })
    listResources.mockReturnValueOnce(pending1).mockReturnValueOnce(deferred<ProjectResourceOut[]>().promise)
    const store = createResourcesStore()

    store.openRead(P) // R1
    store.openRead(P) // R2 —— 還在飛
    await settle()

    reject1(http(403)) // 比較早發出、失敗了
    await settle()

    expect(store.getState(P).phase, '較新的讀取還沒回來，舊的失敗就把畫面變成 failed 了').toBe('loading')
    expect(confirmCalls(), '為一個已經過期的失敗去確認專案狀態').toBe(0)
  })

  it('[FE-J14-S36] 較早發出、較晚回來的資源讀取被丟棄', async () => {
    const r1 = deferred<ProjectResourceOut[]>()
    const r2 = deferred<ProjectResourceOut[]>()
    listResources.mockReturnValueOnce(r1.promise).mockReturnValueOnce(r2.promise)
    const store = createResourcesStore()

    store.openRead(P) // R1
    store.openRead(P) // R2（第二次開啟會重讀）
    await settle()
    expect(listCalls()).toBe(2)

    r2.resolve(many(3))
    await settle()
    expect(itemsOf(store.getState(P))).toHaveLength(3)

    r1.resolve(many(2)) // 比較早發出、帶舊資料
    await settle()

    expect(itemsOf(store.getState(P)), '晚到的舊讀取蓋掉了較新的結果').toHaveLength(3)
  })

  it('[FE-J14-S36] 晚到的 active 確認不得把已經呈現的「已結案」改回去', async () => {
    const c1 = deferred<ProjectOut>()
    const c2 = deferred<ProjectOut>()
    listResources.mockRejectedValue(http(403))
    getProject.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise)
    const store = createResourcesStore()

    store.openRead(P) // 失敗一 → C1
    await settle()
    store.openRead(P) // 失敗二 → C2
    await settle()
    expect(confirmCalls()).toBe(2)

    c2.resolve(project('closed'))
    await settle()
    expect(store.getState(P).phase).toBe('closed')

    c1.resolve(project('active')) // 比較早發出、說專案還活著
    await settle()

    expect(store.getState(P).phase, '晚到的 active 把「已結案」改回去了').toBe('closed')
  })
})
