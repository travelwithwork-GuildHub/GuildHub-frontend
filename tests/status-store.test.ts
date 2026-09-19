import { describe, expect, it, vi } from 'vitest'
import type { StatusIn } from '@/api/contract/ws'
import { LIMITS } from '@/api/contract/limits'
import { createStatusStore } from '@/realtime/statusStore'

// 規格：openspec/changes/fe-k05-status/specs/player-status/spec.md
//   Requirement: 已登入的人可以設定、換掉、清除一句最多 12 字的狀態 —— S01（payload、回聲才算）、S02（12 可送／13 不送／清除）、S03（沒連線不送）的傳輸半邊
//   Requirement: 換場景、重連之後自己的狀態要再送一次 —— S04
//
// 純 store：`send` 是替身，不連任何外部服務。

const TWELVE = '十二個全形字剛好十二個'
const THIRTEEN = `${TWELVE}多`
const status = (text: string): StatusIn => ({ t: 'status', text })

describe('設定狀態：送出、回聲、上限、沒連線', () => {
  it('[FE-K05-S01] set 在連線上送恰好一則、payload 對；回聲到了 text 才變、pending 清掉', () => {
    const store = createStatusStore()
    const send = vi.fn()
    const link = store.port.attach(send)
    expect(store.set('趕工中')).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(status('趕工中'))
    expect(store.getSnapshot()).toMatchObject({ text: '', pending: '趕工中', online: true })
    link.confirm('趕工中')
    expect(store.getSnapshot()).toMatchObject({ text: '趕工中', pending: null })
    // 回聲不是 pending 的那一句（別的分頁改的）：text 照回聲，pending 留著
    store.set('開會中')
    link.confirm('趕工中')
    expect(store.getSnapshot()).toMatchObject({ text: '趕工中', pending: '開會中' })
  })

  it('[FE-K05-S02] 12 字可送、13 字不送（too-long、一則都沒多）；清除送空字串，回聲後沒有狀態', () => {
    expect(TWELVE.length).toBe(LIMITS.statusText.max)
    const store = createStatusStore()
    const send = vi.fn()
    const link = store.port.attach(send)
    expect(store.set(TWELVE)).toEqual({ ok: true })
    expect(send).toHaveBeenLastCalledWith(status(TWELVE))
    expect(store.set(THIRTEEN)).toEqual({ ok: false, reason: 'too-long' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().pending).toBe(TWELVE)
    link.confirm(TWELVE)
    store.clear()
    expect(send).toHaveBeenLastCalledWith(status(''))
    expect(store.getSnapshot()).toMatchObject({ text: TWELVE, pending: '' })
    link.confirm('')
    expect(store.getSnapshot()).toMatchObject({ text: '', pending: null })
  })

  it('[FE-K05-S03] 沒有連線：set 回 offline、不拋、什麼都沒送；接上之後再送就到', () => {
    const store = createStatusStore()
    expect(store.getSnapshot().online).toBe(false)
    expect(store.set('趕工中')).toEqual({ ok: false, reason: 'offline' })
    expect(store.getSnapshot().pending).toBeNull()
    const send = vi.fn()
    store.port.attach(send)
    expect(store.set('趕工中')).toEqual({ ok: true })
    expect(send).toHaveBeenCalledWith(status('趕工中'))
  })

  it('[FE-K05-S01] 訂閱者在每次改變被通知一次；同一個 snapshot reference 直到內容變', () => {
    const store = createStatusStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()
    expect(store.getSnapshot()).toBe(before)
    const link = store.port.attach(vi.fn())
    expect(listener).toHaveBeenCalledTimes(1)
    store.set('趕工中')
    link.confirm('趕工中')
    expect(listener).toHaveBeenCalledTimes(3)
    expect(store.getSnapshot()).not.toBe(before)
  })
})

describe('換場景、重連後重送', () => {
  it('[FE-K05-S04] 已確認的狀態非空：新連線 attach 時立刻重送恰好一則；舊連線 detach 後不再收；空狀態一則都不送；detach 後 set 是 offline', () => {
    const store = createStatusStore()
    const hall = vi.fn()
    const hallLink = store.port.attach(hall)
    store.set('趕工中')
    hallLink.confirm('趕工中')
    hallLink.detach()
    expect(store.getSnapshot().online).toBe(false)
    const room = vi.fn()
    const roomLink = store.port.attach(room)
    expect(room).toHaveBeenCalledTimes(1)
    expect(room).toHaveBeenCalledWith(status('趕工中'))
    expect(hall).toHaveBeenCalledTimes(1)
    // 重送不算 pending（text 沒變）；回聲來了照樣 confirm
    expect(store.getSnapshot()).toMatchObject({ text: '趕工中', pending: null, online: true })
    roomLink.confirm('趕工中')
    // 舊連線晚到的回聲不算
    hallLink.confirm('別的')
    expect(store.getSnapshot().text).toBe('趕工中')
    // 同場景重連：再一則
    roomLink.detach()
    const again = vi.fn()
    store.port.attach(again)
    expect(again).toHaveBeenCalledTimes(1)
    // 空狀態：換連線不送
    const empty = createStatusStore()
    const s1 = vi.fn()
    empty.port.attach(s1).detach()
    const s2 = vi.fn()
    empty.port.attach(s2)
    expect(s1).not.toHaveBeenCalled()
    expect(s2).not.toHaveBeenCalled()
  })

  it('[FE-K05-S04] 重送時 send 拋（連線其實沒 ready）：不炸、狀態留著、下一條連線再試', () => {
    const store = createStatusStore()
    const link = store.port.attach(vi.fn())
    store.set('趕工中')
    link.confirm('趕工中')
    link.detach()
    const throwing = vi.fn(() => {
      throw new Error('not ready')
    })
    expect(() => store.port.attach(throwing)).not.toThrow()
    expect(store.getSnapshot().text).toBe('趕工中')
  })
})
