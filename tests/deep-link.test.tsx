import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { PanelUrlSync } from '@/list-panel/PanelUrlSync'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b09-deep-link/specs/deep-link/spec.md
//   Requirement: 網址表示開著哪一層，複製它就能還原 —— S01～S05、S13
//   Requirement: 互動寫回網址；上一頁與 Escape 等效 —— S06～S11
//
// 整棵真的 provider 樹 ＋ `PanelUrlSync`，`window.history` 是 jsdom 真的那一個。
// 深連結直達 = 先 `replaceState` 成那個網址再掛載（design〈這一份怎麼驗〉）。
// **不連任何團隊共用的位址。**

vi.mock('@/realtime/RealtimeGenerationProvider', () => ({
  useRealtimeGeneration: () => ({ generation: 0, rejoin: vi.fn() }),
}))
vi.mock('@/identity/IdentityProvider', () => ({
  useIdentity: () => ({ state: 'anonymous' }),
  useAdoptIdentity: () => vi.fn(),
}))

const UUID = (n: number) => `33333333-3333-3333-3333-${String(n).padStart(12, '0')}`
const profile = (n: number) => ({
  id: UUID(n),
  display_name: `人才${n}`,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
})
const project = (n: number) => ({
  id: UUID(100 + n),
  owner_id: UUID(0),
  title: `案件${n}`,
  body: '找人',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: '2026-10-09T00:00:00Z',
  updated_at: '2026-09-09T00:00:00Z',
})

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})
afterEach(async () => {
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  cleanup()
  await server.close()
  window.history.replaceState(null, '', '/')
})

type World = { registry: InteractableRegistry; lock: RefObject<boolean> }
/** 世界的輸入鎖（深連結開著面板時，人也不該走得動：`FE-B01-S18` 的鎖沒有人按 E 也要持有）與看板的 registry。 */
function WorldProbe({ sinkRef }: { sinkRef: RefObject<World | null> }) {
  const { registry, inputLockRef } = useInteraction()
  useEffect(() => {
    sinkRef.current = { registry, lock: inputLockRef }
  }, [sinkRef, registry, inputLockRef])
  return null
}

function arriveAt(url: string) {
  // 保留測試預先放進 `history.state` 的東西（Next 的、上一次掛載的）。
  window.history.replaceState(window.history.state, '', url)
  const sinkRef: RefObject<World | null> = { current: null }
  render(
    <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
      <InteractionProvider>
        <WorldProbe sinkRef={sinkRef} />
        <ListPanelProvider>
          <PanelUrlSync />
          <BoardTargets />
          <BoardPanel />
        </ListPanelProvider>
      </InteractionProvider>
    </div>,
  )
  const pressE = () => {
    const id = boardItems().find((b) => b.kind === 'talentBoard')?.item.id
    act(() => {
      sinkRef.current?.registry.entries.get(id ?? '')?.onInteract?.()
    })
  }
  return { locked: () => sinkRef.current?.lock.current ?? null, pressE }
}
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
/** 瀏覽器的上一頁／下一頁：jsdom 的 `history.go` 是非同步的，popstate 之後才回來。 */
const go = (delta: number) =>
  new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
    act(() => window.history.go(delta))
  })
const url = () => `${window.location.pathname}${window.location.search}`
const panel = () => screen.queryByTestId('list-panel')
const detail = () => screen.queryByTestId('talent-detail')
const cards = () => screen.queryAllByTestId('talent-card')
const listCalls = (pathname: string) => server.calls.filter((c) => c.pathname === pathname).map((c) => c.search)

