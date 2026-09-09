import { beforeAll, describe, expect, it } from 'vitest'
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import {
  PHYSICS,
  addStaticBox,
  createPhysicsWorld,
  isOverlapping,
  movePlayer,
  type PhysicsWorld,
} from '@/world/physics/world'
import { planSteps } from '@/world/physics/accumulator'

// ⚠️ import 的是**正式碼**。而且這裡跑的是**真的 Rapier** ——
// 不是 mock。開工前實測過它在 jsdom 裡跑得起來，所以碰撞、邊界、
// 穿牆防護不必只靠眼睛。

let RAPIER: typeof RAPIER_NS

beforeAll(async () => {
  RAPIER = await import('@dimforge/rapier3d-compat')
  await RAPIER.init()
}, 30_000)

/** 反覆推同一個方向，回傳最終位置。 */
function walk(pw: PhysicsWorld, dir: { x: number; z: number }, steps: number, per = 0.05) {
  for (let i = 0; i < steps; i++) movePlayer(pw, { x: dir.x * per, z: dir.z * per })
  return pw.player.translation()
}

describe('角色會被靜態障礙物擋住', () => {
  it('[FE-W04-S01] 走向牆會停下來', () => {
    const pw = createPhysicsWorld(RAPIER)
    // 一面在 x=2 的薄牆
    addStaticBox(pw, { x: 2, z: 0, halfWidth: 0.1, halfDepth: 3 })

    const end = walk(pw, { x: 1, z: 0 }, 120)

    // 停在牆的這一側：牆面在 x=1.9，角色半徑 0.25 → 中心不該超過約 1.65
    expect(end.x).toBeLessThan(1.7)
    expect(end.x).toBeGreaterThan(1.0) // 有真的走到牆邊，不是原地沒動
  })

  it('[FE-W04-S02] 沿著牆斜走會滑動，不完全停住', () => {
    const pw = createPhysicsWorld(RAPIER)
    addStaticBox(pw, { x: 2, z: 0, halfWidth: 0.1, halfDepth: 6 })

    const start = { ...pw.player.translation() }
    // 斜向朝牆：X 被擋掉，Z 應該還走得動
    const end = walk(pw, { x: 0.707, z: 0.707 }, 120)

    expect(end.x).toBeLessThan(1.7) // X 被牆擋掉
    // 完全停住的話 Z 也不會動 —— 那正是「被卡住」的感覺
    expect(end.z - start.z, '沿牆滑動失敗：Z 完全沒有前進').toBeGreaterThan(1)
  })

  it('[FE-W04-S03] 沒有障礙物時位移等於期望值', () => {
    const pw = createPhysicsWorld(RAPIER)
    const end = walk(pw, { x: 1, z: 0 }, 20, 0.05)
    expect(end.x).toBeCloseTo(1.0, 1)
  })
})

describe('遊玩區域有邊界', () => {
  it.each([
    ['+X', { x: 1, z: 0 }],
    ['−X', { x: -1, z: 0 }],
    ['+Z', { x: 0, z: 1 }],
    ['−Z', { x: 0, z: -1 }],
  ])('[FE-W04-S04] 朝 %s 邊界走很久仍在範圍內', (_label, dir) => {
    const pw = createPhysicsWorld(RAPIER)
    const end = walk(pw, dir, 600, 0.1) // 想走 60 個單位，區域只有 ±10

    expect(Math.abs(end.x)).toBeLessThanOrEqual(PHYSICS.halfExtent)
    expect(Math.abs(end.z)).toBeLessThanOrEqual(PHYSICS.halfExtent)
  })
})

describe('任何速度都不得穿牆', () => {
  it('[FE-W04-S05] 世界剛建好、第一次移動就衝向邊界', () => {
    // ⚠️ 這條是負向驗證逼出來的：原本只有「addStaticBox 加的牆」被涵蓋，
    // 而那個函式自己會更新查詢管線。**邊界是在 createPhysicsWorld 裡加的** ——
    // 那裡少一次 updateSceneQueries 的話，開場第一幀衝出去就穿牆，
    // 而且之後每一步都正常（因為 step 更新了管線），所以幾乎查不出來。
    const pw = createPhysicsWorld(RAPIER)

    movePlayer(pw, { x: 50, z: 0 })
    const end = pw.player.translation()

    expect(Math.abs(end.x), '第一幀就穿出邊界了').toBeLessThanOrEqual(PHYSICS.halfExtent)
  })

  it('[FE-W04-S05] 單幀位移遠大於牆厚', () => {
    const pw = createPhysicsWorld(RAPIER)
    // 牆厚 0.2（half 0.1），一次推 5 個單位 —— 是牆厚的 25 倍
    addStaticBox(pw, { x: 2, z: 0, halfWidth: 0.1, halfDepth: 3 })

    movePlayer(pw, { x: 5, z: 0 })
    const end = pw.player.translation()

    // 「移動後再檢查重疊」的寫法在這裡會直接穿到 x=5
    expect(end.x, '穿牆了 —— shape-cast 沒有生效').toBeLessThan(1.7)
  })
})

