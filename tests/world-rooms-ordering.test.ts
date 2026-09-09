import { describe, expect, it } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { doorsFor } from '@/world/rooms/ordering'

// 排序與截斷。規格 `FE-W12-S01`／`S05`。

const room = (id: string, title: string, online = 0): RoomDoorOut => ({
  project_id: id,
  title,
  online_count: online,
})

/** 三筆固定的房間。**id 的字典序刻意跟其他每一種順序都不同。** */
const ALPHA = room('a0000000-0000-4000-8000-000000000001', '星際導航', 1)
const BRAVO = room('b0000000-0000-4000-8000-000000000002', '深海測繪', 9)
const CHARLIE = room('c0000000-0000-4000-8000-000000000003', '沙丘物流', 5)

const idsOf = (rooms: readonly RoomDoorOut[]) => rooms.map((r) => r.project_id)

describe('門的順序', () => {
  it('[FE-W12-S01] 每一筆房間生成一扇門', () => {
    const { doors, hidden } = doorsFor([ALPHA, BRAVO, CHARLIE], 6)
    expect(doors).toHaveLength(3)
    expect(hidden).toBe(0)
  })

  it('[FE-W12-S01] 順序依 project_id 字典序，與回應的陣列順序無關', () => {
    const forward = doorsFor([ALPHA, BRAVO, CHARLIE], 6)
    const shuffled = doorsFor([CHARLIE, ALPHA, BRAVO], 6)
    const reversed = doorsFor([CHARLIE, BRAVO, ALPHA], 6)

    const expected = [ALPHA.project_id, BRAVO.project_id, CHARLIE.project_id]
    expect(idsOf(forward.doors)).toEqual(expected)
    expect(idsOf(shuffled.doors)).toEqual(expected)
    expect(idsOf(reversed.doors)).toEqual(expected)
  })

  it('[FE-W12-S01] online_count 不影響順序', () => {
    // ⚠️ 這一條擋的是「依在線數遞減排序」—— 那在列表產品裡合理，
    // 在可行走的空間裡不合理：門的位置形成空間記憶。
    const busy = doorsFor([{ ...ALPHA, online_count: 40 }, BRAVO, CHARLIE], 6)
    const quiet = doorsFor([{ ...ALPHA, online_count: 0 }, BRAVO, CHARLIE], 6)

    expect(idsOf(busy.doors)).toEqual(idsOf(quiet.doors))
    // 反向控制：如果依在線數排，40 人的 ALPHA 會跟 9 人的 BRAVO 換位置。
    expect(idsOf(busy.doors)[0]).toBe(ALPHA.project_id)
  })

  it('[FE-W12-S01] 不改動傳進來的陣列', () => {
    const input = [CHARLIE, ALPHA, BRAVO]
    doorsFor(input, 6)
    // 就地排序會讓呼叫端拿到一份被動過的資料 —— 那種副作用在別的地方才會爆。
    expect(idsOf(input)).toEqual([CHARLIE.project_id, ALPHA.project_id, BRAVO.project_id])
  })
})

describe('排不下的專案', () => {
  const many = Array.from({ length: 9 }, (_, i) =>
    room(`${String.fromCharCode(97 + i)}0000000-0000-4000-8000-00000000000${i}`, `專案 ${i}`, i),
  )

  it('[FE-W12-S05] 超過容量時只放前 N 扇，並算出還有幾個', () => {
    const { doors, hidden } = doorsFor(many, 6)
    expect(doors).toHaveLength(6)
    expect(hidden).toBe(3)
    expect(hidden).toBe(many.length - doors.length)
  })

  it('[FE-W12-S05] 留下來的是字典序在前的那幾個', () => {
    const { doors } = doorsFor([...many].reverse(), 6)
    expect(idsOf(doors)).toEqual(idsOf(many.slice(0, 6)))
  })

  it('[FE-W12-S05] 剛好等於容量時沒有隱藏的', () => {
    const { doors, hidden } = doorsFor(many.slice(0, 6), 6)
    expect(doors).toHaveLength(6)
    expect(hidden).toBe(0)
  })

  it('[FE-W12-S02] 空清單沒有門，也沒有隱藏的', () => {
    const { doors, hidden } = doorsFor([], 6)
    expect(doors).toEqual([])
    expect(hidden).toBe(0)
  })
})
