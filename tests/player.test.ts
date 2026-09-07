import { describe, expect, it } from 'vitest'
import { FACING } from '@/world/coords'
import { directionFromKeys } from '@/world/player/input'
import { displacement, normalize, speedOf } from '@/world/player/movement'
import { advancePhase, animationStateFor, poseAt } from '@/world/player/animation'
import { nextFacing } from '@/world/player/facing'

// ⚠️ import 的是**正式碼**。

const keys = (...k: string[]) => new Set(k)

describe('鍵盤輸入變成方向', () => {
  it('[FE-W03-S01] 四個方向鍵', () => {
    // 畫面上 = 世界 −Z、畫面下 = 世界 +Z（相機在 +Z 側往回看）
    expect(directionFromKeys(keys('KeyW'))).toEqual({ x: 0, z: -1 })
    expect(directionFromKeys(keys('KeyS'))).toEqual({ x: 0, z: 1 })
    expect(directionFromKeys(keys('KeyA'))).toEqual({ x: -1, z: 0 })
    expect(directionFromKeys(keys('KeyD'))).toEqual({ x: 1, z: 0 })
  })

  it('[FE-W03-S02] 方向鍵與 WASD 等價', () => {
    expect(directionFromKeys(keys('ArrowUp'))).toEqual(directionFromKeys(keys('KeyW')))
    expect(directionFromKeys(keys('ArrowDown'))).toEqual(directionFromKeys(keys('KeyS')))
    expect(directionFromKeys(keys('ArrowLeft'))).toEqual(directionFromKeys(keys('KeyA')))
    expect(directionFromKeys(keys('ArrowRight'))).toEqual(directionFromKeys(keys('KeyD')))
  })

  it('[FE-W03-S03] 相反的鍵互相抵消', () => {
    // 任選一邊的話，玩家按住 W 再按 S 會突然往回衝
    expect(directionFromKeys(keys('KeyW', 'KeyS'))).toEqual({ x: 0, z: 0 })
    expect(directionFromKeys(keys('KeyA', 'KeyD'))).toEqual({ x: 0, z: 0 })
    expect(directionFromKeys(keys('KeyW', 'ArrowDown'))).toEqual({ x: 0, z: 0 })
  })

  it('[FE-W03-S04] 沒有按鍵', () => {
    expect(directionFromKeys(keys())).toEqual({ x: 0, z: 0 })
    expect(directionFromKeys(keys('Space', 'KeyE'))).toEqual({ x: 0, z: 0 })
  })
})

describe('移動有速度上限，對角線不得更快', () => {
  it('[FE-W03-S05] 對角線不比直線快', () => {
    const dt = 0.1
    const straight = displacement(directionFromKeys(keys('KeyD')), dt)
    const diagonal = displacement(directionFromKeys(keys('KeyD', 'KeyS')), dt)

    const straightLen = Math.hypot(straight.x, straight.z)
    const diagonalLen = Math.hypot(diagonal.x, diagonal.z)

    // 沒有正規化的話 diagonalLen 會是 straightLen 的 √2 倍（快 41%）——
    // 玩家只會覺得「斜著走比較快」，不會回報成 bug。
    expect(diagonalLen).toBeLessThanOrEqual(straightLen + 1e-9)
    expect(diagonalLen).toBeCloseTo(straightLen, 9)
  })

  it('[FE-W03-S06] 移動與影格率無關', () => {
    const dir = directionFromKeys(keys('KeyD', 'KeyS'))
    const once = displacement(dir, 0.1)

    let x = 0
    let z = 0
    for (let i = 0; i < 10; i++) {
      const d = displacement(dir, 0.01)
      x += d.x
      z += d.z
    }
    expect(x).toBeCloseTo(once.x, 9)
    expect(z).toBeCloseTo(once.z, 9)
  })

  it.each([NaN, Infinity, -Infinity])('[FE-W03-S07] 非有限的時間間隔 %p 要拋錯', (bad) => {
    expect(() => displacement({ x: 1, z: 0 }, bad)).toThrow(RangeError)
  })

  it('零向量正規化之後還是零', () => {
    expect(normalize({ x: 0, z: 0 })).toEqual({ x: 0, z: 0 })
    expect(speedOf({ x: 0, z: 0 })).toBe(0)
  })
})

describe('朝向用既有的那一份對映', () => {
  it('[FE-W03-S08] 移動時朝向跟著方向', () => {
    // 這些值必須跟 world-coordinates 一致 —— 那份是唯一一份
    expect(nextFacing(directionFromKeys(keys('KeyS')), FACING.up)).toBe(FACING.down)
    expect(nextFacing(directionFromKeys(keys('KeyW')), FACING.down)).toBe(FACING.up)
    expect(nextFacing(directionFromKeys(keys('KeyA')), FACING.down)).toBe(FACING.left)
    expect(nextFacing(directionFromKeys(keys('KeyD')), FACING.down)).toBe(FACING.right)
  })

  it('[FE-W03-S09] 停下來時不轉頭', () => {
    for (const previous of [FACING.down, FACING.left, FACING.right, FACING.up]) {
      expect(nextFacing({ x: 0, z: 0 }, previous)).toBe(previous)
    }
  })
})

describe('Idle 與 Walk 的程式動畫', () => {
  it('[FE-W03-S10] 移動時進入 Walk', () => {
    expect(animationStateFor(speedOf(directionFromKeys(keys('KeyD'))))).toBe('walk')
  })

  it('[FE-W03-S11] 靜止時進入 Idle', () => {
    expect(animationStateFor(speedOf(directionFromKeys(keys())))).toBe('idle')
  })

  it('[FE-W03-S12] 動畫相位連續，切換狀態時不跳', () => {
    const dt = 1 / 60
    let phase = 0
    let previous = phase
    // 前半段 walk、後半段 idle —— 切換的那一幀相位不得重置
    for (let i = 0; i < 120; i++) {
      const state = i < 60 ? 'walk' : 'idle'
      phase = advancePhase(phase, dt, state)
      // 相位在 [0,1) 裡繞圈，所以「沒有跳」是指環狀距離很小
      const raw = Math.abs(phase - previous)
      const wrapped = Math.min(raw, 1 - raw)
      expect(wrapped, `第 ${i} 幀相位跳了 ${wrapped}`).toBeLessThan(0.1)
      previous = phase
    }
  })

  it('相位落在 [0, 1)', () => {
    let phase = 0
    for (let i = 0; i < 500; i++) {
      phase = advancePhase(phase, 0.05, 'walk')
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(1)
    }
  })

  it('非有限的輸入要拋錯', () => {
    expect(() => advancePhase(0, NaN, 'walk')).toThrow(RangeError)
    expect(() => advancePhase(NaN, 0.1, 'walk')).toThrow(RangeError)
  })

  it('Walk 有擺動，Idle 沒有', () => {
    expect(poseAt(0.25, 'walk').swing).not.toBe(0)
    expect(poseAt(0.25, 'idle').swing).toBe(0)
  })
})
