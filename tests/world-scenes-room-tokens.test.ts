import { beforeEach, describe, expect, it } from 'vitest'
import { __resetRoomTokenMemory, dropRoomToken, heldRoomToken, holdRoomToken } from '@/world/scenes/roomTokens'

// 票的持有。規格〈票由前端持有，鍵含身分，不進網址〉：
//   `FE-V01-S14` 基本持有／讀取／丟棄、鍵含身分、不進 localStorage；
//   `FE-V01-S22`（`fe-n08-room-ticket-in-memory`）權威在記憶體 —— storage 被擋這一場仍持有、重整撿回、墓碑蓋過殘留。

const P = 'p0000000-0000-4000-8000-00000000000p'
const Q = 'q0000000-0000-4000-8000-00000000000q'
const ROOM = 'a0000000-0000-4000-8000-00000000000a'

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  __resetRoomTokenMemory() // 這一場的權威在記憶體；跨測試要清
})

describe('roomTokens', () => {
  it('[FE-V01-S14] 持有、讀取、丟棄；鍵含身分；不碰 localStorage', () => {
    expect(heldRoomToken(P, ROOM)).toBeNull()
    holdRoomToken(P, ROOM, 'T')
    expect(heldRoomToken(P, ROOM)).toBe('T')
    expect(heldRoomToken(Q, ROOM), '另一個身分讀不到').toBeNull()
    expect(window.sessionStorage.getItem(`guildhub.roomToken.${P}.${ROOM}`)).toBe('T')
    expect(window.localStorage.length, '不進 localStorage').toBe(0)
    dropRoomToken(P, ROOM)
    expect(heldRoomToken(P, ROOM)).toBeNull()
  })

  it('[FE-V01-S22] sessionStorage 不可用時不拋；票仍在記憶體（這一場進得了房），只有重整後才沒有', () => {
    // 反轉（`fe-n08-room-ticket-in-memory`）：storage 被擋（隱私擴充/設定）**不再**等於沒有票 ——
    // 這一場的權威是記憶體，storage 只是重整後撿回票的持久層。
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      expect(() => holdRoomToken(P, ROOM, 'T')).not.toThrow()
      // storage 擋掉了，但這一場靠記憶體 —— 讀得回票、進得了房（就是修掉「一整隊只有無痕能進」的關鍵）
      expect(heldRoomToken(P, ROOM), 'storage 被擋也照樣持有（記憶體）').toBe('T')
      // 模擬重整：記憶體清空、storage 仍不可用 → 撿不回 → 沒有票（回大廳、走到門前再拿一次）
      __resetRoomTokenMemory()
      expect(heldRoomToken(P, ROOM), '重整後記憶體沒了、storage 也讀不到 → 沒有票').toBeNull()
    } finally {
      Object.defineProperty(window, 'sessionStorage', real)
    }
  })

  it('[FE-V01-S22] 重整後（記憶體清空）從 sessionStorage 撿回票', () => {
    holdRoomToken(P, ROOM, 'T') // storage 正常時 best-effort 寫進去了
    __resetRoomTokenMemory() // 模擬重整：記憶體沒了
    expect(heldRoomToken(P, ROOM), 'storage 撿得回').toBe('T')
    expect(heldRoomToken(Q, ROOM), '別的身分撿不到').toBeNull()
  })

  it('[FE-V01-S22] 丟票後即使 sessionStorage 還殘留，也讀不回（記憶體墓碑不讓舊票復活）', () => {
    holdRoomToken(P, ROOM, 'T')
    // 直接在 storage 留一張舊票，模擬 removeItem 失敗
    const key = `guildhub.roomToken.${P}.${ROOM}`
    dropRoomToken(P, ROOM)
    window.sessionStorage.setItem(key, 'T') // storage 殘留
    expect(heldRoomToken(P, ROOM), '墓碑蓋過 storage 殘留').toBeNull()
  })
})
