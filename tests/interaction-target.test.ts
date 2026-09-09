import { describe, expect, it } from 'vitest'
import { FACING } from '@/world/coords'
import { chooseTarget, type InteractableEntry, type TargetTuning } from '@/world/interaction/target'
import { TUNING } from '@/world/interaction/tuning'

// 規格：openspec/specs/spatial-interaction/spec.md
//   Requirement: 同一時間只有一個互動目標 —— Scenario FE-W06-S01～S05
//   Requirement: 互動範圍用距離判定，且交出連續的距離 —— S06 / S07
//
// **這個檔案測的是正式的 `chooseTarget` 與正式的 `TUNING`**，
// 不是測試裡另外調出來的一組數字。用自訂的 tuning 只出現在
// 「證明某個係數真的在起作用」的負向對照裡，而那些都成對出現。

const at = (id: string, x: number, z: number): InteractableEntry => ({ id, x, z, label: id })

describe('互動目標的選擇', () => {
  it('[FE-W06-S01] 全部在範圍外時沒有目標', () => {
    const far = [at('a', TUNING.range + 0.1, 0), at('b', 0, -(TUNING.range + 5))]
    const r = chooseTarget({ x: 0, z: 0, f: FACING.down }, far, null, TUNING)

    expect(r.id).toBeNull()
    // 防恆真：同樣的物件挪進範圍內就必須選得到，
    // 否則這條驗的可能是「chooseTarget 永遠回 null」
    const inside = [at('a', 0, 0.5)]
    expect(chooseTarget({ x: 0, z: 0, f: FACING.down }, inside, null, TUNING).id).toBe('a')
  })

  it('[FE-W06-S02] 範圍內只有一個時就是它', () => {
    const r = chooseTarget({ x: 0, z: 0, f: FACING.down }, [at('board', 0, 1)], null, TUNING)
    expect(r.id).toBe('board')
  })

  it('[FE-W06-S03] 兩個等距時，面向的那一個贏；轉身之後換人', () => {
    const both = [at('left', -1, 0), at('right', 1, 0)]

    expect(chooseTarget({ x: 0, z: 0, f: FACING.right }, both, null, TUNING).id).toBe('right')
    expect(chooseTarget({ x: 0, z: 0, f: FACING.left }, both, null, TUNING).id).toBe('left')
  })

  it('[FE-W06-S03] 朝向的權重真的在起作用 —— 設成 0 就選不出來了', () => {
    const both = [at('left', -1, 0), at('right', 1, 0)]
    const noFacing: TargetTuning = { ...TUNING, facingWeight: 0 }

    // 成對比較：正式的 tuning 分得出左右，權重為 0 的那一組分不出來
    expect(chooseTarget({ x: 0, z: 0, f: FACING.right }, both, null, TUNING).id).toBe('right')
    expect(chooseTarget({ x: 0, z: 0, f: FACING.left }, both, null, TUNING).id).toBe('left')

    const a = chooseTarget({ x: 0, z: 0, f: FACING.right }, both, null, noFacing).id
    const b = chooseTarget({ x: 0, z: 0, f: FACING.left }, both, null, noFacing).id
    expect(a, '朝向權重為 0 時，轉身不該改變結果').toBe(b)
  })

  it('[FE-W06-S03] 貼著一個、面向遠處另一個時，選貼著的那個', () => {
    // 這是 design 的 Q3 判準 (i)。權重太大的話會選到遠的那個。
    const near = at('near', 0, -0.3)
    const far = at('far', 0, 1.8)
    const r = chooseTarget({ x: 0, z: 0, f: FACING.down }, [near, far], null, TUNING)

    expect(r.id, '站在一個物件正上方，提示卻指著遠處那個').toBe('near')
  })

  it('[FE-W06-S04] 在等分數線附近逐幀來回時，目標不會閃爍', () => {
    const both = [at('left', -1, 0), at('right', 1, 0)]
    // 最壞的實際情況：一整幀的走路距離（MOVE_SPEED 4 ÷ 60 幀）
    const amplitude = 4 / 60

    let current: string | null = null
    let switches = 0
    for (let frame = 0; frame < 120; frame++) {
      const x = (frame % 2 === 0 ? 1 : -1) * amplitude
      const next = chooseTarget({ x, z: -1.5, f: FACING.down }, both, current, TUNING).id
      if (next !== current) {
        switches++
        current = next
      }
    }

    // 第一次從「沒有目標」變成有目標，那一次是應該的
    expect(switches, `120 幀裡切換了 ${switches} 次 —— 提示會在兩個物件之間閃爍`).toBe(1)
  })

  it('[FE-W06-S04] 遲滯真的在起作用 —— 設成 0 就每幀都在換', () => {
    const both = [at('left', -1, 0), at('right', 1, 0)]
    const noHysteresis: TargetTuning = { ...TUNING, hysteresis: 0 }
    const amplitude = 4 / 60

    let current: string | null = null
    let switches = 0
    for (let frame = 0; frame < 120; frame++) {
      const x = (frame % 2 === 0 ? 1 : -1) * amplitude
      const next = chooseTarget({ x, z: -1.5, f: FACING.down }, both, current, noHysteresis).id
      if (next !== current) {
        switches++
        current = next
      }
    }

    expect(switches, '拿掉遲滯之後應該每幀都在換').toBe(120)
  })

  it('[FE-W06-S04] 但遲滯不能大到讓轉身失效 —— 兩邊都要擋', () => {
    // **只驗「不閃爍」是一個洞**：把遲滯設成 999 也不會閃爍，
    // 但那時候目標永遠換不掉，而那同樣是壞的。
    const both = [at('left', -1, 0), at('right', 1, 0)]

    const facingRight = chooseTarget({ x: 0, z: 0, f: FACING.right }, both, 'left', TUNING).id
    expect(facingRight, '已經有目標時轉身，目標要換過去').toBe('right')
  })

  it('[FE-W06-S05] 完全平手且還沒有目標時，結果由 id 決定且可重複', () => {
    const both = [at('bbb', -1, 0), at('aaa', 1, 0)]
    // 面向 +Z，兩個物件對稱地在左右 —— 對齊度與距離都相同
    const first = chooseTarget({ x: 0, z: 0, f: FACING.down }, both, null, TUNING).id
    const again = chooseTarget({ x: 0, z: 0, f: FACING.down }, both, null, TUNING).id
    // 換一個走訪順序，結果必須一樣 —— 否則「誰先掛載」會決定結果
    const reversed = chooseTarget({ x: 0, z: 0, f: FACING.down }, [...both].reverse(), null, TUNING).id

    expect(first).toBe('aaa')
    expect(again).toBe('aaa')
    expect(reversed, '走訪順序改變就換人 —— 那不是決定性的').toBe('aaa')
  })

  it('[FE-W06-S06] 有目標時，距離跟著角色移動改變', () => {
    const board = [at('board', 0, 1.5)]
    const far = chooseTarget({ x: 0, z: 0, f: FACING.down }, board, null, TUNING)
    const near = chooseTarget({ x: 0, z: 1, f: FACING.down }, board, 'board', TUNING)

    expect(far.distance).toBeCloseTo(1.5, 6)
    expect(near.distance).toBeCloseTo(0.5, 6)
  })

  it('[FE-W06-S07] 沒有目標時距離是 null，不是 0', () => {
    const r = chooseTarget({ x: 0, z: 0, f: FACING.down }, [], null, TUNING)

    expect(r.id).toBeNull()
    // 規格的字面要求。`0` 會讓下游的 `if (distance < 1)` 得到「貼在旁邊」
    expect(r.distance, '沒有目標時距離是 0 —— 下游會判斷成「貼在旁邊」').toBeNull()
  })

  it('站在物件正上方時仍然選得到它 —— 不得因為除以零變成 NaN', () => {
    const r = chooseTarget({ x: 0, z: 0, f: FACING.down }, [at('on-top', 0, 0)], null, TUNING)

    expect(r.id).toBe('on-top')
    expect(r.distance).toBe(0)
  })
})
