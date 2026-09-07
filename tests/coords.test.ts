import { describe, expect, it } from 'vitest'
import { FACING, facingFromDirection, toProtocol, toWorld } from '@/world/coords'

// ⚠️ import 的是**正式碼**。在測試檔裡重刻一份對映再斷言它，
// 等於把正式碼的邏輯拔掉之後測試照樣是綠的。

describe('世界座標與協定像素的雙向對映', () => {
  it('[FE-W02-S01] 世界座標轉協定像素', () => {
    const p = toProtocol({ x: 1, z: 2 })
    expect(p).toEqual({ x: 32, y: 64 })
    expect(Number.isInteger(p.x)).toBe(true)
    expect(Number.isInteger(p.y)).toBe(true)
  })

  it('[FE-W02-S02] 取整規則固定，正負兩側都要驗', () => {
    // +0.5 個像素 → 1（`.5` 往正無窮）
    expect(toProtocol({ x: 0.015625, z: 0 }).x).toBe(1)

    // −0.5 個像素 → 0，**不是 −1**。Math.round 對負數不對稱。
    // 只驗正數側的話，一個「對稱進位」的實作照樣是綠的。
    //
    // `toBe` 用 Object.is，所以這一條同時釘住了「回的是 +0 不是 -0」——
    // Math.round(-0.5) 原本回 -0，正式碼把它正規化掉了。
    expect(toProtocol({ x: -0.015625, z: 0 }).x).toBe(0)
    expect(Object.is(toProtocol({ x: -0.015625, z: 0 }).x, -0)).toBe(false)

    // 相同輸入永遠相同輸出
    expect(toProtocol({ x: 0.015625, z: 0 })).toEqual(toProtocol({ x: 0.015625, z: 0 }))
  })

  it('[FE-W02-S03] 協定像素轉回世界座標', () => {
    expect(toWorld({ x: 32, y: 64 })).toEqual({ x: 1, z: 2 })
  })

  it('世界 Z 對映協定 y，不是世界 Y', () => {
    // 寫錯的話：本地玩家在 3D 裡走得好好的，遠端玩家卻只在一條線上移動 ——
    // 因為所有人的 y 都是高度（恆為 0）。
    expect(toProtocol({ x: 0, z: 5 })).toEqual({ x: 0, y: 160 })
  })
})

describe('往返不得累積誤差', () => {
  it('[FE-W02-S04] 像素值往返之後不變', () => {
    const values = [0, 1, -1, 31, 32, 33, -32, -33, 1000, -1000, 123456, -123456]
    for (const x of values) {
      for (const y of values) {
        expect(toProtocol(toWorld({ x, y })), `(${x}, ${y}) 往返之後變了`).toEqual({ x, y })
      }
    }
  })

  it('[FE-W02-S05] 重複量化同一個世界座標不漂移', () => {
    const world = { x: 3.14159, z: -2.71828 }
    const first = toProtocol(world)
    for (let i = 0; i < 100; i++) {
      expect(toProtocol(world)).toEqual(first)
    }
  })
})

describe('不合協定的值必須明顯失敗', () => {
  it.each([NaN, Infinity, -Infinity])('[FE-W02-S06] 非有限的世界座標 %p 要拋錯', (bad) => {
    expect(() => toProtocol({ x: bad, z: 0 })).toThrow(RangeError)
    expect(() => toProtocol({ x: 0, z: bad })).toThrow(RangeError)
  })

  it('[FE-W02-S07] 超出安全整數範圍要拋錯', () => {
    expect(() => toProtocol({ x: Number.MAX_SAFE_INTEGER, z: 0 })).toThrow(RangeError)
  })
})

describe('移動方向對映到離散朝向', () => {
  it('[FE-W02-S08] 四個主方向', () => {
    // 編碼由 protocol.py 決定：0 下、1 左、2 右、3 上
    expect(facingFromDirection(0, 1)).toBe(FACING.down) // +Z
    expect(facingFromDirection(-1, 0)).toBe(FACING.left) // −X
    expect(facingFromDirection(1, 0)).toBe(FACING.right) // +X
    expect(facingFromDirection(0, -1)).toBe(FACING.up) // −Z
    expect([FACING.down, FACING.left, FACING.right, FACING.up]).toEqual([0, 1, 2, 3])
  })

  it('[FE-W02-S09] 對角線的決勝規則固定：取縱向', () => {
    expect(facingFromDirection(1, 1)).toBe(FACING.down)
    expect(facingFromDirection(-1, 1)).toBe(FACING.down)
    expect(facingFromDirection(1, -1)).toBe(FACING.up)
    expect(facingFromDirection(-1, -1)).toBe(FACING.up)
    // 相同輸入永遠相同結果
    expect(facingFromDirection(1, 1)).toBe(facingFromDirection(1, 1))
  })

  it('[FE-W02-S10] 零向量沒有方向', () => {
    expect(facingFromDirection(0, 0)).toBeNull()
  })

  it.each([NaN, Infinity, -Infinity])('[FE-W02-S11] 非有限的方向分量 %p 要拋錯', (bad) => {
    // **不得回報「沒有方向」** —— 那個語意是「站著不動」，
    // 把壞掉的輸入算進去等於把 bug 偽裝成正常狀態。
    expect(() => facingFromDirection(bad, 0)).toThrow(RangeError)
    expect(() => facingFromDirection(0, bad)).toThrow(RangeError)
  })
})
