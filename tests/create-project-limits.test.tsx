import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, within } from '@testing-library/react'
import { startContractServer, type ContractServer } from './support/contract-server'
import { button, click, field, mountBoard, panel, type } from './support/project-board'

// 規格：openspec/changes/fe-j01-create-project/specs/project-posting/spec.md
//   Requirement: 上限由前端守，數字有出處，時機照全站規則 —— S03 的後兩句
//
// 這一檔把 `LIMITS.seatIndex.max` 換成 5（跟 `project-rules.test.ts` 同一支 mock；那裡驗 `FORM_LIMITS.seatCount.max` 是 6）：
// 表單的「座位數」上限訊息與判準 SHALL 跟著變 6 —— 表單裡寫死 8、或不讀 `FORM_LIMITS`，這裡要紅。

vi.mock('@/api/contract/limits', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/api/contract/limits')>()
  return { ...real, LIMITS: { ...real.LIMITS, seatIndex: { min: 0, max: 5 } } }
})

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/')
})

describe('座位數的上限是推導的，不是寫死的', () => {
  it('[FE-J01-S03] 表單：7 紅、6 不紅，訊息裡的數字是 6', async () => {
    mountBoard(server, { identity: 'signed-in' })
    click(await within(panel()).findByRole('button', { name: '發案' }))
    await type(field('座位數'), '7')
    const seat = field('座位數')
    expect(seat.getAttribute('aria-invalid')).toBe('true')
    const message = document.getElementById(seat.getAttribute('aria-describedby') ?? '')?.textContent ?? ''
    expect(message).toContain('6')
    expect(message).not.toContain('8')
    expect(button('送出').disabled).toBe(true)
    await type(field('座位數'), '6')
    expect(field('座位數').getAttribute('aria-invalid')).not.toBe('true')
    expect(button('送出').disabled).toBe(false)
  })
})
