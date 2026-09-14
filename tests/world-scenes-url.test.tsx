import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { CLOSED } from '@/list-panel/urlState'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import { WorldUrlSync } from '@/list-panel/PanelUrlSync'
import { parseWorldUrl, serializeWorldUrl } from '@/world/scenes/urlState'
import { holdRoomToken } from '@/world/scenes/roomTokens'
import type { Identity } from '@/identity/types'

// `?room=<uuid>` 進網址。規格 `FE-V01-S08`（codec）、`FE-V01-S09`（進房間多一層、上一頁回大廳）、
// `FE-V01-S14` 的網址那一半（有票直接進、沒票 canonical 成 `/world`）。
//
// 身分是 mock 的（`FE-B09` 的 deep-link 測試同一招）：這裡驗的是網址與場景狀態，不是 `GET /api/me`。
// 不連任何服務。

const identity = vi.hoisted(() => ({ current: { state: 'guest', reason: 'no-session' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({
  useIdentity: () => identity.current,
  useAdoptIdentity: () => vi.fn(),
}))

const ROOM = 'a0000000-0000-4000-8000-00000000000a'
const ROOM_B = 'b0000000-0000-4000-8000-00000000000b'
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }

describe('網址的 codec', () => {
  it.each([
    [`?room=${ROOM}`, { room: ROOM, panel: CLOSED }, `?room=${ROOM}`],
    ['?room=abc', { room: null, panel: CLOSED }, ''],
    [`?room=${ROOM}&panel=profiles&page=2`, { room: ROOM, panel: CLOSED }, `?room=${ROOM}`],
    ['?panel=profiles&page=2', { room: null, panel: { panel: 'profiles', profile: null, page: 2 } }, '?panel=profiles&page=2'],
    [`?room=${ROOM.toUpperCase()}`, { room: ROOM, panel: CLOSED }, `?room=${ROOM}`],
    [`?room=${ROOM}&room=${ROOM_B}`, { room: ROOM, panel: CLOSED }, `?room=${ROOM}`],
    ['?page=2&panel=profiles&foo=1', { room: null, panel: { panel: 'profiles', profile: null, page: 2 } }, '?panel=profiles&page=2'],
  ])('[FE-V01-S08] %s', (search, parsed, canonical) => {
    const state = parseWorldUrl(search)
    expect(state).toEqual(parsed)
    expect(serializeWorldUrl(state)).toBe(canonical)
    expect(parseWorldUrl(serializeWorldUrl(state)), 'canonical 要是定點').toEqual(state)
  })
})

type Probe = { scene: SceneValue; panel: ReturnType<typeof useListPanel> }
function ProbeSink({ sinkRef }: { sinkRef: RefObject<Probe | null> }) {
  const scene = useScene()
  const panel = useListPanel()
  useEffect(() => {
    sinkRef.current = { scene, panel }
  })
  return null
}

function arriveAt(url: string) {
  window.history.replaceState(window.history.state, '', url)
  const push = vi.spyOn(window.history, 'pushState')
  const replace = vi.spyOn(window.history, 'replaceState')
  const sinkRef: RefObject<Probe | null> = { current: null }
  render(
    <InteractionProvider>
      <ListPanelProvider>
        <SceneProvider>
          <WorldUrlSync />
          <ProbeSink sinkRef={sinkRef} />
        </SceneProvider>
      </ListPanelProvider>
    </InteractionProvider>,
  )
  return {
    probe: () => sinkRef.current!,
    pushes: () => push.mock.calls.length,
    replaces: () => replace.mock.calls.length,
  }
}
const go = (delta: number) =>
  new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
    act(() => window.history.go(delta))
  })
const url = () => `${window.location.pathname}${window.location.search}`

