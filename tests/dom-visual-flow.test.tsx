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
import { BlockingPanelCoordinator, useActivePanel, useBlockingPanelOpen, useBlockingPanels, useRegisterBlockingPanel } from '@/panel/BlockingPanelCoordinator'
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
//   Requirement: 同一時間只有一個阻斷式面板；讓位有協定；非阻斷的提示讓位 —— S13（看板↔收件匣、寄信那條路）、S17（接受的那一半）、S21（前兩段）、S22
//   （jsdom 半邊；名片、拒絕讓位、非阻斷表面在 `--flow-yield`；`focusin` 序列、真瀏覽器的上一頁／下一頁在 `tests/e2e/dom-visual.mjs`）
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
  // 讀 `active`：看板被指到的那一次繪製才會走到這裡（不讀的話 React 不重繪它、也就不會 suspend）
  const active = useActivePanel()
  if (suspendGate !== null && !suspendGate.done && active === 'list-panel') throw suspendGate.promise
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
async function mount(opts: { guest?: boolean; url?: string; project?: ProjectOut } = {}) {
  if (opts.guest) server.replyFor('/api/me', 401, { detail: 'no' })
  else server.replyFor('/api/me', 200, ME)
  for (let i = 0; i < 8; i += 1) {
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
/** 收件匣每次從關閉打開都重取第 0 頁：開之前先排一份回應（contract-server 的佇列不分方法，不能預先堆 —— 寄信的 POST 會吃到）。 */
const willOpenInbox = (messages: MessageOut[] = []) => server.replyFor('/api/messages', 200, messages)
const listPanel = () => screen.queryByTestId('list-panel')
const inboxPanel = () => screen.queryByTestId('inbox-panel')
const profilePanel = () => screen.queryByTestId('profile-panel')
const blockingPanels = () => [listPanel(), inboxPanel(), profilePanel()].filter((p) => p !== null)
describe('同一時間只有一個阻斷式面板', () => {
  it('[FE-X16-S13] 看板→收件匣：後開的取代先開的、焦點在新面板內、不經開啟者與 body、網址退；人才詳情寄信也一樣', SLOW, async () => {
    await mount()
    pressE()
    expect(listPanel()?.dataset.kind).toBe('profiles')
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    const focusins: string[] = []
    const onFocusIn = (e: FocusEvent) => focusins.push((e.target as HTMLElement).dataset.testid ?? (e.target as HTMLElement).tagName)
    inboxButton().focus()
    document.addEventListener('focusin', onFocusIn)
    willOpenInbox()
    click(inboxButton())
    expect(listPanel()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    expect(inboxPanel()!.contains(document.activeElement)).toBe(true)
    expect(focusins, '焦點不經世界錨、不經 body').not.toContain('world-canvas-container')
    expect(focusins).not.toContain('BODY')
    document.removeEventListener('focusin', onFocusIn)
    await waitFor(() => expect(url()).toBe('/world'))

    escape()
    expect(blockingPanels()).toHaveLength(0)

    // 人才詳情裡按寄信（`inbox` 既有的路）：看板關、收件匣開、焦點在收件匣內
    pressE()
    click(await screen.findByTestId('talent-card'))
    const send = await screen.findByTestId('send-message')
    willOpenInbox()
    click(send)
    expect(listPanel()).toBeNull()
    expect(inboxPanel()).not.toBeNull()
    expect(blockingPanels()).toHaveLength(1)
    await waitFor(() => expect(inboxPanel()!.contains(document.activeElement)).toBe(true))
    expect(screen.getByTestId('inbox-thread').dataset.with).toBe(OTHER.id)
    // 看板讓位的 `go(-1)` 是非同步的：等它落地（不然 popstate 會打到下一條測試的 history）
    await waitFor(() => expect(url()).toBe('/world'))
    // 讓位走的是既有的關閉路徑（不只是「不掛」）：再按 E 是乾淨的清單，不是剛剛那一筆詳情
    escape()
    escape()
    expect(blockingPanels()).toHaveLength(0)
    pressE()
    expect(listPanel()?.dataset.kind).toBe('profiles')
    expect(screen.queryByTestId('talent-detail'), '讓位沒有走關閉路徑：上一次的詳情還在').toBeNull()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    escape()
    await waitFor(() => expect(url()).toBe('/world'))
  })

  it('[FE-X16-S17] 下一頁要求重開看板：持有者接受就重開（拒絕的那一半在 --flow-yield）', SLOW, async () => {
    await mount()
    pressE()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    willOpenInbox()
    click(inboxButton())
    await waitFor(() => expect(url()).toBe('/world'))
    await go(1)
    await waitFor(() => expect(listPanel()).not.toBeNull())
    expect(inboxPanel()).toBeNull()
    expect(url()).toBe('/world?panel=profiles')
  })

  it('[FE-X16-S21] 同一個 handler 裡開看板再開收件匣：兩個 true、只掛收件匣、看板從未掛載；關掉後鎖放開、active 空', SLOW, async () => {
    await mount()
    let mountedList = 0
    const observer = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && (n.dataset.testid === 'list-panel' || n.querySelector('[data-testid="list-panel"]'))) mountedList += 1
    })
    observer.observe(document.body, { childList: true, subtree: true })
    let a: boolean | undefined
    let b: boolean | undefined
    willOpenInbox()
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
    willOpenInbox()
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
    willOpenInbox()
    act(() => {
      c = g().inbox.openList(null)
    })
    expect(c).toBe(true)
    await waitFor(() => expect(inboxPanel()).not.toBeNull())
    await waitFor(() => expect(url()).toBe('/world'))
  })

  it('[FE-X16-S22] Strict Mode 殼掛→卸→掛：登記是新的那筆、開著是 true、active 仍指向它；殼卸載不動 active', () => {
    let panels: ReturnType<typeof useBlockingPanels> | null = null
    function GrabPanels() {
      const value = useBlockingPanels()
      useEffect(() => {
        panels = value
      }, [value])
      return null
    }
    // 同一個 id 的第二筆登記（比殼晚掛、比殼晚卸）：殼卸載時只能刪自己那筆 —— React 的 effect 順序下 Strict Mode 本身量不到 compare-and-delete，這一筆才量得到
    function Later() {
      useRegisterBlockingPanel({ id: 'profile-panel', canYield: () => true, onYield: () => {} })
      return null
    }
    const shell = (mounted: boolean, later = false) => (
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
            {later && <Later />}
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
    view.rerender(shell(true, true))
    view.rerender(shell(false, true))
    expect(probe(), '殼卸載只刪自己那筆：晚掛的那筆還在').toEqual({ active: 'profile-panel', open: true })
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
