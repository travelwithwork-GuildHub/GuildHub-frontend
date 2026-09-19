import { StrictMode, Suspense, useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { MessageOut, ProjectOut } from '@/api/contract/rest'
import { AvatarPicker } from '@/app/world/AvatarPicker'
import { FirstEntryNotice } from '@/app/world/FirstEntryNotice'
import { SceneChatHud } from '@/chat/SceneChatHud'
import { AvatarDraftProvider } from '@/identity/AvatarDraftProvider'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { InboxButton } from '@/inbox/InboxButton'
import { InboxPanel } from '@/inbox/InboxPanel'
import { InboxPanelProvider, useInbox } from '@/inbox/InboxPanelProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { WorldUrlSync } from '@/list-panel/PanelUrlSync'
import { BlockingPanelCoordinator, useActivePanel, useBlockingPanelOpen, useBlockingPanels } from '@/panel/BlockingPanelCoordinator'
import { PanelShell } from '@/panel/PanelShell'
import { ProfilePanel } from '@/profile/ProfilePanel'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { SceneChatProvider, useSceneChatPortIfProvided } from '@/realtime/SceneChatProvider'
import type { SceneChatPort } from '@/realtime/sceneChatStore'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { SceneProvider } from '@/world/scenes/SceneProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-x16-dom-visual-and-flow/specs/dom-visual-system/spec.md
//   Requirement: 同一時間只有一個阻斷式面板；讓位有協定；非阻斷的提示讓位 —— S13、S14、S15、S16、S17、S18、S21、S22（jsdom 半邊；
//   `focusin` 序列、捲動位置、真瀏覽器的上一頁／下一頁在 `tests/e2e/dom-visual.mjs`）
//
// 整棵樹是 `page.tsx` ＋ `WorldCanvas` 的形狀：協調者 > IdentityProvider（真的，contract-server 給 /api/me）> ProfilePanelProvider > InboxPanelProvider >
// SceneProvider > SceneChatProvider > [ 標題列（名片、收件匣、換角色），InteractionProvider > ListPanelProvider > [ WorldUrlSync、看板、世界錨裡的三個面板與聊天框 ]，訪客提示 ]。
// 所有請求走真的 `src/api/` 到本機自己起的 HTTP server；`window.history` 是 jsdom 真的那一個。**不連任何團隊共用的位址。**

vi.mock('@/realtime/RealtimeGenerationProvider', () => ({ useRealtimeGeneration: () => ({ generation: 0, rejoin: vi.fn() }) }))

const SLOW = { timeout: 15_000 }
let server: ContractServer
const UUID = (n: number) => `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`
const ME = { id: UUID(1), display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
const OTHER = { ...ME, id: UUID(2), display_name: '別人' }
const project = (extra: Partial<ProjectOut> = {}): ProjectOut => ({ id: UUID(100), owner_id: ME.id, title: '案件', body: '內容', needed_skills: [], status: 'recruiting', room_template: null, seat_count: 4, expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), updated_at: '2026-09-09T00:00:00Z', ...extra })
const msg = (n: number, from = OTHER.id, to = ME.id): MessageOut => ({ id: UUID(500 + n), sender_id: from, recipient_id: to, body: `信 ${n}`, created_at: `2026-09-12T10:${String(n).padStart(2, '0')}:00.000000Z`, read_at: null })

type Grabbed = {
  lock: RefObject<boolean>
  registry: InteractableRegistry
  list: ReturnType<typeof useListPanel>
  inbox: ReturnType<typeof useInbox>
  panels: ReturnType<typeof useBlockingPanels>
  chat: SceneChatPort | undefined
}
let grabbed: Grabbed | null = null
const g = () => grabbed!
function Grab() {
  const { inputLockRef, registry } = useInteraction()
  const list = useListPanel()
  const inbox = useInbox()
  const panels = useBlockingPanels()
  const chat = useSceneChatPortIfProvided()
  useEffect(() => {
    grabbed = { lock: inputLockRef, registry, list, inbox, panels, chat }
  })
  return null
}
/** 協調者的兩個推導值，寫成屬性讓判準讀。 */
function Probe() {
  const active = useActivePanel()
  const open = useBlockingPanelOpen()
  return <span data-testid="probe" data-active={active ?? ''} data-open={String(open)} />
}
const probe = () => ({ active: screen.getByTestId('probe').dataset.active || null, open: screen.getByTestId('probe').dataset.open === 'true' })

/** 掛不掛世界那一半（`S22` 第二段：provider 在 commit 前整個卸載）；`suspend` 讓看板的殼延後 commit（`S22` 第一段）。 */
let suspendGate: { promise: Promise<void>; release: () => void; done: boolean } | null = null
function SuspendBoard({ children }: { children: ReactNode }) {
  if (suspendGate !== null && !suspendGate.done) throw suspendGate.promise
  return children
}
function World({ children }: { children?: ReactNode }) {
  return (
    <InteractionProvider>
      <ListPanelProvider>
        <Grab />
        <WorldUrlSync />
        <BoardTargets />
        <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
          <SceneChatHud />
          <Suspense fallback={null}>
            <SuspendBoard>
              <BoardPanel />
            </SuspendBoard>
          </Suspense>
          <ProfilePanel />
          <InboxPanel />
          {children}
        </div>
      </ListPanelProvider>
    </InteractionProvider>
  )
}
function App({ world = true }: { world?: boolean }) {
  return (
    <BlockingPanelCoordinator>
      <IdentityProvider>
        <AvatarDraftProvider>
          <ProfilePanelProvider>
            <InboxPanelProvider>
              <SceneProvider>
                <SceneChatProvider>
                  <Probe />
                  <header data-testid="app-header" className="relative">
                    <IdentityBadge />
                    <InboxButton />
                    <AvatarPicker />
                  </header>
                  <div className="relative">
                    {world && <World />}
                    <FirstEntryNotice />
                  </div>
                </SceneChatProvider>
              </SceneProvider>
            </InboxPanelProvider>
          </ProfilePanelProvider>
        </AvatarDraftProvider>
      </IdentityProvider>
    </BlockingPanelCoordinator>
  )
}

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
  grabbed = null
  suspendGate = null
  window.history.replaceState(null, '', '/world')
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/world')
})