describe('Sensor 回報重疊但不擋路', () => {
  it('[FE-W04-S06] 走進 sensor 不會被擋', () => {
    const pw = createPhysicsWorld(RAPIER)
    addStaticBox(pw, { x: 1, z: 0, halfWidth: 0.5, halfDepth: 0.5, sensor: true })

    const end = walk(pw, { x: 1, z: 0 }, 60, 0.05)
    // 沒有 sensor 時走 60×0.05 = 3；被擋住的話會停在 0.25 附近
    expect(end.x, 'sensor 擋住了移動').toBeGreaterThan(2.5)
  })

  it('[FE-W04-S07] 進入與離開時重疊查詢的結果會變', () => {
    const pw = createPhysicsWorld(RAPIER)
    const sensor = addStaticBox(pw, { x: 2, z: 0, halfWidth: 0.5, halfDepth: 0.5, sensor: true })

    // ⚠️ **前提是物理世界已經步進過。** 沒步進過的查詢一律回「沒有重疊」，
    // 而且**不會報錯** —— 那是無聲的（規格 FE-W04 的 MODIFIED Requirement）。
    // 這一行同時是「一開始不該重疊」與那個前提的對照組。
    expect(isOverlapping(pw, sensor), '一開始不該重疊').toBe(false)

    walk(pw, { x: 1, z: 0 }, 40, 0.05) // 走到 x≈2
    expect(isOverlapping(pw, sensor), '走進去了卻沒回報重疊').toBe(true)

    walk(pw, { x: 1, z: 0 }, 40, 0.05) // 走過去
    expect(isOverlapping(pw, sensor), '離開了卻還在回報重疊').toBe(false)
  })

  // ⚠️⚠️ **這一條是把一個推翻掉的假設釘住。** ⚠️⚠️
  //
  // FE-W04 原本寫著「sensor 是 Interaction Range 的原語」。FE-W06 開工時實測
  // 發現它不管遮蔽 —— 角色與 sensor 中間隔一道實心牆，重疊照樣成立。
  // 所以互動範圍改用距離判定，而 sensor 的定位被修訂成「物理的觸發原語」。
  //
  // 沒有這條測試的話，之後 FE-V03（可旁觀）／FE-V04（漸進式接近）
  // 很可能會假設 sensor 幫他們處理了視線 —— 而那個假設是錯的。
  it('[FE-W04-S09] Sensor 的重疊不代表可互動 —— 牆擋不住它', () => {
    const pw = createPhysicsWorld(RAPIER)
    // 一道實心牆擋在 x=1；sensor 在牆的另一邊，但範圍蓋回角色身上
    addStaticBox(pw, { x: 1, z: 0, halfWidth: 0.2, halfDepth: 3 })
    const sensor = addStaticBox(pw, {
      x: 2,
      z: 0,
      halfWidth: 2.5,
      halfDepth: 2.5,
      halfHeight: 2,
      sensor: true,
    })

    // 原地踏步，只為了讓世界步進 —— 見上一條的前提
    walk(pw, { x: 0, z: 0 }, 3, 0.05)

    expect(
      isOverlapping(pw, sensor),
      'sensor 開始擋牆了嗎？如果這條變紅，FE-W06 用距離判定的理由要重新評估',
    ).toBe(true)

    // 對照：那道牆是實心的，角色真的過不去 ——
    // 沒有這一段的話，上面那個 true 可能只是因為牆根本不存在
    const end = walk(pw, { x: 1, z: 0 }, 200, 0.05)
    expect(end.x, '牆沒有擋住角色 —— 上面那條驗證是空的').toBeLessThan(0.8)
  })
})

describe('固定時間步的累積器', () => {
  it('影格率高時不會多跑步數', () => {
    // 一幀 1/120 秒（120 Hz）：不到一個固定步，這一幀不該跑
    const fast = planSteps(0, 1 / 120)
    expect(fast.steps).toBe(0)
    // 累積兩幀之後剛好一步
    expect(planSteps(fast.remainder, 1 / 120).steps).toBe(1)
  })

  it('同一段時間拆幾次結果相同（在上限之內）', () => {
    // ⚠️ 總步數要**小於 maxStepsPerFrame**，否則單次呼叫會被上限砍掉，
    // 兩邊本來就不該相同。第一版拿 0.1 秒（6 步）去比 5 步的上限，
    // 是測試自己的前提錯了，不是程式碼有問題。
    let acc = 0
    let total = 0
    for (let i = 0; i < 5; i++) {
      const p = planSteps(acc, 0.01)
      total += p.steps
      acc = p.remainder
    }
    expect(total).toBe(planSteps(0, 0.05).steps)
    expect(total).toBeLessThan(PHYSICS.maxStepsPerFrame)
  })

  it('極大的 dt 被上限擋住，而且不累積', () => {
    const p = planSteps(0, 60)
    expect(p.steps).toBe(PHYSICS.maxStepsPerFrame)
    // 被砍掉的時間丟棄 —— 累積的話下一幀會再爆一次，永遠追不上
    expect(p.remainder).toBe(0)
  })

  it.each([NaN, Infinity])('非有限的時間 %p 要拋錯', (bad) => {
    expect(() => planSteps(0, bad)).toThrow(RangeError)
    expect(() => planSteps(bad, 0.1)).toThrow(RangeError)
  })
})
