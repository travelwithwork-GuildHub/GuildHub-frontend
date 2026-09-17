import { describe, expect, it } from 'vitest'
import { Relay } from './rehearsal/relay'

// 規格：openspec/changes/fe-o08-guildhub-rehearsal/specs/switch-rehearsal/spec.md
//   Requirement: 閉環的每一步都對照期望表 —— 前置失敗 → `blocked: <前置 key>`（S04 的訊息要指根因）
// 不打後端：只驗接力狀態本身。真的對後端跑的是 tests/rehearsal/closure.rehearsal.ts。

const ok = async () => {}
const boom = async () => {
  throw new Error('form-team: 期望 201、實測 200')
}

describe('閉環的接力', () => {
  it('[FE-O08-S04] 前置紅了，後面的每一步都指向根因、不指直接前置', async () => {
    const relay = new Relay()
    await relay.run('create', [], ok)
    await expect(relay.run('form-team', ['create'], boom)).rejects.toThrow('form-team: 期望 201、實測 200')
    await expect(relay.run('enter', ['form-team'], ok)).rejects.toThrow('blocked: form-team')
    // enter 是被擋的，不是根因：seats-empty 要說 form-team。
    await expect(relay.run('seats-empty', ['enter'], ok)).rejects.toThrow('blocked: form-team')
    await expect(relay.run('rooms-excludes', ['close'], ok)).rejects.toThrow('blocked: close')
  })

  it('[FE-O08-S04] 不靠紅掉那一步的照跑；被擋的步驟不會被算成過', async () => {
    const relay = new Relay()
    await expect(relay.run('form-team', [], boom)).rejects.toThrow()
    const ran: string[] = []
    await relay.run('message', [], async () => {
      ran.push('message')
    })
    await expect(relay.run('enter', ['form-team'], async () => {
      ran.push('enter')
    })).rejects.toThrow('blocked: form-team')
    expect(ran).toEqual(['message'])
    // 被擋的 enter 沒有被記成過：靠它的還是 blocked。
    await expect(relay.run('seat-claim', ['enter'], ok)).rejects.toThrow('blocked: form-team')
  })
})
