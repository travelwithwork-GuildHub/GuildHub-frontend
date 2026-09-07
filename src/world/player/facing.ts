import { facingFromDirection, type Facing } from '@/world/coords'
import type { Direction } from './input'

// 朝向。**import `world-coordinates`，不在這裡重寫判斷。**
//
// 那份 design 的 R1：「這份對映是唯一一份，但沒有機器擋得住複製。
// FE-W03／FE-R03／FE-R07 任何一個自己再寫一次，兩邊就開始漂。」
// 這一項是第一個用到它的地方 —— **這裡建立慣例。**

/**
 * 由方向決定朝向；**站著不動時保留前一個** —— 角色不應該一停下來就轉頭。
 *
 * `facingFromDirection` 對零向量回 `null`（「沒有方向」），
 * 那個語意就是「站著不動」，由這裡負責保留。
 */
export function nextFacing(dir: Direction, previous: Facing): Facing {
  return facingFromDirection(dir.x, dir.z) ?? previous
}
