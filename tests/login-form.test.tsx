import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { LoginForm } from '@/app/login/LoginForm'
import { startContractServer, type ContractServer } from './support/contract-server'

// `LoginForm` 有 `useRouter()`（暱稱／帳密成功導向 `/world`）；測試環境沒有 Next 的 app router context —— 只換掉導航。
// 暱稱路成功 `replace('/world')`，所以 `replace` 記下去哪裡；push 這裡用不到。
const replaced: string[] = []
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: (href: string) => replaced.push(href) }) }))


// 規格：openspec/specs/identity-session/spec.md、openspec/specs/first-entry/spec.md
//   Requirement: 匿名暱稱登入建立一個身分 —— S01 / S02 / S03
//   Requirement: 登入頁的暱稱路直接進世界（`FE-A06-S18`，2026-09-21 反轉）
//
// ⚠️ 恢復金鑰相關（`FE-A01-S07`／`S09`／`S10`／`S17`）已隨機制退場而移除：暱稱路成功直接進世界，沒有金鑰畫面。
//
// ⚠️ **受測的是真的 `LoginForm` ＋ 真的 `src/identity/` ＋ 真的 HTTP server。**
// 沒有 mock 掉 `signInWithNickname` —— mock 掉的話，這個檔案驗的是
// 「我有沒有呼叫我自己寫的那個假貨」，而拔掉正式碼的功能照樣綠。

let server: ContractServer

const ME = '11111111-1111-1111-1111-111111111111'
const profileNamed = (name: string) => ({
  id: ME,
  display_name: name,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
})

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
  replaced.length = 0
})

afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  localStorage.clear()
})

/** 直接改 DOM 的 value 再送出 —— 不重刻一份 change 事件的語意。 */
function type(field: HTMLElement, value: string) {
  const input = field as HTMLInputElement
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function submit(button: HTMLElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('登入畫面', () => {
  it('[FE-A01-S01] 輸入暱稱送出之後，送出的是那個名字，並直接進世界', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(replaced).toEqual(['/world']))
    expect(server.calls[0]?.body).toEqual({ nickname: '阿福' })
  })

  it('[FE-A01-S02] 空暱稱送出：畫面說出是長度的問題，而且沒有送出請求', async () => {
    render(<LoginForm />)

    submit(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('20'))
    expect(server.calls, '空暱稱送出了請求').toHaveLength(0)
  })

  it('[FE-A01-S03] 後端失敗之後，輸入的暱稱還在，可以直接再按一次', async () => {
    server.reply(500, { detail: '壞掉了' })
    render(<LoginForm />)

    const field = screen.getByLabelText('在世界裡顯示的名字') as HTMLInputElement
    type(field, '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())

    // **這一行是這條的重點。** 清空輸入框的實作也會顯示錯誤訊息，
    // 但使用者得重打一次 —— 而規格要求「不需要重新輸入暱稱」
    expect(field.value, '失敗之後輸入框被清空了').toBe('阿福')

    server.reply(200, profileNamed('阿福'))
    submit(screen.getByRole('button', { name: '進入世界' }))
    await waitFor(() => expect(replaced).toEqual(['/world']))
  })

  it('[FE-A06-S18] 暱稱路送出後直接進世界，畫面上沒有金鑰', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(replaced).toEqual(['/world']))
    // 恢復金鑰退場：不再顯示金鑰、也沒有「記住我」勾選框、沒有「貼上恢復金鑰」入口
    expect(screen.queryByTestId('recovery-key')).toBeNull()
    expect(screen.queryByLabelText('在這台裝置上記住我')).toBeNull()
    expect(screen.queryByLabelText('貼上你的恢復金鑰')).toBeNull()
  })
})
