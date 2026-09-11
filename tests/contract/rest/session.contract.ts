import { describe, expect, it } from 'vitest'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 唯一一份，兩個目標各跑一次，都走真 HTTP —— S03（cookie jar 讓登入延續；沒 jar 就是 401）
//
// 這個檔案不知道自己在打 internal 還是 guildhub：位址從 harness 來。

describe('session', () => {
  it('[FE-O05-S03] cookie jar 讓登入延續；沒有 jar 的第二個請求是 401', async () => {
    const client = new ContractClient(baseUrl())
    const me = await client.login('契約')
    expect(typeof me.id).toBe('string')
    const again = await client.raw('GET', '/api/me')
    expect(again.status).toBe(200)
    expect((again.json as { id: string }).id).toBe(me.id)
    expect(client.cookies().size, 'login 沒有 Set-Cookie').toBeGreaterThan(0)

    // 證明 jar 不是恆真：同一個 base、不記 cookie，第二個請求就是未登入。
    const forgetful = client.forgetful()
    const first = await forgetful.raw('POST', '/api/login', { body: { nickname: '沒有 jar' } })
    expect(first.status).toBe(200)
    const second = await forgetful.raw('GET', '/api/me')
    expect(second.status).toBe(401)
    expect(second.json).toEqual({ detail: '未登入' })
  })
})
