import { describe, expect, it } from 'vitest'
import { screenWidthOf } from '@/world/layout/framing'
import { staticBoxesFor, visualBoxFor } from '@/world/layout/geometry'
import { LAYOUT, ZONES } from '@/world/layout/guildHallLayout'
import type { Zone } from '@/world/layout/types'
import { PHYSICS } from '@/world/physics/world'
import { DOOR_SPAN, MIN_GAP, doorItemAt, doorSlots, slotCapacity } from '@/world/rooms/slots'
import type { StaticBox } from '@/world/physics/world'

// 走廊上門的槽位。規格 `FE-W12-S06`／`S07`／`S08`。

const CORRIDOR = ZONES.find((zone) => zone.id === 'corridor')

function corridor(): Zone {
  if (CORRIDOR === undefined) throw new Error('配置裡沒有走廊分區 —— 這一整組判準的前提沒了')
  return CORRIDOR
}

/** 兩個軸對齊的盒子相不相交（**接觸不算**）。 */
function intersects(a: StaticBox, b: StaticBox): boolean {
  return (
    Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth &&
    Math.abs(a.z - b.z) < a.halfDepth + b.halfDepth
  )
}

function boxesOf(zone: Zone): StaticBox[] {
  return doorSlots(zone).map((slot) => {
    const box = visualBoxFor(doorItemAt(slot, `door:${slot.index}`))
    if (box === undefined) throw new Error('門沒有視覺包圍盒 —— 造型被改掉了')
    return box
  })
}

