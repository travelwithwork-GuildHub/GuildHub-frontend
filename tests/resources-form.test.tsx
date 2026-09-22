import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act, useEffect, type RefObject } from 'react'
import type { ProjectOut, ProjectResourceOut, ProjectStatus, ResourceType } from '@/api/contract/rest'
import { IdentityProvider, useIdentity } from '@/identity/IdentityProvider'
import { ResourcesPanel } from '@/resources/ResourcesPanel'
import { ResourcesProvider, useResourcesPanel } from '@/resources/ResourcesProvider'
import { useBlockingPanels } from '@/panel/BlockingPanelCoordinator'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'

// 規格：openspec/changes/fe-j14-project-resources/specs/project-resources/spec.md
//   Requirement: 新增：送出前擋下伺服器一定會拒絕的輸入，只送原字串 —— S11、S12、S13、S14、S15
//   Requirement: 鍵盤：面板持有世界命令鎖，Escape 每次只關最上層 —— S21 的**表單**那半（第 6 片延後的那半）
//   Requirement: 讀取的時機是封閉的；晚到的回應不得覆蓋較新的結果 —— S36 的**寫入**那半（第 6 片延後的那半）
//
// 這一支是第 7 片的**前半**（`--form`，新增表單本身）。後半 `--edit-delete` 補：修改（S17～S19）、
// 刪除與刪除確認層（S20、S35 的確認層那段）、上限（S16）、寫入失敗的那一次專案狀態確認（S07、S08）。
//
// ⚠️ **資料層的 operation 換掉，不連任何服務**（規格 Applicability 明文）。
// ⚠️ **`LIMITS` 是可變的假物件**：`S12` 要證明「數字不是寫死的」，同一支檔案裡要換兩次值 ——
//    所以產品碼必須在**渲染時**讀 `LIMITS`，不是在模組載入時把數字烤進 schema。

const listResources = vi.hoisted(() => vi.fn())
const getMyProfile = vi.hoisted(() => vi.fn())
const createResource = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/operations')>()),
  listResources,
  getMyProfile,
  createResource,
}))

/** 每個測試自己調的上限。預設值 = 契約現在的值。 */
const limit = vi.hoisted(() => ({ label: 100, url: 2048 }))
vi.mock('@/api/contract/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/contract/limits')>()
  const LIMITS = { ...actual.LIMITS }
  Object.defineProperties(LIMITS, {
    resourceLabel: { get: () => ({ min: 1, max: limit.label }), enumerable: true },
    resourceUrl: { get: () => ({ min: 1, max: limit.url }), enumerable: true },
  })
  return { ...actual, LIMITS }
})

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
const two = () => [resource('原始碼', 'github', 'https://github.com/guildhub/app'), resource('每週同步', 'meeting', 'https://meet.example.com/abc')]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
async function flush(times = 12) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })
}

const grabbed: { lock: RefObject<boolean> | null } = { lock: null }
function GrabLock() {
  const { inputLockRef } = useInteraction()
  useEffect(() => {
    grabbed.lock = inputLockRef
  }, [inputLockRef])
  return null
}
const locked = () => {
  if (grabbed.lock === null) throw new Error('InteractionProvider 還沒掛好')
  return grabbed.lock.current
}

