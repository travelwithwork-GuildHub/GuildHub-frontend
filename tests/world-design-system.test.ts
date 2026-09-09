import { describe, expect, it } from 'vitest'
import { BufferGeometry, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three'
import { WORLD_COLORS, worldColor, type WorldColorName } from '@/design/world'
import { colorLiterals } from '@/design/colorScan'
import { PRIMITIVE_SHAPES, geometryFor, type GeometrySpec } from '@/world/primitives/geometry'
import { materialFor } from '@/world/primitives/material'

// 規格：openspec/changes/fe-w09-world-design-system/specs/world-design-system/spec.md
//   FE-W09-S01  未知的 token 名要拋錯（**驗收在執行期，不是型別**）
//   FE-W09-S02  顏色字面值的判定（含 0x 數字形式）
//   FE-W09-S04  同參數同實例、異參數異實例、卸載時零次釋放
//   FE-W09-S05  四個 primitive 各自產生得出有頂點的幾何
//   FE-W09-S06  差異化不得污染其他使用者
//
// `FE-W09-S03`（掃描範圍）在 `tests/world-color-scan.test.ts` —— 那條要碰檔案系統。

describe('世界的視覺常數', () => {
  it('[FE-W09-S01] 已知名稱回傳值，未知名稱拋錯', () => {
    expect(worldColor('skin')).toBe(WORLD_COLORS.skin)
    expect(worldColor('skin')).not.toBe('')

    // ⚠️ **驗收下在執行期，不是型別。** `@ts-expect-error` 只證明那一行
    // 有「某種」錯誤 —— 一個 `missingFunction(worldColor('typo'))` 在
    // `worldColor` 已經退化成接受任意字串時仍然會綠。
    const unknown = 'nope' as unknown as WorldColorName
    expect(() => worldColor(unknown)).toThrow(/nope/)
    // 訊息要包含至少一個合法名稱，否則打錯字的人不知道該用什麼
    expect(() => worldColor(unknown)).toThrow(/skin/)
  })
})

describe('顏色字面值的判定', () => {
  it('[FE-W09-S02] 字串與數字兩種形式都被抓到，取 token 不會', () => {
    expect(colorLiterals('<meshStandardMaterial color="#ff0000" />')).toContain('#ff0000')
    // **只看 `#` 的判定被這個繞得過**
    expect(colorLiterals('<meshBasicMaterial color={0xff0000} />')).toContain('0xff0000')
    expect(colorLiterals("const c = worldColor('skin')")).toHaveLength(0)
  })

  it('[FE-W09-S02] 明文豁免的那一行整行跳過', () => {
    expect(colorLiterals("const c = '#ff0000' // world-color-allow 理由")).toHaveLength(0)
  })
})

const BOX: GeometrySpec = { shape: 'RoundedBox', width: 1, height: 1, depth: 1, radius: 0.12 }

describe('幾何與材質的快取', () => {
  it('[FE-W09-S04] 同參數同實例、異參數異實例', () => {
    expect(geometryFor(BOX)).toBe(geometryFor(BOX))
    expect(geometryFor(BOX)).not.toBe(geometryFor({ ...BOX, width: 2 }))

    const spec = { kind: 'standard', color: 'skin' } as const
    expect(materialFor(spec)).toBe(materialFor(spec))
    // **同色不同材質類別必須是不同實例** —— 只用顏色當鍵的話這裡會拿到錯的型別
    const basic = materialFor({ kind: 'basic', color: 'skin' })
    expect(basic).not.toBe(materialFor(spec))
    expect(basic).toBeInstanceOf(MeshBasicMaterial)
    expect(materialFor(spec)).toBeInstanceOf(MeshStandardMaterial)
  })

  it('[FE-W09-S04] 使用者卸載時，共用實例的 dispose 事件是零次', () => {
    const geometry = geometryFor({ shape: 'Sphere', radius: 0.5 })
    const material = materialFor({ kind: 'standard', color: 'ground' })
    let disposed = 0
    const count = () => {
      disposed += 1
    }
    geometry.addEventListener('dispose', count)
    material.addEventListener('dispose', count)

    // 模擬一個使用它們的元件：建了 mesh、用完、丟掉引用。
    // **卸載時不得對共用實例呼叫 dispose()。**
    {
      const used: BufferGeometry = geometry
      expect(used.attributes.position?.count).toBeGreaterThan(0)
    }

    // ⚠️ **MUST NOT 用「畫面還在」或「屬性還在」當判準** —— three.js 對
    // 已 dispose 的資源會在下一次 render 重新上傳，那條恆真。
    expect(disposed, '共用實例被釋放了 —— 症狀是看不出來的，所以只能靠事件計數').toBe(0)

    geometry.removeEventListener('dispose', count)
    material.removeEventListener('dispose', count)
  })

  it('[FE-W09-S06] 差異化不得污染其他使用者', () => {
    const shared = materialFor({ kind: 'standard', color: 'avatarBody' })
    const before = (shared as MeshStandardMaterial).color.getHex()

    // 第二個使用者需要不同顏色 —— **用完整參數另外取一個**，不是就地改
    const other = materialFor({ kind: 'standard', color: 'accent' })
    expect(other).not.toBe(shared)

    expect(
      (shared as MeshStandardMaterial).color.getHex(),
      '第一個使用者手上的實例被改掉了 —— 共用實例是不可變的',
    ).toBe(before)
  })
})

describe('primitive', () => {
  const SPECS: Record<(typeof PRIMITIVE_SHAPES)[number], GeometrySpec> = {
    RoundedBox: BOX,
    Capsule: { shape: 'Capsule', radius: 0.3, length: 0.6 },
    Sphere: { shape: 'Sphere', radius: 0.5 },
    Cylinder: { shape: 'Cylinder', radius: 0.3, height: 1 },
  }

  it('[FE-W09-S05] 四個都真的產生得出有頂點的幾何', () => {
    // **不是只驗名稱。** 一個只宣告 `type PrimitiveShape = …` 的空殼
    // 會讓所有名稱檢查通過，而畫面上什麼都沒有。
    for (const shape of PRIMITIVE_SHAPES) {
      const geometry = geometryFor(SPECS[shape])
      expect(geometry.attributes.position?.count, `${shape} 沒有頂點`).toBeGreaterThan(0)
    }
  })

  it('[FE-W09-S05] 列舉外的名稱拋錯', () => {
    const bogus = { shape: 'Torus', radius: 1 } as unknown as GeometrySpec
    expect(() => geometryFor(bogus)).toThrow(/Torus/)
  })

  it('[FE-W09-S05] RoundedBox 的成品尺寸就是要的尺寸，薄板也不例外', () => {
    // **這是量出來的兩個坑**：
    // 1. bevel 會往外擴 radius —— shape 沒有先內縮的話 1×1×1 會做出 1.24×1.24×1.0
    // 2. 薄板（0.2 厚）的 radius 若 clamp 到「最短邊的一半」會做出退化幾何（高度 0）
    for (const [w, h, d, r] of [
      [1, 1, 1, 0.12],
      [4, 0.2, 4, 0.12], // 薄板，而且 radius 大於厚度的一半
      [0.14, 0.42, 0.14, 0.05],
    ] as const) {
      const g = geometryFor({ shape: 'RoundedBox', width: w, height: h, depth: d, radius: r })
      g.computeBoundingBox()
      const size = g.boundingBox?.getSize(new Vector3()) ?? new Vector3()
      expect(size.x).toBeCloseTo(w, 6)
      expect(size.y).toBeCloseTo(h, 6)
      expect(size.z).toBeCloseTo(d, 6)
    }
  })
})