describe('槽位從走廊的矩形推導', () => {
  it('[FE-W12-S06] 走廊往東移，每一個槽位的 x 跟著移了同樣的距離', () => {
    const base = corridor()
    const moved: Zone = { ...base, x: base.x + 3 }

    const before = doorSlots(base)
    const after = doorSlots(moved)

    expect(after.length).toBe(before.length)
    for (const [index, slot] of after.entries()) {
      const original = before[index]
      if (original === undefined) throw new Error('槽位數目對不上')
      expect(slot.x).toBeCloseTo(original.x + 3, 10)
      // ⚠️ **z 不該動。** 只改中心的 x 時 z 跟著變的話，
      // 那代表座標不是從矩形推導的，是某個共用的中間值算歪了。
      expect(slot.z).toBeCloseTo(original.z, 10)
    }
  })

  it('[FE-W12-S06] 走廊深度減半，容量跟著變小，槽位仍在新矩形內', () => {
    const base = corridor()
    const shallow: Zone = { ...base, halfDepth: base.halfDepth / 2 }

    expect(slotCapacity(shallow)).toBeLessThan(slotCapacity(base))

    for (const slot of doorSlots(shallow)) {
      expect(Math.abs(slot.z - shallow.z)).toBeLessThanOrEqual(shallow.halfDepth)
      expect(Math.abs(slot.x - shallow.x)).toBeLessThanOrEqual(shallow.halfWidth)
    }
  })

  it('[FE-W12-S07] 槽位數目等於容量而且大於一，相鄰間距大於門寬', () => {
    const zone = corridor()
    const slots = doorSlots(zone)

    // ⚠️ **「大於一」不是湊數。** 容量算成 0 或 1 的時候「相鄰兩個槽位」
    // 是空集合，下面那個迴圈一次都不會跑 —— 斷言會**空泛為真**。
    expect(slots.length).toBe(slotCapacity(zone))
    expect(slots.length).toBeGreaterThan(1)

    // 規格：「最小間隙 SHALL 大於零 —— 兩扇門之間要看得出來是兩扇，
    // 不是一整片木牆」。這一行是那句 SHALL 的直接編碼。
    expect(MIN_GAP).toBeGreaterThan(0)

    for (let i = 1; i < slots.length; i += 1) {
      const previous = slots[i - 1]
      const current = slots[i]
      if (previous === undefined || current === undefined) throw new Error('槽位不連續')
      // ⚠️ **不是「大於門寬」而已，是「真的留到了 `MIN_GAP`」。**
      // 只驗「大於門寬」的話，容量算的時候把 `MIN_GAP` 漏掉
      //（`floor(深度 / 門寬)`）會多擠進一扇門、縫只剩 0.13 —— 而那是綠的。
      expect(current.z - previous.z).toBeGreaterThanOrEqual(DOOR_SPAN + MIN_GAP)
    }
  })

  it('[FE-W12-S07] 門貼齊走廊的西緣', () => {
    const zone = corridor()
    const boxes = boxesOf(zone)
    expect(boxes.length).toBeGreaterThan(1)

    // ⚠️ **只驗「在矩形內」是不夠的。** 門的包圍盒**不對稱**（把手凸出一邊），
    // 少掉那個補正之後門會往東偏 0.04 —— 仍然完整落在矩形內，
    // 所以「在裡面」那條判準是綠的。門浮在離牆一小段的地方看得出來。
    for (const box of boxes) {
      expect(box.x - box.halfWidth).toBeCloseTo(zone.x - zone.halfWidth, 9)
    }
  })

  it('[FE-W12-S07] 最外側的門完整落在走廊矩形內', () => {
    const zone = corridor()
    const boxes = boxesOf(zone)
    expect(boxes.length).toBeGreaterThan(1)

    for (const box of boxes) {
      expect(box.z - box.halfDepth).toBeGreaterThanOrEqual(zone.z - zone.halfDepth - 1e-9)
      expect(box.z + box.halfDepth).toBeLessThanOrEqual(zone.z + zone.halfDepth + 1e-9)
      expect(box.x - box.halfWidth).toBeGreaterThanOrEqual(zone.x - zone.halfWidth - 1e-9)
      expect(box.x + box.halfWidth).toBeLessThanOrEqual(zone.x + zone.halfWidth + 1e-9)
    }
  })

  it('[FE-W12-S08] 門不與配置裡任何一個靜態碰撞盒相交', () => {
    const zone = corridor()
    const doors = boxesOf(zone)
    const statics = staticBoxesFor(LAYOUT)

    // ⚠️ **兩邊都要非空。** 只管住門那一側的話，餵一個沒有牆的配置
    // 照樣是綠的 —— 「每一個靜態碰撞盒」會是空集合。
    expect(doors.length).toBe(slotCapacity(zone))
    expect(statics.length).toBeGreaterThan(0)

    for (const door of doors) {
      for (const box of statics) {
        expect(
          intersects(door, box),
          `門 (x=${door.x.toFixed(2)}, z=${door.z.toFixed(2)}) 撞進了 ` +
            `(x=${box.x.toFixed(2)}, z=${box.z.toFixed(2)})`,
        ).toBe(false)
      }
    }
  })

  it('[FE-W12-S08] 配置裡不得有任何一扇門落在走廊裡', () => {
    const zone = corridor()
    const inside = LAYOUT.filter(
      (item) =>
        item.kind === 'door' &&
        Math.abs(item.x - zone.x) < zone.halfWidth &&
        Math.abs(item.z - zone.z) < zone.halfDepth,
    ).map((item) => item.id)

    // ⚠️ **走廊裡的門只能來自 API。** 配置裡再擺一扇寫死的，
    // 世界上就會同時有兩排門 —— 而它們**不會相交**（座標差一點點），
    // 所以「碰撞盒不重疊」那條判準抓不到。
    expect(inside, `走廊裡有寫死的門：${inside.join('、')}`).toEqual([])
    // 反向控制：走廊外面的門（隔牆那個開口）不該被誤判進來。
    expect(LAYOUT.some((item) => item.kind === 'door')).toBe(true)
  })

  it('[FE-W12-S25] 每一扇門都有可辨識的橫向輪廓', () => {
    const zone = corridor()
    const boxes = boxesOf(zone)

    // 門檻是**角色的直徑**，不是挑的數字 —— `world-layout` 的遮擋判準
    // 已經用同一個尺度當「比角色還窄的東西不算遮擋」的界線。
    const minimum = PHYSICS.playerRadius * 2

    expect(boxes.length).toBe(slotCapacity(zone))
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(
        screenWidthOf(box),
        `這扇門在畫面上比角色還窄 —— 那不是門，是一根柱子`,
      ).toBeGreaterThanOrEqual(minimum)
    }
  })

  it('[FE-W12-S26] 反向控制：把門轉成面朝東西就不合格', () => {
    const zone = corridor()
    const slot = doorSlots(zone)[0]
    if (slot === undefined) throw new Error('沒有槽位')

    // ⚠️ 少了這一條，上面那條可能只是「門本來就夠寬」的複述。
    // 這裡要證明**這把尺真的量得到那個退化**。
    const sideways = visualBoxFor({ ...doorItemAt(slot, 'sideways'), turns: 1 })
    if (sideways === undefined) throw new Error('沒有包圍盒')
    expect(screenWidthOf(sideways)).toBeLessThan(PHYSICS.playerRadius * 2)
  })

  it('[FE-W12-S08] 兩扇門彼此不相交', () => {
    const boxes = boxesOf(corridor())
    expect(boxes.length).toBeGreaterThan(1)

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (a === undefined || b === undefined) throw new Error('包圍盒不連續')
        expect(intersects(a, b)).toBe(false)
      }
    }
  })
})