/** 另一個面板來要位子（`FE-X16-S14`）：回傳值就是「讓不讓」。 */
const asked: { request: (() => boolean) | null } = { request: null }
function AskForPanel() {
  const { requestOpen } = useBlockingPanels()
  useEffect(() => {
    asked.request = () => requestOpen('inbox-panel')
  }, [requestOpen])
  return null
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
          <GrabLock />
          <AskForPanel />
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
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const error = (name: 'label' | 'type' | 'url') => screen.queryByTestId(`resource-error-${name}`)
const submitButton = () => screen.getByRole('button', { name: '新增' }) as HTMLButtonElement
const createButton = () => screen.getByTestId('resource-create') as HTMLButtonElement

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

/** 登入的是誰、專案長什麼樣 —— 開好面板、等清單到位，回開啟鈕。 */
async function openPanelAs(me: string, proj: ProjectOut) {
  getMyProfile.mockResolvedValue(profile(me))
  const button = renderTree(proj)
  await waitFor(() => expect(button.dataset.identity).toBe('signed-in'))
  click(button)
  return button
}
/** 開面板 → 等清單 → 按新增 → 等表單。回開啟鈕。 */
async function openForm(items: ProjectResourceOut[], proj = project('active')) {
  listResources.mockResolvedValue(items)
  const button = await openPanelAs(OWNER, proj)
  await waitFor(() => expect(rows()).toHaveLength(items.length))
  click(createButton())
  await screen.findByTestId('resource-form')
  return button
}
/** 合法的一組值（`S11` 那一組：名稱前後有空白、scheme 大寫）。 */
async function fillValid() {
  await type('名稱', ' 設計稿 ')
  await type('類型', 'figma')
  await type('網址', 'HTTPS://www.figma.com/file/abc')
}

beforeAll(async () => {
  await import('@/resources/OpenResourcesPanel')
})
beforeEach(() => {
  seq = 0
  grabbed.lock = null
  limit.label = 100
  limit.url = 2048
  listResources.mockReset()
  getMyProfile.mockReset()
  createResource.mockReset()
})
afterEach(() => {
  cleanup()
})

describe('新增：送出前擋下伺服器一定會拒絕的輸入，只送原字串', () => {
  it('[FE-J14-S11] 合法輸入：恰好一個 POST、body 是原字串、201 之前不樂觀更新、之後接在最後', async () => {
    const items = two()
    const created = resource('設計稿', 'figma', 'https://www.figma.com/file/abc')
    const post = deferred<ProjectResourceOut>()
    createResource.mockReturnValue(post.promise)
    await openForm(items)

    // type 的選項恰好是那五種（規格：封閉集合），加一個「還沒選」的位置
    const options = [...(field('類型') as unknown as HTMLSelectElement).options].map((o) => o.value).filter((v) => v !== '')
    expect(options).toEqual(['github', 'figma', 'notion', 'drive', 'meeting'])

    await fillValid()
    await submit()

    // **原字串**：不 trim、不用 safeHref 的正規化結果（大寫 scheme 照送 —— 後端的 check 是 `~*`）
    expect(createResource.mock.calls).toEqual([[PID, { label: ' 設計稿 ', type: 'figma', url: 'HTTPS://www.figma.com/file/abc' }]])
    // 201 還沒回來：清單仍是兩筆（沒有樂觀更新的假列）
    expect(rows(), '201 還沒回來就先插了一列 —— 那是樂觀更新').toHaveLength(2)

    await act(async () => {
      post.resolve(created)
    })
    await waitFor(() => expect(rows()).toHaveLength(3))
    // 新的那一筆在**最後**，而且是伺服器回的那一筆
    expect(rows().map((row) => row.querySelector('[data-testid="resource-label"]')?.textContent)).toEqual([items[0]!.label, items[1]!.label, created.label])
    // 成功之後表單收起來
    expect(screen.queryByTestId('resource-form'), '成功之後表單還開著').toBeNull()
    expect(createResource.mock.calls, '成功之後又送了一次').toHaveLength(1)
  })

  it('[FE-J14-S12] 名稱與網址的上限：剛好可送、多一個即時擋（兩個欄位各自成對）', async () => {
    await openForm(two())
    await type('類型', 'figma')

    // 名稱：`LIMITS.resourceLabel.max` 個 emoji（長度以 code point 計，不是 UTF-16 單位）
    await type('名稱', '😀'.repeat(limit.label))
    // 網址：以 `https://example.com/` 開頭、總長恰好 `LIMITS.resourceUrl.max`
    const head = 'https://example.com/'
    await type('網址', head + 'a'.repeat(limit.url - head.length))
    await waitFor(() => expect(error('label')).toBeNull())
    expect(error('url')).toBeNull()
    expect(submitButton().disabled, '剛好在上限上，送出鈕卻不能按').toBe(false)

    await type('名稱', '😀'.repeat(limit.label + 1))
    await flush()
    expect(error('label'), '名稱多一個字，沒有立刻說').not.toBeNull()
    expect(submitButton().disabled).toBe(true)

    await type('名稱', '😀'.repeat(limit.label))
    await waitFor(() => expect(error('label')).toBeNull())
    await type('網址', head + 'a'.repeat(limit.url - head.length + 1))
    await flush()
    expect(error('url'), '網址多一個字，沒有立刻說').not.toBeNull()
    expect(submitButton().disabled).toBe(true)
    expect(createResource.mock.calls, '即時擋下的東西不該送出去').toHaveLength(0)
  })

  it('[FE-J14-S12] 上限換成別的數字，判定要跟著換（兩個欄位各要一次 —— 只換一個的話另一個寫死仍然全綠）', async () => {
    limit.label = 10
    await openForm(two())
    await type('類型', 'figma')
    await type('網址', 'https://example.com/x')
    await type('名稱', 'a'.repeat(11))
    await flush()
    expect(error('label'), '上限是 10，11 個字沒有被擋 —— 100 寫死在元件裡了').not.toBeNull()
    await type('名稱', 'a'.repeat(10))
    await waitFor(() => expect(error('label')).toBeNull())
    expect(submitButton().disabled).toBe(false)

    cleanup()
    limit.label = 100
    limit.url = 30
    listResources.mockReset()
    getMyProfile.mockReset()
    await openForm(two())
    await type('類型', 'figma')
    await type('名稱', '設計稿')
    const head = 'https://example.com/'
    await type('網址', head + 'a'.repeat(31 - head.length))
    await flush()
    expect(error('url'), '上限是 30，總長 31 沒有被擋 —— 2048 寫死在元件裡了').not.toBeNull()
    await type('網址', head + 'a'.repeat(30 - head.length))
    await waitFor(() => expect(error('url')).toBeNull())
    expect(submitButton().disabled).toBe(false)
  })

  it('[FE-J14-S13] 伺服器一定會拒絕的網址：即時擋、送出鈕禁用、整段期間沒有任何 POST', async () => {
    await openForm(two())
    await type('名稱', '設計稿')
    await type('類型', 'figma')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'example.com', '/relative', 'https://example.com/a b', 'https://example.com/a\tb']) {
      await type('網址', bad)
      // **不要 `waitFor` 一個「應該出現」的元素**：沒出現時它會紅成一個看不出原因的 timeout。
      // 驗證是 resolver（非同步）跑的，`flush()` 把 microtask 排乾就到位了，之後同步斷言 —— 紅訊息看得見是哪一個網址。
      await flush()
      expect(error('url'), `${JSON.stringify(bad)} 沒有被即時擋下來`).not.toBeNull()
      expect(submitButton().disabled, `${JSON.stringify(bad)}：送出鈕還能按`).toBe(true)
    }
    // 含空白的兩個（`a b`、`a\tb`）`safeHref` 其實放行（會編成 %20）—— 擋它們的是「不含空白」那一半。
    // 所以這條判準同時壓著兩個條件，少寫一個就會有兩列紅。
    expect(createResource.mock.calls).toHaveLength(0)
  })

  it('[FE-J14-S14] 缺必填與只有空白：按下去才說，不送，焦點到名稱欄', async () => {
    await openForm(two())
    expect(error('label'), '還沒按送出就先罵人').toBeNull()
    expect(error('type')).toBeNull()
    expect(error('url')).toBeNull()
    expect(submitButton().disabled, '缺必填的時候送出鈕要可按（讓錯誤說出來）').toBe(false)

    await submit()
    expect(error('label'), '按了送出，名稱沒有說「要填」').not.toBeNull()
    expect(error('type')).not.toBeNull()
    expect(error('url')).not.toBeNull()
    expect(createResource.mock.calls).toHaveLength(0)
    expect(document.activeElement, '焦點沒有落在第一個有錯的欄位').toBe(field('名稱'))

    // 只含空白：後端的 check 是 `btrim(label) <> ''`，前端要在送出時說，不是即時
    await type('名稱', '   ')
    await type('類型', 'figma')
    await type('網址', 'https://example.com/x')
    await flush()
    expect(submitButton().disabled, '只含空白是送出時才說的錯誤，不該禁用送出鈕').toBe(false)
    await submit()
    expect(error('label'), '名稱只有空白卻收下了').not.toBeNull()
    expect(createResource.mock.calls).toHaveLength(0)
  })

  it('[FE-J14-S15] 送出前看得到「這個連結能進房的人都看得到」，而且關聯到網址欄', async () => {
    await openForm(two())
    const hint = screen.getByTestId('resource-form-visibility')
    expect(hint.textContent?.trim().length, '說明是空的').toBeGreaterThan(0)
    // 可見 ＋ 被輔助技術關聯到網址欄：`aria-describedby` 指到它
    expect(hint.hasAttribute('hidden')).toBe(false)
    const describedBy = (field('網址').getAttribute('aria-describedby') ?? '').split(/\s+/)
    expect(describedBy, '網址欄的 aria-describedby 沒有指到那段說明').toContain(hint.id)
    expect(hint.id.length).toBeGreaterThan(0)
  })
})

