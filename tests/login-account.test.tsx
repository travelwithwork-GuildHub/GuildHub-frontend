import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { LoginForm } from '@/app/login/LoginForm'
import { VOCABULARY } from '@/errors/uiError'
import { RECOVERY_KEY_STORAGE_KEY } from '@/identity/recoveryKey'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a08-account-login/specs/account-login/spec.md
//   Requirement: 登入頁有帳號密碼的入口，匿名路仍是主路 —— S01、S12
//   Requirement: 註冊建立一張帶帳號密碼的名片，成功即登入 —— S02、S03、S04、S11、S13
//   Requirement: 帳號密碼登入驗證身分，錯了不透露哪一個錯 —— S05、S06、S07、S08、S14
//
// 真的 `LoginForm` ＋ 真的 `src/identity/` ＋ 真的 HTTP server（本機自己起的 `contract-server`）。**不連任何外部服務。**
// 只換掉導航：`useRouter().push` 記下去哪裡（測試環境沒有 Next 的 app router context）。

const pushed: string[] = []
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (href: string) => pushed.push(href), replace: () => {} }) }))

let server: ContractServer
const ME = { id: '11111111-1111-1111-1111-111111111111', display_name: '愛麗絲', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
  pushed.length = 0
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  localStorage.clear()
})

