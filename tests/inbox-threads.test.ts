import { describe, expect, it } from 'vitest'
import type { MessageOut } from '@/api/contract/rest'
import { counterpartOf, groupThreads, mergeById, preview, shortId } from '@/inbox/threads'

// 規格：openspec/changes/fe-k01-inbox/specs/inbox/spec.md
//   Requirement: 清單是對話，不是信 —— S03（純函式）

const M = '00000000-0000-4000-8000-000000000000'
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
let seq = 0
const msg = (from: string, to: string, hhmm: string, id = `id-${(seq += 1)}`): MessageOut => ({
  id,
  sender_id: from,
  recipient_id: to,
  body: `${from === M ? 'me' : 'them'} ${hhmm}`,
  created_at: `2026-09-12T${hhmm}:00.000000Z`,
  read_at: null,
})

describe('groupThreads', () => {
  it('[FE-K01-S03] 分組、組內舊到新、組依最新新到舊、以 id 去重', () => {
    const top = msg(A, M, '10:00', 'dup')
    const list = [top, msg(M, B, '09:00'), msg(B, M, '08:00'), msg(A, M, '07:00'), { ...top }]
    const threads = groupThreads(list, M)
    expect(threads.map((t) => t.with)).toEqual([A, B])
    expect(threads[0]!.messages.map((m) => m.created_at.slice(11, 16))).toEqual(['07:00', '10:00'])
    expect(threads[0]!.messages).toHaveLength(2)
    expect(threads[0]!.latest.id).toBe('dup')
    expect(threads[1]!.messages.map((m) => m.created_at.slice(11, 16))).toEqual(['08:00', '09:00'])
    expect(counterpartOf(top, M)).toBe(A)
    expect(counterpartOf(msg(M, B, '00:00'), M)).toBe(B)
  })

  it('組的順序看最新一封，不是第一封', () => {
    // A 的第一封比 B 早、但最新一封比 B 新 → A 排前面。
    const threads = groupThreads([msg(A, M, '01:00'), msg(B, M, '05:00'), msg(A, M, '09:00')], M)
    expect(threads.map((t) => t.with)).toEqual([A, B])
  })

  it('mergeById 只增不減、既有的優先', () => {
    const a = msg(A, M, '01:00', 'x')
    const merged = mergeById([a], [{ ...a, body: '改了' }, msg(B, M, '02:00', 'y')])
    expect(merged.map((m) => m.id)).toEqual(['x', 'y'])
    expect(merged[0]!.body).toBe(a.body)
  })
})

describe('preview 與 shortId', () => {
  it('[FE-K01-S03] 壓空白、trim、40 個 code point、emoji 算一個', () => {
    expect(preview('  哈囉\n\n世界  ')).toBe('哈囉 世界')
    expect(preview('哈囉\t\t世界')).toBe('哈囉 世界')
    const fortyOne = '字'.repeat(41)
    expect(preview(fortyOne)).toBe(`${'字'.repeat(40)}…`)
    expect(preview('字'.repeat(40))).toBe('字'.repeat(40))
    const emoji = '😀'.repeat(40)
    expect(emoji.length).toBe(80)
    expect(preview(emoji), '用 .length 算會被切一半').toBe(emoji)
    expect(shortId('11111111-1111-1111-1111-111111111111')).toBe('1111…1111')
    expect(shortId('abcdefgh-0000-4000-8000-0000wxyz1234')).toBe('abcd…1234')
  })
})
