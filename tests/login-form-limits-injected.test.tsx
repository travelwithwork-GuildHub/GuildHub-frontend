import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-o06-limit-source/specs/limit-source/spec.md
//   Requirement: 登入表單的暱稱欄真的拿到那些數字 —— S08（數字不是寫死的）
//
// 用 module mock 把 `LIMITS.displayName.max` 換成 10，**其餘照原樣**，再載入表單：10 可送、11 禁用。
// 表單裡寫死 20 的話這條紅（S06／S07 在真值仍是 20 時寫死也會過 —— 審查抓到的）。
// 要在自己的檔案裡：vi.mock 是整檔生效的。**不連任何外部服務。**

vi.mock('@/api/contract/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/contract/limits')>()
  return { ...actual, LIMITS: { ...actual.LIMITS, displayName: { min: 1, max: 10 } } }
})

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})
afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
})

function type(field: HTMLElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('上限換成 10 之後', () => {
  it('[FE-O06-S08] 10 個字可送、11 個字禁用 —— 表單的閾值跟著來源走', async () => {
    const { LoginForm } = await import('@/app/login/LoginForm')
    const { LIMITS } = await import('@/api/contract/limits')
    expect(LIMITS.displayName.max, 'mock 沒生效').toBe(10)
    render(<LoginForm />)
    const field = screen.getByLabelText('在世界裡顯示的名字')
    const button = () => screen.getByRole('button', { name: '進入世界' }) as HTMLButtonElement
    type(field, '字'.repeat(10))
    expect(button().disabled).toBe(false)
    expect(screen.getByTestId('nickname-remaining').dataset.remaining).toBe('0')
    type(field, '字'.repeat(11))
    expect(button().disabled, '上限是 10 了，11 個字還能送 —— 表單寫死了 20').toBe(true)
    expect(screen.getByTestId('nickname-remaining').dataset.remaining).toBe('-1')
  })
})