async function type(el: HTMLElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
const submit = (form: HTMLElement) =>
  act(async () => {
    ;(form as HTMLFormElement).requestSubmit()
  })

const section = () => screen.getByTestId('account-section')
const tab = (name: '登入' | '註冊') => within(section()).getByRole('button', { name }) as HTMLButtonElement
const loginForm = () => screen.getByTestId('account-login-form')
const registerForm = () => screen.getByTestId('account-register-form')
const field = (form: HTMLElement, label: string) => within(form).getByLabelText(label) as HTMLInputElement
const submitButton = (form: HTMLElement) => within(form).getByRole('button', { name: /登入|建立帳號/ }) as HTMLButtonElement
const posts = (path: string) => server.calls.filter((c) => c.method === 'POST' && c.pathname === path)
const alertIn = (form: HTMLElement) => within(form).getByRole('alert')

describe('登入頁有帳號密碼的入口，匿名路仍是主路', () => {
  it('[FE-A08-S01] 預設登入、切到註冊、切回來值還在；DOM 上一次只有一個；暱稱表單仍是第一個', async () => {
    render(<LoginForm />)
    expect(screen.queryByTestId('account-login-form')).not.toBeNull()
    expect(screen.queryByTestId('account-register-form'), '註冊表單不該在 DOM 上').toBeNull()
    expect(tab('登入').getAttribute('aria-pressed')).toBe('true')
    expect(tab('註冊').getAttribute('aria-pressed')).toBe('false')
    await type(field(loginForm(), '帳號'), 'alice')
    click(tab('註冊'))
    expect(screen.queryByTestId('account-register-form')).not.toBeNull()
    expect(screen.queryByTestId('account-login-form'), '登入表單該離開 DOM（不是 hidden）').toBeNull()
    expect(tab('註冊').getAttribute('aria-pressed')).toBe('true')
    click(tab('登入'))
    expect(field(loginForm(), '帳號').value, '切回來值不見了').toBe('alice')
    // 反方向也要保值：註冊三欄填好、切走、切回來。
    click(tab('註冊'))
    await type(field(registerForm(), '帳號'), 'new-user')
    await type(field(registerForm(), '密碼'), 'correct horse')
    await type(field(registerForm(), '在世界裡顯示的名字（註冊）'), '愛麗絲')
    click(tab('登入'))
    expect(field(loginForm(), '帳號').value).toBe('alice')
    click(tab('註冊'))
    expect(field(registerForm(), '帳號').value).toBe('new-user')
    expect(field(registerForm(), '密碼').value).toBe('correct horse')
    expect(field(registerForm(), '在世界裡顯示的名字（註冊）').value).toBe('愛麗絲')
    // 勾「顯示密碼」（別的 state 重繪）不會把剛打的字蓋回舊值。
    await type(field(registerForm(), '帳號'), 'newer-user')
    click(within(section()).getByLabelText('顯示密碼'))
    expect(field(registerForm(), '帳號').value).toBe('newer-user')
    click(within(section()).getByLabelText('顯示密碼'))
    click(tab('登入'))
    const forms = document.querySelectorAll('form')
    expect(forms[0]?.getAttribute('aria-labelledby'), '暱稱表單要是第一個').toBe('nickname-heading')
    // 兩個含密碼欄的表單不同時在 DOM 上。
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(1)
  })

  /** 四種 pending 的來源：怎麼填、怎麼送、回什麼。 */
  const PENDING_SOURCES: Array<[string, () => Promise<HTMLFormElement>]> = [
    [
      '暱稱表單',
      async () => {
        const form = (screen.getByRole('button', { name: '進入世界' }) as HTMLButtonElement).form as HTMLFormElement
        await type(within(form).getByLabelText('在世界裡顯示的名字'), '阿福')
        return form
      },
    ],
    [
      '金鑰表單',
      async () => {
        const form = (screen.getByRole('button', { name: '用金鑰回來' }) as HTMLButtonElement).form as HTMLFormElement
        await type(within(form).getByLabelText('貼上你的恢復金鑰'), ME.id)
        return form
      },
    ],
    [
      '帳號登入表單',
      async () => {
        await type(field(loginForm(), '帳號'), 'alice')
        await type(field(loginForm(), '密碼'), 'wrong-pass')
        return loginForm() as HTMLFormElement
      },
    ],
    [
      '註冊表單',
      async () => {
        click(tab('註冊'))
        await type(field(registerForm(), '帳號'), 'alice')
        await type(field(registerForm(), '密碼'), 'correct horse')
        await type(field(registerForm(), '在世界裡顯示的名字（註冊）'), '愛麗絲')
        return registerForm() as HTMLFormElement
      },
    ],
  ]
  for (const [source, prepare] of PENDING_SOURCES) {
    it(`[FE-A08-S12] ${source}送出中：當下三個送出鈕與兩個切換鈕都禁用；回來之後恢復、alert 在那個表單裡`, async () => {
      render(<LoginForm />)
      const form = await prepare()
      let release: (() => void) | null = null
      server.reply(403, { detail: '後端寫的字' }, { after: new Promise<void>((r) => (release = r)) })
      await submit(form)
      const submitButtons = () => [...document.querySelectorAll('form button[type="submit"]')] as HTMLButtonElement[]
      expect(submitButtons()).toHaveLength(3)
      for (const b of submitButtons()) expect(b.disabled, `${b.textContent} 沒鎖`).toBe(true)
      expect(tab('登入').disabled).toBe(true)
      expect(tab('註冊').disabled, '送出中還能切走').toBe(true)
      await act(async () => release?.())
      await waitFor(() => expect(within(form).queryByRole('alert')).not.toBeNull())
      for (const b of submitButtons()) expect(b.disabled, `${b.textContent} 回來沒恢復`).toBe(false)
      expect(tab('登入').disabled).toBe(false)
      expect(tab('註冊').disabled).toBe(false)
    })
  }
})

describe('註冊建立一張帶帳號密碼的名片，成功即登入', () => {
  const openRegister = () => {
    render(<LoginForm />)
    click(tab('註冊'))
    return registerForm()
  }

  it('[FE-A08-S02] body 正好三鍵、大小寫原樣；成功導向 /world、不顯示金鑰畫面、舊金鑰被清掉', async () => {
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, '22222222-2222-2222-2222-222222222222')
    const form = openRegister()
    await type(field(form, '帳號'), 'Alice_01')
    await type(field(form, '密碼'), 'correct horse')
    await type(field(form, '在世界裡顯示的名字（註冊）'), '愛麗絲')
    server.reply(200, ME)
    await submit(form)
    await waitFor(() => expect(pushed).toEqual(['/world']))
    expect(posts('/api/register')).toHaveLength(1)
    expect(posts('/api/register')[0]?.body).toEqual({ login_id: 'Alice_01', password: 'correct horse', nickname: '愛麗絲' })
    expect(screen.queryByTestId('recovery-key'), '有密碼的人不看金鑰畫面').toBeNull()
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY), '沒勾記住我：舊金鑰也要清掉').toBeNull()
  })

  it('[FE-A08-S03] 帳號已存在：alert 逐字是前端的那一句、值不變、焦點在 alert', async () => {
    const form = openRegister()
    await type(field(form, '帳號'), 'alice')
    await type(field(form, '密碼'), 'correct horse')
    await type(field(form, '在世界裡顯示的名字（註冊）'), '愛麗絲')
    server.reply(409, { detail: '後端寫的字' })
    await submit(form)
    const alert = await within(form).findByRole('alert')
    expect(alert.textContent?.trim()).toBe('這個帳號已經有人用了。')
    expect(field(form, '帳號').value).toBe('alice')
    expect(field(form, '密碼').value).toBe('correct horse')
    expect(field(form, '在世界裡顯示的名字（註冊）').value).toBe('愛麗絲')
    expect(screen.queryByTestId('account-register-form'), '失敗後表單不見了').not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(alert))
    expect(pushed).toEqual([])
  })

  it('[FE-A08-S04] 太短送出才說（焦點到第一個錯的）、超過上限即時擋、password 沒上限、長度是 code point', async () => {
    const form = openRegister()
    await type(field(form, '帳號'), 'ab')
    await type(field(form, '密碼'), '1234567')
    await act(async () => {})
    expect(within(form).queryByTestId('account-register-form-error-login_id')).toBeNull()
    expect(within(form).queryByTestId('account-register-form-error-password')).toBeNull()
    expect(submitButton(form).disabled).toBe(false)
    await submit(form)
    await waitFor(() => expect(within(form).queryByTestId('account-register-form-error-login_id')).not.toBeNull())
    expect(within(form).queryByTestId('account-register-form-error-password')).not.toBeNull()
    expect(within(form).queryByTestId('account-register-form-error-nickname')).not.toBeNull()
    expect(document.activeElement).toBe(field(form, '帳號'))
    expect(posts('/api/register')).toHaveLength(0)
    await type(field(form, '帳號'), 'x'.repeat(33))
    await type(field(form, '在世界裡顯示的名字（註冊）'), '字'.repeat(21))
    await waitFor(() => expect(within(form).getByTestId('account-register-form-error-login_id').textContent).toContain('32'))
    expect(within(form).getByTestId('account-register-form-error-nickname').textContent).toContain('20')
    expect(submitButton(form).disabled).toBe(true)
    await type(field(form, '密碼'), 'p'.repeat(200))
    await act(async () => {})
    expect(within(form).queryByTestId('account-register-form-error-password'), '密碼沒有上限').toBeNull()
    // code point：32 個 emoji（.length 64）、20 個 emoji 都合法。
    await type(field(form, '帳號'), '😀'.repeat(32))
    await type(field(form, '在世界裡顯示的名字（註冊）'), '😀'.repeat(20))
    await waitFor(() => expect(within(form).queryByTestId('account-register-form-error-login_id')).toBeNull())
    expect(within(form).queryByTestId('account-register-form-error-nickname'), '用 .length 算的實作在這裡會擋').toBeNull()
    expect(submitButton(form).disabled).toBe(false)
  })

  it('[FE-A08-S13] 顯示密碼切換：type 在 password／text 之間切、值不變', async () => {
    const form = openRegister()
    await type(field(form, '密碼'), 'correct horse')
    expect(field(form, '密碼').type).toBe('password')
    click(within(section()).getByLabelText('顯示密碼'))
    expect(field(form, '密碼').type).toBe('text')
    expect(field(form, '密碼').value).toBe('correct horse')
    click(within(section()).getByLabelText('顯示密碼'))
    expect(field(form, '密碼').type).toBe('password')
  })

  it('[FE-A08-S11] 註冊時 500：toUiError 的那一句、值保留、再送再打一次（login_id 帶空白：原值原樣）', async () => {
    const form = openRegister()
    await type(field(form, '帳號'), ' alice ')
    await type(field(form, '密碼'), 'correct horse')
    await type(field(form, '在世界裡顯示的名字（註冊）'), '愛麗絲')
    server.reply(500, { detail: '壞了' })
    await submit(form)
    const alert = await within(form).findByRole('alert')
    expect(alert.textContent?.trim()).toBe(VOCABULARY['server-error'])
    expect(field(form, '帳號').value).toBe(' alice ')
    expect(posts('/api/register')[0]?.body, '前端 trim 了 login_id —— 後端沒有這條規則，註冊與登入會對不上').toMatchObject({ login_id: ' alice ' })
    server.reply(200, ME)
    await submit(form)
    await waitFor(() => expect(posts('/api/register')).toHaveLength(2))
  })
})

