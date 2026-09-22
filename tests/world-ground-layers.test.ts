import { describe, expect, it } from 'vitest'
import { GRASS_Y } from '@/world/primitives/grass'
import { carpetDefinition, floorDefinition } from '@/world/environment/structural'
import type { PropDefinition } from '@/world/environment/definition'

// 地面是好幾層平面疊在一起：主地板（`floorDefinition`，頂面切齊 y=0）、像素草地（`GRASS_Y`，蓋在主地板上）、
// 走道地毯（`carpetDefinition`，疊在草地上）。**任兩層的可見面不得共面** —— 共面的多邊形深度值相同，
// GPU 的深度測試無法決定誰在前，畫面就會 z-fighting（一直閃）。W14 一度把草地設在 0.02，剛好等於
// carpet 頂面（0.01 + 0.02/2），於是「黃色地毯一直閃」（2026-09-23 使用者回報）。
//
// 這條測試把「分層不共面」釘成契約：改動任何一層的 y 撞回共面，就紅。深度精度在這個俯視相機下約 1e-4，
// 取 0.005 當「明顯不共面」的安全門檻。

/** RoundedBox 這類 prop 的可見頂面世界 y（part 自己的 y ＋ 高度的一半）。 */
function topY(def: PropDefinition): number {
  const part = def.parts[0]!
  const g = part.geometry
  const height = 'height' in g ? g.height : 0
  const y = part.position?.[1] ?? 0
  return y + height / 2
}

const Z_SAFE = 0.005

describe('地面分層不共面（避免 z-fighting）', () => {
  it('[FE-W14-S04] 草地落在主地板頂面與 carpet 頂面之間，且與兩者都有 z-fight 安全間距', () => {
    const floorTop = topY(floorDefinition(10, 10)) // 主地板頂面：切齊 y=0
    const carpetTop = topY(carpetDefinition(10, 5)) // carpet 頂面

    expect(floorTop).toBe(0)
    expect(carpetTop).toBeGreaterThan(0)

    // 草地要蓋住主地板（在它之上）、又要讓 carpet 顯示在自己之上。
    expect(GRASS_Y).toBeGreaterThan(floorTop)
    expect(GRASS_Y).toBeLessThan(carpetTop)

    // 而且跟上下兩層都不共面（否則 z-fighting）。
    expect(Math.abs(GRASS_Y - carpetTop)).toBeGreaterThanOrEqual(Z_SAFE)
    expect(Math.abs(GRASS_Y - floorTop)).toBeGreaterThanOrEqual(Z_SAFE)
  })
})
