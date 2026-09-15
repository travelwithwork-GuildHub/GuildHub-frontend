import { act, render } from '@testing-library/react'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { useRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatOut, ServerMessage } from '@/api/contract/ws'
import { RealtimeClient, RealtimeError } from '@/realtime/client'
import { createSceneChatStore, type SceneChatStore } from '@/realtime/sceneChatStore'
import type { LocalPose } from '@/world/PositionSync'
import { RemoteWorld } from '@/world/RemoteWorld'
import { diagnosticsByFile } from './lib/typeFixtures'

// 規格：openspec/changes/fe-r11-realtime-chat/specs/scene-chat-transport/spec.md
//   Requirement: chat 只收驗證過的伺服器訊息、不改內容；送出只走注入的窄介面 —— S01、S02、S10
//   Requirement: 自己的話只在伺服器回聲後出現一次 —— S03
//
// 從 `RemoteWorld` 的 raw `onMessage` 入口進：`RemoteWorld` → `RealtimeClient` → 全域 `WebSocket`（換成 FakeSocket）整條是正式碼
// （同 `remote-world-close-gate.test.tsx`）。S01 把驗證器換成假的（四則都回成功）以證明分流看的是 `t === 'chat'` 與物件的同一性；
// S10／S03 用正式驗證器。**不連任何服務。**

const fakeValidator = vi.hoisted(() => ({ current: null as null | ((raw: string) => { ok: true; message: ServerMessage } | { ok: false }) }))
vi.mock('@/realtime/protocol', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/realtime/protocol')>()
  return {
    ...orig,
    createMessageValidator: (onViolation: Parameters<typeof orig.createMessageValidator>[0]) => {
      const real = orig.createMessageValidator(onViolation)
      return (raw: string) => (fakeValidator.current ?? real)(raw)
    },
  }
})
vi.mock('@react-three/fiber', () => ({ useFrame: () => {}, useThree: () => ({}) }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  readonly sent: string[] = []
  sendImpl: ((data: string) => void) | null = null
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
    if (this.sendImpl) this.sendImpl(data)
    this.sent.push(data)
  }
  close() {}
  emit(type: string, payload: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(payload)
  }
  open() {
    this.emit('open', null)
  }
  frame(raw: string) {
    this.emit('message', { data: raw })
  }
  hello(you = 'me') {
    this.frame(JSON.stringify({ t: 'hello', you, hz: 10 }))
  }
}

