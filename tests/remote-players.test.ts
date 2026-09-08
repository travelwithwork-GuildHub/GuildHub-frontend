import { describe, expect, it } from 'vitest'
import { ServerMessage } from '@/api/contract/ws'
import { applyMessage, createRemotePlayersState } from '@/realtime/remotePlayers'
import { RENDER_DELAY_MS, evaluate } from '@/realtime/interpolation'

// 規格：openspec/changes/fe-r07-remote-players/specs/remote-players/spec.md
//   Requirement: 名單與動態分成兩個容器 —— FE-R07-S01
//   Requirement: snapshot 建立名單，而且排除自己 —— FE-R07-S02 / S03
//   Requirement: presence 的 join 與 leave 在同一則裡處理 —— FE-R07-S04 / S05
//   Requirement: pos 只更新已知的人 —— FE-R07-S06
//
// openspec/changes/fe-r08-interpolation/specs/remote-players/spec.md
//   `pos` 改成**追加一個帶時間的樣本** —— FE-R08-S10
//   `snapshot` / `join` 清空樣本 —— FE-R08-S17 / S18
//   `leave` 把樣本一起清掉 —— FE-R08-S11
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// **訊息一律先過 `api-contract` 的 schema 再餵進去** —— 直接塞手寫物件的話，
// 這些測試會在「協定變了」的時候照樣綠。

const SELF = 'u-self'

/** 測試用的時鐘。**時間一律傳進去**，這一層不自己取。 */
let clock = 1000
const apply = (state: Parameters<typeof applyMessage>[0], m: Parameters<typeof applyMessage>[1]) =>
  applyMessage(state, m, SELF, clock)

/**
 * 某個人**現在畫面上**的位置。
 *
 * ⚠️ 有 250 毫秒的 render delay，所以剛追加的樣本要等 `RENDER_DELAY_MS`
 * 才會走到。`snapshot` / `join` 是 snap，當下就看得到。
 */
