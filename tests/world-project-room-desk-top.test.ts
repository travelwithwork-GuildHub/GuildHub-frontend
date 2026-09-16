import { describe, expect, it, vi } from 'vitest'

// 錨點的 y 是**從家具 definition 讀**的桌面高度，不是寫死的 0.76。規格 `FE-W16-S06`（「h 從家具 definition 讀，不寫死」）。
//
// ⚠️ 單獨一個檔案，因為要把桌子的 definition 換掉再載入 `anchors.ts`：把**桌面那個部件**抬高 0.5（桌腳留在地上），`DESK_TOP` 要跟著高 0.5。
// 只比對 `DESK_TOP === 0.76` 的話，`export const DESK_TOP = 0.76` 照樣綠（審查抓到）。

const RAISE = 0.5
vi.mock('@/world/environment/furnitureProps', async () => {
  const actual = await vi.importActual<typeof import('@/world/environment/furnitureProps')>('@/world/environment/furnitureProps')
  const desk = actual.furnitureDefinition('desk')
  const topY = Math.max(...desk.parts.map((part) => part.position[1]))
  const raised = {
    parts: desk.parts.map((part) =>
      part.position[1] === topY ? { ...part, position: [part.position[0], part.position[1] + RAISE, part.position[2]] as const } : part,
    ),
  }
  return { ...actual, furnitureDefinition: (kind: string) => (kind === 'desk' ? raised : actual.furnitureDefinition(kind as 'chair')) }
})

describe('桌面高度跟著 definition', () => {
  it('[FE-W16-S06] 桌面部件抬高 0.5，DESK_TOP 與八個錨點的 y 跟著高 0.5', async () => {
    const { visualBoundsOf } = await import('@/world/environment/definition')
    const real = await vi.importActual<typeof import('@/world/environment/furnitureProps')>('@/world/environment/furnitureProps')
    const baseline = (visualBoundsOf(real.furnitureDefinition('desk'))?.halfHeight ?? NaN) * 2
    expect(baseline).toBeGreaterThan(0)

    const { DESK_TOP, SEAT_ANCHORS } = await import('@/world/seats/anchors')
    // 桌腳還在地上、桌面高了 0.5：頂面是 baseline + RAISE。
    expect(DESK_TOP).toBeCloseTo(baseline + RAISE, 9)
    for (const anchor of SEAT_ANCHORS) expect(anchor.y).toBeCloseTo(baseline + RAISE, 9)
  })
})
