import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { FC } from 'react'
import { Vector3, type OrthographicCamera } from 'three'
import { WorldCamera, type WorldCameraProps } from '@/world/WorldCamera'
import { cameraOffset } from '@/world/camera'

// `FE-W05-S08` 的規格說「target 的座標在 ref 上被改變多次，相機元件的渲染
// 次數不增加」。這條在 `fe-w05-camera` 的 tasks.md 4.1 被打了勾，
// 而 **一條測試都沒有** —— 打勾說驗過了，跟真的驗過了是兩件事。
//
// 怎麼數渲染次數：把元件包成 `vi.fn(props => WorldCamera(props))`。
// 在另一個元件的函式體裡直接呼叫它等於把它 inline 進去，hooks 仍然在同一次
// render 裡執行，所以 `mock.calls.length` 就是它的渲染次數。
// **不用 React.Profiler** —— 那個量的是 commit，而這條要證明的是
// 「根本沒有觸發 render」。

let frameCb: ((state: unknown, dt: number) => void) | null = null
let camera: OrthographicCamera | null = null

vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = {
      set: (patch: { camera?: OrthographicCamera }) => {
        if (patch.camera) camera = patch.camera
      },
      size: { width: 800, height: 600 },
    }
    return selector ? selector(state) : state
  },
  useFrame: (cb: (state: unknown, dt: number) => void) => {
    frameCb = cb
  },
}))

beforeEach(() => {
  frameCb = null
  camera = null
})

describe('相機的 target 不進 React', () => {
  it('[FE-W05-S08] target 在 ref 上改變多次，相機元件的渲染次數不增加', () => {
    const targetRef = { current: new Vector3(0, 0, 0) }
    // `vi.fn` 的型別不是合法的 JSX 元件，所以掛上去的時候要轉一次；
    // 計數仍然看原本那個 mock。
    const counted = vi.fn((props: WorldCameraProps) => WorldCamera(props))
    const Counted = counted as unknown as FC<WorldCameraProps>

    render(<Counted targetRef={targetRef} />)
    expect(counted).toHaveBeenCalledTimes(1)
    expect(frameCb, 'WorldCamera 沒有註冊 useFrame').not.toBeNull()

    act(() => {
      for (let i = 1; i <= 20; i++) {
        targetRef.current.set(i, 0, i)
        frameCb?.({}, 1 / 60)
      }
    })

    // **這一條才是 Scenario 在講的事。**
    expect(counted, 'target 改變讓元件重新渲染了 —— 高頻資料進了 React').toHaveBeenCalledTimes(1)
  })

  it('[FE-W05-S08] 而且相機真的讀到了新的 target', () => {
    // **沒有這一條，上一條是恆真的** —— 把 useFrame 的內容整個刪掉，
    // 一個什麼都不做的元件當然不會重新渲染，上一條照樣綠。
    const targetRef = { current: new Vector3(0, 0, 0) }
    render(<WorldCamera targetRef={targetRef} />)
    expect(camera, 'WorldCamera 沒有把相機交給 useThree 的 set').not.toBeNull()

    const offset = cameraOffset()
    const start = camera!.position.clone()
    expect(start.x).toBeCloseTo(offset.x, 6)
    expect(start.z).toBeCloseTo(offset.z, 6)

    act(() => {
      targetRef.current.set(100, 0, 100)
      // damp 是指數逼近；跑滿 4 秒（240 幀 @ 60fps）之後應該已經很靠近。
      for (let i = 0; i < 240; i++) frameCb?.({}, 1 / 60)
    })

    expect(camera!.position.x, '相機沒有跟著 target 移動').toBeCloseTo(100 + offset.x, 2)
    expect(camera!.position.z, '相機沒有跟著 target 移動').toBeCloseTo(100 + offset.z, 2)
  })
})
