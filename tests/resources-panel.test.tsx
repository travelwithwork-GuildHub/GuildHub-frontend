import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act, useEffect, type RefObject } from 'react'
import type { ProjectOut, ProjectResourceOut, ProjectStatus, ResourceType } from '@/api/contract/rest'
import { HttpError } from '@/api/transport'
import { VOCABULARY } from '@/errors/uiError'
import { IdentityProvider, useIdentity } from '@/identity/IdentityProvider'
import { ResourcesPanel } from '@/resources/ResourcesPanel'
import { ResourcesProvider, useResourcesPanel } from '@/resources/ResourcesProvider'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'

// 規格：openspec/changes/fe-j14-project-resources/specs/project-resources/spec.md
//   Requirement: 面板依伺服器順序列出資源；名稱是文字、網址只經安全外開、type 看得出來 —— S01、S02
//   Requirement: 空、載入、失敗三種狀態 —— S03、S04
//   Requirement: 結案與權限失敗 —— S05、S06、S09 的**畫面**那半
//   Requirement: 寫入控制項只給寫入者；隱藏不是權限邊界 —— S10
//   Requirement: 鍵盤：面板持有世界命令鎖，Escape 每次只關最上層 —— S21（面板那半）
//   openspec/changes/fe-j14-project-resources/specs/output-safety/spec.md —— S35（面板那半）
//
// 這一支量的是**畫面**。同一批 Scenario 的狀態那半（讀取的時機、確認的次數、晚到的淘汰）
// 在 `tests/resources-state.test.ts`（前一片 `--resources-state`）。
//
// ⚠️ **`listResources`／`getProject`／`getMyProfile` 換掉，不連任何服務**（規格 Applicability 明文）。
// ⚠️ **`getProject` 只出現在 403／409 之後的那一次確認** —— 面板不自己讀專案，`project` 由掛載點傳進來。

const listResources = vi.hoisted(() => vi.fn())
const getProject = vi.hoisted(() => vi.fn())
const getMyProfile = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/operations')>()),
  listResources,
  getProject,
  getMyProfile,
}))

const PID = '22222222-2222-4222-8222-222222222222'
const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

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
const resource = (label: string, type: ResourceType, url: string, at: string): ProjectResourceOut => ({
  id: `${(seq += 1).toString().padStart(8, '0')}-0000-4000-8000-000000000000`,
  project_id: PID,
  label,
  type,
  url,
  created_at: at,
})
/** 三筆，`created_at` T1＜T2＜T3，type 依序 github／meeting／figma（S01 逐字）。 */
const three = () => [
  resource('原始碼', 'github', 'https://github.com/guildhub/app', '2026-09-10T01:00:00Z'),
  resource('每週同步', 'meeting', 'https://meet.example.com/abc', '2026-09-10T02:00:00Z'),
  resource('設計稿', 'figma', 'https://figma.com/file/xyz', '2026-09-10T03:00:00Z'),
]
const http = (status: number) => new HttpError('listResources', status, null)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
/** 把 microtask 排乾（`act` 裡面）。 */
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

/**
 * 開面板的入口。第 8 片的看板會取代它（走近按 E）—— 這一片只需要「有一個開啟者」
 * 才驗得到「關掉之後焦點回到它」（S21）。身分狀態掛在 `data-identity` 上，讓測試等得到它讀完。
 */
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

/** 登入的是誰、專案長什麼樣 —— 開好面板回開啟鈕。 */
async function openPanelAs(me: string, proj: ProjectOut) {
  getMyProfile.mockResolvedValue(profile(me))
  const button = renderTree(proj)
  await waitFor(() => expect(button.dataset.identity).toBe('signed-in'))
  click(button)
  return button
}

const rows = () => screen.queryAllByTestId('resource-row')
const listCalls = () => listResources.mock.calls.length
/** 等它離開載入中。**不要等某個具體的畫面元素** —— 那會讓「畫錯東西」紅成看不出原因的 timeout。 */
const settled = () => waitFor(() => expect(screen.getByTestId('resources-panel-root').dataset.phase).not.toBe('loading'))

