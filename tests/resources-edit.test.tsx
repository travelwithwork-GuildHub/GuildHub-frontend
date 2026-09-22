import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act, useEffect } from 'react'
import { HttpError } from '@/api/transport'
import type { ProjectOut, ProjectResourceOut, ProjectStatus, ResourceType } from '@/api/contract/rest'
import { IdentityProvider, useIdentity } from '@/identity/IdentityProvider'
import { ResourcesPanel } from '@/resources/ResourcesPanel'
import { ResourcesProvider, useResourcesPanel } from '@/resources/ResourcesProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'

// 規格：openspec/changes/fe-j14-project-resources/specs/project-resources/spec.md
//   Requirement: 修改：只送改了的欄位，位置不變 —— S17、S18、S19
//   Requirement: 結案與權限失敗⋯⋯（寫入那一半） —— S07、S08
//   Requirement: 寫入控制項只給寫入者；隱藏不是權限邊界 —— 最後一句（寫入 403 ＋ 專案仍 active）
// design：D1（不樂觀更新）、D2（403／409 之後確認一次專案狀態）、D8（只送改過的欄位）
//
// 這一支是第 7 片後半的**前一半**（`--edit`）。**`D2` 的那一次確認整條在這裡** ——
// 新增、修改、刪除共用同一條路徑，所以 `S07`／`S08` 與寫入 403 那條也一起在這一支。
// 另一半 `--delete` 補：刪除與確認層（`S20`、`S35` 的確認層那段）、上限（`S16`）、
// `S07` 的「對某一列按刪除」那個起點、`S08` 最後一句「重讀之後滿了就不能再新增」。
//
// ⚠️ **資料層的 operation 全部換掉，不連任何服務**（規格 Applicability 明文）。
// ⚠️ **`FE-X03` 的句子逐字抄在 `COPY`，不 `import { VOCABULARY }`** —— 期望值跟實作同源的話，
//    文案改錯時期望值會跟著錯，那條斷言就恆真了。

const listResources = vi.hoisted(() => vi.fn())
const getProject = vi.hoisted(() => vi.fn())
const getMyProfile = vi.hoisted(() => vi.fn())
const createResource = vi.hoisted(() => vi.fn())
const updateResource = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/operations')>()),
  listResources,
  getProject,
  getMyProfile,
  createResource,
  updateResource,
}))

/** `FE-X03` 語彙表裡用到的四句，**逐字抄在這裡**（見檔頭）。 */
const COPY = {
  conflict: '這件事跟目前的狀態衝突了，重新整理之後再試一次。',
  'permission-denied': '你沒有權限做這件事。',
  'not-found': '找不到這個東西 —— 它可能已經被移除了。',
  'authentication-required': '這裡要有身分才看得到 —— 先取個名字加入。',
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
/** A、B、C 三筆（`S17`／`S18`／`S19` 都以 B 為對象，**位置不變**是中間那一筆才量得到）。 */
const three = () => {
  const a = resource('A 原始碼', 'github', 'https://github.com/guildhub/a')
  const b = resource('B 設計稿', 'figma', 'https://www.figma.com/file/b')
  const c = resource('C 筆記', 'notion', 'https://notion.example.com/c')
  return { a, b, c, items: [a, b, c] }
}
/** 第 `i` 個 —— 不在就當場講清楚是哪一個不在（`noUncheckedIndexedAccess`）。 */
function nth<T>(list: readonly T[], i: number, what: string): T {
  const found = list[i]
  if (found === undefined) throw new Error(`找不到第 ${i} 個${what}（只有 ${list.length} 個）`)
  return found
}
const two = () => [resource('原始碼', 'github', 'https://github.com/guildhub/app'), resource('每週同步', 'meeting', 'https://meet.example.com/abc')]
const http = (status: number) => new HttpError('writeResource', status, null)

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

const rows = () => screen.queryAllByTestId('resource-row')
const labels = () => screen.queryAllByTestId('resource-label').map((el) => el.textContent)
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const form = () => screen.queryByTestId('resource-form')
const editButtons = () => screen.queryAllByTestId('resource-edit')
const submitButton = () => screen.getByTestId('resource-form').querySelector('button[type="submit"]') as HTMLButtonElement

async function type(label: string, value: string) {
  const el = field(label)
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () => {
    submitButton().form?.requestSubmit()
  })
  await flush()
}

/** 登入的是誰、專案長什麼樣 —— 開好面板、等清單到位。 */
async function openPanelAs(me: string, proj: ProjectOut) {
  getMyProfile.mockResolvedValue(profile(me))
  const button = renderTree(proj)
  await waitFor(() => expect(button.dataset.identity).toBe('signed-in'))
  click(button)
  return button
}
/** 開面板 → 等清單 → 按第 `index` 列的「修改」→ 等表單。 */
async function openEdit(items: ProjectResourceOut[], index: number, proj = project('active')) {
  listResources.mockResolvedValue(items)
  await openPanelAs(OWNER, proj)
  await waitFor(() => expect(rows()).toHaveLength(items.length))
  click(nth(editButtons(), index, '「修改」鈕'))
  await flush()
  expect(form(), '按了「修改」卻沒有開出表單').not.toBeNull()
}
/** 開面板 → 按「新增」→ 填一組合法值。`S07`／`S08`／403 那三條的共同起點。 */
async function openCreateFilled(items: ProjectResourceOut[], proj = project('active')) {
  listResources.mockResolvedValue(items)
  await openPanelAs(OWNER, proj)
  await waitFor(() => expect(rows()).toHaveLength(items.length))
  click(screen.getByTestId('resource-create'))
  await flush()
  await type('名稱', ' 設計稿 ')
  await type('類型', 'figma')
  await type('網址', 'HTTPS://www.figma.com/file/abc')
}

