import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECONNECT_BASE_MS, RECONNECT_CAP_MS, backoffDelay, createReconnectSchedule } from '@/realtime/reconnect'

// 規格：openspec/changes/fe-r12-reconnect/specs/connection-recovery/spec.md
//   Requirement: 重連的等待時間是指數退避加 full jitter；成功後歸零；沒有次數上限 —— S03（區間、封頂、歸零）、S04（每次失敗都再排、一次只存在一個）
//   Requirement: 單一迴圈；卸載、換場景、失去分頁資格時停 —— S06（等待中再 schedule 不疊加）、S07（cancel 後時間過了不執行）
//
// 純模組（design D1／D5）：沒有 React、沒有 client；時間用假計時器、亂數注入。不連任何外部服務。

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const half = () => 0.5

describe('退避的區間', () => {
  it('[FE-R12-S03] r × min(30s, 1s × 2^n)：0 → 0.5s、3 → 4s、5 → 15s、10 → 15s；r=0.999 第 20 次 < 30s', () => {
    expect(RECONNECT_BASE_MS).toBe(1_000)
    expect(RECONNECT_CAP_MS).toBe(30_000)
    expect(backoffDelay(0, half)).toBe(500)
    expect(backoffDelay(3, half)).toBe(4_000)
    expect(backoffDelay(5, half)).toBe(15_000)
    expect(backoffDelay(10, half)).toBe(15_000)
    expect(backoffDelay(20, () => 0.999)).toBeLessThan(30_000)
    // 2^20 已經溢出 cap 很多；不能因為 attempt 大就變成 NaN／Infinity
    expect(Number.isFinite(backoffDelay(1_000, half))).toBe(true)
  })

  it('[FE-R12-S03] 連續 3 次失敗的等待是 1、2、4 秒（r=0.5）；ready 之後 reset，再斷那一次回到 0.5 秒', () => {
    const s = createReconnectSchedule({ random: half })
    const run = vi.fn()
    // 第 0 次：0.5 秒
    s.schedule(run)
    vi.advanceTimersByTime(499)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
    // 失敗 → 第 1、2、3 次：1、2、4 秒
    for (const ms of [1_000, 2_000, 4_000]) {
      s.schedule(run)
      vi.advanceTimersByTime(ms - 1)
      expect(run, `等 ${ms}ms 之前不能跑`).toHaveBeenCalledTimes(run.mock.calls.length)
      const before = run.mock.calls.length
      vi.advanceTimersByTime(1)
      expect(run, `等滿 ${ms}ms 要跑`).toHaveBeenCalledTimes(before + 1)
    }
    expect(s.attempt).toBe(4)
    // 第 4 次 ready → 歸零；再斷：0.5 秒
    s.reset()
    expect(s.attempt).toBe(0)
    s.schedule(run)
    vi.advanceTimersByTime(500)
    expect(run).toHaveBeenCalledTimes(5)
  })
})

describe('一次只有一個排程；停得下來', () => {
  it('[FE-R12-S04] 連續 6 次失敗各再排一次、每次恰好跑一次，任何時刻至多一個待跑；不放棄', () => {
    const s = createReconnectSchedule({ random: half })
    const run = vi.fn()
    for (let i = 0; i < 7; i += 1) {
      expect(s.pending).toBe(false)
      s.schedule(run)
      expect(s.pending).toBe(true)
      expect(vi.getTimerCount()).toBe(1)
      vi.runOnlyPendingTimers()
      expect(run).toHaveBeenCalledTimes(i + 1)
      expect(s.pending).toBe(false)
    }
    expect(s.attempt).toBe(7)
    // 沒有上限：第 7 次照排、封頂 15 秒（r=0.5）
    s.schedule(run)
    vi.advanceTimersByTime(14_999)
    expect(run).toHaveBeenCalledTimes(7)
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(8)
  })

  it('[FE-R12-S06] 等待中再 schedule：不疊加、不重排（第一個排程的時間不變、只跑一次）', () => {
    const s = createReconnectSchedule({ random: half })
    const run = vi.fn()
    const other = vi.fn()
    s.schedule(run)
    vi.advanceTimersByTime(300)
    s.schedule(other) // 舊 socket 又發了一次 close
    s.schedule(other)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(200) // 原本的 500ms 到
    expect(run).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(run).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    expect(s.attempt).toBe(1)
  })

  it('[FE-R12-S07] cancel：時間過了也不跑、pending 變 false；cancel 之後還能再 schedule（新的 effect 用新的 schedule，這裡只保證不炸）', () => {
    const s = createReconnectSchedule({ random: half })
    const run = vi.fn()
    s.schedule(run)
    s.cancel()
    expect(s.pending).toBe(false)
    vi.runAllTimers()
    expect(run).not.toHaveBeenCalled()
    expect(() => s.cancel()).not.toThrow() // 幂等
    s.schedule(run)
    vi.runAllTimers()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('run 裡面再 schedule（失敗就再排）用的是下一次的 attempt', () => {
    const s = createReconnectSchedule({ random: half })
    const seen: number[] = []
    const run = () => {
      seen.push(s.attempt)
      if (s.attempt < 3) s.schedule(run)
    }
    s.schedule(run)
    vi.runAllTimers()
    expect(seen).toEqual([1, 2, 3])
  })
})
