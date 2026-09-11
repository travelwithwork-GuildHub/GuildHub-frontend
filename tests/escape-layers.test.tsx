import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AvatarPicker } from '@/app/world/AvatarPicker'
import { AvatarDraftProvider, useAvatarDraft } from '@/identity/AvatarDraftProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { escapeLayerCount } from '@/world/interaction/escapeLayers'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-x06-keyboard-focus/specs/keyboard-focus/spec.md
//   Requirement: Escape 每次只關最上層 —— S01／S02
//   Requirement: 焦點有邊界，關閉之後有地方去 —— S12、S13（DOM 半邊：錨在哪；Tab 循環 S11 在 Playwright）
//   Requirement: 非阻斷式的彈出層 —— S15、S16、S17（S14「人走得動」在 `input-lock.test.tsx` 的形狀，這裡看鎖）
//   MODIFIED：`FE-B01-S16`（沒有子層時一次就關）由 S02 覆蓋
//
// 整棵真的 provider 樹：`InteractionProvider > ListPanelProvider > BoardTargets + BoardPanel + AvatarPicker`。
// **不連任何團隊共用的位址。**

vi.mock('@/realtime/RealtimeGenerationProvider', () => ({
  useRealtimeGeneration: () => ({ generation: 0, rejoin: vi.fn() }),
}))
vi.mock('@/identity/IdentityProvider', () => ({
  useIdentity: () => ({
    state: 'signed-in',
    profile: {
      id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      display_name: '鍵盤測試員',
      avatar_id: 0,
      skills: [],
      hours_per_week: null,
      bio: null,
      updated_at: '2026-09-10T00:00:00Z',
    },
  }),
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

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  server.replyFor('/api/profiles', 200, [profile(0), profile(1)])
  server.replyFor(`/api/profiles/${UUID(0)}`, 200, profile(0))
})
afterEach(async () => {
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  await server.close()
  // 每條測試結束堆疊要是空的 —— 卸載沒把自己拿掉的話，下一條測試的 Escape 會打到幽靈層。
  // 先 cleanup（這個 afterEach 跑在 setup 的那個之前），不然元件還掛著。
  cleanup()
  expect(escapeLayerCount()).toBe(0)
})

type World = { registry: InteractableRegistry; lock: RefObject<boolean>; panel: ReturnType<typeof useListPanel> }
function Grab({ sinkRef }: { sinkRef: RefObject<World | null> }) {
  const { registry, inputLockRef } = useInteraction()
  const panel = useListPanel()
  useEffect(() => {
    sinkRef.current = { registry, lock: inputLockRef, panel }
  }, [sinkRef, registry, inputLockRef, panel])
  return null
}
function DraftProbe() {
  const { draft } = useAvatarDraft()
  return <span data-testid="draft">{draft === undefined ? 'none' : String(draft)}</span>
}

function mountWorld() {
  const sinkRef: RefObject<World | null> = { current: null }
  render(
    <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
      <InteractionProvider>
        <ListPanelProvider>
          <AvatarDraftProvider>
            <Grab sinkRef={sinkRef} />
            <header>
              <a href="/login">建立你的身分</a>
              <AvatarPicker />
              <DraftProbe />
            </header>
            <BoardTargets />
            <BoardPanel />
          </AvatarDraftProvider>
        </ListPanelProvider>
      </InteractionProvider>
    </div>,
  )
  const world = () => {
    if (sinkRef.current === null) throw new Error('provider 還沒掛好')
    return sinkRef.current
  }
  const pressE = () => {
    const id = boardItems().find((b) => b.kind === 'talentBoard')?.item.id
    act(() => {
      world().registry.entries.get(id ?? '')?.onInteract?.()
    })
  }
  return { world, pressE }
}
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
const cards = () => screen.queryAllByTestId('talent-card')
const panel = () => screen.queryByTestId('list-panel')
const detail = () => screen.queryByTestId('talent-detail')

describe('Escape 每次只關最上層', () => {
  it('[FE-X06-S01] 兩次 Escape，一次一層：詳情 → 列表（頁碼還在）→ 關面板', async () => {
    const { world, pressE } = mountWorld()
    pressE()
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    expect(escapeLayerCount()).toBe(2)

    escape()
    expect(detail(), '第一下 Escape 沒關詳情').toBeNull()
    expect(panel(), '第一下 Escape 連面板一起關了 —— 兩層各關各的').not.toBeNull()
    expect(cards()).toHaveLength(2)
    expect(world().lock.current).toBe(true)

    escape()
    expect(panel(), '第二下 Escape 沒關面板').toBeNull()
    expect(world().lock.current, '面板關了鎖沒放').toBe(false)
  })

  it('[FE-X06-S02][FE-B01-S16] 沒有子層時一次就關面板', async () => {
    const { world, pressE } = mountWorld()
    pressE()
    await waitFor(() => expect(cards()).toHaveLength(2))
    escape()
    expect(panel(), '沒有子層，一下 Escape 沒關面板 —— 「一律只關詳情、永遠關不掉面板」').toBeNull()
    expect(world().lock.current).toBe(false)
  })
})

describe('焦點有邊界，關閉之後有地方去', () => {
  it('[FE-X06-S12] 詳情關閉，焦點回那張卡', async () => {
    const { pressE } = mountWorld()
    pressE()
    await waitFor(() => expect(cards()).toHaveLength(2))
    const card = cards()[0] as HTMLElement
    card.focus()
    fireEvent.click(card)
    await waitFor(() => expect(detail()?.dataset.phase).toBe('ready'))
    escape()
    expect(detail()).toBeNull()
    expect(document.activeElement, '詳情關了焦點沒回那張卡').toBe(cards()[0])
  })

  it('[FE-X06-S13] 面板關閉，焦點在世界焦點錨上，不是 body', async () => {
    const { pressE } = mountWorld()
    pressE()
    await waitFor(() => expect(cards()).toHaveLength(2))
    escape()
    expect(panel()).toBeNull()
    expect(document.activeElement, '面板關了焦點掉到 body —— 鍵盤使用者的下一個 Tab 從頭開始').not.toBe(document.body)
    expect(document.activeElement?.getAttribute('data-focus-anchor')).toBe('world')
  })
})

describe('非阻斷式的彈出層：AvatarPicker', () => {
  const openPicker = () => {
    fireEvent.click(screen.getByRole('button', { name: '更換角色' }))
    return screen.getByRole('region', { name: '更換角色' })
  }

  it('[FE-X06-S14] 彈出層開著不鎖世界', () => {
    const { world } = mountWorld()
    openPicker()
    expect(world().lock.current, 'picker 開著把世界鎖了 —— 邊走邊看新外觀是 FE-A05 的產品意圖').toBe(false)
  })

  it('[FE-X06-S15] Escape 關彈出層，焦點回「更換角色」', () => {
    mountWorld()
    openPicker()
    expect(escapeLayerCount()).toBe(1)
    escape()
    expect(screen.queryByRole('region', { name: '更換角色' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '更換角色' }))
  })

  it('[FE-X06-S16] 焦點移出範圍就關', () => {
    mountWorld()
    const region = openPicker()
    // 開的時候焦點要進來（第一個選項）——沒進來的話它永遠不會離開。
    expect(region.contains(document.activeElement), '開了 picker 焦點沒進去').toBe(true)
    const link = screen.getByRole('link', { name: '建立你的身分' })
    // 焦點移到範圍外：先 focusout（relatedTarget 是要去的地方）再 focus。
    fireEvent.focusOut(region, { relatedTarget: link })
    link.focus()
    expect(screen.queryByRole('region', { name: '更換角色' }), 'Tab 走出去了 picker 還開著').toBeNull()
    // 失焦而關**不**搶回焦點 —— 焦點是刻意去別處的。
    expect(document.activeElement).toBe(link)
  })

  it('[FE-X06-S17] 彈出層開著時按 E 開面板：面板開並取得焦點、彈出層關、草稿丟', async () => {
    const { pressE } = mountWorld()
    const region = openPicker()
    fireEvent.click(within(region).getByRole('button', { name: /角色 2/ }))
    expect(screen.getByTestId('draft').textContent).toBe('1')

    pressE()
    await waitFor(() => expect(cards()).toHaveLength(2))
    // 面板掛載時把焦點放到列表上 → picker 的 focusout（jsdom 的 focus() 會派送 focusout，relatedTarget 是列表）。
    expect(panel()?.contains(document.activeElement), '面板沒有取得焦點').toBe(true)
    expect(screen.queryByRole('region', { name: '更換角色' }), '面板開了 picker 還開著 —— 兩層 UI 誰持有焦點？').toBeNull()
    expect(screen.getByTestId('draft').textContent, '草稿沒被丟 —— 畫面上的自己還是沒儲存的那一款').toBe('none')
    expect(escapeLayerCount(), '堆疊裡應該只剩面板').toBe(1)
    // 卸載時依 token 移除自己：picker 先走，面板還在 —— 這時 Escape 關的是面板，不是幽靈。
    escape()
    expect(panel()).toBeNull()
  })
})
