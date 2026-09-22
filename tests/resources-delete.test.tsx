import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { HttpError } from '@/api/transport'
import type { ProjectOut, ProjectResourceOut, ProjectStatus, ResourceType } from '@/api/contract/rest'
import { IdentityProvider, useIdentity } from '@/identity/IdentityProvider'
import { ResourcesPanel } from '@/resources/ResourcesPanel'
import { ResourcesProvider, useResourcesPanel } from '@/resources/ResourcesProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'

// 規格：openspec/changes/fe-j14-project-resources/specs/project-resources/spec.md
//   Requirement: 刪除要確認；取消不送、確認送一次 —— S20
//   Requirement: 上限：已有 50 筆時新增不可用，並說得出為什麼 —— S16
//   Requirement: 結案與權限失敗⋯⋯ —— S07 的「對某一列按刪除」那個起點
//   Requirement: 新增⋯⋯（S08 最後一句：重讀之後滿了就不能再新增）
// openspec/changes/fe-j14-project-resources/specs/output-safety/spec.md
//   Requirement: ⋯⋯只是文字 —— S35 的確認層那一段
// design：D1（不樂觀更新）、D2（403／409 之後確認一次專案狀態）、D9（上限住在 `LIMITS`）
//
// 這一支是第 7 片後半的**後一半**（`--delete`）。`D2` 的確認本身在 `--edit` 那一支驗過整條，
// 這裡只驗「刪除也走同一條」那個起點（規格明文：確認流程不分是哪一個寫入動作）。
//
// ⚠️ **資料層的 operation 全部換掉，不連任何服務**（規格 Applicability 明文）。
// ⚠️ **`FE-X03` 的句子與上限那一句逐字抄在這裡，不 import 實作的常數** —— 期望值跟實作同源的話，
//    文案改錯時期望值會跟著錯，那條斷言就恆真了。

const listResources = vi.hoisted(() => vi.fn())
const getProject = vi.hoisted(() => vi.fn())
const getMyProfile = vi.hoisted(() => vi.fn())
const createResource = vi.hoisted(() => vi.fn())
const deleteResource = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/operations')>()),
  listResources,
  getProject,
  getMyProfile,
  createResource,
  deleteResource,
}))

/** 每個測試自己調的上限（`S16` 最後一段：元件裡寫死 50 的話那一段紅）。預設值 ＝ 契約現在的值。 */
const limit = vi.hoisted(() => ({ perProject: 50 }))
vi.mock('@/api/contract/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/contract/limits')>()
  const LIMITS = { ...actual.LIMITS }
  Object.defineProperty(LIMITS, 'resourcesPerProject', { get: () => ({ min: 0, max: limit.perProject }), enumerable: true })
  return { ...actual, LIMITS }
})

/** 逐字抄（見檔頭）。 */
const COPY = {
  conflict: '這件事跟目前的狀態衝突了，重新整理之後再試一次。',
  closed: '這個專案已經結案，資源不能再修改。',
  limitReached: (max: number) => `這個專案的資源已經有 ${max} 筆，到上限了 —— 要新增的話先刪掉一筆。`,
} as const

const PID = '22222222-2222-4222-8222-222222222222'
const OWNER = '11111111-1111-1111-1111-111111111111'

