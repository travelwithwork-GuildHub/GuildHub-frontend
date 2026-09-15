import { createHmac, timingSafeEqual } from 'node:crypto'

// 本地房間票的簽章。規格 `FE-N08`〈本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下〉（design D7）。
//
// **兩邊共用這一份**：`src/app/api/projects/[project_id]/enter/route.ts` 簽、`scripts/realtime-stub.ts` 驗。
// 第二份簽章就是「handler 簽的票替身不認」的起點。
//
// 票 = `HMAC-SHA256(secret, "room:<project_id>|<profile_id>")` 的 base64url —— **綁房間也綁人**：
// 替身只在「票的房間＝scene ∧ 票的身分＝握手 cookie 的身分」時接受，跟真後端 `room_token.verify()` 可觀察的語意一樣。
// **不**模仿真後端的三段式格式（前端不解析票；票只在簽發者的 process 內有意義），也**不過期**（已知差異，design D7）。
//
// ⚠️ 這裡刻意**不** import `server-only`：替身用 `tsx` 在 Next 之外跑，`server-only` 會拋。secret 由呼叫端傳入
// （handler 用 `internalSessionSecret()`，替身讀自己的環境變數），這個模組不讀 `process.env`。

export function roomScene(projectId: string): string {
  return `room:${projectId}`
}

export function signRoomToken(secret: string, projectId: string, profileId: string): string {
  return createHmac('sha256', secret).update(`${roomScene(projectId)}|${profileId}`).digest('base64url')
}

/** 常數時間比對：票對不對只回 true／false，不說哪裡不對。 */
export function roomTokenMatches(secret: string, token: string, projectId: string, profileId: string): boolean {
  const given = Buffer.from(token)
  const expected = Buffer.from(signRoomToken(secret, projectId, profileId))
  return given.length === expected.length && timingSafeEqual(given, expected)
}
