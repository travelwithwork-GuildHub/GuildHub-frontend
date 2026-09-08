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
// **這個檔案是空檔、突波、時間與清理**；求值本身在 `interpolation.test.ts`。
// 分兩個檔案是因為一個 PR 的 diff 上限是 400 行（AGENTS.md）。
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

describe('遠端角色的插值：空檔、突波與清理', () => {  it('[FE-R08-S04] 長時間靜止之後重新移動，不跳格', () => {
    const track = createTrack()
    at(track, 0, 0)
    // 靜止 10 秒後走一步（0.4 世界單位）
    at(track, 2_000, 0.4)

    // 到達的那一瞬間，**還在舊位置上**
    expect(pose(track, 2_000).x, '收到的瞬間就跳掉了').toBeCloseTo(0, 10)

    // 之後 250 毫秒平順地走完
    const xs: number[] = []
    for (let frame = 0; frame <= 15; frame++) {
      xs.push(pose(track, 2_000 + (frame * 1000) / 60).x)
    }
    const jumps = xs.slice(1).map((x, i) => x - xs[i]!)
    expect(Math.max(...jumps), '中間有一幀跳超過整段的一半').toBeLessThan(0.4 / 2)
    expect(pose(track, 2_000 + D).x).toBeCloseTo(0.4, 10)
  })

  it('[FE-R08-S05] 一次進來一批時間相同的樣本', () => {
    // 斷線兩秒後恢復，TCP 把積壓的封包一次交付。
    const track = createTrack()
    at(track, 0, 0)
    for (let i = 1; i <= 20; i++) at(track, 5000, i * 0.4)

    // 時長為零的段不得產生 NaN。**NaN 寫進 three 的 position 不會拋錯**，
    // 只會讓那個角色從畫面上消失。
    for (const now of [5000, 5000 + D / 2, 5000 + D, 5000 + D + 1]) {
      const p = pose(track, now)
      expect(Number.isFinite(p.x), `x 在 ${now} 是 ${p.x}`).toBe(true)
      expect(Number.isFinite(p.z), `z 在 ${now} 是 ${p.z}`).toBe(true)
    }

    // 游標越過那一批之後，位置是**那批裡最後一個**
    expect(pose(track, 5000 + D + 1).x).toBeCloseTo(20 * 0.4, 10)
  })

  it('[FE-R08-S15] 時間倒退不會讓位置跑到區間外', () => {
    const track = createTrack()
    at(track, 1000, 0)
    at(track, 500, 1) // **比前一筆還早**

    const times = track.samples.map((s) => s.t)
    expect(times[1]!, '樣本時間倒退了').toBeGreaterThanOrEqual(times[0]!)

    for (let now = 900; now <= 1500; now += 25) {
      const x = pose(track, now).x
      expect(x, `在 ${now} 求到 ${x}，跑到 [0,1] 之外`).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
    }

    // 用比先前更早的游標再求一次 —— 純函式，不保留「上次求到哪裡」
    expect(() => evaluate(track, 100)).not.toThrow()
    expect(evaluate(track, 100)).not.toBeNull()
  })

  it('[FE-R08-S16] 樣本數不隨時間無限成長', () => {
    // ⚠️ **2000 次不是隨便挑的，10000 次會弄壞別的測試。**
    // vitest 平行跑各個檔案，而這一條把一顆核心吃滿約半秒 ——
    // 實測讓 `world-boundary.test.tsx` 的 `findByTestId`（預設 1 秒逾時）
    // 在三次裡紅兩次。那條測試的逾時也一起放寬了，但**計算量本身也該收斂** ——
    // 這一條要證明的是「有上界」，2000 次（＝ 200 秒的連線）就足以證明。
    const track = createTrack()
    const withPruning: number[] = []
    let maxLength = 0
    for (let i = 0; i < 2_000; i++) {
      at(track, i * 100, i * 0.4)
      const p = evaluate(track, i * 100)
      if (p !== null && i % 500 === 0) withPruning.push(p.x)
      maxLength = Math.max(maxLength, track.samples.length)
    }
    expect(maxLength, `樣本數長到 ${maxLength}，這是記憶體洩漏`).toBeLessThan(10)

    // 結果要跟「完全不清理」時相同 —— 用一條從頭餵到底、只在最後求值的軌跡比對。
    const reference: number[] = []
    for (let i = 0; i < 2_000; i++) {
      if (i % 500 !== 0) continue
      const fresh = createTrack()
      // 只留必要的幾筆就足以求出同一個值
      for (let k = Math.max(0, i - 5); k <= i; k++) at(fresh, k * 100, k * 0.4)
      const p = evaluate(fresh, i * 100)
      if (p !== null) reference.push(p.x)
    }
    expect(withPruning).toEqual(reference)
  })

  it('[FE-R08-S06] snapshot 讓角色直接出現在新位置', () => {
    const track = createTrack()
    at(track, 0, 0)
    at(track, 100, 0.4)

    resetTrack(track, { x: 100, z: 200, f: 1 }, 150)

    // 沒有從舊位置滑過去 —— 下一次求值就在那裡
    expect(pose(track, 150)).toEqual({ x: 100, z: 200, f: 1 })
    expect(pose(track, 150 + D)).toEqual({ x: 100, z: 200, f: 1 })
    expect(track.samples).toHaveLength(1)
  })

  it('[FE-R08-S07] 距離很遠的 pos 仍然是插值，不 snap', () => {
    // 掉了 1 秒的封包：下一筆距離 4 個世界單位。**插值過去才是對的** ——
    // 那 1 秒他真的在走。這裡刻意用一個「距離門檻」會攔下來的距離。
    const track = createTrack()
    at(track, 0, 0)
    at(track, 1000, 4)

    expect(pose(track, 1000).x, '收到的瞬間就跳過去了').toBeCloseTo(0, 10)
    const half = pose(track, 1000 + D / 2).x
    expect(half, '沒有中間值 —— 被 snap 掉了').toBeGreaterThan(0)
    expect(half).toBeLessThan(4)
    expect(pose(track, 1000 + D).x).toBeCloseTo(4, 10)
  })

  it('[FE-R08-S08] 朝向只會是協定裡的四個值之一', () => {
    const track = createTrack()
    at(track, 0, 0, 0, 2) // 面向右
    at(track, 100, 0.4, 0, 0) // 面向下

    // 這一段用**終點**的朝向
    expect(pose(track, 50 + D).f, '用了這一段起點的朝向').toBe(0)

    const seen = new Set<number>()
    for (let now = D; now <= 100 + D; now += 5) seen.add(pose(track, now).f)
    expect([...seen].sort(), '出現了協定沒有定義的中間值').toEqual([0, 2])
  })

  it('[FE-R08-S09] 原地轉身：位置不動，朝向會換', () => {
    const track = createTrack()
    at(track, 0, 1, 2, 0)
    at(track, 100, 1, 2, 3) // 同一個位置，換朝向

    for (let now = D; now <= 100 + D; now += 10) {
      const p = pose(track, now)
      expect(p.x).toBe(1)
      expect(p.z).toBe(2)
    }
    // 游標進入這一段之後，朝向就是新的那個
    expect(pose(track, 1 + D).f).toBe(3)
    expect(pose(track, 100 + D).f).toBe(3)
  })
})