beforeEach(() => {
  FakeSocket.instances = []
  fakeValidator.current = null
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function Harness({ store }: { store: SceneChatStore }) {
  const poseRef = useRef<LocalPose>({ x: 0, z: 0, f: 0 } as LocalPose) as RefObject<LocalPose>
  return <RemoteWorld poseRef={poseRef} scene="lobby" chat={store.port} />
}
/** 掛上 RemoteWorld、socket open＋hello（ready）。sink 是包在 port 外面的 spy：拿到的就是 `receive` 拿到的那個物件。 */
async function mountReady(store: SceneChatStore) {
  const sink = vi.fn()
  const attach = store.port.attach
  const spiedPort = {
    attach: (sendRaw: (d: string) => void) => {
      const link = attach(sendRaw)
      return { ...link, receive: (m: ChatOut) => (sink(m), link.receive(m)) }
    },
  }
  render(<Harness store={{ ...store, port: spiedPort }} />)
  await act(async () => {})
  const socket = FakeSocket.instances[0] as FakeSocket
  await act(async () => {
    socket.open()
    socket.hello('me')
  })
  return { sink, socket }
}

describe('分派', () => {
  it('[FE-R11-S01] 四則都驗證成功時只有 chat 那個物件到達 sink（同一個 reference）、恰好一次；記憶體只多一則', async () => {
    const M: ChatOut = { t: 'chat', id: 'u1', name: '甲', body: '哨兵' }
    const sentinels: Record<string, ServerMessage> = {
      status: { t: 'status', id: 'u1', text: 'x' },
      chat: M,
      pos: { t: 'pos', p: [['u1', 0, 0, 0]] },
      presence: { t: 'presence', join: [], leave: [] },
    }
    fakeValidator.current = (raw) => {
      const t = (JSON.parse(raw) as { t: string }).t
      const message = sentinels[t]
      return message === undefined ? { ok: false } : { ok: true, message }
    }
    const store = createSceneChatStore()
    const { sink, socket } = await mountReady(store)
    const before = store.getLog().length
    await act(async () => {
      for (const t of ['status', 'chat', 'pos', 'presence']) socket.frame(JSON.stringify({ t }))
    })
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0]?.[0], '要是驗證器產出的那個物件，不是自己 parse 出來的複本').toBe(M)
    expect(store.getLog().length - before).toBe(1)
    expect(store.getLog().at(-1)?.body).toBe('哨兵')
  })

  it('[FE-R11-S01] 靜態邊界：sceneChat* 的 import 圖沒有 RealtimeClient 的值、createMessageValidator、JSON.parse；sink 與 reducer 不收字串（型別）', () => {
    const root = path.resolve(import.meta.dirname, '..')
    const entries = readdirSync(path.join(root, 'src/realtime')).filter((f) => f.startsWith('sceneChat'))
    expect(entries.length).toBeGreaterThan(1)
    for (const entry of entries) {
      for (const file of importGraph(path.join(root, 'src/realtime', entry))) {
        const source = readFileSync(file, 'utf8')
        const rel = path.relative(root, file)
        // 型別 import 不算（`import type … from '@/realtime/client'` 在 import 圖上不留邊）；值的 import 一律不准。
        expect(/^import\s+(?!type\s)[^'"]*from\s*['"](@\/|\.\/|(\.\.\/)+)realtime\/client['"]/m.test(source), `${rel} import 了 client 的值`).toBe(false)
        expect(/^import\s+(?!type\s)[^'"]*from\s*['"](\.\/|(\.\.\/)+)client['"]/m.test(source), `${rel} import 了 client 的值`).toBe(false)
        expect(source.includes('createMessageValidator'), `${rel} 碰了驗證器`).toBe(false)
        expect(source.includes('JSON.parse'), `${rel} 自己 parse raw frame`).toBe(false)
      }
    }
    const diags = diagnosticsByFile()
    expect(diags.get('scene-chat-sink-string.ts') ?? [], 'appendChat 收字串要是 TS2345').toEqual(['TS2345'])
    expect(diags.get('scene-chat-link-string.ts') ?? [], 'receive 收字串要是 TS2345').toEqual(['TS2345'])
  }, 120_000)

  it('[FE-R11-S10] 缺 name／body 不是字串的 chat 不到 sink；空字串、全空白、HTML 的 name 與 body 照原值', async () => {
    const store = createSceneChatStore()
    const { sink, socket } = await mountReady(store)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await act(async () => {
      socket.frame('{"t":"chat","id":"x","body":"hi"}')
      socket.frame('{"t":"chat","id":"x","name":"n","body":7}')
    })
    expect(sink).not.toHaveBeenCalled()
    expect(store.getLog()).toHaveLength(0)
    await act(async () => {
      socket.frame('{"t":"chat","id":"x","name":"n","body":"ok"}')
    })
    expect(sink).toHaveBeenCalledTimes(1)
    expect(store.getLog()).toHaveLength(1)
    const html = '<img src=x onerror=alert(1)>'
    await act(async () => {
      socket.frame(JSON.stringify({ t: 'chat', id: 'a', name: '', body: 'b1' }))
      socket.frame(JSON.stringify({ t: 'chat', id: 'a', name: 'n', body: '' }))
      socket.frame(JSON.stringify({ t: 'chat', id: 'a', name: 'n', body: '   ' }))
      socket.frame(JSON.stringify({ t: 'chat', id: 'a', name: html, body: html }))
    })
    const tail = store.getLog().slice(-4)
    expect(tail.map((r) => [r.name, r.body, r.truncated])).toEqual([
      ['', 'b1', false],
      ['n', '', false],
      ['n', '   ', false],
      [html, html, false],
    ])
    warn.mockRestore()
  })
})

