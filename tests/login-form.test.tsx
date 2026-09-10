import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { LoginForm } from '@/app/login/LoginForm'
import { RECOVERY_KEY_STORAGE_KEY } from '@/identity/recoveryKey'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a01-login/specs/identity-session/spec.md
//   Requirement: 匿名暱稱登入建立一個身分 —— S01 / S02 / S03
//   Requirement: 恢復金鑰預設不落地，而且使用者知道它等同於身分 —— S07 / S09 / S17
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
  it('[FE-A01-S01] 輸入暱稱送出之後，畫面顯示的是那個名字', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByText('阿福')).toBeDefined())
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
    await waitFor(() => expect(screen.getByText('阿福')).toBeDefined())
  })

  it('[FE-A01-S09] 建立身分之後，金鑰看得到，而且兩句話都說了', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))

    // 金鑰本身 —— 沒勾記住的人也要拿得到
    await waitFor(() => expect(screen.getByTestId('recovery-key').textContent).toBe(ME))
    // 「取得金鑰的人就能成為你」
    expect(screen.getByText(/就能成為你/)).toBeDefined()
    // 「沒有備份、又清掉瀏覽器資料的話，這個身分回不來」
    expect(screen.getByText(/回不來/)).toBeDefined()
  })

  it('[FE-A01-S07] 記住我預設不勾，而且不勾就不落地', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    const remember = screen.getByLabelText('在這台裝置上記住我') as HTMLInputElement
    expect(remember.checked, '「記住我」預設是勾起來的').toBe(false)

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByTestId('recovery-key')).toBeDefined())
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBeNull()
  })

  it('[FE-A01-S07] 勾了就落地', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    submit(screen.getByLabelText('在這台裝置上記住我'))
    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByTestId('recovery-key')).toBeDefined())
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBe(ME)
  })

  it('[FE-A01-S17] 貼上一把金鑰就回得去', async () => {
    server.reply(200, profileNamed('阿福'))
    render(<LoginForm />)

    type(screen.getByLabelText('貼上你的恢復金鑰'), ME)
    submit(screen.getByRole('button', { name: '用金鑰回來' }))

    await waitFor(() => expect(screen.getByText('阿福')).toBeDefined())
    // **送出去的是 resume_token。** 只看畫面的話，一個改送 nickname 的
    // 實作會建一張新名片，而畫面長得一模一樣
    expect(server.calls[0]?.body).toEqual({ resume_token: ME })
  })

  it('[FE-A01-S10] 金鑰無效時，畫面說它無效，不是靜默進去', async () => {
    server.reply(404, { detail: '名片不存在' })
    render(<LoginForm />)

    type(screen.getByLabelText('貼上你的恢復金鑰'), '22222222-2222-2222-2222-222222222222')
    submit(screen.getByRole('button', { name: '用金鑰回來' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('不存在'))
    expect(screen.queryByTestId('recovery-key'), '無效的金鑰讓人進去了').toBeNull()
  })
})
