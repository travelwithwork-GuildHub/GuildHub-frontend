import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { z } from 'zod'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { LoginForm } from '@/app/login/LoginForm'
import { VOCABULARY } from '@/errors/uiError'
import { startContractServer, type ContractServer } from './support/contract-server'
import { send } from '@/api/transport'

// 規格：openspec/changes/fe-x05-form-conventions/specs/form-conventions/spec.md
//   Requirement: 驗證時機是全站規則 —— S01、S02、S03、S04、S14
//   Requirement: 送出中、失敗、重試 —— S05、S06、S07（＋ `describeError` 的兩個分支、一個表單一個 alert）
//   Requirement: `LoginForm` 遷到同一套，行為不變 —— S13（全綠那一半是 `tests/login-form*.test.tsx` 自己）
//
// 受測的是 `useForm` 封裝（真的 react-hook-form ＋ Zod）。Fixture 表單：兩個必填（a、b）、一個下限 3（c）、一個上限 20（d）、一個 number（n）。
// 送出走真的 transport 到 `contract-server`（本機自己起的 HTTP server）—— 數的是後端收到幾個請求。**不連任何外部服務。**

const Schema = z.object({
  a: z.string().min(1, { error: 'a 必填' }),
  b: z.string().min(1, { error: 'b 必填' }),
  c: z.string().min(3, { error: 'c 至少 3 字' }),
  d: z.string().max(20, { error: 'd 最多 20 字' }),
  n: z
    .string()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(z.number().int({ error: 'n 要是整數' }).min(0).max(80, { error: 'n 最多 80' }).nullable()),
})

class DomainError extends Error {
  override name = 'DomainError'
}

function Fixture({ onSent, describeError }: { onSent?: (count: number) => void; describeError?: (cause: unknown) => string | null }) {
  const { form, visibleErrors, canSubmit, busy, submitError, onSubmit } = useForm({
    schema: Schema,
    defaultValues: { a: '', b: '', c: '', d: '', n: '' },
    onSubmit: async (values) => {
      if (values.a === 'domain') throw new DomainError('detail from server')
      await send('fixture', { method: 'POST', path: '/api/login', body: { nickname: values.a } }, z.unknown())
      onSent?.(1)
    },
    describeError,
  })
  // 規格：欄位錯誤用 aria-invalid ＋ aria-describedby 掛到欄位，不各自 role=alert。
  const field = (name: 'a' | 'b' | 'c' | 'd' | 'n') => (
    <div>
      <input {...form.register(name)} aria-label={name} aria-invalid={visibleErrors[name] ? true : undefined} aria-describedby={visibleErrors[name] ? `error-${name}` : undefined} />
      {visibleErrors[name] && (
        <span id={`error-${name}`} data-testid={`error-${name}`}>
          {visibleErrors[name]}
        </span>
      )}
    </div>
  )
  return (
    <form onSubmit={onSubmit} noValidate>
      {field('a')}
      {field('b')}
      {field('c')}
      {field('d')}
      {field('n')}
      <SubmitError message={submitError} />
      <button type="submit" disabled={!canSubmit}>
        {busy ? '送出中' : '送出'}
      </button>
    </form>
  )
}

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
})

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement
const button = () => screen.getByRole('button') as HTMLButtonElement
const error = (name: string) => screen.queryByTestId(`error-${name}`)
async function type(name: string, value: string) {
  const el = input(name)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () => {
    button().form?.requestSubmit()
  })
}
const fill = async () => {
  await type('a', 'x')
  await type('b', 'y')
  await type('c', 'abc')
}

describe('驗證時機', () => {
  it('[FE-X05-S01] 超過上限即時顯示、送出禁用；刪回去就消失', async () => {
    render(<Fixture />)
    await type('d', '字'.repeat(21))
    await waitFor(() => expect(error('d')?.textContent).toBe('d 最多 20 字'))
    expect(button().disabled).toBe(true)
    // 錯誤文字跟欄位有無障礙關聯：aria-describedby 指到那個元素、aria-invalid 是 true。
    expect(input('d').getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input('d').getAttribute('aria-describedby') ?? '')).toBe(error('d'))
    await type('d', '字'.repeat(20))
    await waitFor(() => expect(error('d')).toBeNull())
    expect(button().disabled).toBe(false)
  })

  it('[FE-X05-S02] 太短要按下去才說：按前沒錯誤、可按；按後錯誤、沒請求、焦點到欄位、鈕仍可按', async () => {
    render(<Fixture />)
    await type('b', 'y')
    await type('c', 'abc')
    expect(error('a')).toBeNull()
    expect(button().disabled).toBe(false)
    await submit()
    await waitFor(() => expect(error('a')?.textContent).toBe('a 必填'))
    expect(server.calls).toHaveLength(0)
    expect(document.activeElement).toBe(input('a'))
    expect(button().disabled, '送出過之後鈕還是要可按').toBe(false)
  })

  it('[FE-X05-S03] 送出過一次之後，錯誤隨輸入更新（不必再按）', async () => {
    render(<Fixture />)
    await type('b', 'y')
    await type('c', 'abc')
    await submit()
    await waitFor(() => expect(error('a')).not.toBeNull())
    await type('a', 'x')
    await waitFor(() => expect(error('a')).toBeNull())
  })

  it('[FE-X05-S04] 焦點到第一個錯誤欄位（DOM 順序）', async () => {
    render(<Fixture />)
    await type('c', 'abc')
    await submit()
    await waitFor(() => expect(error('b')).not.toBeNull())
    expect(document.activeElement).toBe(input('a'))
  })

  it('[FE-X05-S14] 下限 3：送出前不說、送出擋、2 字錯誤留著、3 字才消失', async () => {
    render(<Fixture />)
    await type('a', 'x')
    await type('b', 'y')
    await type('c', 'ab')
    expect(error('c')).toBeNull()
    expect(button().disabled).toBe(false)
    await submit()
    await waitFor(() => expect(error('c')?.textContent).toBe('c 至少 3 字'))
    expect(server.calls).toHaveLength(0)
    await type('c', 'a')
    await type('c', 'ab')
    await waitFor(() => expect(error('c')).not.toBeNull())
    await type('c', 'abc')
    await waitFor(() => expect(error('c')).toBeNull())
  })
})