describe('送出', () => {
  it('[FE-R11-S02] idle／connecting／open／closed 各自：拋 RealtimeError、socket 沒收到、記憶體不變；之後 ready 也不補送；ready 但 socket.send 拋 → 原樣拋、不排隊', () => {
    const store = createSceneChatStore()
    const client = new RealtimeClient({ scene: 'lobby', onMessage: () => {} })
    store.port.attach((data) => client.send(data))
    const sentFrames = () => FakeSocket.instances.flatMap((s) => s.sent)
    const attempt = (label: string) => {
      expect(() => store.send({ t: 'chat', body: label }), label).toThrow(RealtimeError)
      expect(sentFrames(), `${label}：socket 不得收到 frame`).toEqual([])
      expect(store.getLog(), `${label}：記憶體不變`).toHaveLength(0)
    }
    expect(client.state).toBe('idle')
    attempt('idle')
    client.connect()
    expect(client.state).toBe('connecting')
    attempt('connecting')
    const socket = FakeSocket.instances[0] as FakeSocket
    socket.open()
    expect(client.state).toBe('open')
    attempt('open')
    socket.hello('me')
    expect(client.state).toBe('ready')
    vi.runAllTimers()
    expect(sentFrames(), 'ready 之後不得補送任何一則').toEqual([])
    // ready 但底層 send 拋：原樣拋、不 append、不排隊、之後不補送
    socket.sendImpl = () => {
      throw new Error('socket 壞了')
    }
    expect(() => store.send({ t: 'chat', body: 'x' })).toThrow('socket 壞了')
    expect(store.getLog()).toHaveLength(0)
    socket.sendImpl = null
    vi.runAllTimers()
    expect(socket.sent, '拋掉的那一則不得排隊、之後不得補送').toEqual([])
  })

  it('[FE-R11-S02] closed 之後送：拋、socket 沒收到', () => {
    const store = createSceneChatStore()
    const client = new RealtimeClient({ scene: 'lobby', onMessage: () => {} })
    store.port.attach((data) => client.send(data))
    client.connect()
    const socket = FakeSocket.instances[0] as FakeSocket
    socket.open()
    socket.hello('me')
    void client.close()
    expect(client.state).toBe('closed')
    expect(() => store.send({ t: 'chat', body: 'late' })).toThrow(RealtimeError)
    expect(socket.sent).toEqual([])
    expect(store.getLog()).toHaveLength(0)
  })

  it('[FE-R11-S03] 送出不先顯示；回聲後恰好一筆（id 等於自己也照收）', async () => {
    const store = createSceneChatStore()
    const { socket } = await mountReady(store)
    store.send({ t: 'chat', body: '哈囉' })
    expect(socket.sent).toEqual(['{"t":"chat","body":"哈囉"}'])
    expect(store.getLog().some((r) => r.body === '哈囉'), '送出時不得先加進記憶體').toBe(false)
    await act(async () => {
      socket.frame('{"t":"chat","id":"me","name":"我","body":"哈囉"}')
    })
    expect(store.getLog().filter((r) => r.body === '哈囉')).toHaveLength(1)
    expect(store.getLog().at(-1)?.id).toBe('me')
  })
})

/** 走 `src/` 的靜態 import 圖（同 `scene-chat-memory.test.ts`）。 */
function importGraph(entry: string): Set<string> {
  const root = path.resolve(import.meta.dirname, '..')
  const isFile = (p: string) => {
    try {
      readdirSync(p)
      return false
    } catch {
      return existsSync(p)
    }
  }
  const resolveFrom = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
    if (base === null) return null
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (isFile(c)) return c
    return null
  }
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    for (const m of readFileSync(file, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g)) {
      const target = resolveFrom(file, m[1] ?? m[2] ?? m[3] ?? '')
      if (target !== null) queue.push(target)
    }
  }
  return seen
}
