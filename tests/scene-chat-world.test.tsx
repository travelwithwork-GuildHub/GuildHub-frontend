import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { CHAT_COMPOSER_LABELS } from '@/chat/SceneChatComposer'
import { SceneChatHud } from '@/chat/SceneChatHud'
import { SceneChatProvider } from '@/realtime/SceneChatProvider'
import { EditableFocusLock } from '@/world/interaction/EditableFocusLock'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { SceneProvider } from '@/world/scenes/SceneProvider'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-k04-scene-chat-ui/specs/scene-chat-ui/spec.md
//   Requirement: 不必互動就看得到目前場景的 chat；只看不鎖世界，打字才鎖 —— S01（jsdom 可驗的部分）、S02（鎖與焦點）
//
// 掛真的 `WorldCanvas`（`page.tsx` 的形狀：`SceneProvider` → `SceneChatProvider` → `WorldCanvas`）；訊息由假伺服器（FakeSocket）送。
// 換掉的只有第三方邊界（r3f `Canvas`、`LocalPlayer`、`RemotePlayers`、`PositionSync`）。「真的按 W 會動」是 e2e 的；這裡量的是鎖（`inputLockRef`）與焦點。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    onCreated?.()
    return <canvas data-testid="r3f-canvas-stub">{children}</canvas>
  },
}))
vi.mock('@/world/player/LocalPlayer', () => ({ LocalPlayer: () => null }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))
vi.mock('@/api/operations', () => ({
  listRooms: vi.fn(async () => []),
  enterProject: vi.fn(),
  listProfiles: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
}))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  readonly sent: string[] = []
  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }
  addEventListener(type: string, l: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(l))
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {}
  emit(type: string, payload: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(payload)
  }
  ready() {
    this.emit('open', null)
    this.emit('message', { data: JSON.stringify({ t: 'hello', you: 'me', hz: 10 }) })
    this.emit('message', { data: JSON.stringify({ t: 'snapshot', players: [] }) })
  }
  chat(name: string, body: string) {
    this.emit('message', { data: JSON.stringify({ t: 'chat', id: 'u1', name, body }) })
  }
}

function LockProbe({ sinkRef }: { sinkRef: RefObject<RefObject<boolean> | null> }) {
  const { inputLockRef } = useInteraction()
  useEffect(() => {
    sinkRef.current = inputLockRef
  }, [sinkRef, inputLockRef])
  return null
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
  identity.current = { state: 'guest', reason: 'no-session' }
  window.history.replaceState(null, '', '/world')
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })

/** `page.tsx` 的形狀。 */
async function mountWorld() {
  render(
    <SceneProvider>
      <SceneChatProvider>
        <WorldCanvas />
      </SceneChatProvider>
    </SceneProvider>,
  )
  await flush()
  const socket = FakeSocket.instances.at(-1) as FakeSocket
  await act(async () => socket.ready())
  await flush()
  return { socket }
}
/**
 * S02 的鎖與焦點：`WorldCanvas` 自己有 `InteractionProvider`，外面讀不到那把鎖 —— 這裡把 HUD 掛在測試的 `InteractionProvider` 底下，
 * 旁邊放正式的 `EditableFocusLock`（鎖就是它持的）與世界焦點錨；HUD 在 `WorldCanvas` 裡的位置由 S01 守。
 */
function mountHud() {
  const lockRef: RefObject<RefObject<boolean> | null> = { current: null }
  render(
    <SceneProvider>
      <SceneChatProvider>
        <InteractionProvider>
          <LockProbe sinkRef={lockRef} />
          <EditableFocusLock />
          <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
            <SceneChatHud />
          </div>
        </InteractionProvider>
      </SceneChatProvider>
    </SceneProvider>,
  )
  return { lock: () => lockRef.current?.current }
}
/** `EditableFocusLock` 在焦點事件之後排 microtask＋下一個 task 才重算。 */
const settleFocus = () =>
  act(async () => {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
  })
const hud = () => screen.getByTestId('scene-chat')
const field = () => screen.getByLabelText(CHAT_COMPOSER_LABELS.field) as HTMLTextAreaElement
const anchor = () => screen.getByTestId('world-canvas-container')

describe('不必互動就看得到', () => {
  it('[FE-K04-S01] 剛進大廳、沒碰任何東西：chat 區在焦點錨容器裡、沒有 dialog；伺服器送來一則就顯示', async () => {
    const { socket } = await mountWorld()
    expect(anchor().contains(hud()), 'chat 區在世界焦點錨的容器裡').toBe(true)
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
    expect(screen.getByTestId('chat-empty')).toBeTruthy()
    await act(async () => socket.chat('阿福', '早安'))
    expect(screen.getByTestId('chat-name').textContent).toBe('阿福')
    expect(screen.getByTestId('chat-body').textContent).toBe('早安')
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
  })
})

describe('只看不鎖；打字才鎖；Escape 回錨', () => {
  it('[FE-K04-S02] chat 區可見、輸入框沒焦點：鎖是開的；輸入框有焦點：鎖住、字進欄位；Escape：焦點回錨、chat 區還在、值保留、網址不變；離開後鎖開', async () => {
    const { lock } = mountHud()
    expect(hud()).toBeTruthy()
    expect(lock(), '只看不鎖').toBe(false)
    act(() => field().focus())
    await settleFocus()
    expect(lock(), '輸入框有焦點要鎖').toBe(true)
    fireEvent.change(field(), { target: { value: 'w' } })
    expect(field().value).toBe('w')
    const before = window.location.href
    fireEvent.keyDown(field(), { key: 'Escape' })
    await settleFocus()
    expect(document.activeElement, 'Escape 要把焦點放回世界錨').toBe(anchor())
    expect(hud(), 'Escape 不關 chat 區').toBeTruthy()
    expect(field().value, '值保留').toBe('w')
    expect(window.location.href).toBe(before)
    expect(lock(), '離開輸入框之後鎖要開').toBe(false)
  })
})
