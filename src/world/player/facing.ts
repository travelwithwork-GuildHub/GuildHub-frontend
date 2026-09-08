import { FACING, facingFromDirection, type Facing } from '@/world/coords'
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

/**
 * 朝向 → 繞 Y 軸的角度。0 下、1 左、2 右、3 上（協定的編碼）。
 *
 * ⚠️ **本地與遠端角色共用這一份。** 原本它是 `LocalPlayer` 裡的私有常數，
 * `FE-R07` 要用同一個對映時搬到這裡 —— 複製一份的話，兩邊會在
 * 「左是 +90° 還是 −90°」上悄悄分岔，而畫面上那看起來只是「有人轉錯邊」。
 * 檔頭那句「任何一個自己再寫一次，兩邊就開始漂」講的就是這件事。
 */
export const FACING_ROTATION: Record<Facing, number> = {
  [FACING.down]: 0,
  [FACING.left]: Math.PI / 2,
  [FACING.right]: -Math.PI / 2,
  [FACING.up]: Math.PI,
}
