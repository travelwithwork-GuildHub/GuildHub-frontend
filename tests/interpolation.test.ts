import { describe, expect, it } from 'vitest'
import {
  RENDER_DELAY_MS,
  appendSample,
  createTrack,
  evaluate,
  resetTrack,
  type Track,
} from '@/realtime/interpolation'

// 規格：openspec/changes/fe-r08-interpolation/specs/remote-interpolation/spec.md
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的
// 每一個 WHEN/THEN 子句都跑過。
//
// 時間全部是**傳進去的**。這裡沒有任何 `performance.now()` ——
// 那正是規格要求的：寫入端與求值端用同一個注入的時間來源。

const D = RENDER_DELAY_MS

/** 在 `t` 這一刻寫入一筆。 */
function at(track: Track, t: number, x: number, z = 0, f = 0) {
  appendSample(track, { x, z, f }, t)
}

/** 求 `now` 這一刻的位置，回 `null` 就直接讓測試爆掉（那是另一種失敗）。 */
function pose(track: Track, now: number) {
  const p = evaluate(track, now)
  expect(p, `在 ${now} 求值得到 null`).not.toBeNull()
  return p!
}

describe('遠端角色的插值', () => {  it('[FE-R08-S01] 兩個樣本之間，位置隨時間連續前進', () => {
    const track = createTrack()
    at(track, 0, 0)
    at(track, 100, 0.4)

    // 游標 = now − D，所以要在 D 之後才會走到第二筆。
    const mid = pose(track, 50 + D)
    expect(mid.x).toBeCloseTo(0.2, 10)

    const quarter = pose(track, 25 + D)
    expect(quarter.x).toBeCloseTo(0.1, 10)

    // **純函式**：同一個游標求值兩次，完全相同。
    expect(pose(track, 25 + D)).toEqual(quarter)
  })

  it('[FE-R08-S13] 游標就是 now − 250ms，而且單段上限也是 250ms', () => {
    // 這一條同時鎖住三件事：D 是 250、單段上限是 250、而且**兩者相等**。
    const T = 1000
    const track = createTrack()
    at(track, T, 0)
    at(track, T + 5000, 0.4) // 空檔 5 秒，遠大於 D

    // 到達的瞬間：**還在第一筆上**（上限 > D 的話這裡會跳掉一段比例）
    expect(pose(track, T + 5000).x).toBeCloseTo(0, 10)
    // 半段：中點（上限 ≠ D 的話這裡會偏）
    expect(pose(track, T + 5000 + D / 2).x).toBeCloseTo(0.2, 10)
    // 整段：正好到第二筆
    expect(pose(track, T + 5000 + D).x).toBeCloseTo(0.4, 10)
    // 之後：停在第二筆
    expect(pose(track, T + 5000 + D + 1).x).toBeCloseTo(0.4, 10)
  })

  it('[FE-R08-S14] 游標早於第一個樣本', () => {
    // 剛 `join` 之後的 250 毫秒**一定**會發生：只有一筆樣本、時間就是現在，
    // 而游標永遠比現在早 250 毫秒。
    const track = createTrack()
    at(track, 1000, 3, 4, 2)

    const p = pose(track, 1000)
    expect(p).toEqual({ x: 3, z: 4, f: 2 })
    expect(Number.isNaN(p.x), 'x 是 NaN').toBe(false)
    // 更早也一樣
    expect(pose(track, 900)).toEqual({ x: 3, z: 4, f: 2 })
  })

  it('[FE-R08-S02] 10 Hz 的樣本在 60 FPS 上沒有跳格', () => {
    // ⚠️ **時間只能往前走。** 先把整段未來餵完再回頭求值的話，
    // 舊樣本已經被清掉了（那是對的行為），會求到一個夾住的常數 ——
    // 而那看起來像「插值壞了」。這裡照真實情況跑：每幀推進，
    // 跨過 100 毫秒邊界就寫入一筆。
    const track = createTrack()
    const STEP = 0.4 // 每則 0.4 世界單位（= 12.8 協定像素）

    const steps: number[] = []
    let previous: number | null = null
    let nextSampleAt = 0
    let sampleIndex = 0
    for (let frame = 0; frame <= 120; frame++) {
      const now = (frame * 1000) / 60
      while (nextSampleAt <= now) {
        at(track, nextSampleAt, sampleIndex * STEP)
        sampleIndex++
        nextSampleAt += 100
      }
      // 前 250 毫秒游標還在第一筆之前（夾住不動），那不是跳格，跳過不算
      if (now < RENDER_DELAY_MS + 100) continue
      const x = pose(track, now).x
      if (previous !== null) steps.push(x - previous)
      previous = x
    }

    const sorted = [...steps].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const max = sorted[sorted.length - 1]!

    expect(Math.min(...steps), '有幀完全沒動').toBeGreaterThan(0)
    expect(max, `最大單幀位移 ${max} 超過中位數 ${median} 的兩倍`).toBeLessThanOrEqual(
      median * 2,
    )
    // **沒有插值的話這裡會是 0.4** —— 一整則樣本的距離塞進一幀。
    expect(max, '有一幀跳掉了一整則樣本的距離').toBeLessThan(STEP)
  })

  it('[FE-R08-S03] 樣本用完之後停在最後一個位置，不繼續滑行', () => {
    const track = createTrack()
    at(track, 0, 0)
    at(track, 100, 0.4)
    at(track, 200, 0.8)

    // 推進到超過最後一筆 1 秒
    const stopped = pose(track, 200 + D + 1000)
    expect(stopped.x, '外插了 —— 協定裡沒有「我停了」這則訊息').toBe(0.8)

    // 再推 10 秒，完全不動
    expect(pose(track, 200 + D + 11000)).toEqual(stopped)
  })

  it('沒有任何樣本時回 null，不拋錯', () => {
    expect(evaluate(createTrack(), 12_345)).toBeNull()
  })

  it('render delay 是 250 毫秒', () => {
    // 量到的到達間隔 p99 是 202.6ms、max 是 205.5ms。
    // 150 會在已知的 200ms 結構性空檔上餓死；200 在 loopback 上就不夠。
    expect(RENDER_DELAY_MS).toBe(250)
  })
})