describe('網址表示開著哪一層，複製它就能還原', () => {
  it('[FE-B09-S01] ?panel=profiles：人才清單開著，已送 GET /api/profiles?page=0', async () => {
    server.replyFor('/api/profiles', 200, [profile(0), profile(1)])
    const { locked } = arriveAt('/world?panel=profiles')
    expect(panel()?.dataset.kind, '沒有人按 E，面板要從網址開').toBe('profiles')
    expect(locked(), '面板從網址開著，世界的輸入鎖沒持有 —— 人在面板底下走').toBe(true)
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(listCalls('/api/profiles')).toEqual(['?page=0'])
    expect(url()).toBe('/world?panel=profiles')
  })

  it('[FE-B09-S02] ?panel=profiles&profile=<id>：詳情蓋在面板上，已送 GET /api/profiles/<id>', async () => {
    server.replyFor('/api/profiles', 200, [profile(0), profile(1)])
    server.replyFor(`/api/profiles/${UUID(1)}`, 200, { ...profile(1), bio: '詳情端點回的' })
    arriveAt(`/world?panel=profiles&profile=${UUID(1)}`)
    expect(panel()?.dataset.kind).toBe('profiles')
    expect(detail(), '詳情沒有跟著網址開').not.toBeNull()
    await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    expect(screen.getByText('詳情端點回的')).toBeTruthy()
    expect(server.calls.some((c) => c.pathname === `/api/profiles/${UUID(1)}`), '沒有預覽可用，要去載那一筆').toBe(true)
  })

  it('[FE-B09-S13] ?panel=projects：案件清單開著，已送 GET /api/projects?page=0', async () => {
    server.replyFor('/api/projects', 200, [project(0)])
    arriveAt('/world?panel=projects')
    expect(panel()?.dataset.kind).toBe('projects')
    await waitFor(() => expect(screen.getByText('案件0')).toBeTruthy())
    expect(listCalls('/api/projects')).toEqual(['?page=0'])
    expect(listCalls('/api/profiles'), '案件面板不該去打人才端點').toEqual([])
  })

  it('[FE-B09-S03] page=2：清單送出的第一個請求是 page=2', async () => {
    server.replyFor('/api/profiles', 200, [profile(40), profile(41)])
    arriveAt('/world?panel=profiles&page=2')
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(listCalls('/api/profiles')[0], '深連結的頁碼沒被用上，還是從第 0 頁開始').toBe('?page=2')
    expect(listCalls('/api/profiles')).toHaveLength(1)
    expect(url()).toBe('/world?panel=profiles&page=2')
  })

  it('[FE-B09-S04] 直達的頁碼已經是空的：改請求第 0 頁並呈現，網址不再帶 page=7', async () => {
    server.replyFor('/api/profiles', 200, [])
    server.replyFor('/api/profiles', 200, [profile(0)])
    arriveAt('/world?panel=profiles&page=7')
    // 第 7 頁撲空的那一格不能被畫成「首次無資料」—— 使用者會以為系統沒資料或連結壞了。
    // 用 MutationObserver 盯著：`waitFor` 之後再查是查不到中間那一格的。
    const seen = new Set<string>()
    const observer = new MutationObserver(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-empty-state]')) seen.add(el.dataset.emptyState ?? '')
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    await waitFor(() => expect(cards()).toHaveLength(1))
    observer.disconnect()
    expect(listCalls('/api/profiles')).toEqual(['?page=7', '?page=0'])
    expect(seen.has('first-empty'), '第 7 頁撲空被畫成「首次無資料」').toBe(false)
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
  })

  describe('[FE-B09-S05] 不合法的參數回到 canonical，不出錯', () => {
    it('page=-1：人才清單第 0 頁，網址 /world?panel=profiles', async () => {
      server.replyFor('/api/profiles', 200, [profile(0)])
      arriveAt('/world?panel=profiles&page=-1')
      await waitFor(() => expect(cards()).toHaveLength(1))
      expect(listCalls('/api/profiles')).toEqual(['?page=0'])
      expect(url()).toBe('/world?panel=profiles')
    })
    it('page=abc：同上', async () => {
      server.replyFor('/api/profiles', 200, [profile(0)])
      arriveAt('/world?panel=profiles&page=abc')
      await waitFor(() => expect(cards()).toHaveLength(1))
      expect(listCalls('/api/profiles')).toEqual(['?page=0'])
      expect(url()).toBe('/world?panel=profiles')
    })
    it('panel=bogus：沒有面板的世界，網址 /world', () => {
      const { locked } = arriveAt('/world?panel=bogus')
      expect(panel()).toBeNull()
      expect(locked()).toBe(false)
      expect(url()).toBe('/world')
      expect(server.calls).toEqual([])
    })
    it('單獨的 profile=<id>：視為人才面板開著那一筆詳情，網址補上 panel', async () => {
      server.replyFor('/api/profiles', 200, [profile(0)])
      server.replyFor(`/api/profiles/${UUID(0)}`, 200, profile(0))
      arriveAt(`/world?profile=${UUID(0)}`)
      expect(panel()?.dataset.kind).toBe('profiles')
      expect(detail()).not.toBeNull()
      expect(url()).toBe(`/world?panel=profiles&profile=${UUID(0)}`)
      await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    })
  })
})

