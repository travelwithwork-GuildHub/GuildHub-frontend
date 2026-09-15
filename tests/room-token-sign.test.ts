// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { roomScene, roomSceneProject, roomTokenMatches, signRoomToken } from '@/server/roomToken'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下 —— 票綁房間**與**身分（S12 的握手那段在契約測試；這裡是簽章模組自己的判準）
// 規格：openspec/specs/internal-backend/spec.md
//   Requirement: 即時層替身照 protocol.py —— S21 的「room 的 uuid 不合法」：替身在驗票之前先用 `roomSceneProject` 擋格式。
//   契約測試手上沒有票（ADR 0008：格式是簽發者的事），證不了「uuid 不合法但票算對也拒絕」—— 那一條由這裡守：
//   `roomSceneProject` 對不合法的 uuid 回 null，替身對 null 的房間不驗票直接拒。

const P = '22222222-0000-4000-8000-0000000000f1'
const Q = '22222222-0000-4000-8000-0000000000f2'
const ME = '11111111-0000-4000-8000-000000000001'
const YOU = '11111111-0000-4000-8000-000000000002'

describe('roomToken：簽章綁房間也綁人', () => {
  it('同房同人才對；換房、換人、換 secret 都不對；比對常數時間（長度不同也只是 false）', () => {
    const t = signRoomToken('s', P, ME)
    expect(roomTokenMatches('s', t, P, ME)).toBe(true)
    expect(roomTokenMatches('s', t, Q, ME), '換房').toBe(false)
    expect(roomTokenMatches('s', t, P, YOU), '換人').toBe(false)
    expect(roomTokenMatches('other', t, P, ME), '換 secret').toBe(false)
    expect(roomTokenMatches('s', '', P, ME), '空票').toBe(false)
    expect(roomTokenMatches('s', `${t}x`, P, ME), '長度不同').toBe(false)
    expect(signRoomToken('s', P, ME)).toBe(t)
  })

  it('[FE-O03-S21] roomSceneProject：只認 `room:<真的 uuid>`；36 個連字號、少一段、大廳、空字串都是 null', () => {
    expect(roomSceneProject(roomScene(P))).toBe(P)
    expect(roomSceneProject(`room:${P.toUpperCase()}`)).toBe(P.toUpperCase())
    for (const bad of ['room:------------------------------------', 'room:', 'room:22222222-0000-4000-8000', `room:${P}x`, `room:${P}/../`, 'lobby', '', `${P}`, `ROOM:${P}`]) {
      expect(roomSceneProject(bad), bad).toBeNull()
    }
  })
})
