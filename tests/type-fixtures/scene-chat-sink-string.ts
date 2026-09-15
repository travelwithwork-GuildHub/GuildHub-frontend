// FIXTURE —— 故意違規（規格 FE-R11-S01）：chat 的接收端與 reducer 只收驗證器產出的 `ChatOut` 物件，不收字串。
// 約束在的話是 TS2345（參數型別不合）；沒有約束的話 UI 可以把 raw frame 直接塞進來、繞過驗證器。
import { appendChat, EMPTY_CHAT } from '../../src/realtime/sceneChat'

export const bad = appendChat(EMPTY_CHAT, '{"t":"chat","id":"x","name":"n","body":"hi"}')
