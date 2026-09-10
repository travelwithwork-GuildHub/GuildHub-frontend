import type { Identity } from './types'
import { myAvatar } from './myAvatar'

// 「正在挑、還沒存」與「已經存了」是兩個不同的東西。規格 `FE-A05`。
//
// ⚠️⚠️ **把它們混成一個值，就是這一列最可能做錯的決定。**
// 兩個外部審查者被獨立問到「這一列最可能做錯什麼」，答的都是同一件事：
// **把「本地預覽成功」誤認成「角色選擇完成」**。
//
// 分開之後，規格的三條要求各自有地方落腳：
//
//   `S01` 選了就看得到      → 世界裡的自己讀**待存值**
//   `S02` 別人看不到未提交的 → 送出去的東西只讀**已儲存值**
//   `S03` 放棄要復原        → 把待存值丟掉就好，不必反向計算

/**
 * 畫面上的自己現在該長什麼樣。
 *
 * @param identity 身分（已儲存的 `avatar_id` 在裡面）
 * @param draft 正在挑的那個；`undefined` 表示沒有在挑
 *
 * ⚠️⚠️ **這裡用 `??` 而不是 `||`，而那個差別會吃掉第一個角色。**
 *
 * 索引 `0` 是 falsy —— `draft || myAvatar(identity)` 在使用者挑第一款時
 * 會**跳過草稿、回到已儲存值**，於是畫面看起來像「按了沒反應」。
 * `??` 只在 `null`／`undefined` 時才 fallback，`0` 會原樣通過。
 *
 * 同一個陷阱在送出 `PATCH` 的時候還會再出現一次（規格 `S08`）。
 */
export function shownAvatar(identity: Identity, draft: number | undefined): number | undefined {
  return draft ?? myAvatar(identity)
}
