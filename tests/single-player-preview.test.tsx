import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import WorldCanvas from '@/world/WorldCanvas'
import { RemoteWorld } from '@/world/RemoteWorld'
import type { LocalPose } from '@/world/PositionSync'
import type { RefObject } from 'react'

// 規格：openspec/changes/fe-o14-preview-deploy/specs/runtime-config/spec.md
//   Requirement: 沒有即時後端時 MUST NOT 建立連線 —— FE-O14-S07 / S08
// 規格：openspec/changes/fe-o14-drop-preview-notice/specs/runtime-config/spec.md
//   Requirement: 世界不解釋「為什麼看不到別人」 —— FE-O14-S11 / S12
//   （退場的 FE-O14-S09 / S10 是它的前身，那兩個 ID MUST NOT 被重新使用）
//
// ⚠️ **被換掉的是全域的 `WebSocket`，不是我們自己的任何一層。**
// `RemoteWorld` → `RealtimeClient` → `browserSocket` → `new WebSocket(url)`，
// 中間沒有任何注入點 —— 而那是刻意的（`socket.ts` 檔頭：真的 `WebSocket`
// 直接滿足 `SocketLike`，包一層轉接只會多製造一個「替身跟真的不一樣」的地方）。
// 從全域替換等於**走正式碼真正的那條路**，沒有為了測試而開的後門。

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
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))

/** 記得自己被建了幾次、被傳了什麼位址的 WebSocket 替身。 */
class FakeSocket {
  static urls: string[] = []
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(url: string) {
    FakeSocket.urls.push(url)
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    const set = this.#listeners.get(type) ?? new Set()
    set.add(fn)
    this.#listeners.set(type, set)
  }

  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.#listeners.get(type)?.delete(fn)
  }

  send() {}
  close() {}

  /** 從外面觸發事件 —— `FE-O14-S10` 要的「回報關閉」就是這個。 */
  emit(type: string, event: unknown) {
    for (const fn of this.#listeners.get(type) ?? []) fn(event)
  }

  static last: FakeSocket | null = null
}

const realGetContext = HTMLCanvasElement.prototype.getContext

beforeEach(() => {
  FakeSocket.urls = []
  FakeSocket.last = null
  // WebGL2 要可用，否則 WorldCanvas 直接走 `WebGLUnavailable` 那一支，
  // 而那會讓下面每一條都在驗一個根本沒掛起來的世界（假綠）。
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
    id === 'webgl2' ? ({} as unknown as RenderingContext) : null,
  ) as unknown as typeof realGetContext
  vi.stubGlobal(
    'WebSocket',
    class extends FakeSocket {
      constructor(url: string) {
        super(url)
        FakeSocket.last = this
      }
    },
  )
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('沒有即時後端的部署', () => {
  it('[FE-O14-S07] none 時完全不碰 socket，而且不吵', () => {
    // ⚠️ **這一條直接掛 `RemoteWorld`，不透過 `WorldCanvas`。**
    // 後者會渲染 `<ambientLight>`／`<directionalLight>` 這些 R3F 內建標籤，
    // 而 Canvas 被換成一個真的 `<div>` 之後，React DOM 會對每一個發出
    // 「unrecognized tag」警告 —— 實測 16 次。那是**測試環境的產物**，
    // 不是正式碼的輸出，混進來會讓「不吵」這條斷言變成在驗 React 的行為。
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const poseRef: RefObject<LocalPose> = { current: { x: 0, z: 0, f: 0 } }

    vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'none')
    render(<RemoteWorld poseRef={poseRef} />)
    expect(FakeSocket.urls, 'none 竟然建立了連線').toHaveLength(0)
    expect(errors, `none 竟然吵了：${JSON.stringify(errors.mock.calls[0])}`).not.toHaveBeenCalled()
    expect(warns, `none 竟然吵了：${JSON.stringify(warns.mock.calls[0])}`).not.toHaveBeenCalled()

    // **對照組。** 沒有這一段，一個「永遠不連線」的實作也會讓上面全綠。
    vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
    vi.stubEnv('NEXT_PUBLIC_GUILDHUB_WS', 'ws://localhost:8000/ws')
    render(<RemoteWorld poseRef={poseRef} />)
    expect(FakeSocket.urls).toHaveLength(1)
    expect(FakeSocket.urls[0], '位址不是從設定來的').toContain('localhost:8000')

    errors.mockRestore()
    warns.mockRestore()
  })

  it('[FE-O14-S08] none 時缺 WebSocket 位址不會讓世界倒掉', () => {
    // 這就是部署時的真實組合：production、沒有即時後端、**沒有填位址**。
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'none')

    expect(() => render(<WorldCanvas />)).not.toThrow()
    // 刻意只斷言容器存在。斷言「世界正常呈現」量不到東西 ——
    // 只要沒拋錯元件本來就會掛載，那是同義反覆。
    expect(screen.getByTestId('world-canvas-container')).toBeTruthy()
  })

  // 規格 `FE-O14-S11`／`S12` 的判準：**只下在訪客真的會讀到的措辭上**。
  //
  // ⚠️ **MUST NOT 改成 `queryByRole('status')`。** 那看起來更嚴，實際是錯的：
  // `status` 在這個世界已經有兩個合法使用者（`world-loading` 與
  // `interaction-prompt`），而 `FE-R12`（連不上的呈現）大機率是第三個。
  // 規格裡有一則明文的 MUST NOT 講這件事。
  const FORBIDDEN = ['單人預覽', '看不到其他人', '即時伺服器'] as const

  /** 世界渲染完成，而且畫面上沒有那些措辭。 */
  function expectNoRealtimeStatusProse() {
    // **正向控制。** 只斷言容器存在不夠 —— 一個內部出錯只剩空殼容器的世界
    // 也有容器，而在空白畫面上「沒有那段文字」恆真。
    // `ready` 只有在 `Canvas` 的 `onCreated` 真的跑過之後才是 true。
    expect(
      screen.queryByTestId('world-loading'),
      '世界還停在載入中 —— 下面那些「沒有那段文字」的斷言在空畫面上恆真',
    ).toBeNull()

    const text = screen.getByTestId('world-canvas-container').textContent ?? ''
    for (const phrase of FORBIDDEN) {
      expect(text, `畫面上出現了「${phrase}」`).not.toContain(phrase)
    }
  }

  it('[FE-O14-S11] 資料來源是 none 時世界渲染完成，但沒有任何說明', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'none')
    render(<WorldCanvas />)

    expectNoRealtimeStatusProse()
  })

  it('[FE-O14-S12] 連線失敗之後也不出現「一切正常」的措辭', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
    vi.stubEnv('NEXT_PUBLIC_GUILDHUB_WS', 'ws://localhost:8000/ws')
    render(<WorldCanvas />)

    expectNoRealtimeStatusProse()

    // ⚠️ **這一行不能省。** 少了它，一個根本沒走到連線路徑的測試也會綠 ——
    // 而那正是這條要防的情況。（從退場的 `FE-O14-S10` 原封搬過來）
    expect(FakeSocket.last, '根本沒有嘗試連線，下面那條斷言等於沒驗').not.toBeNull()

    // 握手從來沒成功就被關掉 —— 實測時客戶端看到的就是這個
    // （`close code=1006`、空 reason、`wasClean=false`）。
    FakeSocket.last?.emit('close', { code: 1006, reason: '', wasClean: false })

    expectNoRealtimeStatusProse()
  })
})
