import { describe, expect, it } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { CAMERA_DEFAULTS } from '@/world/camera'
import { visualBoundsOf } from '@/world/environment/definition'
import { doorDefinition } from '@/world/environment/semantic'
import { labelAnchorsFor } from '@/world/rooms/anchors'
import { doorTargetId } from '@/world/rooms/labels'
import {
  LABEL_SIZE,
  MIN_VIEWPORT,
  labelRectFor,
  labelsOverlap,
} from '@/world/rooms/labelProjection'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'

// 標籤的投影與版面。規格 `FE-W12-S10`／`S11`／`S12`／`S13`。
//
// ⚠️ **判定是「兩個矩形不相交」，不是「中心點的距離大於寬度」** ——
// 後者不足以證明兩個矩形沒有重疊。

const room = (letter: string, title: string, online = 0): RoomDoorOut => ({
  project_id: `${letter}0000000-0000-4000-8000-00000000000${letter}`,
  title,
  online_count: online,
})

/** 排滿走廊。 */
const FULL = CORRIDOR_SLOTS.map((_, i) =>
  room(String.fromCharCode(97 + i), `專案 ${i}`, i),
)

/** 站在走廊裡看門。 */
const IN_CORRIDOR = { x: -9, z: 3 }

describe('標籤的位置', () => {
  it('[FE-W12-S10] 標籤掛在門**頂上**，不是門身上', () => {
    const anchors = labelAnchorsFor(FULL, CORRIDOR_SLOTS)
    expect(anchors.length).toBeGreaterThan(0)

    // 門的視覺高度**從造型推導** —— 換一個更高的門，標籤要跟著上去。
    const doorHeight = (visualBoundsOf(doorDefinition())?.halfHeight ?? 0) * 2
    expect(doorHeight).toBeGreaterThan(1)

    for (const anchor of anchors) {
      // ⚠️ 錨在 y = 0 的話標籤會蓋在門板上，而**投影仍然算得出位置**
      // —— 只驗「有位置」的話那是綠的。
      expect(anchor.y).toBeGreaterThan(doorHeight)
    }
  })

  it('[FE-W12-S10] 標籤跟著門的世界座標走', () => {
    const anchors = labelAnchorsFor(FULL, CORRIDOR_SLOTS)
    expect(anchors.length).toBeGreaterThan(1)

    const rects = anchors.map((a) => labelRectFor(a, IN_CORRIDOR, MIN_VIEWPORT))
    const first = rects[0]
    const second = rects[1]
    if (first === null || second === null || first === undefined || second === undefined) {
      throw new Error('走廊中間看不到前兩扇門的標籤 —— 投影或槽位算錯了')
    }
    // 兩扇門只差在 z，而螢幕縱向座標是 `(py - pz + tz) × √2/2` ——
    // 所以差距是**算得出來的**，不是「有差就好」。
    const pitch = (CORRIDOR_SLOTS[1]?.z ?? 0) - (CORRIDOR_SLOTS[0]?.z ?? 0)
    const expected =
      ((pitch * Math.SQRT1_2) / (CAMERA_DEFAULTS.viewHeight / 2)) * (MIN_VIEWPORT.height / 2)
    expect(second.top - first.top).toBeCloseTo(expected, 6)
    // 同一面牆上的門，水平位置一樣。
    expect(second.left).toBeCloseTo(first.left, 6)
  })

  it('[FE-W12-S13] 門在畫面外時沒有位置', () => {
    const anchors = labelAnchorsFor(FULL, CORRIDOR_SLOTS)
    const anchor = anchors[0]
    if (anchor === undefined) throw new Error('沒有錨點')

    // 相機跟著角色 —— 走到世界的另一頭，走廊就離開畫面了。
    expect(labelRectFor(anchor, { x: 60, z: 3 }, MIN_VIEWPORT)).toBe(null)
    // 反向控制：站在走廊裡看得到。
    expect(labelRectFor(anchor, IN_CORRIDOR, MIN_VIEWPORT)).not.toBe(null)
  })
})

describe('排滿時的版面', () => {
  it('[FE-W12-S11] 最小支援尺寸下，標籤兩兩不相交', () => {
    const anchors = labelAnchorsFor(FULL, CORRIDOR_SLOTS)
    const rects = anchors
      .map((a) => labelRectFor(a, IN_CORRIDOR, MIN_VIEWPORT))
      .filter((r) => r !== null)

    // ⚠️ **「大於一」擋的是空泛為真**：只有 0 或 1 個標籤時，
    // 「任意兩個」是空集合，下面的迴圈一次都不會跑。
    expect(rects.length).toBe(CORRIDOR_SLOTS.length)
    expect(rects.length).toBeGreaterThan(1)

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        if (a === undefined || b === undefined) throw new Error('矩形不連續')
        expect(labelsOverlap(a, b), `第 ${i} 與第 ${j} 個標籤疊在一起`).toBe(false)
      }
    }
  })

  it('[FE-W12-S12] 名稱過長不改變任何標籤的位置或尺寸', () => {
    const short = labelAnchorsFor(FULL, CORRIDOR_SLOTS)
    const long = labelAnchorsFor(
      FULL.map((r, i) => (i === 0 ? { ...r, title: '極長的專案名稱'.repeat(20) } : r)),
      CORRIDOR_SLOTS,
    )
    expect(short.length).toBeGreaterThan(1)

    // 標籤是**固定尺寸**：名稱的長度由後端決定，
    // 讓它影響版面等於把版面交給不可控的輸入。
    for (const [index, anchor] of long.entries()) {
      const before = short[index]
      if (before === undefined) throw new Error('錨點數目對不上')
      const a = labelRectFor(anchor, IN_CORRIDOR, MIN_VIEWPORT)
      const b = labelRectFor(before, IN_CORRIDOR, MIN_VIEWPORT)
      expect(a).toEqual(b)
    }
    // 而且第一個標籤的名字真的變長了 —— 沒有這一行，上面的迴圈在
    // 「名稱根本沒被塞進去」的情況下也是綠的。
    expect((long[0]?.text.length ?? 0) > (short[0]?.text.length ?? 0)).toBe(true)
  })

  it('[FE-W12-S11] 標籤的尺寸只有一個來源', () => {
    // 測試不得抄一份數字 —— 這一行是那件事的守衛。
    expect(LABEL_SIZE.width).toBeGreaterThan(0)
    expect(LABEL_SIZE.height).toBeGreaterThan(0)
    // 相鄰兩扇門在最小畫面上的縱向距離，必須大於標籤的高度。
    const pitch = (CORRIDOR_SLOTS[1]?.z ?? 0) - (CORRIDOR_SLOTS[0]?.z ?? 0)
    const gap =
      ((pitch * Math.SQRT1_2) / (CAMERA_DEFAULTS.viewHeight / 2)) * (MIN_VIEWPORT.height / 2)
    expect(gap).toBeGreaterThanOrEqual(LABEL_SIZE.height)
  })
})
