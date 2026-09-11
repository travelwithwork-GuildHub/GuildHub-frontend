import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { LoginForm } from '@/app/login/LoginForm'
import { LIMITS } from '@/api/contract/limits'
import { startContractServer, type ContractServer } from './support/contract-server'

// `LoginForm` 在 `FE-A08` 之後有 `useRouter()`（帳號密碼成功導向 `/world`）；測試環境沒有 Next 的 app router context —— 只換掉導航。
// 這裡的判準不走那條路，所以 push 什麼都不做。
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }))


// 規格：openspec/changes/fe-o06-limit-source/specs/limit-source/spec.md
//   Requirement: 登入表單的暱稱欄真的拿到那些數字 —— S06、S07（S08 在 `login-form-limits-injected.test.tsx`：module mock 把上限換成 10）
//
// 長度用 `LIMITS.displayName.max` 算，**不寫 20**。受測的是真的 `LoginForm` ＋ 真的 HTTP server（看有沒有送請求）。
// **不連任何團隊共用的位址。**

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
const field = () => screen.getByLabelText('在世界裡顯示的名字') as HTMLInputElement
const button = () => screen.getByRole('button', { name: '進入世界' }) as HTMLButtonElement
const remaining = () => screen.getByTestId('nickname-remaining')

describe('暱稱欄的數字來自 LIMITS', () => {
  it('[FE-O06-S06] 超出上限：送出鈕禁用、沒有請求、剩餘字數是 −1', async () => {
    render(<LoginForm />)
    const max = LIMITS.displayName.max as number
    type(field(), '字'.repeat(max + 1))
    expect(button().disabled).toBe(true)
    expect(remaining().dataset.remaining).toBe('-1')
    expect(remaining().textContent).toContain('超過 1 字')
    act(() => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button().form?.requestSubmit?.()
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(server.calls, '超長還是送出了').toHaveLength(0)
    // 沒有原生 maxlength：輸入不會被截斷。
    expect(field().getAttribute('maxlength')).toBeNull()
    expect(field().value.length).toBe(max + 1)
  })

  it('[FE-O06-S07] 剛好上限的 emoji 可以送：剩餘 0、送出的 nickname 完整', async () => {
    server.reply(200, { id: '11111111-1111-1111-1111-111111111111', display_name: 'x', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' })
    render(<LoginForm />)
    const max = LIMITS.displayName.max as number
    const emoji = '😀'.repeat(max)
    expect(emoji.length, '.length 是上限的兩倍 —— 用它算會說超長').toBe(max * 2)
    type(field(), emoji)
    expect(remaining().dataset.remaining).toBe('0')
    expect(button().disabled).toBe(false)
    act(() => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => expect(server.calls).toHaveLength(1))
    expect(server.calls[0]?.body).toEqual({ nickname: emoji })
  })

  it('太短（含空）不禁用：按下去走 FE-A01-S02 的 alert（兩位審查者一致，規格修正 #343）', async () => {
    render(<LoginForm />)
    expect(button().disabled).toBe(false)
    expect(remaining().dataset.remaining).toBe(String(LIMITS.displayName.max))
  })
})