beforeAll(async () => {
  // 面板內容是 lazy 的（`PanelHost`）。先把 chunk 熱起來。
  await import('@/resources/OpenResourcesPanel')
})
beforeEach(() => {
  seq = 0
  grabbed.lock = null
  listResources.mockReset()
  getProject.mockReset()
  getMyProfile.mockReset()
})
afterEach(() => {
  cleanup()
})

describe('面板依伺服器順序列出資源', () => {
  it('[FE-J14-S01] 非 owner：三列照順序、名稱是文字、網址是安全外開、type 可及名稱兩兩不同、沒有寫入控制', async () => {
    const items = three()
    listResources.mockResolvedValue(items)
    await openPanelAs(OTHER, project('active'))
    await screen.findByTestId('resources-panel')

    await waitFor(() => expect(rows()).toHaveLength(3))
    const seen = rows()
    // 順序與回應相同（不是「集合一樣」——把 `map` 換成 `toSorted` 會被這一行抓到）
    expect(seen.map((row) => within(row).getByTestId('resource-label').textContent)).toEqual(items.map((r) => r.label))
    for (const [i, row] of seen.entries()) {
      const item = items[i]!
      // 名稱是文字節點：`textContent` 等於原字串、底下沒有元素
      const label = within(row).getByTestId('resource-label')
      expect(label.textContent).toBe(item.label)
      expect(label.children).toHaveLength(0)
      // 網址：`safeHref` 放行 → 另開分頁的連結，`rel` 兩個都要在（`SafeExternalLink` 的既定形狀）
      const link = within(row).getByTestId('safe-link') as HTMLAnchorElement
      expect(link.tagName).toBe('A')
      expect(link.getAttribute('href')).toBe(new URL(item.url).href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    }
    // type：讀得到是哪一種，三列兩兩不同（顏色／形狀不算 —— 這裡量的是文字）
    const typeNames = seen.map((row) => within(row).getByTestId('resource-type').textContent)
    expect(typeNames.every((name) => (name ?? '').trim().length > 0)).toBe(true)
    expect(new Set(typeNames).size).toBe(3)
    // 非 owner：三種寫入控制一個都不在 DOM 裡
    expect(screen.queryByTestId('resource-create')).toBeNull()
    expect(screen.queryAllByTestId('resource-edit')).toHaveLength(0)
    expect(screen.queryAllByTestId('resource-delete')).toHaveLength(0)
  })

  it('[FE-J14-S02] 存得進去但 safeHref 放行不了的網址：那一列是純文字，其他列不受影響', async () => {
    const items = [resource('壞的', 'notion', 'https://[', '2026-09-10T01:00:00Z'), resource('好的', 'drive', 'https://drive.example.com/d/1', '2026-09-10T02:00:00Z')]
    listResources.mockResolvedValue(items)
    await openPanelAs(OTHER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(2))

    const [bad, good] = rows() as [HTMLElement, HTMLElement]
    expect(bad.querySelector('a'), 'safeHref 放行不了的網址不該是連結').toBeNull()
    expect(within(bad).getByTestId('unsafe-link').textContent).toBe('https://[')
    expect(within(good).getByTestId('safe-link').tagName).toBe('A')
  })

  it('[FE-J14-S35] 名稱含 HTML、網址是 javascript:：面板只是文字，沒有那些元素', async () => {
    const LABEL = '<img src=x onerror=alert(1)><b>r</b>'
    listResources.mockResolvedValue([resource(LABEL, 'github', 'javascript:alert(2)', '2026-09-10T01:00:00Z')])
    await openPanelAs(OTHER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(1))

    const label = screen.getByTestId('resource-label')
    expect(label.textContent).toBe(LABEL)
    expect(label.children).toHaveLength(0)
    expect(screen.getByTestId('unsafe-link').textContent).toBe('javascript:alert(2)')
    const panel = screen.getByTestId('resources-panel')
    expect(panel.querySelector('img')).toBeNull()
    expect(panel.querySelector('b')).toBeNull()
    expect(panel.querySelector('a[href^="javascript"]')).toBeNull()
  })
})

describe('空、載入、失敗三種狀態', () => {
  it('[FE-J14-S03] 空清單：兩種人都看到「首次無資料」，只有 active owner 有新增動作', async () => {
    listResources.mockResolvedValue([])
    await openPanelAs(OWNER, project('active'))
    await screen.findByTestId('empty-state')
    expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('first-empty')
    expect(screen.queryByTestId('resource-create'), 'active owner 看不到新增').not.toBeNull()

    cleanup()
    listResources.mockResolvedValue([])
    await openPanelAs(OTHER, project('active'))
    await screen.findByTestId('empty-state')
    expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('first-empty')
    expect(screen.queryByTestId('resource-create'), '非 owner 不該有任何可操作的新增控制').toBeNull()
  })

  it('[FE-J14-S04] 500 是載入失敗、按一次重試恰好再讀一次；401 是權限阻擋、沒有重試', async () => {
    listResources.mockRejectedValueOnce(http(500)).mockResolvedValueOnce(three())
    await openPanelAs(OTHER, project('active'))
    await screen.findByTestId('empty-state')
    expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('load-failed')

    listResources.mockClear()
    click(screen.getByRole('button', { name: '再試一次' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(listCalls(), '按一次重試要恰好再讀一次').toBe(1)

    cleanup()
    listResources.mockReset()
    listResources.mockRejectedValue(http(401))
    await openPanelAs(OTHER, project('active'))
    await screen.findByTestId('empty-state')
    expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked')
    expect(screen.queryByRole('button', { name: '再試一次' }), '權限阻擋不該有重試').toBeNull()
  })

  it('面板首次載入有可辨識的載入狀態（在清單回來之前）', async () => {
    listResources.mockReturnValue(deferred<ProjectResourceOut[]>().promise)
    await openPanelAs(OTHER, project('active'))
    await screen.findByTestId('resources-panel')

    expect(screen.queryByTestId('resources-loading'), '讀取還沒回來，畫面卻不是載入中').not.toBeNull()
    expect(rows()).toHaveLength(0)
    expect(screen.queryByTestId('empty-state'), '還在讀就畫成「沒有資料」是在說謊').toBeNull()
  })
})

describe('結案與權限失敗：畫面', () => {
  it('[FE-J14-S05] 非 owner 讀到 403、確認是 closed：說已結案，沒有清單、沒有重試、沒有寫入控制', async () => {
    listResources.mockRejectedValue(http(403))
    getProject.mockResolvedValue(project('closed'))
    await openPanelAs(OTHER, project('active'))
    await settled()

    expect(screen.queryByTestId('resources-closed'), '沒有說已結案').not.toBeNull()
    expect(rows(), '非 owner 結案後不顯示清單').toHaveLength(0)
    expect(screen.queryByRole('button', { name: '再試一次' })).toBeNull()
    expect(screen.queryByTestId('resource-create')).toBeNull()
  })

  it('[FE-J14-S06] 403 但專案仍是 active：權限阻擋那一句，不是已結案', async () => {
    listResources.mockRejectedValue(http(403))
    getProject.mockResolvedValue(project('active'))
    await openPanelAs(OTHER, project('active'))
    await settled()

    expect(screen.queryByTestId('resources-closed'), '專案還活著，卻說已結案').toBeNull()
    expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked')
    expect(screen.getByTestId('empty-state').textContent).toContain(VOCABULARY['permission-denied'])
  })

  it('[FE-J14-S09] 開面板時專案已是 closed：owner 讀得到清單，但一開始就沒有寫入控制', async () => {
    listResources.mockResolvedValue(three())
    await openPanelAs(OWNER, project('closed'))
    await waitFor(() => expect(rows()).toHaveLength(3))

    expect(screen.queryByTestId('resources-closed'), 'owner 要看得出這個專案已結案').not.toBeNull()
    expect(screen.queryByTestId('resource-create')).toBeNull()
    expect(screen.queryAllByTestId('resource-edit')).toHaveLength(0)
    expect(screen.queryAllByTestId('resource-delete')).toHaveLength(0)
    expect(getProject.mock.calls.length, '讀得到就不該去確認狀態').toBe(0)
  })
})

describe('寫入控制項只給寫入者；隱藏不是權限邊界', () => {
  it('[FE-J14-S10] 只有 (a) active 專案的 owner 有；(b) 非 owner、(c) closed 的 owner、(d) 身分還在讀取中都沒有', async () => {
    const items = three()
    const cases: Array<{ name: string; me: Promise<unknown>; proj: ProjectOut; writer: boolean }> = [
      { name: '(a) active owner', me: Promise.resolve(profile(OWNER)), proj: project('active'), writer: true },
      { name: '(b) 持票的非 owner', me: Promise.resolve(profile(OTHER)), proj: project('active'), writer: false },
      { name: '(c) closed 專案的 owner', me: Promise.resolve(profile(OWNER)), proj: project('closed'), writer: false },
      { name: '(d) 身分還在讀取中', me: deferred<unknown>().promise, proj: project('active'), writer: false },
    ]
    for (const c of cases) {
      listResources.mockReset()
      getMyProfile.mockReset()
      listResources.mockResolvedValue(items)
      getMyProfile.mockReturnValue(c.me)
      const button = renderTree(c.proj)
      click(button)
      await waitFor(() => expect(rows()).toHaveLength(3))

      const create = screen.queryAllByTestId('resource-create')
      const edit = screen.queryAllByTestId('resource-edit')
      const remove = screen.queryAllByTestId('resource-delete')
      if (c.writer) {
        expect(create, `${c.name}：沒有新增控制`).toHaveLength(1)
        expect(edit, `${c.name}：每一列都要有修改`).toHaveLength(3)
        expect(remove, `${c.name}：每一列都要有刪除`).toHaveLength(3)
      } else {
        // **不存在**，不是 hidden：`queryAll` 連 `hidden` 的元素也數得到，所以這一行擋得住「改成 hidden」
        expect([...create, ...edit, ...remove], `${c.name}：DOM 裡還有寫入控制`).toHaveLength(0)
      }
      cleanup()
    }
  })
})

describe('鍵盤：面板持有世界命令鎖，Escape 每次只關最上層', () => {
  it('[FE-J14-S21] 開啟時持鎖、Tab 在面板內循環、Escape 關面板並放鎖、焦點回開啟者（表單那半在第 7 片）', async () => {
    listResources.mockResolvedValue(three())
    const button = await openPanelAs(OWNER, project('active'))
    // 鎖在 chunk 抵達前就成立（鎖在 eager 的 host 上）
    expect(locked(), '面板開著，世界的輸入沒有被鎖住').toBe(true)
    const panel = await screen.findByTestId('resources-panel')
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(panel.contains(document.activeElement), '焦點不在面板內').toBe(true)

    // focus trap：從最後一個可聚焦元素按 Tab、從第一個按 Shift+Tab，焦點都留在面板內
    const stops = [...panel.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')]
    expect(stops.length, '面板裡一個可聚焦的元素都沒有 —— 這條判準會恆真').toBeGreaterThan(1)
    for (const [target, shift] of [
      [stops.at(-1)!, false],
      [stops[0]!, true],
    ] as const) {
      act(() => target.focus())
      act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }))
      })
      expect(panel.contains(document.activeElement), `Tab（shift=${shift}）之後焦點跑出面板了`).toBe(true)
    }

    escape()
    expect(screen.queryByTestId('resources-panel')).toBeNull()
    expect(locked(), '關了面板鎖還在 —— 人走不動').toBe(false)
    expect(document.activeElement, '焦點沒有回到開啟面板的那個元素').toBe(button)
  })

  it('[FE-J14-S21] 關掉再開仍然重讀（面板每一次開啟一次）—— 這是不輪詢時唯一能發現結案的時機', async () => {
    listResources.mockResolvedValue(three())
    const button = await openPanelAs(OTHER, project('active'))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(listCalls()).toBe(1)

    escape()
    await flush()
    click(button)
    await waitFor(() => expect(listCalls()).toBe(2))
  })
})
