import type { StaticBox } from '../physics/world'

// 可走路徑。規格 `FE-W11-S10`／`S11`。
//
// **這不是產品功能。** 角色仍然是玩家自己用鍵盤走 —— 這裡的搜尋只在測試裡跑，
// 用來證明「配置沒有把路堵死」。那種錯誤在渲染出來的畫面上**看起來完全正常**。
//
// ⚠️ **格子 0.1，判定保守。** 兩個外部審查者討論過的取捨：
//
// - 有人提議把配置的座標硬性對齊 0.5，讓格子「絕對精準」。**否決了** ——
//   場景元件的尺寸是 1.6／1.08／0.44，全部不對齊 0.5，那等於要求造型去遷就
//   測試演算法；而且角色半徑 0.25 膨脹後的邊界落在 0.25 偏移上，
//   「絕對精準」本來就不成立
// - 也否決了「不用格子、改用可見性圖」：它沒有消除精度問題，只是把
//   「格子解析度」換成「接觸邊界算不算相交、共線與退化角點怎麼處理」
//
// **判定寧可誤報封閉，不要把走不過去的判成可走。** 誤報會逼人把通道拉寬，
// 而漏報會讓玩家真的卡住。

const CELL = 0.1
/** 四方向。**不走斜向** —— 斜向會從兩個盒子的對角穿過去。 */
const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export interface ReachabilityOptions {
  readonly half: number
  readonly radius: number
}

/** 一個點在不在任何膨脹後的盒子裡（**接觸就算**）。 */
function blocked(x: number, z: number, boxes: readonly StaticBox[], radius: number): boolean {
  for (const box of boxes) {
    if (Math.abs(x - box.x) <= box.halfWidth + radius && Math.abs(z - box.z) <= box.halfDepth + radius) {
      return true
    }
  }
  return false
}

const key = (ix: number, iz: number) => `${ix},${iz}`

/**
 * 從起點走得到的格子集合。
 *
 * 障礙物先按角色半徑做 Minkowski 膨脹，於是角色縮成一個點 ——
 * 這樣「通道夠不夠寬」變成「格子連不連得起來」。
 */
export function reachableFrom(
  start: { x: number; z: number },
  boxes: readonly StaticBox[],
  { half, radius }: ReachabilityOptions,
): Set<string> {
  const toIndex = (v: number) => Math.round(v / CELL)
  const toWorld = (i: number) => i * CELL
  const limit = Math.floor(half / CELL)

  const startIx = toIndex(start.x)
  const startIz = toIndex(start.z)
  const seen = new Set<string>()
  if (blocked(toWorld(startIx), toWorld(startIz), boxes, radius)) return seen

  const queue: [number, number][] = [[startIx, startIz]]
  seen.add(key(startIx, startIz))
  while (queue.length > 0) {
    const cell = queue.pop()
    if (cell === undefined) break
    const [ix, iz] = cell
    for (const [dx, dz] of STEPS) {
      const nx = ix + dx
      const nz = iz + dz
      if (Math.abs(nx) > limit || Math.abs(nz) > limit) continue
      const id = key(nx, nz)
      if (seen.has(id)) continue
      if (blocked(toWorld(nx), toWorld(nz), boxes, radius)) continue
      seen.add(id)
      queue.push([nx, nz])
    }
  }
  return seen
}

/** 一個點在不在可走集合裡。 */
export function isReachable(
  point: { x: number; z: number },
  reached: ReadonlySet<string>,
): boolean {
  return reached.has(key(Math.round(point.x / CELL), Math.round(point.z / CELL)))
}

/**
 * 一個矩形範圍裡「角色站得下」的每一個格子。
 *
 * 拿來問「這個分區有沒有走不進去的死角」—— 只驗一個代表點的話，
 * 分區裡包著一塊到不了的地方是看不出來的。
 */
export function standableIn(
  area: { x: number; z: number; halfWidth: number; halfDepth: number },
  boxes: readonly StaticBox[],
  radius: number,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  const fromX = Math.ceil((area.x - area.halfWidth) / CELL)
  const toX = Math.floor((area.x + area.halfWidth) / CELL)
  const fromZ = Math.ceil((area.z - area.halfDepth) / CELL)
  const toZ = Math.floor((area.z + area.halfDepth) / CELL)
  for (let ix = fromX; ix <= toX; ix += 1) {
    for (let iz = fromZ; iz <= toZ; iz += 1) {
      const x = ix * CELL
      const z = iz * CELL
      if (!blocked(x, z, boxes, radius)) out.push({ x, z })
    }
  }
  return out
}

/** 可走集合裡的格子座標（給遮擋掃描降採樣用）。 */
export function cellsOf(reached: ReadonlySet<string>, step = 10): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (const id of reached) {
    const [a, b] = id.split(',')
    const ix = Number(a)
    const iz = Number(b)
    if (ix % step !== 0 || iz % step !== 0) continue
    out.push({ x: ix * CELL, z: iz * CELL })
  }
  return out
}
