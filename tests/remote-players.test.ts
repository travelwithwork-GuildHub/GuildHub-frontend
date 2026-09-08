import { describe, expect, it } from 'vitest'
import { ServerMessage } from '@/api/contract/ws'
import { applyMessage, createRemotePlayersState } from '@/realtime/remotePlayers'

// 規格：openspec/changes/fe-r07-remote-players/specs/remote-players/spec.md
//   Requirement: 名單與動態分成兩個容器 —— FE-R07-S01
//   Requirement: snapshot 建立名單，而且排除自己 —— FE-R07-S02 / S03
//   Requirement: presence 的 join 與 leave 在同一則裡處理 —— FE-R07-S04 / S05
//   Requirement: pos 只更新已知的人 —— FE-R07-S06
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// **訊息一律先過 `api-contract` 的 schema 再餵進去** —— 直接塞手寫物件的話，
// 這些測試會在「協定變了」的時候照樣綠。

const SELF = 'u-self'

function player(id: string, x = 0, y = 0, f = 0) {
  return { id, name: '訪客', av: 0, x, y, f, st: '' }
}

/** 過一次真的 schema，確保測試資料本身是合法的協定訊息。 */
function message(raw: unknown) {
  const parsed = ServerMessage.safeParse(raw)
  if (!parsed.success) throw new Error(`測試資料不符協定：${parsed.error.message}`)
  return parsed.data
}

const snapshot = (...players: ReturnType<typeof player>[]) =>
  message({ t: 'snapshot', players })
const presence = (join: ReturnType<typeof player>[], leave: string[]) =>
  message({ t: 'presence', join, leave })
const pos = (...entries: Array<[string, number, number, number]>) =>
  message({ t: 'pos', p: entries })

describe('遠端玩家的狀態', () => {
  it('[FE-R07-S01] 收到位置更新時，名單不會改變', () => {
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player(SELF), player('u1', 32, 64, 1)), SELF)
    const rosterBefore = state.roster

    const changed = applyMessage(state, pos(['u1', 320, 640, 2]), SELF)

    expect(changed, 'pos 不該讓呼叫端以為名單變了').toBe(false)
    // **只斷言「內容相等」是不夠的** —— 每次建一個內容相同的新 Map，
    // React 照樣會重繪。要驗的是**沒有產生新的名單**。
    expect(state.roster, '名單物件被換掉了 —— 那會讓 React 重繪').toBe(rosterBefore)
    expect(state.motion.get('u1')).toEqual({ x: 10, z: 20, f: 2 })
  })

  it('[FE-R07-S02] snapshot 建立名單並排除自己', () => {
    const state = createRemotePlayersState()

    applyMessage(state, snapshot(player(SELF, 0, 0), player('u1', 32, 64, 1), player('u2')), SELF)

    expect([...state.roster.keys()].sort(), '自己不該出現在遠端玩家裡').toEqual(['u1', 'u2'])
    expect(state.motion.has(SELF)).toBe(false)
    // 「座標來自 snapshot，不是預設值」：32 像素 = 1 世界單位、64 = 2
    expect(state.motion.get('u1'), '初始座標應該取自 snapshot').toEqual({ x: 1, z: 2, f: 1 })
  })

  it('[FE-R07-S03] 後來的 snapshot 取代整份名單', () => {
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player('u1', 32, 32), player('u2')), SELF)

    applyMessage(state, snapshot(player('u3', 96, 0)), SELF)

    expect([...state.roster.keys()]).toEqual(['u3'])
    expect(state.motion.has('u1'), '前一批人的動態也要清掉').toBe(false)
    expect(state.motion.has('u2')).toBe(false)
    expect(state.motion.get('u3')).toEqual({ x: 3, z: 0, f: 0 })
  })

  it('[FE-R07-S04] 一則 presence 同時處理進場與離場', () => {
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player('u1'), player('u2', 64, 0)), SELF)

    const changed = applyMessage(state, presence([player('u3', 32, 0)], ['u1']), SELF)

    expect(changed).toBe(true)
    expect([...state.roster.keys()].sort()).toEqual(['u2', 'u3'])
    expect(state.motion.has('u1'), '離開的人的動態也要清掉').toBe(false)
    // 沒有被提到的人完全沒有受影響
    expect(state.motion.get('u2')).toEqual({ x: 2, z: 0, f: 0 })
  })

  it('[FE-R07-S05] 不合常理的 presence 不得造成錯誤', () => {
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player('u1', 32, 0)), SELF)

    expect(() => applyMessage(state, presence([], ['nobody']), SELF)).not.toThrow()
    expect(state.motion.get('u1'), 'leave 不存在的人不該影響其他人').toEqual({ x: 1, z: 0, f: 0 })

    applyMessage(state, presence([player('u1', 999, 999)], []), SELF)
    expect([...state.roster.keys()], '重複 join 不該讓同一個人出現兩次').toEqual(['u1'])
    expect(state.motion.get('u1'), '重複 join 不該覆寫既有的位置').toEqual({ x: 1, z: 0, f: 0 })

    applyMessage(state, presence([player(SELF)], []), SELF)
    expect(state.roster.has(SELF), '自己不該被 join 進遠端玩家').toBe(false)
  })

  it('[FE-R07-S06] pos 更新已知的人，忽略不認識的 id', () => {
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player('u1')), SELF)

    applyMessage(state, pos(['u1', 320, 640, 3], ['ghost', 1, 1, 0]), SELF)

    // 存的是**世界座標**，不是協定像素（320 / 32 = 10）
    expect(state.motion.get('u1')).toEqual({ x: 10, z: 20, f: 3 })
    expect(state.roster.has('ghost'), 'pos 不該建立名單上沒有的人').toBe(false)
    expect(state.motion.has('ghost')).toBe(false)
  })

  it('不屬於這一層的訊息不會造成任何改變', () => {
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player('u1')), SELF)
    const rosterBefore = state.roster

    for (const m of [
      message({ t: 'hello', you: SELF, hz: 10 }),
      message({ t: 'status', id: 'u1', text: '趕工中' }),
      message({ t: 'chat', id: 'u1', name: '訪客', body: '嗨' }),
      message({ t: 'err', code: 'x', msg: 'y' }),
    ]) {
      expect(applyMessage(state, m, SELF)).toBe(false)
    }
    expect(state.roster).toBe(rosterBefore)
  })

  it('selfId 還不知道的時候，snapshot 裡的每個人都算遠端', () => {
    // `FE-R01` 的狀態機保證 `ready` 之前不會有 `selfId`。真的發生的話，
    // **寧可多畫一個分身，也不要少畫別人** —— 前者看得見，後者查不出來。
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player(SELF), player('u1')), null)
    expect([...state.roster.keys()].sort()).toEqual([SELF, 'u1'].sort())
  })
})