/** 登入成我、掛整棵樹；收件匣與清單的回應先堆好（每次開啟都會重取第 0 頁）。 */
async function mount(opts: { guest?: boolean; url?: string; messages?: MessageOut[]; project?: ProjectOut } = {}) {
  if (opts.guest) server.replyFor('/api/me', 401, { detail: 'no' })
  else server.replyFor('/api/me', 200, ME)
  for (let i = 0; i < 8; i += 1) {
    server.replyFor('/api/messages', 200, opts.messages ?? [])
    server.replyFor('/api/profiles', 200, [OTHER])
    server.replyFor(`/api/profiles/${OTHER.id}`, 200, OTHER)
    if (opts.project) {
      server.replyFor('/api/projects', 200, [opts.project])
      server.replyFor(`/api/projects/${opts.project.id}`, 200, opts.project)
      server.replyFor(`/api/profiles/${ME.id}`, 200, ME)
    }
  }
  if (opts.url) window.history.replaceState(null, '', opts.url)
  const view = render(<App />)
  await waitFor(() => expect(server.calls.filter((c) => c.pathname === '/api/me')).toHaveLength(1))
  if (!opts.guest) await screen.findByTestId('inbox-button')
  await waitFor(() => expect(grabbed).not.toBeNull())
  return view
}
const click = (el: HTMLElement) =>
  act(() => {
    el.focus()
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
async function type(el: HTMLElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
/** 對著人才看板按 E（Canvas 裡的 `onInteract`）。 */
const pressE = (kind: 'talentBoard' | 'projectBoard' = 'talentBoard') => {
  const id = boardItems().find((b) => b.kind === kind)?.item.id ?? ''
  act(() => g().registry.entries.get(id)?.onInteract?.())
}
/** 瀏覽器的上一頁／下一頁：jsdom 的 `history.go` 是非同步的，popstate 之後才回來。 */
const go = (delta: number) =>
  new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
    act(() => window.history.go(delta))
  })
const url = () => `${window.location.pathname}${window.location.search}`
const inboxButton = () => screen.getByTestId('inbox-button')
const badge = () => screen.getByRole('button', { name: /^我的名片/ })
const listPanel = () => screen.queryByTestId('list-panel')
const inboxPanel = () => screen.queryByTestId('inbox-panel')
const profilePanel = () => screen.queryByTestId('profile-panel')
const blockingPanels = () => [listPanel(), inboxPanel(), profilePanel()].filter((p) => p !== null)
const statusText = () => [...document.querySelectorAll('[role="status"]')].map((el) => el.textContent?.trim() ?? '').filter((t) => t !== '')
/** 一個可以從外面放行的 pending。 */
function gate() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release: () => release() }
}
/** 案件詳情裡把成軍表單送出、壓著不回（`FE-J04-S04` 的「送出中」）。 */
async function holdFormTeam(p: ProjectOut) {
  const detail = screen.getByTestId('project-detail')
  await waitFor(() => expect(detail.dataset.phase).toBe('ready'))
  await waitFor(() => expect(screen.getByTestId('owner-card').dataset.phase).toBe('ready'))
  click(within(detail).getByRole('button', { name: '成軍', hidden: true }))
  await type(within(detail).getByLabelText('房間密碼'), 'demo-1234')
  const held = gate()
  server.replyFor(`/api/projects/${p.id}/form-team`, 200, { ...p, status: 'active' }, { after: held.promise })
  await act(async () => (screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit())
  await waitFor(() => expect(server.calls.filter((c) => c.pathname === `/api/projects/${p.id}/form-team`)).toHaveLength(1))
  return held
}
/** 收件匣對話裡寄一封、壓著不回。 */
async function holdSend() {
  click(inboxButton())
  const row = await screen.findByTestId('inbox-thread-item')
  click(row)
  const field = await screen.findByLabelText('寫一封信')
  await type(field, '哈囉')
  const held = gate()
  server.replyFor('/api/messages', 201, msg(9, ME.id, OTHER.id), { after: held.promise })
  await act(async () => (field.closest('form') as HTMLFormElement).requestSubmit())
  await waitFor(() => expect(server.calls.filter((c) => c.method === 'POST' && c.pathname === '/api/messages')).toHaveLength(1))
  return held
}

describe('同一時間只有一個阻斷式面板', () => {
  it('[FE-X16-S13] 看板→收件匣→名片→收件匣：後開的取代先開的、焦點在新面板內、不經開啟者與 body、網址退；人才詳情寄信也一樣', SLOW, async () => {
    await mount()
    pressE()
    expect(listPanel()?.dataset.kind).toBe('profiles')
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    const focusins: string[] = []
    const onFocusIn = (e: FocusEvent) => focusins.push((e.target as HTMLElement).dataset.testid ?? (e.target as HTMLElement).tagName)
    inboxButton().focus()
    document.addEventListener('focusin', onFocusIn)
    click(inboxButton())
    expect(listPanel()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    expect(inboxPanel()!.contains(document.activeElement)).toBe(true)
    expect(focusins, '焦點不經世界錨、不經 body').not.toContain('world-canvas-container')
    expect(focusins).not.toContain('BODY')
    document.removeEventListener('focusin', onFocusIn)
    await waitFor(() => expect(url()).toBe('/world'))

    click(badge())
    expect(inboxPanel()).toBeNull()
    expect(profilePanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    click(inboxButton())
    expect(profilePanel()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    escape()
    expect(blockingPanels()).toHaveLength(0)

    // 人才詳情裡按寄信（`inbox` 既有的路）：看板關、收件匣開、焦點在收件匣內
    pressE()
    click(await screen.findByTestId('talent-card'))
    const send = await screen.findByTestId('send-message')
    click(send)
    expect(listPanel()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    await waitFor(() => expect(inboxPanel()!.contains(document.activeElement)).toBe(true))
    expect(screen.getByTestId('inbox-thread').dataset.with).toBe(OTHER.id)
  })

  it('[FE-X16-S14] 成軍送出中拒絕讓位：收件匣不開、詳情留著、焦點留在按鈕、有 status；回來後接受；名片 dirty 也拒絕且不出確認', SLOW, async () => {
    const p = project()
    await mount({ project: p, url: `/world?panel=projects&project=${p.id}` })
    const held = await holdFormTeam(p)
    click(inboxButton())
    expect(inboxPanel()).toBeNull()
    expect(screen.queryByTestId('project-detail')).not.toBeNull()
    expect(document.activeElement).toBe(inboxButton())
    expect(statusText(), '拒絕要有看得到的回饋').not.toHaveLength(0)
    held.release()
    await waitFor(() => expect(within(screen.getByTestId('project-detail')).getByTestId('project-status').textContent).toBe('已成軍'))
    click(inboxButton())
    expect(listPanel()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
    escape()

    click(badge())
    click(within(profilePanel()!).getByRole('button', { name: '編輯' }))
    const name = within(profilePanel()!).getByLabelText('在世界裡顯示的名字') as HTMLInputElement
    await type(name, '改了名字')
    click(inboxButton())
    expect(inboxPanel()).toBeNull()
    expect(profilePanel()).not.toBeNull()
    expect((within(profilePanel()!).getByLabelText('在世界裡顯示的名字') as HTMLInputElement).value).toBe('改了名字')
    expect(screen.queryByRole('alertdialog'), '讓位不替使用者按下「放棄修改？」').toBeNull()
    expect(document.activeElement).toBe(inboxButton())
    expect(statusText()).not.toHaveLength(0)
  })

  it('[FE-X16-S15] 訪客提示讓位、關了回來、輸入中的名字沒丟；先關掉提示或走完的不回來', SLOW, async () => {
    await mount({ guest: true })
    const notice = () => screen.getByTestId('first-entry-notice')
    expect(notice()).toBeVisible()
    await type(within(notice()).getByLabelText('在世界裡顯示的名字'), '打到一半')
    pressE()
    expect(listPanel()).not.toBeNull()
    expect(notice()).not.toBeVisible()
    escape()
    expect(notice()).toBeVisible()
    expect((within(notice()).getByLabelText('在世界裡顯示的名字') as HTMLInputElement).value, '讓位不重設提示裡的狀態').toBe('打到一半')
    click(within(notice()).getByRole('button', { name: '先四處看看' }))
    expect(screen.queryByTestId('first-entry-notice')).toBeNull()
    pressE()
    escape()
    expect(screen.queryByTestId('first-entry-notice'), '關掉了就不回來').toBeNull()
  })

  it('[FE-X16-S15] 走完首次進入之後開看板、關看板：提示不回來', SLOW, async () => {
    await mount({ guest: true })
    const notice = screen.getByTestId('first-entry-notice')
    server.replyFor('/api/login', 200, ME)
    server.replyFor('/api/profiles/me', 200, ME)
    await type(within(notice).getByLabelText('在世界裡顯示的名字'), '阿福')
    click(within(notice).getByRole('button', { name: '建立我的身分' }))
    await screen.findByTestId('recovery-key')
    await act(async () => {
      Object.assign(navigator, { clipboard: { writeText: async () => {} } })
      screen.getByRole('button', { name: '複製鑰匙' }).click()
    })
    await screen.findByText('已經複製了')
    click(screen.getByRole('button', { name: '進入世界' }))
    await waitFor(() => expect(screen.queryByTestId('first-entry-notice')).toBeNull())
    pressE()
    escape()
    expect(screen.queryByTestId('first-entry-notice')).toBeNull()
  })

  it('[FE-X16-S16] 面板開著聊天框收成一行、顯示期間新到的數、不持鎖；關了展開、訊息都在', SLOW, async () => {
    await mount()
    const link = g().chat!.attach(() => {}, 'lobby')
    const receive = (n: number) => act(() => link.receive({ t: 'chat', id: OTHER.id, name: '別人', body: `第 ${n} 則` }))
    receive(0)
    expect(screen.getAllByTestId('chat-row')).toHaveLength(1)
    pressE()
    const hud = screen.getByTestId('scene-chat')
    expect(within(hud).queryByTestId('chat-feed')).toBeNull()
    expect(within(hud).queryByRole('textbox')).toBeNull()
    for (let i = 1; i <= 3; i += 1) receive(i)
    expect(hud.textContent).toContain('3')
    escape()
    expect(g().lock.current, '面板關了、聊天框收起狀態沒有留下鎖').toBe(false)
    expect(screen.getAllByTestId('chat-row')).toHaveLength(4)
    expect(within(screen.getByTestId('scene-chat')).getByRole('textbox')).toBeTruthy()
  })

  it('[FE-X16-S17] 下一頁要求重開看板：接受就重開；送出中拒絕 → replaceState 一次、pushState 零次、網址沒有 panel；再上一頁回原本那一筆', SLOW, async () => {
    await mount({ messages: [msg(1)] })
    pressE()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    click(inboxButton())
    await waitFor(() => expect(url()).toBe('/world'))
    await go(1)
    await waitFor(() => expect(listPanel()).not.toBeNull())
    expect(inboxPanel()).toBeNull()
    expect(url()).toBe('/world?panel=profiles')

    const held = await holdSend()
    await waitFor(() => expect(url()).toBe('/world'))
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    await go(1)
    await act(async () => {})
    expect(inboxPanel()).not.toBeNull()
    expect(listPanel()).toBeNull()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(url()).toBe('/world')
    await go(-1)
    expect(url()).toBe('/world')
    expect(inboxPanel()).not.toBeNull()
    held.release()
  })

  it('[FE-X16-S18] 換角色彈出層：成功開面板就關；被拒也因焦點離開而關、草稿丟、焦點在收件匣按鈕', SLOW, async () => {
    const p = project()
    await mount({ project: p, url: `/world?panel=projects&project=${p.id}` })
    const held = await holdFormTeam(p)
    const picker = () => screen.queryByRole('region', { name: '更換角色' }) ?? document.querySelector<HTMLElement>('section[aria-label="更換角色"]')
    click(screen.getByRole('button', { name: '更換角色' }))
    expect(picker()).not.toBeNull()
    click(within(picker()!).getByRole('button', { name: /^角色 2/ }))
    click(inboxButton())
    expect(inboxPanel()).toBeNull()
    expect(picker(), '焦點離開了它').toBeNull()
    expect(document.activeElement).toBe(inboxButton())
    click(screen.getByRole('button', { name: '更換角色' }))
    expect(within(picker()!).getByRole('button', { name: /^角色 1/ }).getAttribute('aria-pressed'), '草稿丟了').toBe('true')
    click(inboxButton())
    held.release()
    await waitFor(() => expect(within(screen.getByTestId('project-detail')).getByTestId('project-status').textContent).toBe('已成軍'))

    click(screen.getByRole('button', { name: '更換角色' }))
    expect(picker()).not.toBeNull()
    click(inboxButton())
    expect(picker()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
  })

  it('[FE-X16-S21] 同一個 handler 裡開看板再開收件匣：兩個 true、只掛收件匣、看板從未掛載；關掉後鎖放開、active 空；送出中再請求 → false', SLOW, async () => {
    await mount({ messages: [msg(1)] })
    let mountedList = 0
    const observer = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && (n.dataset.testid === 'list-panel' || n.querySelector('[data-testid="list-panel"]'))) mountedList += 1
    })
    observer.observe(document.body, { childList: true, subtree: true })
    let a: boolean | undefined
    let b: boolean | undefined
    act(() => {
      a = g().list.openPanel('profiles')
      b = g().inbox.openList(null)
    })
    await act(async () => {})
    expect([a, b]).toEqual([true, true])
    expect(blockingPanels()).toHaveLength(1)
    expect(inboxPanel()).not.toBeNull()
    expect(mountedList, '看板從未掛載').toBe(0)
    observer.disconnect()
    expect(g().lock.current).toBe(true)
    expect(url(), '看板那次請求沒有寫網址').toBe('/world')
    escape()
    expect(g().lock.current, '關掉後鎖放開').toBe(false)
    expect(probe()).toEqual({ active: null, open: false })

    const held = await holdSend()
    let c: boolean | undefined
    act(() => {
      c = g().list.openPanel('profiles')
    })
    expect(c).toBe(false)
    expect(inboxPanel()).not.toBeNull()
    expect(listPanel()).toBeNull()
    held.release()
  })

  it('[FE-X16-S22] 看板的殼延後 commit、期間開收件匣：看板掛不出來；provider 在 commit 前卸載：不鎖死、下一次請求成功', SLOW, async () => {
    const view = await mount()
    let release = () => {}
    suspendGate = { promise: new Promise<void>((r) => (release = r)), release: () => release(), done: false }
    let a: boolean | undefined
    act(() => {
      a = g().list.openPanel('profiles')
    })
    expect(a).toBe(true)
    expect(listPanel(), '殼還在 Suspense 裡').toBeNull()
    expect(probe(), '殼沒登記：active 指著它、但「開著」是 false').toEqual({ active: 'list-panel', open: false })
    let b: boolean | undefined
    act(() => {
      b = g().inbox.openList(null)
    })
    expect(b).toBe(true)
    suspendGate.done = true
    await act(async () => suspendGate!.release())
    await act(async () => {})
    expect(listPanel(), '延後的 commit 掛不出第二個面板').toBeNull()
    expect(inboxPanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    escape()

    // provider 在 commit 前整個卸載：請求成功後同一個 act 裡把世界拆掉
    suspendGate = { promise: new Promise<void>((r) => (release = r)), release: () => release(), done: false }
    act(() => {
      g().list.openPanel('profiles')
      view.rerender(<App world={false} />)
    })
    await act(async () => {})
    expect(probe().open, '不存在的面板不能壓著提示與聊天框').toBe(false)
    view.rerender(<App />)
    await waitFor(() => expect(grabbed).not.toBeNull())
    suspendGate = null
    let c: boolean | undefined
    act(() => {
      c = g().inbox.openList(null)
    })
    expect(c).toBe(true)
    await waitFor(() => expect(inboxPanel()).not.toBeNull())
  })

  it('[FE-X16-S22] Strict Mode 殼掛→卸→掛：登記是新的那筆、開著是 true、active 仍指向它；殼卸載不動 active', () => {
    let panels: ReturnType<typeof useBlockingPanels> | null = null
    function GrabPanels() {
      panels = useBlockingPanels()
      return null
    }
    const shell = (mounted: boolean) => (
      <StrictMode>
        <BlockingPanelCoordinator>
          <InteractionProvider>
            <GrabPanels />
            <Probe />
            {mounted && (
              <PanelShell title="殼" closeLabel="關閉" testId="p" panel={{ id: 'profile-panel', canYield: () => true, onYield: () => {} }} onCloseRequest={() => {}}>
                <span />
              </PanelShell>
            )}
          </InteractionProvider>
        </BlockingPanelCoordinator>
      </StrictMode>
    )
    const view = render(shell(false))
    act(() => {
      expect(panels!.requestOpen('profile-panel')).toBe(true)
    })
    expect(probe()).toEqual({ active: 'profile-panel', open: false })
    view.rerender(shell(true))
    expect(probe(), 'Strict Mode 的舊 cleanup 不得刪掉新登記').toEqual({ active: 'profile-panel', open: true })
    view.rerender(shell(false))
    expect(probe(), '殼卸載不動 active').toEqual({ active: 'profile-panel', open: false })
    act(() => {
      expect(panels!.requestOpen('inbox-panel')).toBe(true)
    })
    expect(probe()).toEqual({ active: 'inbox-panel', open: false })
    act(() => panels!.requestClose('inbox-panel'))
    expect(probe()).toEqual({ active: null, open: false })
  })
})
