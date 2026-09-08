import type { Player, ServerMessage } from '@/api/contract/ws'
import { toWorld } from '@/world/coords'
import { appendSample, createTrack, resetTrack, type Track } from './interpolation'

// 別人在這個世界裡的存在與位置。規格 FE-R07。
//
// ⚠️ **這裡刻意是兩個容器，不是一個 store 加一個「不要用 setState」的約定。**
//
//   名單（RemoteIdentity）  低頻。join / leave 才動。**進 React**
//   動態（RemoteMotion）    每秒 400 次（40 人 × 10 Hz）。**只能放 ref**
//
// `CONTEXT.md` 的硬規則：高頻資料不進 React，
// **違反這條不會有錯誤訊息，只會變慢**。
// 約定沒有東西在擋；分成兩個容器之後，把座標寫進 React 需要**刻意去改型別**。

/** 名單上的一個人。**沒有座標** —— 那是另一個容器的事。 */
export interface RemoteIdentity {
  readonly id: string
  /**
   * ⚠️ **目前每個人都是「訪客」**（`BE-G02`：後端讀 `session["name"]`，
   * 而那個鍵從來沒有被設定過）。照收，但**不要照著它設計功能**。
   */
  readonly name: string
  /** ⚠️ **遠端玩家一律 `0`**（`BE-G03`）。同上。 */
  readonly av: number
}

/**
 * 一個人的動態。**世界座標，不是協定像素** —— 換算在寫入時就做完了。
 *
 * ⚠️ **這不是「目前位置」，是一段樣本歷史**（`FE-R08`）。畫面位置由
 * `interpolation.evaluate` 從它求值 —— 直接讀最後一筆的話，
 * 角色會回到每 100 毫秒跳一格。
 */
export type RemoteMotion = Track

export interface RemotePlayersState {
  /** 名單。**這個 Map 只在 join / leave 時被換掉。** */
  roster: ReadonlyMap<string, RemoteIdentity>
  /** 動態。**同一個 Map 被就地改寫，不會被換掉。** */
  motion: Map<string, RemoteMotion>
}

export function createRemotePlayersState(): RemotePlayersState {
  return { roster: new Map(), motion: new Map() }
}

function identityOf(p: Player): RemoteIdentity {
  return { id: p.id, name: p.name, av: p.av }
}

/**
 * `snapshot` 與 `presence.join` 帶來的座標。
 *
 * ⚠️ **它們清空整段歷史，不是追加一筆。** 它們是權威狀態的重建，
 * 不是一段連續軌跡上的一點 —— 留著舊樣本的話，畫面會把**上一個場景的位置**
 * 與新位置連成一段插值。**這是唯一的 snap 入口**（`FE-R08` 的 D6：
 * teleport 是語義的，不是幾何的）。
 */
function seedTrack(existing: RemoteMotion | undefined, p: Player, now: number): RemoteMotion {
  // ⚠️ **換算在寫入時做，不在 render loop。**
  // 訊息每秒 400 次；render loop 是每秒 60 次 × 40 個角色 = 2400 次。
  // 放錯邊是六倍的工作量，而且它會每一幀重算一個不會變的值。
  const { x, z } = toWorld({ x: p.x, y: p.y })
  const track = existing ?? createTrack()
  resetTrack(track, { x, z, f: p.f }, now)
  return track
}

/**
 * 把一個人從**所有**容器裡移除。
 *
 * ⚠️ **之後每新增一份 per-player 的狀態，都要加進這個函式。**
 * `FE-R08` 會加 interpolation buffer、`FE-R10` 會加狀態文字 ——
 * 每多一份就多一個「忘了清」的地方，而忘了清的症狀是
 * **同一個 id 再出現時讀到舊資料**，不是錯誤訊息。
 */
function removeRemote(state: RemotePlayersState, id: string): boolean {
  const had = state.roster.has(id)
  if (had) {
    const next = new Map(state.roster)
    next.delete(id)
    state.roster = next
  }
  state.motion.delete(id)
  return had
}

/**
 * 套用一則已驗證的訊息。
 *
 * 回傳**名單有沒有變** —— 呼叫端據此決定要不要讓 React 重繪。
 * `pos` 一律回傳 `false`：那是每秒 400 次的東西。
 *
 * `selfId` 用來把自己排除在遠端玩家之外。**實測 `snapshot` 裡包含自己**
 *（第一個元素的 `id` 就是 `hello` 的 `you`），不排除的話畫面上會有一個
 * 跟本地角色重疊、而且跟著它走的分身。
 */
export function applyMessage(
  state: RemotePlayersState,
  message: ServerMessage,
  selfId: string | null,
  now: number,
): boolean {
  switch (message.t) {
    case 'snapshot': {
      // 整份重建。舊的動態也要清掉 —— 留著的話，離開的人再進來會讀到舊位置。
      const roster = new Map<string, RemoteIdentity>()
      state.motion.clear()
      for (const p of message.players) {
        if (p.id === selfId) continue
        roster.set(p.id, identityOf(p))
        state.motion.set(p.id, seedTrack(undefined, p, now))
      }
      state.roster = roster
      return true
    }

    case 'presence': {
      // **後端把 join 與 leave 合併成一則**，所以兩者在同一個分支裡處理。
      let changed = false
      for (const id of message.leave) {
        if (removeRemote(state, id)) changed = true
      }
      // ⚠️ **已經在名單裡的人也要重新就位。** 舊寫法整個跳過他們，
      // 於是「沒有先 `leave` 就 `join`」的情況會留著上一段軌跡 ——
      // 畫面把舊位置跟新位置連成一段插值。
      const joining = message.join.filter((p) => p.id !== selfId)

      // **進場就有座標** —— `join` 的元素帶 x/y/f。
      // 不能等第一則 `pos`：靜止時後端整則不送，
      // 進來之後沒動過的人**永遠不會出現在 `pos` 裡**。
      for (const p of joining) {
        state.motion.set(p.id, seedTrack(state.motion.get(p.id), p, now))
      }

      // **名單只在真的多了人時才換掉。** 重複的 `join` 不該讓 React 重繪 ——
      // 換一個新的 Map 就是換身分，而身分改變就是重繪。
      const fresh = joining.filter((p) => !state.roster.has(p.id))
      if (fresh.length > 0) {
        const roster = new Map(state.roster)
        for (const p of fresh) roster.set(p.id, identityOf(p))
        state.roster = roster
        changed = true
      }
      return changed
    }

    case 'pos': {
      for (const [id, x, y, f] of message.p) {
        // **不在名單裡的一律忽略，不建立新的人。**
        // `pos` 是差量，名單只由 `snapshot` 與 `presence` 決定 ——
        // 這裡放行的話，一個已經離開的人會因為一則延遲的 `pos` 復活。
        const track = state.motion.get(id)
        if (track === undefined) continue
        const { x: wx, z: wz } = toWorld({ x, y })
        // **追加一筆，不是覆寫位置。** 覆寫的話畫面沒有前一個點可以插值，
        // 角色就回到每 100 毫秒跳一格。
        appendSample(track, { x: wx, z: wz, f }, now)
      }
      // **名單沒有變。** 回傳 true 的話，每秒 400 次的 `pos` 會變成
      // 每秒 400 次的 React 重繪。
      return false
    }

    default:
      // `hello` / `status` / `chat` / `err` 不屬於這一層。
      // **不是錯誤** —— 驗證是 `FE-R02` 做的，這裡只是不關心。
      return false
  }
}