describe('送出中、失敗、重試', () => {
  it('[FE-X05-S05] 連按兩次只送一次；busy 在 submit 的當下就生效', async () => {
    server.reply(200, { ok: true })
    render(<Fixture />)
    await fill()
    // 同步的 act：resolver 還沒跑完，鈕就已經 disabled（規格「送出開始 SHALL 立刻進入 busy」）。
    act(() => {
      button().form?.requestSubmit()
    })
    expect(button().disabled, 'busy 等到 resolver 跑完才生效').toBe(true)
    await act(async () => {
      button().form?.requestSubmit()
    })
    await waitFor(() => expect(server.calls).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 100))
    expect(server.calls).toHaveLength(1)
  })

  it('[FE-X05-S06] 失敗留值、alert 在送出鈕上方且取得焦點、再按就重試', async () => {
    server.reply(500, '壞了')
    server.reply(200, { ok: true })
    render(<Fixture />)
    await fill()
    await type('d', '保留我')
    await submit()
    const alert = await screen.findByRole('alert')
    expect(input('d').value).toBe('保留我')
    expect(alert.compareDocumentPosition(button()) & Node.DOCUMENT_POSITION_FOLLOWING, 'alert 要在送出鈕之前').toBeTruthy()
    expect(document.activeElement).toBe(alert)
    expect(alert.textContent?.length).toBeGreaterThan(0)
    await submit()
    await waitFor(() => expect(server.calls).toHaveLength(2))
  })

  it('[FE-X05-S07] 不自動重送', async () => {
    server.reply(500, '壞了')
    render(<Fixture />)
    await fill()
    await submit()
    await screen.findByRole('alert')
    await new Promise((r) => setTimeout(r, 300))
    expect(server.calls).toHaveLength(1)
  })

  it('describeError 回字串就用它；回 null 退回 toUiError；欄位錯誤不是 alert（一個表單一個 alert）', async () => {
    server.reply(500, '壞了')
    const describe = (cause: unknown) => (cause instanceof DomainError ? '前端自己寫的一句話' : null)
    render(<Fixture describeError={describe} />)
    await fill()
    await type('a', 'domain')
    await submit()
    expect((await screen.findByRole('alert')).textContent).toBe('前端自己寫的一句話')
    // 領域錯誤沒送請求；換成一般值 → 500 → 走 toUiError 的語彙，不是 describeError、不是後端的字。
    expect(server.calls).toHaveLength(0)
    await type('a', 'x')
    await submit()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(VOCABULARY['server-error']))
    // 同時把一個欄位弄成即時錯誤：欄位錯誤顯示了，但 alert 仍只有一個。
    await type('d', '字'.repeat(21))
    expect(error('d')).not.toBeNull()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})

describe('LoginForm 遷到同一套', () => {
  it('[FE-X05-S13] 暱稱欄由 RHF 註冊：input 有 name="nickname"；金鑰欄也有 name', () => {
    render(<LoginForm />)
    expect((screen.getByLabelText('在世界裡顯示的名字') as HTMLInputElement).name).toBe('nickname')
    expect((screen.getByLabelText('貼上你的恢復金鑰') as HTMLInputElement).name).toBe('key')
    // 兩個表單、還沒失敗：沒有任何 alert（欄位提示不是 alert）。
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })
})

describe('巢狀欄位', () => {
  const Nested = z.object({ p: z.object({ q: z.string().max(3, { error: 'q 最多 3 字' }) }), list: z.array(z.string().max(2, { error: '項目最多 2 字' })) })
  function NestedFixture() {
    const { form, visibleErrors, canSubmit } = useForm({ schema: Nested, defaultValues: { p: { q: '' }, list: ['', ''] }, onSubmit: async () => {} })
    return (
      <form noValidate>
        <input {...form.register('p.q')} aria-label="p.q" />
        <input {...form.register('list.1')} aria-label="list.1" />
        <span data-testid="error-p.q">{visibleErrors['p.q']}</span>
        <span data-testid="error-list.1">{visibleErrors['list.1']}</span>
        <button type="submit" disabled={!canSubmit}>
          送出
        </button>
      </form>
    )
  }
  it('巢狀物件與陣列的即時錯誤：路徑對得上 register、也算進禁用（審查抓到只看頂層）', async () => {
    render(<NestedFixture />)
    await type('p.q', '四個字了')
    await waitFor(() => expect(screen.getByTestId('error-p.q').textContent).toBe('q 最多 3 字'))
    expect(button().disabled).toBe(true)
    await type('p.q', '三個字')
    await waitFor(() => expect(screen.getByTestId('error-p.q').textContent).toBe(''))
    expect(button().disabled).toBe(false)
    await type('list.1', '三個字')
    await waitFor(() => expect(screen.getByTestId('error-list.1').textContent).toBe('項目最多 2 字'))
    expect(button().disabled).toBe(true)
  })
})
