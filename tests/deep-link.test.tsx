import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { PanelUrlSync } from '@/list-panel/PanelUrlSync'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { BoardTargets } from '@/world/rooms/BoardTargets'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b09-deep-link/specs/deep-link/spec.md
//   Requirement: 網址表示開著哪一層，複製它就能還原 —— S01～S05、S13
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

/** 世界的輸入鎖：深連結開著面板時，人也不該走得動（`FE-B01-S18` 的鎖沒有人按 E 也要持有）。 */
function LockProbe({ sinkRef }: { sinkRef: RefObject<RefObject<boolean> | null> }) {
  const { inputLockRef } = useInteraction()
  useEffect(() => {
    sinkRef.current = inputLockRef
  }, [sinkRef, inputLockRef])
  return null
}

function arriveAt(url: string) {
  window.history.replaceState(null, '', url)
  const lockRef: RefObject<RefObject<boolean> | null> = { current: null }
  render(
    <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
      <InteractionProvider>
        <LockProbe sinkRef={lockRef} />
        <ListPanelProvider>
          <PanelUrlSync />
          <BoardTargets />
          <BoardPanel />
        </ListPanelProvider>
      </InteractionProvider>
    </div>,
  )
  return { locked: () => lockRef.current?.current ?? null }
}
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