const profile = (id: string) => ({ id, display_name: '人', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' })
const project = (status: ProjectStatus, ownerId = OWNER): ProjectOut => ({
  id: PID,
  owner_id: ownerId,
  title: '專案',
  body: '',
  needed_skills: [],
  status,
  room_template: null,
  seat_count: 4,
  expires_at: '2026-12-01T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
})
let seq = 0
const resource = (label: string, type: ResourceType, url: string): ProjectResourceOut => ({
  id: `${(seq += 1).toString().padStart(8, '0')}-0000-4000-8000-000000000000`,
  project_id: PID,
  label,
  type,
  url,
  created_at: `2026-09-10T0${seq % 10}:00:00Z`,
})
/** A、B、C 三筆 —— **刪的是 B**：頭尾那一筆被刪掉時「剩下的順序對不對」量不出來。 */
const three = () => {
  const a = resource('A 原始碼', 'github', 'https://github.com/guildhub/a')
  const b = resource('B 設計稿', 'figma', 'https://www.figma.com/file/b')
  const c = resource('C 筆記', 'notion', 'https://notion.example.com/c')
  return { a, b, c, items: [a, b, c] }
}
const many = (n: number) => Array.from({ length: n }, (_, i) => resource(`資源 ${i + 1}`, 'github', `https://github.com/guildhub/r${i + 1}`))
/** 第 `i` 個 —— 不在就當場講清楚是哪一個不在（`noUncheckedIndexedAccess`）。 */
function nth<T>(list: readonly T[], i: number, what: string): T {
  const found = list[i]
  if (found === undefined) throw new Error(`找不到第 ${i} 個${what}（只有 ${list.length} 個）`)
  return found
}
const http = (status: number) => new HttpError('deleteResource', status, null)
/** 卡在路上的請求 —— 連按的 guard 只有在「還沒回來」的時候量得到。 */
function pending<T>() {
  let settle!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/** 把 microtask 排乾再**同步**斷言：等一個應該出現的元素會紅成 `Test timed out`，看不出原因。 */
async function flush(times = 12) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })
}

function OpenButton({ projectId }: { projectId: string }) {
  const { openPanel } = useResourcesPanel()
  const identity = useIdentity()
  return (
    <button type="button" data-testid="open-resources" data-identity={identity.state} onClick={(e) => openPanel(projectId, e.currentTarget)}>
      開資源
    </button>
  )
}

function renderTree(proj: ProjectOut) {
  render(
    <IdentityProvider>
      <InteractionProvider>
        <ResourcesProvider>
          <OpenButton projectId={proj.id} />
          <ResourcesPanel projectId={proj.id} project={proj} />
        </ResourcesProvider>
      </InteractionProvider>
    </IdentityProvider>,
  )
  return screen.getByTestId('open-resources')
}

const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })

const rows = () => screen.queryAllByTestId('resource-row')
/** 只取**清單那些列**的名稱 —— 確認層裡那一個也叫 `resource-label`（`S35` 要求）。 */
const rowLabels = () => rows().map((row) => within(row).getByTestId('resource-label').textContent)
const deleteButtons = () => screen.queryAllByTestId('resource-delete')
const confirm = () => screen.queryByTestId('resource-delete-confirm')
const createButton = () => screen.getByTestId('resource-create') as HTMLButtonElement
const confirmYes = () => within(screen.getByTestId('resource-delete-confirm')).getByTestId('resource-delete-confirm-yes')
const confirmNo = () => within(screen.getByTestId('resource-delete-confirm')).getByTestId('resource-delete-confirm-no')

