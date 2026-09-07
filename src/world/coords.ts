// 3D 世界座標 ↔ WS 協定整數像素的對映。**唯一一份。**
//
// 合約來源：`GuildHub-backend/app/realtime/protocol.py` 的 `Move`。
// 依 docs/adr/0001-backend-contract.md，這裡不複述後端的欄位定義。
//
// ⚠️ 為什麼錯了會很難查：後端收到不合協定的訊息是 `continue` ——
// **靜默丟棄、不回錯、不斷線**（`main.py`）。症狀是「我動了但別人沒看到」，
// 而且沒有任何線索指向原因。所以這裡寧可拋錯，也不回一個看起來正常的值。
//
// ⚠️ **FE-W03 要驗一件這裡證明不了的事**（design.md 的 R4）：
// 純函式測得到「+Z 進去、0（下）出來」，但測不到那個 0 在真實畫面上
// 是不是朝下。相機轉個向，邏輯對映就跟視覺脫鉤，而兩邊的測試都是綠的。
// **FE-W03 的完成條件要包含「按下往下的鍵，角色在畫面上往下走」。**

/** 每 1 個世界單位對應的協定像素數。規格 FE-W02 的 Requirement。 */
const PIXELS_PER_UNIT = 32

/** 協定的離散朝向。編碼由 `protocol.py` 決定：0 下、1 左、2 右、3 上。 */
export const FACING = { down: 0, left: 1, right: 2, up: 3 } as const

export type Facing = (typeof FACING)[keyof typeof FACING]

export interface ProtocolPoint {
  /** 協定的 `x`。對應世界的 X 軸。 */
  x: number
  /** 協定的 `y`。**對應世界的 Z 軸，不是 Y** —— Y 是高度，不參與 2D 邏輯。 */
  y: number
}

export interface WorldPoint {
  x: number
  /** 世界的 Z。3D 的遊玩平面是 X／Z。 */
  z: number
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `${name} 不是有限數值（${value}）。送出去會被後端的 StrictInt 擋下，` +
        `而後端對不合協定的訊息是靜默丟棄 —— 在這裡拋錯是唯一會被看見的失敗方式。`,
    )
  }
}

/**
 * 把 `-0` 正規化成 `0`。
 *
 * `Math.round(-0.5)` 回的是 `-0`（`.5` 往正無窮對負數不對稱）。
 * 送到線上是無害的（`JSON.stringify(-0)` 就是 `"0"`），但**留在 API 上是尖角**：
 * `Object.is(-0, 0)` 是 `false`，而之後 FE-R03 要判斷「位置有沒有變」。
 * 在這裡收掉，呼叫端就不必知道這件事。
 */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} 超出安全整數範圍（${value}）。`)
  }
}

/**
 * 世界座標 → 協定整數像素。
 *
 * 取整是 `Math.round`（`.5` 往正無窮）。**對負數不對稱** ——
 * `Math.round(-0.5)` 是 `-0` 不是 `-1`。`-0` 在這裡被正規化成 `0`
 * （見 `normalizeZero`）。這不影響往返穩定性（那是對整數輸入的性質）。
 *
 * ⚠️ **回傳值 MUST NOT 被寫回 3D 的位置。** 3D 的浮點位置是權威來源，
 * 量化只發生在送出的那一刻。把量化值餵回位置的話每一幀掉一次精度，
 * 走一分鐘之後位置就歪了 —— 而且沒有任何錯誤訊息。
 */
export function toProtocol(world: WorldPoint): ProtocolPoint {
  assertFinite(world.x, '世界座標 x')
  assertFinite(world.z, '世界座標 z')

  const x = normalizeZero(Math.round(world.x * PIXELS_PER_UNIT))
  const y = normalizeZero(Math.round(world.z * PIXELS_PER_UNIT))

  assertSafeInteger(x, '協定像素 x')
  assertSafeInteger(y, '協定像素 y')

  return { x, y }
}

/** 協定整數像素 → 世界座標。 */
export function toWorld(point: ProtocolPoint): WorldPoint {
  assertFinite(point.x, '協定像素 x')
  assertFinite(point.y, '協定像素 y')

  return { x: point.x / PIXELS_PER_UNIT, z: point.y / PIXELS_PER_UNIT }
}

/**
 * 移動方向 → 協定的離散朝向。
 *
 * 主軸由分量的絕對值決定；**兩軸絕對值相等時取縱向**。
 * 這條決勝規則是任意的，但必須固定 —— 不固定的話，
 * 沿著對角線移動會讓朝向在兩個值之間跳動。
 *
 * 零向量回 `null`（「沒有方向」），**呼叫端負責保留前一個朝向** ——
 * 站著不動的角色不應該轉頭。
 *
 * 非有限的分量會拋錯，**不會**被當成「沒有方向」——
 * 那個語意是「站著不動」，把壞掉的輸入算進去等於把 bug 偽裝成正常狀態。
 */
export function facingFromDirection(dx: number, dz: number): Facing | null {
  assertFinite(dx, '方向分量 dx')
  assertFinite(dz, '方向分量 dz')

  if (dx === 0 && dz === 0) return null

  // 絕對值相等時走這一支（縱向）—— `>` 而不是 `>=` 就是那條決勝規則
  if (Math.abs(dx) > Math.abs(dz)) {
    return dx > 0 ? FACING.right : FACING.left
  }
  return dz > 0 ? FACING.down : FACING.up
}
