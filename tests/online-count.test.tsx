import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_ACK_TIMEOUT_MS } from '@/realtime/client'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import type { SceneRef } from '@/world/scenes/registry'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-r10-presence/specs/remote-players/spec.md
//   Requirement: 使用者看得到目前 scene 的在線人數 —— FE-R10-S07 / S08 / S09
//
// ⚠️ **這三條的 THEN 是「畫面上顯示的」人數**，所以掛的是整個 `WorldCanvas`，
// 而 `RemoteWorld → RealtimeClient → new WebSocket(url)` 整條是**正式碼** —— 被換掉的只有：
//   - 全域 `WebSocket`（假 socket，測試自己送訊息；同 `remote-world-close-gate.test.tsx`）
//   - `@react-three/fiber` 的 `Canvas`（jsdom 沒有 WebGL；同 `world-canvas.test.tsx`）
//   - `LocalPlayer`／`PositionSync`（three 的場景圖、送位置 —— 跟人數無關）
//   - `RemotePlayers`：換成**會記下收到幾個人**的殼（`S07` 要驗畫面上的遠端角色仍是兩個）
//   - `listRooms`：大廳的門，跟人數無關
// 算人數、何時通知、Canvas 外怎麼顯示，一行都沒被替換。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    onCreated?.()
    return <div data-testid="r3f-canvas-stub">{children}</div>
  },
}))
vi.mock('@/world/player/LocalPlayer', () => ({ LocalPlayer: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))
const rendered = vi.hoisted(() => ({ remoteCount: -1 }))
vi.mock('@/world/RemotePlayers', () => ({
  RemotePlayers: ({ roster }: { roster: ReadonlyMap<string, unknown> }) => {
    rendered.remoteCount = roster.size
    return null
  },
}))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<Listener>>()
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  addEventListener(type: string, l: Listener) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(l)
    this.listeners.set(type, set)
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l)
  }
  send() {}
  close() {}
  emit(type: string, event: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(event)
  }
}

const SELF = 'u-self'
const player = (id: string, st = '') => ({ id, name: '訪客', av: 0, x: 0, y: 0, f: 0, st })
const HALL: SceneRef = { id: 'hall' }
const ROOM: SceneRef = { id: 'room', projectId: 'a0000000-0000-4000-8000-00000000000a' }

async function send(socket: FakeSocket, message: unknown) {
  await act(async () => {
    socket.emit('message', { data: JSON.stringify(message) })
  })
}

/** 連線建立、收到 `hello`（`selfId` 就緒）—— 但**還沒有 snapshot**。 */
async function openAndHello(socket: FakeSocket) {
  await act(async () => {
    socket.emit('open', {})
  })
  await send(socket, { t: 'hello', you: SELF, hz: 10 })
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

/**
 * 畫面上顯示的在線人數；沒有就是 `null`。
 *
 * ⚠️ **解析出數字再比，不用 `toContain('3 人在線')`**：「13 人在線」也包含那幾個字，
 * 多算十個人的實作會照樣綠。文案不是契約，所以只認「開頭的整數 ＋ 人在線」這個形狀。
 */
const shownCount = () => {
  const text = screen.queryByTestId('online-count')?.textContent
  if (text == null) return null
  const match = /^(\d+)\s*人在線/.exec(text)
  return match ? Number(match[1]) : Number.NaN
}
/** 畫面上任何「N 人在線」形狀的數字 —— `S09` 要求未就緒時**一個都沒有**，不只是那個元素不在。 */
const anyCountNumber = () => /\d+\s*人在線/.test(document.body.textContent ?? '')

function World({ scene }: { scene: SceneRef }) {
  return (
    <SceneRefProvider scene={scene}>
      <WorldCanvas />
    </SceneRefProvider>
  )
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  rendered.remoteCount = -1
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  listRooms.mockReset()
  listRooms.mockResolvedValue([])
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
    id === 'webgl2' ? ({} as RenderingContext) : null,
  ) as typeof realGetContext
})
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('目前 scene 的在線人數（畫面）', () => {
  it('[FE-R10-S07] 初始在線人數包含自己', async () => {
    const view = render(<World scene={HALL} />)
    await flush()
    const socket = FakeSocket.instances[0]!
    await openAndHello(socket)
    expect(anyCountNumber(), '前提：snapshot 之前沒有數字').toBe(false)

    await send(socket, { t: 'snapshot', players: [player(SELF), player('u1'), player('u2')] })

    expect(shownCount(), '含自己 —— 不是遠端角色數 2').toBe(3)
    expect(rendered.remoteCount, '畫面上的遠端角色仍只有另外兩個人').toBe(2)
    view.unmount()
  })

  it('[FE-R10-S08] join 與 leave 更新在線人數', async () => {
    const view = render(<World scene={HALL} />)
    await flush()
    const socket = FakeSocket.instances[0]!
    await openAndHello(socket)
    await send(socket, { t: 'snapshot', players: [player(SELF), player('u1'), player('u2')] })
    expect(shownCount()).toBe(3)

    await send(socket, { t: 'presence', join: [player('u3')], leave: [] })
    expect(shownCount(), '新 id 加入').toBe(4)

    await send(socket, { t: 'presence', join: [player('u3', '另一條連線')], leave: [] })
    expect(shownCount(), '同一 id 因另一條連線重複 join').toBe(4)

    await send(socket, { t: 'presence', join: [], leave: ['u1'] })
    expect(shownCount(), '現有 id 離開').toBe(3)

    await send(socket, { t: 'status', id: 'u2', text: '開會中' })
    await send(socket, { t: 'pos', p: [['u2', 32, 0, 1]] })
    await send(socket, { t: 'presence', join: [], leave: ['nobody'] })
    expect(shownCount(), 'status、pos 與未知 id 的 leave 都不改變人數').toBe(3)

    // 上面每一次人數改變都經過 WorldCanvas 重繪 —— callback 身分不穩的話，每一次都會重連。
    expect(FakeSocket.instances, '單純更新人數不得建立新的 WebSocket 連線').toHaveLength(1)
    view.unmount()
  })

  it('[FE-R10-S09] 新連線取得 snapshot 前不顯示舊人數', async () => {
    const view = render(<World scene={HALL} />)
    await flush()
    const hall = FakeSocket.instances[0]!
    await openAndHello(hall)
    await send(hall, { t: 'snapshot', players: [player(SELF), player('u1'), player('u2')] })
    expect(shownCount(), '前提：前一條連線顯示過非零人數').toBe(3)

    // 換場景＝場景子樹以 key 重掛（`FE-V01` D3）：舊連線卸載、新連線建立
    view.rerender(<World scene={ROOM} />)
    await flush()
    expect(anyCountNumber(), '舊連線卸載後，畫面上不得留著上一條連線的人數').toBe(false)

    // 新連線要等舊 socket 的 close 事件（`FE-V01-S18`）才建 —— 這段期間也不得有數字
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS)
    })
    const room = FakeSocket.instances.at(-1)!
    expect(room, '前提：新連線已經建立').not.toBe(hall)
    await openAndHello(room)
    expect(anyCountNumber(), 'hello 不是基準線 —— 新 snapshot 之前仍然不顯示').toBe(false)

    await send(room, { t: 'presence', join: [player('u9')], leave: [] })
    expect(anyCountNumber(), 'join 比 snapshot 早到也不得顯示').toBe(false)

    await send(room, { t: 'snapshot', players: [player(SELF), player('u9')] })
    expect(shownCount(), '新 snapshot 到達後才顯示它所代表的人數').toBe(2)
    view.unmount()
  })
})
