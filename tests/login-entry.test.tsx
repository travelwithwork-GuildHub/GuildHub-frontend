import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { LoginForm } from '@/app/login/LoginForm'
import type { ClipboardPort } from '@/identity/clipboard'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a06-login-entry/specs/first-entry/spec.md
//   Requirement: 登入頁的每一條路都通到世界，而新建的名片要先帶走金鑰 —— S13 / S14 / S15 / S17
//
// 真的 `LoginForm` ＋ 真的 `src/identity/` ＋ 真的 HTTP server（本機自己起的 `contract-server`）。
// 只換掉導航：`useRouter().replace`／`push` 各自記下去哪裡 —— `S14` 要分得出「取代」與「推入」。
// 剪貼簿走 `clipboard` prop，跟 `tests/first-entry-flow.test.tsx` 同一種替身：注入的是「會成功／會失敗」，
// 不是一個 `toHaveBeenCalledWith` 的靶子。
//
// ⚠️ `S15`／`S17` 各自從全新狀態開始 —— 連著 `S13` 寫的話會沿用畫面，紅了分不清是哪一段。

const replaced: string[] = []
const pushed: string[] = []
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replaced.push(href), push: (href: string) => pushed.push(href) }),
}))

let server: ContractServer
// id 要含 16 進位的字母：尾碼比對「大小寫不一致也該通過」對全數字的 id 恆真（`first-entry-flow.test.tsx` 的教訓）。
const ME = 'abc1def2-3a4b-5c6d-7e8f-9012ab34cdef'
const PROFILE = { id: ME, display_name: '阿福', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
/** `seen.ts` 落地用的 key。規格逐字寫的是這個名字，所以判準也直接寫它。 */
const FIRST_ENTRY_DONE = 'guildhub.first-entry-done'

const workingClipboard: ClipboardPort = { async write() {} }
const brokenClipboard: ClipboardPort = {
  async write() {
    throw new Error('這個瀏覽器（或這個連線）不允許自動複製。')
  },
}

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
const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

/** 在 `/login` 用暱稱建立身分，走到顯示金鑰那一步。 */
async function reachKey(clipboard: ClipboardPort) {
  server.reply(200, PROFILE)
  render(<LoginForm clipboard={clipboard} />)
  type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
  click(screen.getByRole('button', { name: '進入世界' }))
  await waitFor(() => expect(screen.getByTestId('recovery-key').textContent).toBe(ME))
}
const enterButton = () => screen.getByRole('button', { name: '進入世界' }) as HTMLButtonElement
const proofField = () => screen.getByLabelText(/最後 6 個字/) as HTMLInputElement

describe('登入頁的每一條路都通到世界，而新建的名片要先帶走金鑰', () => {
  it('[FE-A06-S13] 暱稱路：金鑰與兩句警語在、「進入世界」鎖著、還沒記下走完；複製成功才開鎖，按下去取代成 /world 並記下', async () => {
    await reachKey(workingClipboard)
    expect(screen.getByText(/就能成為你/)).toBeDefined()
    expect(screen.getByText(/回不來/)).toBeDefined()
    expect(enterButton().disabled, '還沒帶走金鑰就能進世界').toBe(true)
    // **按之前不得記下** —— 擋的是「渲染金鑰畫面那一刻就 markFirstEntryDone()」的實作
    expect(localStorage.getItem(FIRST_ENTRY_DONE), '還沒走完就被記成走完了').toBeNull()

    click(screen.getByRole('button', { name: '複製鑰匙' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已經複製'))
    expect(enterButton().disabled).toBe(false)
    expect(replaced, '還沒按就離開了').toEqual([])

    click(enterButton())
    expect(replaced).toEqual(['/world'])
    expect(pushed, '該用取代不是推入').toEqual([])
    expect(localStorage.getItem(FIRST_ENTRY_DONE)).toBe('1')
  })

  it('[FE-A06-S13] 暱稱路：填對金鑰結尾 6 個字也開鎖', async () => {
    await reachKey(workingClipboard)
    expect(enterButton().disabled).toBe(true)
    type(proofField(), ME.slice(-6))
    expect(enterButton().disabled, '填對了尾碼卻仍鎖著').toBe(false)
    expect(localStorage.getItem(FIRST_ENTRY_DONE), '按之前就記下了').toBeNull()
    click(enterButton())
    expect(replaced).toEqual(['/world'])
    expect(localStorage.getItem(FIRST_ENTRY_DONE)).toBe('1')
  })

  it('[FE-A06-S14] 金鑰路：成功就取代成 /world，不顯示金鑰畫面、頁面上沒有那把金鑰', async () => {
    server.reply(200, PROFILE)
    render(<LoginForm clipboard={workingClipboard} />)
    type(screen.getByLabelText('貼上你的恢復金鑰'), ME)
    click(screen.getByRole('button', { name: '用金鑰回來' }))

    await waitFor(() => expect(replaced).toEqual(['/world']))
    expect(pushed, '登入頁不該留在返回鍵的歷史裡').toEqual([])
    // 送出去的是 resume_token：拿回既有的名片，不是建一張同名的新名片（`FE-A01-S17`）
    expect(server.calls[0]?.body).toEqual({ resume_token: ME })
    expect(screen.queryByTestId('recovery-key'), '金鑰路又把金鑰顯示了一次').toBeNull()
    expect(screen.queryByText(ME), '頁面上不該出現那把金鑰的文字').toBeNull()
    expect(screen.queryByRole('button', { name: '複製鑰匙' })).toBeNull()
  })

  it('[FE-A06-S15] 複製失敗：不說成功、仍鎖著、不離開；而且給得出手動保存的路與填回的入口', async () => {
    await reachKey(brokenClipboard)
    click(screen.getByRole('button', { name: '複製鑰匙' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('不允許自動複製'))
    expect(screen.queryByText(/已經複製/), '寫入失敗卻說已複製').toBeNull()
    expect(enterButton().disabled, '複製失敗卻放行了').toBe(true)
    expect(replaced, '複製失敗卻離開了登入頁').toEqual([])
    expect(pushed).toEqual([])
    expect(localStorage.getItem(FIRST_ENTRY_DONE)).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('自己選起來複製')
    expect(proofField(), '填回結尾的入口不在').toBeDefined()
  })

  it('[FE-A06-S17] 尾碼填錯：仍鎖著、說得出對不上、不離開', async () => {
    await reachKey(workingClipboard)
    type(proofField(), 'zzzzzz')

    expect(screen.getByRole('alert').textContent).toContain('對不上')
    expect(enterButton().disabled, '填錯了卻放行').toBe(true)
    expect(replaced, '填錯了卻離開了登入頁').toEqual([])
    expect(pushed).toEqual([])
    expect(localStorage.getItem(FIRST_ENTRY_DONE)).toBeNull()
  })
})
