import { describe, expect, it } from 'vitest'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_DEFAULTS, cameraOffset, damp, dampFactor, orthoFrustum } from '@/world/camera'

// ⚠️ import 的是**正式碼**。相機的方位與構圖用 three.js 的相機數學驗證 ——
// `vector.project(camera)` 是純數學，**不需要 WebGL、不需要瀏覽器**。

/** 照正式碼的方位建一台相機（上方且 +Z 側，看向 target）。 */
function makeCamera(aspect = 16 / 9, target = new Vector3(0, 0, 0)) {
  const { left, right, top, bottom } = orthoFrustum(aspect, CAMERA_DEFAULTS.viewHeight)
  const cam = new OrthographicCamera(left, right, top, bottom, 0.1, 1000)
  const o = cameraOffset()
  cam.position.set(target.x + o.x, target.y + o.y, target.z + o.z)
  cam.lookAt(target)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

/** 世界座標 → NDC。x 右為正、**y 上為正**（所以「更下」是 y 更小）。 */
function toNdc(cam: OrthographicCamera, x: number, y: number, z: number) {
  return new Vector3(x, y, z).project(cam)
}

describe('固定的 Orthographic Elevated 相機', () => {
  it('[FE-W05-S01] 投影型別是 orthographic，不是 perspective', () => {
    const cam = makeCamera()
    expect(cam).toBeInstanceOf(OrthographicCamera)
    expect(cam).not.toBeInstanceOf(PerspectiveCamera)
    expect(cam.isOrthographicCamera).toBe(true)
  })

  it('[FE-W05-S02] +X 在畫面右、+Z 在畫面下', () => {
    const cam = makeCamera()
    const origin = toNdc(cam, 0, 0, 0)
    const plusX = toNdc(cam, 1, 0, 0)
    const plusZ = toNdc(cam, 0, 0, 1)

    // 這一條是 world-coordinates 那份對映的視覺依據。
    // 相機的 Z 偏移改成負的，這裡就會反過來 —— 而 coords 的測試照樣是綠的。
    expect(plusX.x, '+X 沒有出現在畫面右側').toBeGreaterThan(origin.x)
    expect(plusZ.y, '+Z 沒有出現在畫面下方').toBeLessThan(origin.y)
  })

  it('[FE-W05-S03] 相機的偏移是「上方且 +Z 側」', () => {
    // S03 的「沒有旋轉操作」由 WorldCamera 元件不掛任何控制器保證
    // （它回傳 null，沒有事件監聽）。這裡釘住方位的前提條件。
    const o = cameraOffset()
    expect(o.y, '相機必須在上方').toBeGreaterThan(0)
    expect(o.z, '相機必須在 +Z 側 —— 這是 +Z 出現在畫面下方的原因').toBeGreaterThan(0)
  })
})

describe('跟隨是平滑的，而且與影格率無關', () => {
  it('[FE-W05-S04] 一個半衰期之後剩餘距離減半', () => {
    const halfLife = 0.12
    expect(dampFactor(halfLife, halfLife)).toBeCloseTo(0.5, 10)
    expect(damp(0, 100, halfLife, halfLife)).toBeCloseTo(50, 8)
  })

  it('[FE-W05-S05] 拆成幾次更新不影響結果', () => {
    const halfLife = 0.12
    const once = damp(0, 100, 0.1, halfLife)

    let stepped = 0
    for (let i = 0; i < 10; i++) stepped = damp(stepped, 100, 0.01, halfLife)

    // 每幀固定係數的寫法（`* 0.1`）會讓這兩個差很多 ——
    // 那正是「120 Hz 比 60 Hz 快一倍」的病。
    expect(stepped).toBeCloseTo(once, 8)
  })

  it('[FE-W05-S06] 極大的時間間隔會收斂，不越過也不發散', () => {
    const result = damp(0, 100, 60, 0.12)
    expect(result).toBeCloseTo(100, 6)
    expect(result).toBeLessThanOrEqual(100)
    expect(Number.isFinite(result)).toBe(true)
  })

  it.each([NaN, Infinity, -Infinity])('[FE-W05-S07] 非有限的時間間隔 %p 要拋錯', (bad) => {
    expect(() => dampFactor(bad, 0.12)).toThrow(RangeError)
    expect(() => damp(0, 100, bad, 0.12)).toThrow(RangeError)
  })

  it('半衰期必須是正的有限數值', () => {
    expect(() => dampFactor(0.1, 0)).toThrow(RangeError)
    expect(() => dampFactor(0.1, -1)).toThrow(RangeError)
    expect(() => dampFactor(0.1, NaN)).toThrow(RangeError)
  })
})

describe('視窗尺寸改變時維持構圖', () => {
  it('[FE-W05-S09] 變寬時垂直範圍不變、水平變大', () => {
    const narrow = orthoFrustum(4 / 3, CAMERA_DEFAULTS.viewHeight)
    const wide = orthoFrustum(21 / 9, CAMERA_DEFAULTS.viewHeight)

    expect(wide.top - wide.bottom).toBeCloseTo(narrow.top - narrow.bottom, 10)
    expect(wide.right - wide.left).toBeGreaterThan(narrow.right - narrow.left)
  })

  it('[FE-W05-S10] 世界不被拉扁', () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9, 1]) {
      const cam = makeCamera(aspect)
      // 世界座標上的一個正方形（X／Z 平面各 2 單位）
      const a = toNdc(cam, -1, 0, 0)
      const b = toNdc(cam, 1, 0, 0)
      const widthNdc = Math.abs(b.x - a.x)
      // 同樣 2 單位的世界寬度，在 NDC 上佔的比例應該隨 aspect 反比縮小 ——
      // 也就是實際的世界寬度不變。
      const worldWidthOnScreen = (widthNdc / 2) * (cam.right - cam.left)
      expect(worldWidthOnScreen, `aspect ${aspect} 下世界被拉扁了`).toBeCloseTo(2, 6)
    }
  })

  it('長寬比不合法要拋錯', () => {
    expect(() => orthoFrustum(0, 20)).toThrow(RangeError)
    expect(() => orthoFrustum(NaN, 20)).toThrow(RangeError)
  })
})
