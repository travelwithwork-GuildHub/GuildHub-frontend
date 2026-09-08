import { describe, expect, it, vi } from 'vitest'
import { createMessageValidator, type ProtocolViolation } from '@/realtime/protocol'

// 規格：openspec/changes/fe-r02-protocol/specs/realtime-protocol/spec.md
//   Requirement: 每一則訊息都要驗證，結果是成功或失敗二選一 —— FE-R02-S01 / S02
//   Requirement: 違規一定要有人被通知 —— FE-R02-S03
//   Requirement: 訊息級的失敗只影響那一則 —— FE-R02-S04
//   Requirement: 後端新增的訊息類型也是違規 —— FE-R02-S05
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。

const SNAPSHOT = JSON.stringify({
  t: 'snapshot',
  players: [{ id: 'u1', name: '訪客', av: 0, x: 0, y: 0, f: 0, st: '' }],
})
const POS = JSON.stringify({ t: 'pos', p: [['u1', 120, 340, 2]] })

function validator() {
  const violations: Array<{ violation: ProtocolViolation; raw: string }> = []
  const onViolation = vi.fn((violation: ProtocolViolation, raw: string) => {
    violations.push({ violation, raw })
  })
  return { validate: createMessageValidator(onViolation), onViolation, violations }
}

describe('訊息驗證', () => {
  it('[FE-R02-S01] 合法的訊息驗證通過並帶出型別已知的內容', () => {
    const { validate, onViolation } = validator()

    const snapshot = validate(SNAPSHOT)
    expect(snapshot.ok).toBe(true)
    // 「可以讀到它的 players」—— 只斷言 ok 的話，一個回傳 `{ok:true}` 但
    // 不帶訊息的實作也會通過。
    if (snapshot.ok && snapshot.message.t === 'snapshot') {
      expect(snapshot.message.players[0]?.id).toBe('u1')
    } else {
      expect.unreachable('snapshot 應該驗過而且 t 是 snapshot')
    }

    const pos = validate(POS)
    expect(pos.ok).toBe(true)
    if (pos.ok && pos.message.t === 'pos') {
      expect(pos.message.p[0]).toEqual(['u1', 120, 340, 2])
    } else {
      expect.unreachable('pos 應該驗過而且 t 是 pos')
    }

    expect(onViolation, '合法訊息不該通報違規').not.toHaveBeenCalled()
  })

  it('[FE-R02-S02] 不是 JSON、不是物件、缺 t 都失敗且不交出訊息', () => {
    const { validate, violations } = validator()

    const notJson = validate('這不是 JSON')
    expect(notJson.ok).toBe(false)
    expect(notJson).not.toHaveProperty('message')

    expect(validate('42').ok, '合法 JSON 但不是物件').toBe(false)
    expect(validate('null').ok, 'null 也不是物件').toBe(false)
    expect(validate('[1,2,3]').ok, '陣列也不是我們要的物件').toBe(false)
    expect(validate('{"players":[]}').ok, '沒有 t').toBe(false)

    expect(violations.map((v) => v.violation)).toEqual([
      'not-json',
      'not-an-object',
      'not-an-object',
      'not-an-object',
      'not-in-contract',
    ])
  })

  it('[FE-R02-S03] 未知的 t 一定會被通報，而且不交出訊息', () => {
    const { validate, onViolation, violations } = validator()
    const raw = '{"t":"teleport","x":1}'

    const result = validate(raw)

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('message')
    expect(onViolation, '違規通報應該剛好被呼叫一次').toHaveBeenCalledTimes(1)
    expect(violations[0]?.raw, '通報要拿得到原文').toBe(raw)
  })

  it('[FE-R02-S04] 壞掉的一則不影響下一則', () => {
    const { validate, onViolation } = validator()

    const bad = validate('{"t":"teleport","x":1}')
    const good = validate(SNAPSHOT)

    expect(bad.ok).toBe(false)
    expect(good.ok, '前一則壞掉不該影響後一則').toBe(true)
    expect(onViolation, '只有壞掉的那一則該通報').toHaveBeenCalledTimes(1)
  })

  it('[FE-R02-S05] 形狀對但欄位不合的訊息也失敗', () => {
    // **只驗「未知 t」是不夠的**：一個「只看 t 在不在清單裡」的實作
    // 會讓這兩則通過，而下游會拿到一個少了欄位的物件。
    const { validate, onViolation } = validator()

    const posAsObject = validate('{"t":"pos","p":[{"id":"u1","x":1,"y":2,"f":0}]}')
    expect(posAsObject.ok, 'pos 的 p 是物件而不是陣列，應該失敗').toBe(false)

    const helloWithoutYou = validate('{"t":"hello","hz":10}')
    expect(helloWithoutYou.ok, 'hello 少了 you，應該失敗').toBe(false)

    expect(onViolation).toHaveBeenCalledTimes(2)
  })

  it('這一層擋不住呼叫端把通報接成空函式', () => {
    // **規格明文承認這件事。** 必填的價值是逼呼叫端在組裝的地方表態，
    // 不是防止他表態成「什麼都不做」。
    // 這條測試存在是為了讓那個限制**在測試裡看得見**，不是只寫在註解裡。
    const validate = createMessageValidator(() => {})
    const result = validate('{"t":"teleport"}')

    expect(result.ok, '驗證本身仍然會失敗 —— 這一層沒有吞掉違規').toBe(false)
    // 但沒有任何機制能讓上面那個空函式變紅。
  })
})
