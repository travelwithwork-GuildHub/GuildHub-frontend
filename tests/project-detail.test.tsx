import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { avatarLook } from '@/design/avatar'
import { VOCABULARY } from '@/errors/uiError'
import type { Identity } from '@/identity/types'
import { ProjectDetail } from '@/projects/ProjectDetail'
import { useProjectDetail } from '@/projects/useProjectDetail'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b03-project-detail/specs/project-directory/spec.md
//   Requirement: 詳情在同一個面板裡，案子本體一律來自 GET /api/projects/{id} —— S03～S07
//   Requirement: 發案者名片是獨立的載入單元 —— S08、S09、S15、S16
//   Requirement: 動作列只放做得到的 —— S11（owner 標示、訪客 401）、S12（沒有做不到的動作）；S10（私訊 → 關看板進對話）在接線那一片
//
// 直接掛載 `ProjectDetail`（它自己打真的 operation → 本機自起的 `contract-server`）。身分用替身控制（owner／非 owner／訪客）。
// **不連任何團隊共用的位址。**

const identity = { current: { state: 'unknown' } as Identity }
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current }))

const UUID = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`
const OWNER = UUID(90)
const OTHER = UUID(91)
const NOW_ISH = () => Date.now()
const project = (n: number, extra: Partial<ProjectOut> = {}): ProjectOut => ({
  id: UUID(n),
  owner_id: OWNER,
  title: `案件${n}`,
  body: `內容${n}`,
  needed_skills: [`技能${n}`],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: new Date(NOW_ISH() + 5 * 86_400_000).toISOString(),
  updated_at: '2026-09-09T00:00:00Z',
  ...extra,
})
const profile = (id: string, extra: Partial<ProfileOut> = {}): ProfileOut => ({
  id,
  display_name: `發案者-${id.slice(-2)}`,
  avatar_id: 1,
  skills: ['Three.js'],
  hours_per_week: 12,
  bio: '這段自介是哨兵-9c1e',
  updated_at: '2091-01-01T00:00:00Z',
  ...extra,
})
const projectPath = (id: string) => `/api/projects/${id}`
const profilePath = (id: string) => `/api/profiles/${id}`
const LABELS = { back: '返回' }
const signedInAs = (id: string) => {
  identity.current = { state: 'signed-in', profile: profile(id, { display_name: '我' }) }
}

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  signedInAs(OTHER)
})
afterEach(async () => {
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  await server.close()
})

const detail = () => screen.getByTestId('project-detail')
const owner = () => within(detail()).getByTestId('owner-card')
const calls = () => server.calls.map((c) => c.pathname)
const mount = (id: string, preview: ProjectOut | undefined, extra: Partial<Parameters<typeof ProjectDetail>[0]> = {}) =>
  render(<ProjectDetail id={id} preview={preview} onBack={() => {}} labels={LABELS} {...extra} />)
/** 案子與發案者都回 200 並等到兩塊都 ready。 */
async function mountReady(p: ProjectOut, extra: Partial<Parameters<typeof ProjectDetail>[0]> = {}) {
  server.replyFor(projectPath(p.id), 200, p)
  server.replyFor(profilePath(p.owner_id), 200, profile(p.owner_id))
  const view = mount(p.id, undefined, extra)
  await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
  await waitFor(() => expect(owner().dataset.phase).toBe('ready'))
  return view
}

describe('案子本體一律來自 GET /api/projects/{id}', () => {
  it('[FE-B03-S03] 詳情呈現的是回應，不是列表那一筆；保留換行', async () => {
    server.replyFor(projectPath(UUID(0)), 200, project(0, { body: '詳情端點回的\n第二行' }))
    server.replyFor(profilePath(OWNER), 200, profile(OWNER))
    mount(UUID(0), project(0, { body: '列表上的舊內容' }))
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    const body = within(detail()).getByTestId('project-body')
    expect(body.textContent, '詳情用的是列表那一筆').toBe('詳情端點回的\n第二行')
    expect(getComputedStyle(body).whiteSpace || body.className, '換行沒有保留').toMatch(/pre-wrap|whitespace-pre-wrap/)
    expect(detail().textContent).not.toContain('列表上的舊內容')
    expect(calls()[0]).toBe(projectPath(UUID(0)))
  })

  it('[FE-B03-S04] 載入中是可辨識的載入中（預覽的標題看得到）；500 是載入失敗、不是 ready；重試恰好再問一次', async () => {
    server.replyFor(projectPath(UUID(0)), 500, { detail: '壞了' })
    server.replyFor(projectPath(UUID(0)), 200, project(0))
    server.replyFor(profilePath(OWNER), 200, profile(OWNER))
    mount(UUID(0), project(0))
    expect(detail().dataset.phase).toBe('loading')
    expect(detail().getAttribute('aria-busy')).toBe('true')
    expect(within(detail()).getByTestId('project-detail-title').textContent).toBe('案件0')
    expect(within(detail()).queryByTestId('project-body'), '載入中就把預覽的內容當正式內容畫了').toBeNull()
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    const empty = within(detail()).getByTestId('empty-state')
    expect(empty.dataset.emptyState).toBe('load-failed')
    expect(detail().getAttribute('aria-busy')).toBe('false')
    expect(calls().filter((c) => c.startsWith('/api/profiles')), '案子沒成功（有預覽）就去打發案者了').toEqual([])
    fireEvent.click(within(empty).getByRole('button', { name: '再試一次' }))
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(calls().filter((p) => p === projectPath(UUID(0)))).toHaveLength(2)
  })

  it('[FE-B03-S05] 401 是權限阻擋、404 是找不到；三種失敗都不打 profiles', async () => {
    server.replyFor(projectPath(UUID(0)), 401, { detail: '未登入' })
    const a = mount(UUID(0), undefined)
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    expect(within(detail()).getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked')
    a.unmount()
    server.replyFor(projectPath(UUID(1)), 404, { detail: '專案不存在' })
    const b = mount(UUID(1), undefined)
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    const empty = within(detail()).getByTestId('empty-state')
    expect(empty.dataset.emptyState, '404 不是權限阻擋').toBe('load-failed')
    expect(empty.textContent, '404 要說「找不到」，不是「壞了」').toContain(VOCABULARY['not-found'])
    b.unmount()
    server.replyFor(projectPath(UUID(2)), 500, { detail: '壞了' })
    mount(UUID(2), undefined)
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    await new Promise((r) => setTimeout(r, 30))
    expect(calls().filter((p) => p.startsWith('/api/profiles')), '案子沒成功就去打發案者了').toEqual([])
  })

  it('[FE-B03-S06] 先開 A 再開 B、A 較晚到：畫面是 B，沒有任何一格是「B 的 id 配 A 的內容」', async () => {
    const gateA = { release: () => {} }
    server.replyFor(projectPath(UUID(0)), 200, project(0, { body: 'A 的內容' }), { after: new Promise<void>((r) => (gateA.release = r)) })
    server.replyFor(projectPath(UUID(1)), 200, project(1, { body: 'B 的內容' }))
    const frames: Array<{ id: string; body: string | undefined }> = []
    const { result, rerender } = renderHook(
      (id: string) => {
        const d = useProjectDetail(id, undefined)
        frames.push({ id, body: d.project?.body })
        return d
      },
      { initialProps: UUID(0) },
    )
    expect(result.current.phase).toBe('loading')
    rerender(UUID(1))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.project?.body).toBe('B 的內容')
    gateA.release()
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.project?.id, 'A 的回應蓋掉了 B').toBe(UUID(1))
    expect(frames.filter((f) => f.id === UUID(1) && f.body === 'A 的內容')).toEqual([])
  })

  it('[FE-B03-S07] 欄位齊全：已成軍、剩 2 天、<time dateTime>、2 個座位、未指定技能、換行；沒有 owner_id／room_template', async () => {
    const p = project(0, { status: 'active', needed_skills: [], seat_count: 2, expires_at: new Date(NOW_ISH() + 47 * 3_600_000).toISOString(), body: '第一行\n第二行', room_template: 42 })
    await mountReady(p)
    const d = detail()
    expect(within(d).getByTestId('project-status').textContent).toBe('已成軍')
    const time = within(d).getByTestId('project-expires')
    expect(time.tagName).toBe('TIME')
    expect(time.getAttribute('datetime')).toBe(p.expires_at)
    expect(time.textContent).toContain('剩 2 天')
    expect(within(d).getByTestId('project-seats').textContent).toBe('2 個座位')
    expect(within(d).getByText((_, el) => el?.getAttribute('data-missing') === 'needed_skills').textContent).toBe('未指定')
    expect(within(d).getByTestId('project-body').textContent).toBe('第一行\n第二行')
    expect(d.textContent).not.toContain(OWNER)
    expect(d.textContent).not.toContain('42')
  })
})

describe('發案者名片是獨立的載入單元', () => {
  it('[FE-B03-S08] 名片來自 GET /api/profiles/{owner_id}：名字、技能、外觀色跟世界一致；沒有 bio／updated_at', async () => {
    await mountReady(project(0))
    const o = owner()
    expect(within(o).getByTestId('owner-name').textContent).toBe(`發案者-${OWNER.slice(-2)}`)
    expect(within(o).getAllByTestId('talent-skill').map((n) => n.textContent)).toEqual(['Three.js'])
    const css = (color: string) => {
      const el = document.createElement('i')
      el.style.background = color
      return el.style.background
    }
    expect(within(o).getByTestId('talent-look').style.background).toBe(css(avatarLook(1).body))
    expect(detail().textContent).not.toContain('哨兵-9c1e')
    expect(detail().textContent).not.toContain('2091')
    expect(calls()).toEqual([projectPath(UUID(0)), profilePath(OWNER)])
  })

  it('[FE-B03-S15] 案子 ready、發案者還在載：兩塊各自的狀態', async () => {
    server.replyFor(projectPath(UUID(0)), 200, project(0))
    // 發案者壓著不回（沒排回應的話替身會立刻回 500，那是另一條）；結尾要放行，server 才關得掉
    const held = { release: () => {} }
    server.replyFor(profilePath(OWNER), 200, profile(OWNER), { after: new Promise<void>((r) => (held.release = r)) })
    mount(UUID(0), undefined)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(within(detail()).getByTestId('project-body').textContent).toBe('內容0')
    const o = owner()
    expect(o.dataset.phase).toBe('loading')
    expect(o.getAttribute('aria-busy')).toBe('true')
    expect(within(o).queryByTestId('owner-name')).toBeNull()
    held.release()
    await waitFor(() => expect(owner().dataset.phase).toBe('ready'))
  })

  it('[FE-B03-S16] 切換案件後，舊發案者（X）的回應不得覆蓋新案子的發案者（Y）', async () => {
    const X = UUID(80)
    const Y = UUID(81)
    const gateX = { release: () => {} }
    server.replyFor(projectPath(UUID(0)), 200, project(0, { owner_id: X }))
    server.replyFor(projectPath(UUID(1)), 200, project(1, { owner_id: Y }))
    server.replyFor(profilePath(X), 200, profile(X, { display_name: 'X 的名字', skills: ['X 的技能'] }), { after: new Promise<void>((r) => (gateX.release = r)) })
    server.replyFor(profilePath(Y), 200, profile(Y, { display_name: 'Y 的名字', skills: ['Y 的技能'] }))
    const view = mount(UUID(0), undefined)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    await waitFor(() => expect(calls()).toContain(profilePath(X)))
    view.rerender(<ProjectDetail id={UUID(1)} preview={undefined} onBack={() => {}} labels={LABELS} />)
    await waitFor(() => expect(within(owner()).queryByTestId('owner-name')?.textContent).toBe('Y 的名字'))
    gateX.release()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(owner()).getByTestId('owner-name').textContent).toBe('Y 的名字')
    expect(detail().textContent).not.toContain('X 的名字')
    expect(detail().textContent).not.toContain('X 的技能')
  })

  it('[FE-B03-S09] 發案者 500：案子本體仍 ready；發案者那一塊是載入失敗；重試只打 profiles', async () => {
    server.replyFor(projectPath(UUID(0)), 200, project(0))
    server.replyFor(profilePath(OWNER), 500, { detail: '壞了' })
    server.replyFor(profilePath(OWNER), 200, profile(OWNER))
    mount(UUID(0), undefined)
    await waitFor(() => expect(owner().dataset.phase).toBe('error'))
    expect(detail().dataset.phase, '發案者載不到把整份詳情畫成失敗了').toBe('ready')
    expect(within(detail()).getByTestId('project-body').textContent).toBe('內容0')
    expect(within(owner()).getByTestId('empty-state').dataset.emptyState).toBe('load-failed')
    fireEvent.click(within(owner()).getByRole('button', { name: '再試一次' }))
    await waitFor(() => expect(owner().dataset.phase).toBe('ready'))
    expect(calls()).toEqual([projectPath(UUID(0)), profilePath(OWNER), profilePath(OWNER)])
  })
})

describe('動作列只放做得到的', () => {
  it('[FE-B03-S11] owner 看到標示與插槽、沒有 actions；非 owner 有 actions、沒有標示；訪客 401 什麼都沒有', async () => {
    signedInAs(OWNER)
    const asOwner = await mountReady(project(0), { actions: () => <button type="button">私訊發案者</button>, ownerActions: <output data-testid="j04-slot">插槽</output> })
    expect(within(detail()).getByTestId('owner-mark').textContent).toBe('這是你發的案子')
    expect(within(detail()).getByTestId('j04-slot')).toBeInTheDocument()
    expect(within(detail()).queryByRole('button', { name: '私訊發案者' }), 'owner 也長出了私訊自己').toBeNull()
    asOwner.unmount()

    signedInAs(OTHER)
    const asOther = await mountReady(project(1), { actions: () => <button type="button">私訊發案者</button>, ownerActions: <output data-testid="j04-slot">插槽</output> })
    expect(within(detail()).getByRole('button', { name: '私訊發案者' })).toBeInTheDocument()
    expect(within(detail()).queryByTestId('owner-mark')).toBeNull()
    expect(within(detail()).queryByTestId('j04-slot'), '非 owner 看到了 J04 的插槽').toBeNull()
    asOther.unmount()

    identity.current = { state: 'guest', reason: 'no-session' } as Identity
    server.replyFor(projectPath(UUID(2)), 401, { detail: '未登入' })
    mount(UUID(2), undefined, { actions: () => <button type="button">私訊發案者</button>, ownerActions: <output data-testid="j04-slot">插槽</output> })
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    expect(within(detail()).getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked')
    expect(within(detail()).queryByRole('button', { name: '私訊發案者' })).toBeNull()
    expect(within(detail()).queryByTestId('owner-mark')).toBeNull()
    expect(within(detail()).queryByTestId('j04-slot')).toBeNull()
  })

  it('[FE-B03-S12] owner 與非 owner 都沒有成軍／結案／應徵／收藏／檢舉的控制項（含 disabled）', async () => {
    const forbidden = /成軍|結案|應徵|收藏|檢舉/
    for (const me of [OWNER, OTHER]) {
      signedInAs(me)
      const view = await mountReady(project(me === OWNER ? 0 : 1))
      const controls = [...detail().querySelectorAll<HTMLElement>('button, a, [role="button"], [role="link"]')]
      expect(controls.filter((c) => forbidden.test(c.textContent ?? '') || forbidden.test(c.getAttribute('aria-label') ?? '')), `${me === OWNER ? 'owner' : '非 owner'} 看到了做不到的動作`).toEqual([])
      view.unmount()
    }
  })
})