beforeAll(async () => {
  await import('@/resources/OpenResourcesPanel')
})
beforeEach(() => {
  seq = 0
  listResources.mockReset()
  getProject.mockReset()
  getMyProfile.mockReset()
  createResource.mockReset()
  updateResource.mockReset()
})
afterEach(cleanup)

describe('修改：只送改了的欄位，位置不變', () => {
  it('[FE-J14-S17] 只改網址：恰好一次 PATCH、body 的鍵集合恰好是 {"url"}、B 的位置不變', async () => {
    const { a, b: B, c, items } = three()
    await openEdit(items, 1)

    // 初始值是那一筆目前的值 —— 不是空表單（沒有這一段，下面的「只改 url」就不成立）
    expect(field('名稱').value, '修改表單沒有帶入那一筆目前的名稱').toBe(B.label)
    expect(field('類型').value).toBe(B.type)
    expect(field('網址').value).toBe(B.url)

    const nextUrl = 'https://www.figma.com/file/b2'
    updateResource.mockResolvedValue({ ...B, url: nextUrl })
    await type('網址', nextUrl)
    await submit()

    expect(updateResource.mock.calls, '修改只該送一次 PATCH').toHaveLength(1)
    const [projectId, resourceId, body] = nth(updateResource.mock.calls, 0, 'PATCH 呼叫')
    expect(projectId).toBe(PID)
    expect(resourceId, 'PATCH 的對象不是 B').toBe(B.id)
    // ⚠️ 逐鍵比對**鍵集合**，不是只看 `body.url` —— 只看 url 的話「整份表單都送出去」照樣綠
    expect(Object.keys(body as object).sort(), '沒改的欄位也被送出去了（會蓋掉別人在這期間改的欄位）').toEqual(['url'])
    expect((body as { url: string }).url).toBe(nextUrl)

    expect(labels(), '修改之後那一列換了位置').toEqual([a.label, B.label, c.label])
    expect(screen.getByText(nextUrl), 'B 那列沒有換成新網址').toBeTruthy()
    expect(form(), '成功之後修改表單還開著').toBeNull()
  })

  it('[FE-J14-S18] 沒改任何東西就按送出：一個請求都不送，修改結束', async () => {
    const { items } = three()
    await openEdit(items, 1)
    await submit()

    expect(updateResource.mock.calls, '沒改任何欄位卻送了 PATCH').toHaveLength(0)
    expect(form(), '沒改就送出之後，修改狀態沒有結束').toBeNull()
    expect(rows()).toHaveLength(3)
  })

  it('[FE-J14-S19] PATCH 回 404：說出那一句、恰好再讀一次清單，重讀沒有 B 時清單就沒有 B', async () => {
    const { a, b: B, c, items } = three()
    await openEdit(items, 1)
    updateResource.mockRejectedValue(http(404))
    listResources.mockClear()
    listResources.mockResolvedValue([a, c])
    await type('網址', 'https://www.figma.com/file/b2')
    await submit()

    expect(screen.getByTestId('submit-error').textContent, '沒有把 404 那一句原封端出來').toBe(COPY['not-found'])
    expect(listResources.mock.calls, '404 要恰好再讀一次清單').toHaveLength(1)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(labels(), '重讀回來沒有 B，清單裡卻還有 B').not.toContain(B.label)
    // 404 不是 403／409：**不走** D2 的那一次確認
    expect(getProject.mock.calls, '404 也跑去確認專案狀態了（D2 只對 403／409）').toHaveLength(0)
  })
})