/** 新增鈕的可及描述 —— `aria-describedby` 指到的那些節點的文字。 */
function createDescription() {
  const ids = createButton().getAttribute('aria-describedby')
  if (ids === null) return null
  return ids
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

/** 登入的是誰、專案長什麼樣 —— 開好面板、等清單到位。 */
async function openPanelAs(me: string, proj: ProjectOut) {
  getMyProfile.mockResolvedValue(profile(me))
  const button = renderTree(proj)
  await waitFor(() => expect(button.dataset.identity).toBe('signed-in'))
  click(button)
  return button
}
/** 開面板 → 等清單 → 按第 `index` 列的「刪除」→ 等確認層。 */
async function openDelete(items: ProjectResourceOut[], index: number, proj = project('active')) {
  listResources.mockResolvedValue(items)
  await openPanelAs(OWNER, proj)
  await waitFor(() => expect(rows()).toHaveLength(items.length))
  click(nth(deleteButtons(), index, '「刪除」鈕'))
  await flush()
  expect(confirm(), '按了「刪除」卻沒有開出確認層').not.toBeNull()
}

beforeEach(() => {
  limit.perProject = 50
  vi.clearAllMocks()
  getProject.mockResolvedValue(project('active'))
})
afterEach(cleanup)

describe('刪除要確認；取消不送、確認送一次', () => {
  it('[FE-J14-S20] 取消不送、確認只送一次、回 204 就移除那一列', async () => {
    const { b, items } = three()
    await openDelete(items, 1)

    // 確認層要讓人認得出刪的是哪一筆
    expect(within(screen.getByTestId('resource-delete-confirm')).getByTestId('resource-label').textContent).toBe(b.label)

    click(confirmNo())
    await flush()
    expect(confirm(), '取消之後確認層還在').toBeNull()
    expect(deleteResource, '取消卻送出了 DELETE').not.toHaveBeenCalled()
    expect(rowLabels()).toEqual([items[0]?.label, b.label, items[2]?.label])

    // 再按一次刪除，在確認層**連按兩次**確認（請求還沒回來）
    click(nth(deleteButtons(), 1, '「刪除」鈕'))
    await flush()
    const inFlight = pending<void>()
    deleteResource.mockReturnValue(inFlight.promise)
    // **同一個批次裡連按兩下** —— 分兩個 act 的話 state 已經重繪過，用 state 當 guard 也會綠
    const yes = confirmYes()
    await act(async () => {
      yes.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      yes.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()
    expect(deleteResource, '連按兩次確認送出了不只一次 DELETE').toHaveBeenCalledTimes(1)
    expect(deleteResource).toHaveBeenCalledWith(PID, b.id)

    await act(async () => {
      inFlight.settle()
    })
    await flush()
    expect(rowLabels(), '刪掉的那一列還在，或順序被動過').toEqual(['A 原始碼', 'C 筆記'])
    expect(confirm(), '成功之後確認層還在').toBeNull()
    expect(listResources, '刪除成功不在重讀的封閉列舉裡').toHaveBeenCalledTimes(1)
  })

  it('[FE-J14-S20] Escape 等同取消：一個請求都不送，那一列還在', async () => {
    const { b, items } = three()
    await openDelete(items, 1)
    escape()
    await flush()
    expect(confirm(), 'Escape 沒有關掉確認層').toBeNull()
    expect(deleteResource, 'Escape 卻送出了 DELETE').not.toHaveBeenCalled()
    expect(rowLabels()).toContain(b.label)
  })

  it('刪除回 404：那一列照樣移除（東西已經不在了），而且恰好再讀一次清單', async () => {
    const { a, c, items } = three()
    await openDelete(items, 1)
    deleteResource.mockRejectedValue(http(404))
    listResources.mockResolvedValue([a, c])
    click(confirmYes())
    await flush()

    expect(rowLabels(), '404 之後那一列還在').toEqual(['A 原始碼', 'C 筆記'])
    expect(listResources, '刪除的 404 要恰好再讀一次清單').toHaveBeenCalledTimes(2)
    expect(getProject, '404 不是 403／409，不該去確認專案狀態').not.toHaveBeenCalled()
    // ⚠️ 規格對刪除的 404 **只說**「同樣從清單移除、重新讀取清單一次」，沒有指名任何訊息 ——
    // 這裡不驗訊息：多驗一句就是替規格加一條它沒寫的要求（那一列消失本身就是回饋）。
    expect(confirm(), '404 之後確認層還在').toBeNull()
  })
})

describe('結案與權限失敗：刪除也走同一條確認', () => {
  it('[FE-J14-S07] DELETE 回 409、確認出來是 closed：說已結案、收掉三種寫入控制、清單留著', async () => {
    const { items } = three()
    await openDelete(items, 1)
    deleteResource.mockRejectedValue(http(409))
    getProject.mockResolvedValue(project('closed'))
    click(confirmYes())
    await flush()

    expect(getProject, '刪除的 409 要確認一次專案狀態（D2）').toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('resources-closed').textContent).toBe(COPY.closed)
    expect(screen.queryByTestId('resource-create'), '結案了新增鈕還在').toBeNull()
    expect(deleteButtons(), '結案了刪除鈕還在').toHaveLength(0)
    expect(screen.queryAllByTestId('resource-edit'), '結案了修改鈕還在').toHaveLength(0)
    expect(confirm(), '結案了確認層還在').toBeNull()
    expect(rowLabels(), '結案不該把已經讀到的清單收掉').toEqual(['A 原始碼', 'B 設計稿', 'C 筆記'])
    expect(deleteResource, '自動重送了 DELETE').toHaveBeenCalledTimes(1)
  })
})

describe('上限：已有 50 筆時新增不可用，並說得出為什麼', () => {
  it('[FE-J14-S16] 50 筆：不能新增、說得出為什麼；刪一筆（204）就恢復', async () => {
    const items = many(50)
    listResources.mockResolvedValue(items)
    await openPanelAs(OWNER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(50))

    expect(createButton().disabled, '滿了新增鈕卻按得下去').toBe(true)
    expect(createDescription(), '滿了卻說不出為什麼').toBe(COPY.limitReached(50))
    click(createButton())
    await flush()
    expect(screen.queryByTestId('resource-form'), '滿了卻開出了新增表單').toBeNull()
    expect(createResource, '滿了卻送出了 POST').not.toHaveBeenCalled()

    // 刪一筆就恢復
    click(nth(deleteButtons(), 0, '「刪除」鈕'))
    await flush()
    deleteResource.mockResolvedValue(undefined)
    click(confirmYes())
    await flush()

    expect(rows()).toHaveLength(49)
    expect(createButton().disabled, '刪了一筆新增還是按不下去').toBe(false)
    expect(createButton().getAttribute('aria-describedby'), '沒滿卻還指著上限那一句').toBeNull()
  })

  it('[FE-J14-S16] 上限換成 3：3 筆就不能新增、2 筆可以 —— 元件裡寫死 50 的話這一段紅', async () => {
    limit.perProject = 3
    listResources.mockResolvedValue(many(3))
    await openPanelAs(OWNER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(createButton().disabled, '上限是 3、已經 3 筆了，新增鈕卻按得下去').toBe(true)
    expect(createDescription()).toBe(COPY.limitReached(3))
    cleanup()

    listResources.mockResolvedValue(many(2))
    await openPanelAs(OWNER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(createButton().disabled, '上限是 3、只有 2 筆，新增鈕卻按不下去').toBe(false)
  })

  it('[FE-J14-S08] 新增 409 ＋ 專案仍 active：重讀之後滿了，新增就變成不可用', async () => {
    const items = many(49)
    listResources.mockResolvedValue(items)
    await openPanelAs(OWNER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(49))
    click(createButton())
    await flush()
    const el = screen.getByLabelText('名稱') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, '設計稿')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const type = screen.getByLabelText('類型') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(type, 'figma')
      type.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const url = screen.getByLabelText('網址') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(url, 'https://www.figma.com/file/abc')
      url.dispatchEvent(new Event('input', { bubbles: true }))
    })

    createResource.mockRejectedValue(http(409))
    listResources.mockResolvedValue(many(50))
    await act(async () => {
      ;(screen.getByTestId('resource-form').querySelector('button[type="submit"]') as HTMLButtonElement).form?.requestSubmit()
    })
    await flush()

    expect(document.body.textContent, '409 ＋ active 該說「衝突」').toContain(COPY.conflict)
    expect(rows(), '409 ＋ active 要重讀一次清單').toHaveLength(50)
    expect(createButton().disabled, '重讀之後滿了，新增鈕卻還按得下去').toBe(true)
    expect(createDescription()).toBe(COPY.limitReached(50))
  })
})

describe('渲染端不信任輸入：確認層也只是文字', () => {
  it('[FE-J14-S35] 確認層的資源名稱是純文字，沒有子元素、沒有 img／b／javascript: 連結', async () => {
    const nasty = '<img src=x onerror=alert(1)><b>r</b>'
    const item = resource(nasty, 'github', 'javascript:alert(2)')
    await openDelete([item], 0)

    const layer = screen.getByTestId('resource-delete-confirm')
    const label = within(layer).getByTestId('resource-label')
    expect(label.textContent, '確認層的名稱不是原字串').toBe(nasty)
    expect(label.children, '確認層的名稱長出了子元素').toHaveLength(0)
    expect(layer.querySelectorAll('img, b, a[href^="javascript"]'), '確認層裡出現了可執行的元素').toHaveLength(0)
  })
})