beforeEach(() => {
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('進房間多一層紀錄，上一頁回大廳', () => {
  it('[FE-V01-S09] 從清單開著進房間：網址 ?room、面板關；上一頁：網址與清單回來、場景是大廳；下一頁再進', async () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    const { probe, pushes } = arriveAt('/world?panel=profiles')
    expect(probe().panel.open).toBe('profiles')
    expect(probe().scene.scene).toEqual({ id: 'hall' })

    const before = pushes()
    act(() => probe().scene.enterRoom(ROOM))
    expect(url()).toBe(`/world?room=${ROOM}`)
    expect(pushes(), '進房間是 push 一層').toBe(before + 1)
    expect(probe().panel.open, '進房間時面板歸零').toBeNull()
    expect(probe().scene.scene).toEqual({ id: 'room', projectId: ROOM })

    await go(-1)
    expect(url(), '一次上一頁就到').toBe('/world?panel=profiles')
    expect(probe().scene.scene).toEqual({ id: 'hall' })
    expect(probe().panel.open, '清單重新開著').toBe('profiles')

    await go(1)
    expect(url()).toBe(`/world?room=${ROOM}`)
    expect(probe().scene.scene).toEqual({ id: 'room', projectId: ROOM })
    expect(probe().panel.open).toBeNull()
  })

  it('[FE-V01-S13] 「回到 Guild Hall」是 push：上一頁回到房間', async () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    const { probe, pushes } = arriveAt(`/world?room=${ROOM}`)
    expect(probe().scene.scene).toEqual({ id: 'room', projectId: ROOM })
    const before = pushes()
    act(() => probe().scene.returnToHall())
    expect(url()).toBe('/world')
    expect(pushes()).toBe(before + 1)
    expect(probe().scene.scene).toEqual({ id: 'hall' })
    await go(-1)
    expect(url()).toBe(`/world?room=${ROOM}`)
    expect(probe().scene.scene).toEqual({ id: 'room', projectId: ROOM })
  })
})

describe('深連結：有票直接進，沒票安靜地回大廳', () => {
  it('[FE-V01-S14] 有票：場景是房間、網址保持；換帳號：讀不到前一個的票、網址改成 /world', () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    let world = arriveAt(`/world?room=${ROOM}`)
    expect(world.probe().scene.scene).toEqual({ id: 'room', projectId: ROOM })
    expect(url()).toBe(`/world?room=${ROOM}`)
    expect(window.location.href, '票不進網址').not.toContain('T')
    cleanup()

    identity.current = { state: 'signed-in', profile: { ...PROFILE, id: 'q0000000-0000-4000-8000-00000000000q' } }
    world = arriveAt(`/world?room=${ROOM}`)
    expect(world.probe().scene.scene, 'Q 沒有票').toEqual({ id: 'hall' })
    expect(url()).toBe('/world')
    expect(world.probe().scene.deniedRoom, '要留下「你想去的那間房」給說明用').toBe(ROOM)
  })

  it('[FE-V01-S14] 身分還沒問完：不動網址、先在大廳；問完有票才進', () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    identity.current = { state: 'unknown' }
    const world = arriveAt(`/world?room=${ROOM}`)
    expect(world.probe().scene.scene).toEqual({ id: 'hall' })
    expect(url(), '身分沒問完之前不得把 room 洗掉').toBe(`/world?room=${ROOM}`)
    expect(world.replaces()).toBe(0)
    cleanup()
    // 同一個網址、身分回來了（重新掛載模擬 provider 更新）
    identity.current = { state: 'signed-in', profile: PROFILE }
    const again = arriveAt(`/world?room=${ROOM}`)
    expect(again.probe().scene.scene).toEqual({ id: 'room', projectId: ROOM })
  })

  it('[FE-V01-S14] 匿名：沒有票可言，回大廳', () => {
    identity.current = { state: 'guest', reason: 'no-session' }
    const world = arriveAt(`/world?room=${ROOM}`)
    expect(world.probe().scene.scene).toEqual({ id: 'hall' })
    expect(url()).toBe('/world')
  })
})
