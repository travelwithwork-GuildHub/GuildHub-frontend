import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import type { SceneRef } from '@/world/scenes/registry'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-x15-load-order/specs/*/spec.md
//   Requirement: 首屏以固定次序載入 —— FE-X15-S03（Rapier／WS 排在 Canvas ready 之後）
//                                       FE-X15-S07（房間清單不阻塞首個可操作畫面）
//
// ⚠️ **掛的是整個 `WorldCanvas`，而 `RemoteWorld → RealtimeClient → new WebSocket(url)`、
//     `useRooms → listRooms`、`LocalPlayer` 的掛載全是正式碼。** 被換掉的只有第三方邊界：
//   - 全域 `WebSocket`（假 socket；同 `online-count.test.tsx`）—— WS 連線的觀測點是 `FakeSocket.instances`
//   - `@react-three/fiber` 的 `Canvas`：**這個檔案刻意讓 `onCreated` 由測試主動呼叫**，
//     才能觀測「ready 之前 vs 之後」。這是 `world-canvas.test.tsx`（同步呼叫）之外的一種控制方式。
//   - `listRooms`（`@/api/operations`）—— 房間清單的觀測點
//   - `LocalPlayer`／`PositionSync`／`RemotePlayers`：three 的場景圖，jsdom 跑不了。
//     `LocalPlayer` 換成**記下掛載次數**的殼 —— Rapier 的 `import('@dimforge/rapier3d-compat')`
//     在真的 `LocalPlayer` 的掛載 effect 裡，所以「`LocalPlayer` 有沒有掛載」就是「Rapier chunk
//     會不會被請求」的單元層代理（真正的 chunk 網路次序在第 5 片 e2e 驗）。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms, listProjects: () => Promise.resolve([]), listProfiles: () => Promise.resolve([]) }))

// Canvas 替身：**捕捉** `onCreated`，不自動呼叫 —— ready 由測試用 `act` 控制。
const canvas = vi.hoisted(() => ({ onCreated: null as (() => void) | null }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    canvas.onCreated = onCreated ?? null
    return <div data-testid="r3f-canvas-stub">{children}</div>
  },
}))

// Rapier 掛載的代理：真的 `LocalPlayer` 一掛載就 `import('@dimforge/rapier3d-compat')`。
const localPlayer = vi.hoisted(() => ({ mounts: 0 }))
vi.mock('@/world/player/LocalPlayer', async () => {
  const { useEffect: onMount } = await import('react')
  return {
    LocalPlayer: () => {
      onMount(() => {
        localPlayer.mounts += 1
      }, [])
      return null
    },
  }
})
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))

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
}

const HALL: SceneRef = { id: 'hall' }

function World({ scene }: { scene: SceneRef }) {
  return (
    <SceneRefProvider scene={scene}>
      <WorldCanvas />
    </SceneRefProvider>
  )
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  localPlayer.mounts = 0
  canvas.onCreated = null
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

describe('首屏以固定次序載入：Rapier／WS／房間清單排在 Canvas ready 之後', () => {
  it('[FE-X15-S03] Canvas ready 前不建 WebSocket、不觸發 Rapier 掛載；ready 之後才發生', async () => {
    render(<World scene={HALL} />)
    await flush()

    // 前提：Canvas 已掛載並交出 onCreated，但測試還沒呼叫它 —— 世界尚未 ready。
    expect(canvas.onCreated, '前提：Canvas 已把 onCreated 交出來').not.toBeNull()
    expect(screen.queryByTestId('world-loading'), 'ready 前世界載入層仍在').not.toBeNull()

    expect(FakeSocket.instances, 'Canvas ready 前不得建立任何 WebSocket 連線').toHaveLength(0)
    expect(localPlayer.mounts, 'Canvas ready 前不得掛載 LocalPlayer（＝不觸發 Rapier chunk）').toBe(0)

    // Canvas ready（onCreated）。
    await act(async () => {
      canvas.onCreated?.()
    })
    await flush()

    expect(FakeSocket.instances.length, 'Canvas ready 之後才開始連線').toBeGreaterThanOrEqual(1)
    expect(localPlayer.mounts, 'Canvas ready 之後 LocalPlayer 才掛載（Rapier 由它初始化觸發）').toBeGreaterThanOrEqual(1)
  })

  it('[FE-X15-S07] Canvas ready 前不打 GET /api/rooms；ready 之後才載入房間清單', async () => {
    render(<World scene={HALL} />)
    await flush()

    expect(canvas.onCreated, '前提：Canvas 已把 onCreated 交出來').not.toBeNull()
    expect(listRooms, 'Canvas ready 前不得請求房間清單').not.toHaveBeenCalled()

    await act(async () => {
      canvas.onCreated?.()
    })
    await flush()

    expect(listRooms, 'Canvas ready 之後房間清單才開始載入').toHaveBeenCalled()
  })
})
