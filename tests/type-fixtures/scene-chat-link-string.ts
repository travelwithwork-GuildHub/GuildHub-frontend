// FIXTURE —— 故意違規（規格 FE-R11-S01）：連線的 `receive` 也只收 `ChatOut`。
import { createSceneChatStore } from '../../src/realtime/sceneChatStore'

const link = createSceneChatStore().port.attach(() => {}, 'lobby')
export const bad = link.receive('{"t":"chat","id":"x","name":"n","body":"hi"}')
