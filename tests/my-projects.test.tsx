import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act, useEffect } from 'react'
import type { ProjectOut, ProjectStatus } from '@/api/contract/rest'
import { PAGE_SIZE } from '@/api/contract/limits'
import { ProjectCard } from '@/projects/ProjectCard'
import { MyProjects } from '@/projects/MyProjects'
import { MY_PROJECTS_MAX_PAGES, mergeMine, nextPage } from '@/projects/myProjectsScan'
import { useMyProjects, type MyProjectsApi } from '@/projects/useMyProjects'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-j03-my-projects/specs/my-projects/spec.md
//   Requirement: 我的案件由三種狀態逐頁掃描、以 `owner_id` 過濾；掃描有上限，畫面誠實標明 —— S02、S03
//   Requirement: 晚到的回應不得混進另一個視圖 —— S05 的 hook 半邊（切走作廢、重掃作廢；「招募中清單不混」在 `my-projects-board.test.tsx`）
//
// 三種狀態並行，所以替身的回應要對得上 query：`replyFor('/api/projects?status=…&page=N')`（contract-server 先比路徑＋query）。
// 真的 `listProjects` → 真的 HTTP → 本機自起的 contract-server。**不連任何團隊共用的位址。**

const UUID = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`
const ME = UUID(1)
const OTHER = UUID(2)
let seq = 0
/** `updated_at` 遞減：先造的比較新（排序判準要分得出「照造的順序」跟「照 updated_at」）。 */
const project = (owner: string, status: ProjectStatus, tag: string): ProjectOut => {
  seq += 1
  return { id: UUID(1000 + seq), owner_id: owner, title: `${status}-${tag}`, body: '內容', needed_skills: [], status, room_template: status === 'recruiting' ? null : 0, seat_count: 4, expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), updated_at: new Date(Date.UTC(2026, 8, 1, 0, 0, 0) - seq * 60_000).toISOString() }
}
const page = (status: ProjectStatus, n: number, mine: number, total = PAGE_SIZE) =>
  Array.from({ length: total }, (_, i) => project(i < mine ? ME : OTHER, status, `p${n}-${i}`))
const path = (status: ProjectStatus, n: number) => `/api/projects?status=${status}&page=${n}`

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  seq = 0
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
})

const api: { current: MyProjectsApi | null } = { current: null }
function Harness({ me, active }: { me: string; active: boolean }) {
  const mine = useMyProjects({ me, active })
  useEffect(() => {
    api.current = mine
  })
  if (!active) return <p data-testid="other-view">招募中的清單</p>
  return <MyProjects state={mine.state} retry={mine.retry} renderItem={(item, { fetchedAt }) => <ProjectCard project={item} now={fetchedAt} onOpen={() => {}} />} />
}
const root = () => screen.getByTestId('my-projects')
const cards = () => screen.queryAllByTestId('project-card')
const titles = () => cards().map((c) => within(c).getByTestId('project-card-title').textContent)
const scanCalls = () => server.calls.filter((c) => c.pathname === '/api/projects').map((c) => c.search)
const summary = () => screen.queryByTestId('my-projects-summary')?.textContent ?? ''
const gate = () => {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release: () => release() }
}

describe('純函式', () => {
  it('[FE-J03-S02] nextPage：不滿一頁停、滿一頁下一頁、到上限記 capped', () => {
    expect(nextPage(PAGE_SIZE - 1, 0)).toBe('done')
    expect(nextPage(0, 0)).toBe('done')
    expect(nextPage(PAGE_SIZE, 0)).toBe(1)
    expect(nextPage(PAGE_SIZE, MY_PROJECTS_MAX_PAGES - 2)).toBe(MY_PROJECTS_MAX_PAGES - 1)
    expect(nextPage(PAGE_SIZE, MY_PROJECTS_MAX_PAGES - 1)).toBe('capped')
    expect(MY_PROJECTS_MAX_PAGES).toBe(5)
  })

  it('[FE-J03-S02] mergeMine：只留我的、三種合併後依 updated_at 由新到舊、seen 是載到的總數', () => {
    const a = project(ME, 'recruiting', 'a') // 最新
    const b = project(OTHER, 'recruiting', 'b')
    const c = project(ME, 'closed', 'c')
    const d = project(ME, 'active', 'd') // 最舊
    const r = mergeMine({ recruiting: [[a, b]], active: [[d]], closed: [[c]] }, ME, ['closed'])
    expect(r.items.map((p) => p.title)).toEqual(['recruiting-a', 'closed-c', 'active-d'])
    expect(r.seen).toBe(4)
    expect(r.capped).toEqual(['closed'])
  })
})

describe('我的案件由三種狀態逐頁掃描、以 owner_id 過濾；掃描有上限，畫面誠實標明', () => {
  it('[FE-J03-S02] recruiting 兩頁、active 一頁、closed 到上限：8 個請求、9 筆全是我的、由新到舊、看過 128、closed 只看了前 100', async () => {
    server.replyFor(path('recruiting', 0), 200, page('recruiting', 0, 2))
    server.replyFor(path('recruiting', 1), 200, page('recruiting', 1, 1, 5))
    server.replyFor(path('active', 0), 200, page('active', 0, 1, 3))
    for (let n = 0; n < 5; n += 1) server.replyFor(path('closed', n), 200, page('closed', n, 1))
    server.replyFor(path('closed', 5), 200, page('closed', 5, 1)) // 不該被打到
    render(<Harness me={ME} active />)
    expect(root().getAttribute('aria-busy')).toBe('true')
    await waitFor(() => expect(root().getAttribute('aria-busy')).toBe('false'))
    expect(scanCalls().sort()).toEqual(['?status=active&page=0', '?status=closed&page=0', '?status=closed&page=1', '?status=closed&page=2', '?status=closed&page=3', '?status=closed&page=4', '?status=recruiting&page=0', '?status=recruiting&page=1'].sort())
    expect(cards()).toHaveLength(9)
    // 由新到舊 = 造的順序（recruiting 第 0 頁的兩筆最先造）
    expect(titles()).toEqual(['recruiting-p0-0', 'recruiting-p0-1', 'recruiting-p1-0', 'active-p0-0', 'closed-p0-0', 'closed-p1-0', 'closed-p2-0', 'closed-p3-0', 'closed-p4-0'])
    expect(summary()).toContain('128')
    const capped = screen.getAllByTestId('my-projects-capped')
    expect(capped.map((el) => el.dataset.status)).toEqual(['closed'])
    expect(capped[0]?.textContent).toContain('100')
    expect(root().textContent).toContain('到期')
  })

  it('[FE-J03-S03] 載入中 aria-busy；三種都空是空狀態且仍標看過幾個；一種 500 → 失敗＋重試、不呈現另外兩種的結果；重試重掃三種', async () => {
    const held = gate()
    server.replyFor(path('recruiting', 0), 200, [], { after: held.promise })
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, [])
    render(<Harness me={ME} active />)
    expect(root().getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByTestId('empty-state'), '還在載就出現空狀態').toBeNull()
    await act(async () => held.release())
    await waitFor(() => expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('first-empty'))
    expect(summary()).toContain('0')

    cleanup()
    server.replyFor(path('recruiting', 0), 200, page('recruiting', 0, 2, 2))
    server.replyFor(path('active', 0), 500, { detail: '壞了' })
    server.replyFor(path('closed', 0), 200, [])
    render(<Harness me={ME} active />)
    await waitFor(() => expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('load-failed'))
    expect(cards(), '一種失敗就不能把另外兩種當成完整的').toHaveLength(0)
    expect(screen.queryByTestId('my-projects-summary')).toBeNull()
    const before = scanCalls().length
    server.replyFor(path('recruiting', 0), 200, page('recruiting', 0, 2, 2))
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, [])
    act(() => screen.getByRole('button', { name: '再試一次' }).click())
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(scanCalls().length - before, '重試要重掃三種').toBe(3)
  })

  it('[FE-J03-S03] 第一個回來的是 401：權限阻擋，不是載入失敗', async () => {
    server.replyFor(path('recruiting', 0), 401, { detail: 'no' })
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, [])
    render(<Harness me={ME} active />)
    await waitFor(() => expect(screen.getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked'))
  })
})

describe('晚到的回應不得混進另一個視圖（hook 半邊）', () => {
  it('[FE-J03-S05] 切走時壓住的回應不套用；再切回來是新的掃描、第一次壓住的回應此時才回也不算', async () => {
    const held = gate()
    server.replyFor(path('recruiting', 0), 200, page('recruiting', 0, 3, 3))
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, page('closed', 0, 1, 1), { after: held.promise })
    const view = render(<Harness me={ME} active />)
    await waitFor(() => expect(scanCalls()).toHaveLength(3))
    view.rerender(<Harness me={ME} active={false} />)
    expect(screen.getByTestId('other-view')).toBeDefined()
    // 第二次掃描：closed 回一筆不一樣的、而且不壓
    server.replyFor(path('recruiting', 0), 200, [])
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, page('closed', 0, 1, 1))
    view.rerender(<Harness me={ME} active />)
    await waitFor(() => expect(scanCalls()).toHaveLength(6))
    await waitFor(() => expect(cards()).toHaveLength(1))
    const second = titles()
    await act(async () => held.release())
    await act(async () => {})
    expect(titles(), '第一次掃描壓住的回應套進來了').toEqual(second)
    expect(summary()).toContain('1')
  })

  it('[FE-J03-S04] patch：就地更新一筆的狀態、不重掃、不因狀態改變而消失', async () => {
    server.replyFor(path('recruiting', 0), 200, page('recruiting', 0, 1, 1))
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, [])
    render(<Harness me={ME} active />)
    await waitFor(() => expect(cards()).toHaveLength(1))
    const id = cards()[0]?.dataset.projectId ?? ''
    const before = scanCalls().length
    const next = { ...page('active', 9, 1, 1)[0]!, id, status: 'active' as const }
    act(() => api.current?.patch(next))
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0] as HTMLElement).getByTestId('project-status').textContent).toBe('已成軍')
    expect(scanCalls().length).toBe(before)
  })
})