describe('結案與權限失敗：寫入的那一次確認（D2）', () => {
  it('[FE-J14-S07] 新增拿到 409、確認是 closed：說已結案、收掉表單與三種寫入控制、清單留著、不自動重送', async () => {
    createResource.mockRejectedValue(http(409))
    getProject.mockResolvedValue(project('closed'))
    await openCreateFilled(two())
    await submit()

    expect(screen.queryByTestId('resources-closed'), '確認是 closed 卻沒說已結案').not.toBeNull()
    expect(form(), '已結案還留著表單').toBeNull()
    expect(screen.queryByTestId('resource-create'), '已結案還留著新增控制').toBeNull()
    expect(editButtons(), '已結案還留著修改控制').toHaveLength(0)
    expect(screen.queryAllByTestId('resource-delete'), '已結案還留著刪除控制').toHaveLength(0)
    expect(rows(), '結案之後把已經讀到的清單丟掉了').toHaveLength(2)
    expect(getProject.mock.calls, '一次失敗要恰好確認一次').toHaveLength(1)
    await flush()
    expect(createResource.mock.calls, '自動重送了').toHaveLength(1)
  })

  it('[FE-J14-S07] PATCH 回 409 與 403 都走同一條確認路徑（成對：只驗新增的話，修改沒接上確認仍然全綠）', async () => {
    for (const status of [409, 403]) {
      const { items } = three()
      await openEdit(items, 1)
      updateResource.mockRejectedValue(http(status))
      getProject.mockResolvedValue(project('closed'))
      await type('網址', 'https://www.figma.com/file/b2')
      await submit()

      expect(getProject.mock.calls, `PATCH 回 ${status} 沒有確認專案狀態`).toHaveLength(1)
      expect(screen.queryByTestId('resources-closed'), `PATCH 回 ${status}、確認是 closed，卻沒說已結案`).not.toBeNull()
      expect(form(), '已結案還留著修改表單').toBeNull()
      expect(editButtons(), '已結案還留著修改控制').toHaveLength(0)
      expect(rows(), '結案之後把已經讀到的清單丟掉了').toHaveLength(3)

      cleanup()
      listResources.mockReset()
      getProject.mockReset()
      getMyProfile.mockReset()
      updateResource.mockReset()
      seq = 0
    }
  })

  it('[FE-J14-S08] 新增拿到 409、專案仍是 active：衝突那一句、值留著、表單留著、恰好重讀一次', async () => {
    const items = two()
    createResource.mockRejectedValue(http(409))
    getProject.mockResolvedValue(project('active'))
    await openCreateFilled(items)
    listResources.mockClear()
    listResources.mockResolvedValue([...items, resource('別處新增的', 'drive', 'https://drive.example.com/x')])
    await submit()

    expect(screen.queryByTestId('resources-closed'), '專案還活著，卻說已結案').toBeNull()
    expect(form(), '衝突之後表單不該關掉').not.toBeNull()
    expect(field('名稱').value, '失敗要保留輸入').toBe(' 設計稿 ')
    expect(field('網址').value).toBe('HTTPS://www.figma.com/file/abc')
    const alert = screen.getByTestId('submit-error')
    expect(alert.textContent, '沒有把「衝突」那一句原封端出來').toBe(COPY.conflict)
    // alert 在送出鈕**上方**（DOM 順序）
    expect(alert.compareDocumentPosition(submitButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(listResources.mock.calls, '409＋active 要恰好再讀一次清單').toHaveLength(1)
    await waitFor(() => expect(rows()).toHaveLength(3))
  })

  it('寫入拿到 403、確認是 active：「沒有權限」那一句在表單上，三種寫入控制項全部收掉（表單不收）', async () => {
    createResource.mockRejectedValue(http(403))
    getProject.mockResolvedValue(project('active'))
    await openCreateFilled(two())
    await submit()

    expect(screen.getByTestId('submit-error').textContent, '沒有把「沒有權限」那一句放在表單上').toBe(COPY['permission-denied'])
    expect(form(), '「沒有權限」要呈現在表單上 —— 連表單一起收掉的話沒有人告訴使用者為什麼').not.toBeNull()
    expect(screen.queryByTestId('resources-closed'), '確認是 active，不該說已結案').toBeNull()
    expect(
      [...screen.queryAllByTestId('resource-create'), ...editButtons(), ...screen.queryAllByTestId('resource-delete')],
      '伺服器說沒有權限，寫入控制項卻還在 DOM 裡',
    ).toHaveLength(0)
    expect(getProject.mock.calls).toHaveLength(1)
  })

  it('確認本身的分支是封閉的：recruiting／401／404／500 各自的呈現，一次失敗都只確認一次', async () => {
    const cases: readonly { readonly name: string; readonly confirm: () => unknown; readonly expected: string }[] = [
      { name: 'recruiting（不是 closed 就不說已結案）', confirm: () => Promise.resolve(project('recruiting')), expected: COPY.conflict },
      { name: '確認回 401（登入失效比原本那個碼更接近事實）', confirm: () => Promise.reject(http(401)), expected: COPY['authentication-required'] },
      { name: '確認回 404（專案不見了）', confirm: () => Promise.reject(http(404)), expected: COPY['not-found'] },
      { name: '確認回 500（退回原本那個 409，不猜是結案）', confirm: () => Promise.reject(http(500)), expected: COPY.conflict },
    ]
    for (const { name, confirm, expected } of cases) {
      createResource.mockRejectedValue(http(409))
      getProject.mockImplementation(confirm)
      await openCreateFilled(two())
      await submit()

      expect(screen.getByTestId('submit-error').textContent, `${name}：呈現的不是該說的那一句`).toBe(expected)
      expect(screen.queryByTestId('resources-closed'), `${name}：專案不是 closed，卻說已結案`).toBeNull()
      expect(getProject.mock.calls, `${name}：一次失敗要恰好確認一次`).toHaveLength(1)

      cleanup()
      listResources.mockReset()
      getProject.mockReset()
      getMyProfile.mockReset()
      createResource.mockReset()
      seq = 0
    }
  })
})
