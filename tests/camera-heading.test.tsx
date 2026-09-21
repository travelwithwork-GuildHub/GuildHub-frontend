import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { Quaternion, Vector3, type OrthographicCamera } from 'three'
import { WorldCamera } from '@/world/WorldCamera'
import { cameraOffset } from '@/world/camera'

// `FE-W05-S11`：走路時相機**朝向**不得改變。
//
// 跟 `camera-no-rerender.test.tsx` 同一招：mock 掉 R3F 的 `useFrame`／`useThree`，拿到 frameCb 與相機，
// 直接驅動**正式的** `WorldCamera` —— 不是重刻一份 follow 邏輯再斷言它。
//
// 修前的實作是「阻尼位置 → 每幀 `lookAt(target)`」：移動時位置落後、從落後的位置看向移動中的 target，
// 視線偏離常數 −offset。這條在修前**要紅**（量到約 2.5°），修完是 0。

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

/** 0.01°，浮點誤差的餘裕；今天的 bug 約 4.4e-2 rad，差兩個數量級。 */
const EPS_RAD = (0.01 * Math.PI) / 180
/** 走路速度（世界單位／秒）×每幀時間 = 每幀位移；`LocalPlayer` 的走速在這個量級。 */
const DT = 1 / 60
const STEP = 3 * DT

describe('[FE-W05-S11] 移動中相機朝向不變', () => {
  it('target 連續移動並反覆變向 180 幀，每幀四元數與基準夾角 ≤ 0.01°，而且相機仍在跟隨', () => {
    const targetRef = { current: new Vector3(0, 0, 0) }
    render(<WorldCamera targetRef={targetRef} />)
    expect(camera, 'WorldCamera 沒有把相機交給 useThree 的 set').not.toBeNull()
    expect(frameCb, 'WorldCamera 沒有註冊 useFrame').not.toBeNull()

    // 靜止幾幀讓位置收斂，再記基準朝向。
    act(() => {
      for (let i = 0; i < 60; i++) frameCb?.({}, DT)
    })
    const baseline = new Quaternion().copy(camera!.quaternion)

    // 三段路：往 +X 走、急轉往 −Z、再回頭往 −X —— 變向時的擺動最大。
    const legs: Array<[number, number]> = [
      [STEP, 0],
      [0, -STEP],
      [-STEP, 0],
    ]
    let worst = 0
    act(() => {
      for (const [dx, dz] of legs) {
        for (let i = 0; i < 60; i++) {
          targetRef.current.x += dx
          targetRef.current.z += dz
          frameCb?.({}, DT)
          worst = Math.max(worst, baseline.angleTo(camera!.quaternion))
        }
      }
    })
    // **每一幀**都量：停下來會收斂回去，只比最後一幀會漏掉移動中的擺動。
    expect(worst, `移動中相機朝向偏了 ${((worst * 180) / Math.PI).toFixed(3)}°（每幀 lookAt 落後的 target 造成）`).toBeLessThanOrEqual(EPS_RAD)

    // **而且相機真的在跟隨** —— 少了這一段，一台不動的相機當然朝向不變。
    const offset = cameraOffset()
    const gapBefore = camera!.position.distanceTo(new Vector3(targetRef.current.x + offset.x, offset.y, targetRef.current.z + offset.z))
    act(() => {
      for (let i = 0; i < 240; i++) frameCb?.({}, DT)
    })
    const gapAfter = camera!.position.distanceTo(new Vector3(targetRef.current.x + offset.x, offset.y, targetRef.current.z + offset.z))
    expect(gapBefore, '移動中位置應該落後 target+offset（有阻尼）').toBeGreaterThan(0.05)
    expect(gapAfter, '停止後位置沒有收斂到 target+offset').toBeLessThan(0.01)
  })
})