describe('帳號密碼登入驗證身分，錯了不透露哪一個錯', () => {
  const fill = async (loginId: string, password: string) => {
    await type(field(loginForm(), '帳號'), loginId)
    await type(field(loginForm(), '密碼'), password)
  }

  it('[FE-A08-S05] 密碼錯：alert 逐字是前端的那一句、body 正好兩鍵；換一個 detail 畫面一樣', async () => {
    render(<LoginForm />)
    await fill('alice', 'wrong-pass')
    server.reply(403, { detail: '後端寫的字 A' })
    await submit(loginForm())
    const first = (await within(loginForm()).findByRole('alert')).textContent?.trim()
    expect(first).toBe('帳號或密碼錯誤。')
    expect(posts('/api/login')).toHaveLength(1)
    expect(posts('/api/login')[0]?.body).toEqual({ login_id: 'alice', password: 'wrong-pass' })
    cleanup()
    render(<LoginForm />)
    await fill('nobody', 'wrong-pass')
    server.reply(403, { detail: '後端寫的字 B' })
    await submit(loginForm())
    const second = (await within(loginForm()).findByRole('alert')).textContent?.trim()
    expect(second).toBe(first)
  })

  it('[FE-A08-S06] 失敗後兩欄的值都在（含密碼）、焦點在 alert；改對再送就導向 /world', async () => {
    render(<LoginForm />)
    await fill('alice', 'wrong-pass')
    server.reply(403, { detail: 'x' })
    await submit(loginForm())
    const alert = await within(loginForm()).findByRole('alert')
    expect(field(loginForm(), '帳號').value).toBe('alice')
    expect(field(loginForm(), '密碼').value, '失敗清了密碼欄 —— FE-X05 的全站規則是保留').toBe('wrong-pass')
    await waitFor(() => expect(document.activeElement).toBe(alert))
    await type(field(loginForm(), '密碼'), 'right-pass')
    server.reply(200, ME)
    await submit(loginForm())
    await waitFor(() => expect(pushed).toEqual(['/world']))
    expect(posts('/api/login')).toHaveLength(2)
    expect(posts('/api/login')[1]?.body).toEqual({ login_id: 'alice', password: 'right-pass' })
    expect(screen.queryByTestId('recovery-key')).toBeNull()
  })

  it('[FE-A08-S07] 勾了記住我就落地；沒勾就清掉舊的', async () => {
    render(<LoginForm />)
    click(screen.getByLabelText('在這台裝置上記住我'))
    await fill('alice', 'right-pass')
    server.reply(200, ME)
    await submit(loginForm())
    await waitFor(() => expect(pushed).toEqual(['/world']))
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBe(ME.id)
    cleanup()
    pushed.length = 0
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, '22222222-2222-2222-2222-222222222222')
    render(<LoginForm />)
    await fill('alice', 'right-pass')
    server.reply(200, ME)
    await submit(loginForm())
    await waitFor(() => expect(pushed).toEqual(['/world']))
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBeNull()
  })

  it('[FE-A08-S08] 500 與連不上：toUiError 的句子、值保留', async () => {
    render(<LoginForm />)
    await fill('alice', 'right-pass')
    server.reply(500, { detail: '壞了' })
    await submit(loginForm())
    expect((await within(loginForm()).findByRole('alert')).textContent?.trim()).toBe(VOCABULARY['server-error'])
    expect(field(loginForm(), '密碼').value).toBe('right-pass')
    await server.close()
    await submit(loginForm())
    await waitFor(() => expect(alertIn(loginForm()).textContent?.trim()).toBe(VOCABULARY['network-unavailable']))
    server = await startContractServer() // 給 afterEach 關
  })

  it('[FE-A08-S14] 登入表單的太短不送、超長即時擋', async () => {
    render(<LoginForm />)
    await fill('ab', '1234567')
    await submit(loginForm())
    await waitFor(() => expect(within(loginForm()).queryByTestId('account-login-form-error-login_id')).not.toBeNull())
    expect(within(loginForm()).queryByTestId('account-login-form-error-password')).not.toBeNull()
    expect(posts('/api/login')).toHaveLength(0)
    await type(field(loginForm(), '帳號'), 'x'.repeat(33))
    await waitFor(() => expect(within(loginForm()).getByTestId('account-login-form-error-login_id').textContent).toContain('32'))
    expect(submitButton(loginForm()).disabled).toBe(true)
  })
})
