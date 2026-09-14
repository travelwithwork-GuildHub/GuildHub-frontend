import { beforeEach, describe, expect, it } from 'vitest'
import { dropRoomToken, heldRoomToken, holdRoomToken } from '@/world/scenes/roomTokens'

// 票的持有。規格 `FE-V01-S14`（鍵含身分、sessionStorage、不進 localStorage）。

const P = 'p0000000-0000-4000-8000-00000000000p'
const Q = 'q0000000-0000-4000-8000-00000000000q'
const ROOM = 'a0000000-0000-4000-8000-00000000000a'

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
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

  it('[FE-V01-S14] sessionStorage 不可用時不拋，當成沒有票', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      expect(() => holdRoomToken(P, ROOM, 'T')).not.toThrow()
      expect(heldRoomToken(P, ROOM)).toBeNull()
    } finally {
      Object.defineProperty(window, 'sessionStorage', real)
    }
  })
})