describe('互動寫回網址；上一頁與 Escape 等效', () => {
  const TWO = [profile(0), profile(1)]
  /** 從 `/world` 走到看板前按 E，再點第一張卡：清單一層、詳情一層。 */
  async function openListThenDetail() {
    server.replyFor('/api/profiles', 200, TWO)
    server.replyFor(`/api/profiles/${UUID(0)}`, 200, profile(0))
    const world = arriveAt('/world')
    const base = window.history.length
    world.pressE()
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    return { ...world, base }
  }

  it('[FE-B09-S06] 按 E 開清單：網址多 panel，紀錄多一層；Next 放在 history.state 的東西還在', async () => {
    server.replyFor('/api/profiles', 200, TWO)
    const { pressE } = arriveAt('/world')
    // Next App Router 把自己的路由狀態放在 `history.state`：整個蓋掉的話，上一頁離開 /world 時 router 會崩。
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['', {}] }, '', '/world')
    const base = window.history.length
    pressE()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    expect(window.history.length, '開清單沒有新增一層紀錄 —— 上一頁會直接離開世界').toBe(base + 1)
    expect((window.history.state as Record<string, unknown>).__NA, 'push 的時候把 Next 的 history.state 蓋掉了').toBe(true)
    expect((window.history.state as Record<string, unknown>).__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(['', {}])
  })

  it('[FE-B09-S07] 點卡開詳情：網址多 profile，紀錄再多一層', async () => {
    const { base } = await openListThenDetail()
    expect(url()).toBe(`/world?panel=profiles&profile=${UUID(0)}`)
    expect(window.history.length).toBe(base + 2)
  })

  it('[FE-B09-S08] 翻頁改網址、不加紀錄', async () => {
    server.replyFor('/api/profiles', 200, Array.from({ length: 20 }, (_, i) => profile(i)))
    server.replyFor('/api/profiles', 200, [profile(20)])
    const { pressE } = arriveAt('/world')
    pressE()
    await waitFor(() => expect(cards()).toHaveLength(20))
    const before = window.history.length
    fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
    await waitFor(() => expect(url()).toBe('/world?panel=profiles&page=1'))
    expect(window.history.length, '翻頁 push 了一層 —— 上一頁會變成「上一頁的清單」而不是關面板').toBe(before)
  })

  it('[FE-B09-S09] 上一頁關最上層，下一頁依序重開', async () => {
    const { locked } = await openListThenDetail()
    await go(-1)
    await waitFor(() => expect(detail()).toBeNull())
    expect(panel(), '上一頁把面板一起關了').not.toBeNull()
    expect(cards()).toHaveLength(2)
    expect(url()).toBe('/world?panel=profiles')
    await go(-1)
    await waitFor(() => expect(panel()).toBeNull())
    expect(url()).toBe('/world')
    expect(locked(), '面板被上一頁關了，鎖沒放').toBe(false)
    await go(1)
    await waitFor(() => expect(panel()?.dataset.kind).toBe('profiles'))
    expect(detail()).toBeNull()
    expect(locked()).toBe(true)
    await go(1)
    await waitFor(() => expect(detail()).not.toBeNull())
    expect(url()).toBe(`/world?panel=profiles&profile=${UUID(0)}`)
  })

  it('[FE-B09-S10] Escape 關一層，網址跟著少一層；紀錄是退，不是再堆', async () => {
    const { base, locked } = await openListThenDetail()
    escape()
    expect(detail(), 'Escape 要同步關詳情（FE-X06-S01）').toBeNull()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    expect(panel()).not.toBeNull()
    escape()
    expect(panel()).toBeNull()
    await waitFor(() => expect(url()).toBe('/world'))
    expect(locked()).toBe(false)
    // 退回去之後紀錄長度不變（jsdom 的 length 算的是整條，退了之後前面那兩層還在，可以再前進）。
    expect(window.history.length).toBe(base + 2)
    await go(1)
    await waitFor(() => expect(panel()).not.toBeNull())
  })

  it('[FE-B09-S10] 兩下 Escape 連按：第二下在第一下的 popstate 之前，最後還是 /world，而且沒退過頭', async () => {
    await openListThenDetail()
    escape()
    escape()
    expect(panel()).toBeNull()
    await waitFor(() => expect(url()).toBe('/world'))
    // 不會多出一層、也不會又把面板打開。
    await new Promise((r) => setTimeout(r, 20))
    expect(url()).toBe('/world')
    expect(panel()).toBeNull()
    // 沒有退過頭：前面那一層（清單）還在，前進一次就是它。退的期間第二下 Escape 若又算了一次 delta 就會 go(-2)。
    await go(1)
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    expect(panel()).not.toBeNull()
  })

  it('[FE-B09-S11] 深連結直達，Escape 不離站', async () => {
    server.replyFor('/api/profiles', 200, TWO)
    server.replyFor(`/api/profiles/${UUID(0)}`, 200, profile(0))
    arriveAt(`/world?panel=profiles&profile=${UUID(0)}`)
    const base = window.history.length
    await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    escape()
    expect(detail()).toBeNull()
    expect(panel(), '一下 Escape 把面板連詳情一起關了 —— 同一個 commit 掛載時詳情比面板先註冊').not.toBeNull()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    expect(window.history.length, '直達之後 Escape 用了 back —— jsdom 只有一層時 back 是 no-op，網址會停在 profile').toBe(base)
    escape()
    await waitFor(() => expect(url()).toBe('/world'))
    expect(window.history.length).toBe(base)
  })

  it('[FE-B09-S11] 帶著別次掛載的血緣回來（先去別的路由再回來）：Escape 一樣不離站', async () => {
    server.replyFor('/api/profiles', 200, TWO)
    server.replyFor(`/api/profiles/${UUID(0)}`, 200, profile(0))
    // 上一次掛載留下的標記說「往回有兩層是我 push 的」—— 那是上一次的紀錄，這一次的 back 會退到哪裡沒有人知道。
    window.history.replaceState({ guildhubPanel: { session: 'previous-mount', pushed: 2 } }, '', `/world?panel=profiles&profile=${UUID(0)}`)
    arriveAt(`/world?panel=profiles&profile=${UUID(0)}`)
    const base = window.history.length
    await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    escape()
    await waitFor(() => expect(url()).toBe('/world?panel=profiles'))
    expect(window.history.length, '信了別次掛載的血緣去 back').toBe(base)
    expect(panel()).not.toBeNull()
  })
})
