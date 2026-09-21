import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { LoginForm } from '@/app/login/LoginForm'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/specs/first-entry/spec.md（`fe-a06-first-entry`，2026-09-21 反轉）
//   Requirement: 登入頁的暱稱路直接進世界 —— `FE-A06-S18`
//
// ⚠️ **原本〈登入頁每條路…帶走金鑰〉整組（`FE-A06-S13`～`S17`，含「貼上恢復金鑰」）已隨恢復金鑰機制退場而移除。**
// 現在 `/login` 的暱稱路：送出合法名字 → 直接 `replace('/world')`、記下走完，頁面上不出現金鑰、也沒有「貼上恢復金鑰」入口。
// 帳密路（`FE-A08`）另有測試。只換掉導航：`replace`／`push` 各自記下去哪裡。

const replaced: string[] = []
const pushed: string[] = []
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replaced.push(href), push: (href: string) => pushed.push(href) }),
}))

let server: ContractServer
const ME = 'abc1def2-3a4b-5c6d-7e8f-9012ab34cdef'
const PROFILE = { id: ME, display_name: '阿福', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
/** `seen.ts` 落地用的 key。規格逐字寫的是這個名字，所以判準也直接寫它。 */
const FIRST_ENTRY_DONE = 'guildhub.first-entry-done'

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
  replaced.length = 0
  pushed.length = 0
})
afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  localStorage.clear()
})

function type(field: HTMLElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('登入頁的暱稱路直接進世界', () => {
  it('[FE-A06-S18] 暱稱路：送出合法名字 → 直接取代成 /world、記下走完，頁面上沒有金鑰', async () => {
    server.reply(200, PROFILE)
    render(<LoginForm />)
    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    click(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(replaced).toEqual(['/world']))
    expect(pushed, '暱稱路該用取代不是推入').toEqual([])
    expect(localStorage.getItem(FIRST_ENTRY_DONE), '走完了才記下').toBe('1')
    // 中間沒有金鑰畫面：不出現金鑰、複製鑰匙、填回尾碼那些字
    expect(screen.queryByTestId('recovery-key')).toBeNull()
    expect(screen.queryByText(ME), '頁面上不該出現金鑰的文字').toBeNull()
    expect(screen.queryByRole('button', { name: '複製鑰匙' })).toBeNull()
  })

  it('[FE-A06-S18] `/login` 不再有「貼上恢復金鑰」的入口', () => {
    render(<LoginForm />)
    expect(screen.queryByLabelText('貼上你的恢復金鑰'), '恢復金鑰貼上表單已移除').toBeNull()
    expect(screen.queryByRole('button', { name: '用金鑰回來' })).toBeNull()
  })
})
