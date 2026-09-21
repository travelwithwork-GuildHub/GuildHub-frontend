import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { FirstEntryFlow } from '@/first-entry/FirstEntryFlow'
import type { Identity } from '@/identity/types'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/specs/first-entry/spec.md（`fe-a06-first-entry`，2026-09-21 反轉）
//   Requirement: 網站的根路徑是一條走得完的路 —— `FE-A06-S02`（送出合法名字直接進、中間無金鑰步驟）
//
// ⚠️ **原本〈金鑰要真的被帶走〉整組（`FE-A06-S07`～`S12`）已隨恢復金鑰機制退場而移除。**
// 現在的流程只有一步：取名字 → 直接 `onDone`。這裡驗「送出合法名字就交出身分、畫面上不出現任何金鑰」。

let server: ContractServer
const ME = 'abc1def2-3a4b-5c6d-7e8f-9012ab34cdef'
const PROFILE = { id: ME, display_name: '阿福', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }

let done: Array<Extract<Identity, { state: 'signed-in' }>> = []
const mount = () => render(<FirstEntryFlow onDone={(id) => done.push(id)} />)

function type(field: HTMLElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const submit = () => click(screen.getByRole('button', { name: '進入世界' }))

beforeEach(async () => {
  done = []
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})

afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
})

describe('取一個名字就直接進世界', () => {
  it('[FE-A06-S02] 送出合法名字 → 直接交出身分，中間沒有金鑰畫面', async () => {
    server.reply(200, PROFILE)
    mount()
    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit()

    await waitFor(() => expect(done).toHaveLength(1))
    expect(done[0]?.profile.display_name).toBe('阿福')
    // 「中間 SHALL NOT 出現要求帶走金鑰的步驟」：整段流程裡不得出現金鑰、複製、尾碼那些字。
    expect(screen.queryByTestId('recovery-key'), '不該再顯示恢復金鑰').toBeNull()
    expect(screen.queryByRole('button', { name: '複製鑰匙' }), '不該有複製鑰匙的按鈕').toBeNull()
    expect(screen.queryByText(/最後 6 個字/), '不該要求填回尾碼').toBeNull()
  })

  it('[FE-A06-S02] 不合法的名字：不交出身分，畫面說出長度問題', async () => {
    mount()
    // 空字串：一個請求都不送、onDone 不被呼叫、alert 說長度
    submit()
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(done, '不合法卻進去了').toHaveLength(0)
    expect(server.calls, '不合法的名字送出了請求').toHaveLength(0)
  })

  it('[FE-A06-S02] 後端 500 時不交出身分，值還在、可以直接再試一次', async () => {
    server.reply(500, { detail: '壞掉了' })
    mount()
    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    submit()
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(done).toHaveLength(0)

    // 再試一次就成功（輸入框的值還在）
    server.reply(200, PROFILE)
    submit()
    await waitFor(() => expect(done).toHaveLength(1))
  })
})