function shown(state: ReturnType<typeof createRemotePlayersState>, id: string, at = clock) {
  const track = state.motion.get(id)
  return track === undefined ? undefined : evaluate(track, at)
}

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
    apply(state, snapshot(player(SELF), player('u1', 32, 64, 1)))
    const rosterBefore = state.roster

    const changed = apply(state, pos(['u1', 320, 640, 2]))

    expect(changed, 'pos 不該讓呼叫端以為名單變了').toBe(false)
    // **只斷言「內容相等」是不夠的** —— 每次建一個內容相同的新 Map，
    // React 照樣會重繪。要驗的是**沒有產生新的名單**。
    expect(state.roster, '名單物件被換掉了 —— 那會讓 React 重繪').toBe(rosterBefore)
    // 走完 render delay 之後才會到新位置（320 / 32 = 10）
    expect(shown(state, 'u1', clock + RENDER_DELAY_MS)).toEqual({ x: 10, z: 20, f: 2 })
  })

  it('[FE-R07-S02] snapshot 建立名單並排除自己', () => {
    const state = createRemotePlayersState()

    apply(state, snapshot(player(SELF, 0, 0), player('u1', 32, 64, 1), player('u2')))

    expect([...state.roster.keys()].sort(), '自己不該出現在遠端玩家裡').toEqual(['u1', 'u2'])
    expect(state.motion.has(SELF)).toBe(false)
    // 「座標來自 snapshot，不是預設值」：32 像素 = 1 世界單位、64 = 2
    // snapshot 是 snap —— **當下就看得到**，不必等 render delay
    expect(shown(state, 'u1'), '初始座標應該取自 snapshot').toEqual({ x: 1, z: 2, f: 1 })
  })

  it('[FE-R07-S03] 後來的 snapshot 取代整份名單', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1', 32, 32), player('u2')))

    apply(state, snapshot(player('u3', 96, 0)))

    expect([...state.roster.keys()]).toEqual(['u3'])
    expect(state.motion.has('u1'), '前一批人的動態也要清掉').toBe(false)
    expect(state.motion.has('u2')).toBe(false)
    expect(shown(state, 'u3')).toEqual({ x: 3, z: 0, f: 0 })
  })

  it('[FE-R07-S04] 一則 presence 同時處理進場與離場', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1'), player('u2', 64, 0)))

    const changed = apply(state, presence([player('u3', 32, 0)], ['u1']))

    expect(changed).toBe(true)
    expect([...state.roster.keys()].sort()).toEqual(['u2', 'u3'])
    expect(state.motion.has('u1'), '離開的人的動態也要清掉').toBe(false)
    // 沒有被提到的人完全沒有受影響
    expect(shown(state, 'u2')).toEqual({ x: 2, z: 0, f: 0 })
  })

  it('[FE-R07-S05] 不合常理的 presence 不得造成錯誤', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1', 32, 0)))

    expect(() => apply(state, presence([], ['nobody']))).not.toThrow()
    expect(shown(state, 'u1'), 'leave 不存在的人不該影響其他人').toEqual({ x: 1, z: 0, f: 0 })

    apply(state, presence([player('u1', 320, 640)], []))
    expect([...state.roster.keys()], '重複 join 不該讓同一個人出現兩次').toEqual(['u1'])
    // ⚠️ **這裡的行為在 FE-R08 改了。** 舊規格是「重複 join 不該覆寫既有的位置」；
    // 新規格（FE-R08-S17）是 `join` **清空樣本並直接就位** ——
    // 它是權威狀態的重建，留著舊軌跡會讓畫面把舊位置跟新位置連成一段插值。
    expect(shown(state, 'u1'), 'join 應該直接就位').toEqual({ x: 10, z: 20, f: 0 })

    apply(state, presence([player(SELF)], []))
    expect(state.roster.has(SELF), '自己不該被 join 進遠端玩家').toBe(false)
  })

  it('[FE-R07-S06] pos 更新已知的人，忽略不認識的 id', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1')))

    apply(state, pos(['u1', 320, 640, 3], ['ghost', 1, 1, 0]))

    // 存的是**世界座標**，不是協定像素（320 / 32 = 10）
    expect(shown(state, 'u1', clock + RENDER_DELAY_MS)).toEqual({ x: 10, z: 20, f: 3 })
    expect(state.roster.has('ghost'), 'pos 不該建立名單上沒有的人').toBe(false)
    expect(state.motion.has('ghost')).toBe(false)
  })

  it('[FE-R08-S10] pos 是追加樣本，不是覆寫位置', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1', 0, 0)))

    const GAP = 100
    clock += GAP
    apply(state, pos(['u1', 320, 0, 0]))

    // **第二則到達的當下，畫面位置還在第一則附近。**
    // 覆寫的話這裡會直接是 10 —— 而那就是「每 100 毫秒跳一格」。
    expect(shown(state, 'u1')!.x, '覆寫了位置，沒有留下可以插值的區間').toBeCloseTo(0, 6)

    // 這一段在畫面上的時間窗是 `[t1 + D, t2 + D]`，也就是
    // `clock + D − GAP` 到 `clock + D`（`clock` 已經是 t2）。
    const half = shown(state, 'u1', clock + RENDER_DELAY_MS - GAP / 2)!.x
    expect(half, '沒有中間值 —— 沒有形成可以插值的區間').toBeGreaterThan(0)
    expect(half).toBeLessThan(10)
    expect(shown(state, 'u1', clock + RENDER_DELAY_MS)!.x).toBeCloseTo(10, 6)
  })

  it('[FE-R08-S11] 離開的人不留下樣本', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1', 32, 0), player('u2', 64, 0)))
    for (let i = 0; i < 30; i++) {
      clock += 100
      apply(state, pos(['u1', 32 + i, 0, 0], ['u2', 64 + i, 0, 0]))
    }
    const u2Before = state.motion.get('u2')!.samples.length

    apply(state, presence([], ['u1']))

    // **直接斷言容器** —— 用「重新 join 之後不會從舊位置滑過來」來測的話，
    // `join` 自己就會清樣本，所以 `leave` 忘了清照樣是綠的，
    // 而漏掉的是一個**沒有錯誤訊息的記憶體洩漏**。
    expect(state.motion.has('u1'), 'leave 之後樣本還留著 —— 這是記憶體洩漏').toBe(false)
    expect(state.motion.get('u2')!.samples.length, '別人的樣本被連累了').toBe(u2Before)
  })

  it('不屬於這一層的訊息不會造成任何改變', () => {
    const state = createRemotePlayersState()
    apply(state, snapshot(player('u1')))
    const rosterBefore = state.roster

    for (const m of [
      message({ t: 'hello', you: SELF, hz: 10 }),
      message({ t: 'status', id: 'u1', text: '趕工中' }),
      message({ t: 'chat', id: 'u1', name: '訪客', body: '嗨' }),
      message({ t: 'err', code: 'x', msg: 'y' }),
    ]) {
      expect(apply(state, m)).toBe(false)
    }
    expect(state.roster).toBe(rosterBefore)
  })

  it('selfId 還不知道的時候，snapshot 裡的每個人都算遠端', () => {
    // `FE-R01` 的狀態機保證 `ready` 之前不會有 `selfId`。真的發生的話，
    // **寧可多畫一個分身，也不要少畫別人** —— 前者看得見，後者查不出來。
    const state = createRemotePlayersState()
    applyMessage(state, snapshot(player(SELF), player('u1')), null, clock)
    expect([...state.roster.keys()].sort()).toEqual([SELF, 'u1'].sort())
  })
})
