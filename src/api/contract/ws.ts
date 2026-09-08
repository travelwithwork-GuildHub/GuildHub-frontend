import { z } from 'zod'
import { LIMITS } from './limits'

// WebSocket 協定 v1。規格 FE-O01「WebSocket 兩個方向是兩個獨立的訊息集合」。
//
// **真實來源是後端的 `app/realtime/protocol.py`**，每一則下面標了對應的段落。
// `CONTEXT.md` 明寫：文件的敘述一律不算數，寫規格以 `protocol.py` 為準。
//
// ⚠️ **不合協定的訊息一律被後端靜默丟棄，不回錯誤**
//（`main.py` 對 `ProtocolError` 是 `continue`）。送出去沒反應就是格式不對 ——
// 這就是為什麼送出之前要在前端驗一次。

/** 後端的廣播頻率（`protocol.py` 的 `HZ = 10`）。固定值，不可設定。 */
export const HZ = 10

/**
 * 朝向。`protocol.py`：`f: StrictInt = Field(ge=0, le=3)`。
 *
 * **是 0–3 的離散值，不是角度。** 插值時要做 facing transition，
 * 不是角度插值（`FE-R08`）。
 */
export const FACING = { down: 0, left: 1, right: 2, up: 3 } as const

// ══════════════════════════════════════════════ client → server
//
// `protocol.py` 的 `ClientMessage = Union[Move, StatusIn, ChatIn]`。

/**
 * `{"t":"move","x":120,"y":340,"f":2}`
 *
 * ⚠️ `x`／`y` 是 `StrictInt`。**送浮點會讓整則訊息被丟棄** ——
 * 不是把座標四捨五入，是整則不見，而且沒有任何錯誤回來。
 *
 * 座標是**整數像素**，不是 3D 世界座標。對映在 `src/world/coords.ts`（`FE-W02`）。
 */
export const Move = z.object({
  t: z.literal('move'),
  x: z.number().int(),
  y: z.number().int(),
  f: z.number().int().min(0).max(3),
})

/**
 * `{"t":"status","text":"趕工中"}`
 *
 * ⚠️ **超過 12 字會被後端靜默丟棄，舊狀態不變** ——
 * 使用者會以為壞掉。長度以 code point 計（後端是 Python `len()`）。
 */
export const StatusIn = z.object({
  t: z.literal('status'),
  text: z.string().max(LIMITS.statusText.max),
})

/**
 * `{"t":"chat","body":"..."}`
 *
 * ⚠️ **後端對 `body` 沒有任何長度限制，也沒有 rate limit**（`BE-G16`）。
 * 聊天不落 DB，refresh 後清空。前端的節流是 `FE-X11`，
 * 而那**只擋得住守規矩的人** —— 不要當成防護。
 */
export const ChatIn = z.object({
  t: z.literal('chat'),
  body: z.string(),
})

export const ClientMessage = z.discriminatedUnion('t', [Move, StatusIn, ChatIn])

// ══════════════════════════════════════════════ server → client
//
// ⚠️ **`t` 不是全域唯一的判別鍵。** `status` 與 `chat` 兩個方向都有，
// 形狀不同（client 送 `{t,text}`，server 送 `{t,id,text}`）。
// 合成單一個 union 會讓其中一個方向被另一個方向的形狀覆蓋，
// **而且不會有錯誤訊息**。所以這裡是兩個各自獨立的集合。

/**
 * `snapshot` 與 `presence.join` 的元素（`presence.py` 的 `Player.as_dict`）。
 *
 * ⚠️ 兩個欄位目前是常數，不要照著它們設計功能：
 *   `name` —— **每個人都是「訪客」**。`main.py` 讀 `session["name"]`，
 *             而那個鍵在整個後端從來沒有被設定過（`BE-G02`）。
 *   `av`   —— **遠端玩家一律 0**。`presence.join()` 沒收 avatar（`BE-G03`）。
 */
export const Player = z.object({
  id: z.string(),
  name: z.string(),
  av: z.number(),
  x: z.number(),
  y: z.number(),
  f: z.number(),
  st: z.string(),
})

/** `{"t":"hello","you":"<id>","hz":10}`。連線建立時送一次。 */
export const Hello = z.object({
  t: z.literal('hello'),
  you: z.string(),
  hz: z.number(),
})

/** `{"t":"snapshot","players":[…]}`。進場一次，之後只送差量。 */
export const Snapshot = z.object({
  t: z.literal('snapshot'),
  players: z.array(Player),
})

/**
 * `{"t":"pos","p":[["<id>",120,340,2], …]}`
 *
 * **是陣列不是物件** —— 40 人 × 10 Hz 下，欄位名會被重複送 400 次／秒。
 *
 * ⚠️ **沒有人移動時整則訊息不送**，不是送空陣列。
 * **不能拿它當心跳**（`FE-R01` 那條 Alarm：協定裡沒有 heartbeat）。
 */
export const Pos = z.object({
  t: z.literal('pos'),
  p: z.array(z.tuple([z.string(), z.number(), z.number(), z.number()])),
})

/** `{"t":"presence","join":[…],"leave":["<id>"]}`。**join 與 leave 合併成一則。** */
export const Presence = z.object({
  t: z.literal('presence'),
  join: z.array(Player),
  leave: z.array(z.string()),
})

/** `{"t":"status","id":"<id>","text":"…"}`。**比 client 的多一個 `id`。** */
export const StatusOut = z.object({
  t: z.literal('status'),
  id: z.string(),
  text: z.string(),
})

/** `{"t":"chat","id":"<id>","name":"…","body":"…"}`。**比 client 的多兩個欄位。** */
export const ChatOut = z.object({
  t: z.literal('chat'),
  id: z.string(),
  name: z.string(),
  body: z.string(),
})

/**
 * `{"t":"err","code":"…","msg":"…"}`
 *
 * ⚠️ **握手失敗不會有這個** —— 直接 close `1008`，連線根本沒 accept。
 * 前端只看得到「被關掉」（`FE-R12` 的 UI 要能解釋這件事）。
 */
export const Err = z.object({
  t: z.literal('err'),
  code: z.string(),
  msg: z.string(),
})

export const ServerMessage = z.discriminatedUnion('t', [
  Hello,
  Snapshot,
  Pos,
  Presence,
  StatusOut,
  ChatOut,
  Err,
])

export type Move = z.infer<typeof Move>
export type StatusIn = z.infer<typeof StatusIn>
export type ChatIn = z.infer<typeof ChatIn>
export type ClientMessage = z.infer<typeof ClientMessage>
export type Player = z.infer<typeof Player>
export type ServerMessage = z.infer<typeof ServerMessage>