describe('讓位：送出中或改過沒存的表單不讓位', () => {
  it('[FE-X16-S14] 表單乾淨時讓位；打了字（未儲存）就不讓 —— 而且不開確認層', async () => {
    await openForm(two())
    const request = asked.request
    if (request === null) throw new Error('協調者還沒掛好')

    // 乾淨的表單：讓位（使用者沒有東西會掉）
    expect(request(), '表單一個字都沒改，卻擋著不讓別的面板開').toBe(true)

    cleanup()
    listResources.mockReset()
    getMyProfile.mockReset()
    await openForm(two())
    await type('名稱', '設計稿')
    expect(asked.request?.(), '改了字沒存卻讓位了 —— 那些字會直接消失').toBe(false)
    // 讓位不替使用者按下那個問題（`FE-X16-S14` 逐字）：不得冒出放棄修改的確認層
    expect(screen.queryByRole('alertdialog'), '讓位時冒出了確認層').toBeNull()
    expect(screen.queryByTestId('resource-form'), '被拒絕讓位之後表單要留著').not.toBeNull()
  })
})

describe('鍵盤：表單那一半', () => {
  it('[FE-J14-S21] 在欄位裡打 wasde 只進欄位、鎖仍被持有；Escape 先關表單（鎖不放），再關面板', async () => {
    const button = await openForm(two())
    expect(locked(), '面板開著，世界的輸入沒有被鎖住').toBe(true)
    field('名稱').focus()
    await type('名稱', 'wasde')

    expect(field('名稱').value, 'wasde 沒有進欄位').toBe('wasde')
    expect(locked(), '在欄位裡打字，世界的輸入鎖卻掉了 —— 那五個字母會變成走路').toBe(true)
    // 角色實際不動由掛進房間之後的 e2e 補（規格 `S21` 的「驗於」明寫）

    escape()
    await flush()
    expect(screen.queryByTestId('resource-form'), '第一次 Escape 沒有關掉表單').toBeNull()
    expect(screen.queryByTestId('resources-panel'), '第一次 Escape 把面板一起關了 —— Escape 每次只關最上層').not.toBeNull()
    expect(locked(), '關掉表單就把鎖放了 —— 面板還開著，人不該走得動').toBe(true)

    escape()
    await flush()
    expect(screen.queryByTestId('resources-panel'), '第二次 Escape 沒有關掉面板').toBeNull()
    expect(locked(), '面板關了鎖還在').toBe(false)
    expect(document.activeElement, '焦點沒有回到開啟面板的那個元素').toBe(button)
  })
})

describe('晚到的回應不得覆蓋較新的結果：寫入那一半', () => {
  it('[FE-J14-S36] 新增成功之後，一個更早發出的讀取才回來：畫面仍是新增後的那一份', async () => {
    const items = two()
    const created = resource('設計稿', 'figma', 'https://www.figma.com/file/abc')
    listResources.mockResolvedValue(items)
    const button = await openPanelAs(OWNER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(2))

    // 關掉再開 → 第二次讀取（規格的第 2 種時機），讓它**停在路上**
    escape()
    await flush()
    const late = deferred<ProjectResourceOut[]>()
    listResources.mockReturnValue(late.promise)
    click(button)
    await screen.findByTestId('resources-panel')

    // 讀取還在飛的時候新增成功
    createResource.mockResolvedValue(created)
    click(createButton())
    await screen.findByTestId('resource-form')
    await fillValid()
    await submit()
    await waitFor(() => expect(rows()).toHaveLength(3))

    // 那個更早發出的讀取現在才回來，而且是新增之前的兩筆
    await act(async () => {
      late.resolve(items)
    })
    await flush()
    expect(rows(), '晚到的舊讀取把新增的那一筆蓋掉了').toHaveLength(3)
    expect(rows().at(-1)?.querySelector('[data-testid="resource-label"]')?.textContent).toBe(created.label)
  })
})
