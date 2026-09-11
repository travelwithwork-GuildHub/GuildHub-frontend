'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useWatch, type FieldPath, type FieldValues } from 'react-hook-form'
import { z } from 'zod'
import { registerAccount, signInWithNickname, signInWithPassword, signInWithRecoveryKey } from '@/identity/session'
import { CredentialsRejectedError, LoginIdTakenError, NicknameLengthError, RecoveryKeyRejectedError, type Identity } from '@/identity/types'
import { CHECK_ROW, FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { LIMITS, remaining, violates } from '@/api/contract/limits'
import { useForm, type FormApi } from '@/forms/useForm'
import { SubmitError } from '@/forms/SubmitError'

// 登入畫面。規格 `FE-A01-S01`／`S02`／`S03`／`S07`／`S09`／`S17`。
//
// ⚠️ **這個元件不自己判斷任何規則。** 長度、金鑰有沒有效、要不要落地 ——
// 全部在 `src/identity/`，而那一層有 19 條判準守著。
// 在這裡再寫一次「長度要 1 到 20」的話，兩份會漂，
// 而症狀是「畫面說可以、送出去卻被擋」。
//
// 暱稱欄的剩餘字數與「超出就不能送」（規格 `FE-O06`〈登入表單的暱稱欄真的拿到那些數字〉）：數字從 `LIMITS.displayName`、
// 算法用 `remaining`／`violates`（code point）—— 同一份來源，不是第二份規則。**不用原生 `maxlength`**：它數 UTF-16 code unit，
// 20 個 emoji 在第 10 個就被擋，而後端收得下 20 個。
//
// ⚠️ **失敗之後輸入框不清空**（`S03`：「使用者 SHALL 能再試一次，
// 而不需要重新輸入暱稱」）。`useForm` 失敗時不 reset —— 這是**被要求的行為**，不是實作細節，判準守著它。
//
// 表單機制走 `src/forms/useForm`（規格 `FE-X05`〈`LoginForm` 遷到同一套，行為不變〉、`S13`）：欄位由 RHF `register`（所以 input 有 `name`）、
// schema 只放**上限**（`.max(LIMITS.displayName.max)`）—— 太短（含空）刻意不在 schema 裡：照 `FE-A01-S02` 按下去，
// 讓 `src/identity/` 的 `nicknameProblem` 拋 `NicknameLengthError`、alert 說出「1 到 20」。領域錯誤的文案由 `describeError` 提供
// （規格修正，design `D5`）；其餘一律 `toUiError`。
//
// 第三塊「用帳號密碼」（規格 `FE-A08`）：登入／註冊以 `aria-pressed` 切換、**DOM 上一次只有一個 `<form>`**（兩個含密碼欄的表單同時在會弄亂
// 密碼管理員與無障礙樹），兩個 `useForm` 都掛在這裡；切換不丟值靠切走前存值、切回來 `reset`（RHF 會把卸載欄位的值拿掉）。
// 成功**導向 `/world`**、不顯示恢復金鑰畫面：帳號密碼就是這個人回來的路（那個畫面是匿名路的義務）。
// 任一入場表單送出中，當下的三個送出鈕與兩個切換鈕全部禁用（送出中切走，回來的 403 會掛在看不見的表單上）。

/** 建立身分之後要給使用者看的東西。`S09` 要求兩件事都得說。 */
function RecoveryKeyPanel({ identity }: { identity: Identity }) {
  if (identity.state !== 'signed-in') return null
  return (
    <section aria-labelledby="recovery-key-heading" className="border-line border p-gutter">
      <h2 id="recovery-key-heading" className="text-title">
        你的恢復金鑰
      </h2>
      <p>
        歡迎，<strong>{identity.profile.display_name}</strong>。
      </p>
      {/* **金鑰本身要看得到、選得起來。** 只說「我們幫你記住了」的話，
          沒勾記住的人什麼都拿不到，而 S09 要求無論有沒有勾都拿得到 */}
      <p>
        <code data-testid="recovery-key">{identity.profile.id}</code>
      </p>
      {/* ⚠️ **這兩句是義務，不是提示。**（規格逐字：「最後那一條是義務不是提示。
          沒有它，『預設不存』就從一個知情的選擇變成一個默默弄丟身分的陷阱」） */}
      <p className="text-danger">拿到這把金鑰的人，就能成為你 —— 它不是密碼，不會驗證任何身分。</p>
      <p className="text-danger">
        沒有把它抄下來、又清掉瀏覽器資料的話，這個身分就回不來了。
      </p>
    </section>
  )
}

/** 前端自己定義的領域錯誤，用它們自己的話。其餘回 `null` → `toUiError`。**不在這裡重新判斷原因。** */
function describeDomainError(cause: unknown): string | null {
  if (
    cause instanceof NicknameLengthError ||
    cause instanceof RecoveryKeyRejectedError ||
    cause instanceof CredentialsRejectedError ||
    cause instanceof LoginIdTakenError
  )
    return cause.message
  return null
}

const NicknameSchema = z.object({
  // 只有上限：超過即時擋（`FE-O06-S06`）。太短交給 `nicknameProblem`（見檔頭）。
  nickname: z.string().max(LIMITS.displayName.max, { error: `暱稱最多 ${LIMITS.displayName.max} 個字。` }),
  remember: z.boolean(),
})
const RecoveryKeySchema = z.object({ key: z.string() })

// 帳號密碼（`FE-A08`）：限制一律 `LIMITS`；`password` 只有下限、**沒有上限**（前端不自加）。太短是 too_small（送出才說）、超過上限即時。
// 三欄**原值原樣**送：不 trim、不折疊大小寫（後端沒有這些規則，前端加了會讓註冊與登入對不上）。
const loginIdField = z
  .string()
  .min(LIMITS.loginId.min, { error: `帳號要 ${LIMITS.loginId.min} 到 ${LIMITS.loginId.max} 個字。` })
  .max(LIMITS.loginId.max as number, { error: `帳號最多 ${LIMITS.loginId.max} 個字。` })
const passwordField = z.string().min(LIMITS.password.min, { error: `密碼至少 ${LIMITS.password.min} 個字。` })
const AccountLoginSchema = z.object({ login_id: loginIdField, password: passwordField })
const RegisterSchema = z.object({
  login_id: loginIdField,
  password: passwordField,
  nickname: z
    .string()
    .min(LIMITS.displayName.min, { error: `名字要 ${LIMITS.displayName.min} 到 ${LIMITS.displayName.max} 個字。` })
    .max(LIMITS.displayName.max as number, { error: `名字最多 ${LIMITS.displayName.max} 個字。` }),
})

export const ACCOUNT_LABELS = {
  heading: '用帳號密碼',
  tabLogin: '登入',
  tabRegister: '註冊',
  loginId: '帳號',
  password: '密碼',
  nickname: '在世界裡顯示的名字（註冊）',
  showPassword: '顯示密碼',
  submitLogin: '用帳號密碼登入',
  submitRegister: '建立帳號',
}

export function LoginForm() {
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })
  const nick = useForm({
    schema: NicknameSchema,
    defaultValues: { nickname: '', remember: false },
    onSubmit: async ({ nickname, remember }) => setIdentity(await signInWithNickname(nickname, { remember })),
    describeError: describeDomainError,
  })
  const recovery = useForm({
    schema: RecoveryKeySchema,
    defaultValues: { key: '' },
    // 「記住我」只有一個勾選框，兩個表單共用；金鑰那邊在送出的當下讀它。
    onSubmit: async ({ key }) => setIdentity(await signInWithRecoveryKey(key, { remember: nick.form.getValues('remember') })),
    describeError: describeDomainError,
  })
  const router = useRouter()
  const [accountTab, setAccountTab] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  // 切換不丟值（`FE-A08-S01`）：RHF 對卸載的欄位會 `unregister`（值跟預設值都拿掉，不論 `shouldUnregister`），
  // 所以切走前把值存下來、切回來掛好之後 `reset` 回去。DOM 上仍然一次只有一個表單。
  const saved = useRef<{ login?: { login_id: string; password: string }; register?: { login_id: string; password: string; nickname: string } }>({})
  const account = useForm({
    schema: AccountLoginSchema,
    defaultValues: { login_id: '', password: '' },
    onSubmit: async ({ login_id, password }) => {
      await signInWithPassword(login_id, password, { remember: nick.form.getValues('remember') })
      router.push('/world')
    },
    describeError: describeDomainError,
  })
  const signup = useForm({
    schema: RegisterSchema,
    defaultValues: { login_id: '', password: '', nickname: '' },
    onSubmit: async ({ login_id, password, nickname }) => {
      await registerAccount({ loginId: login_id, password, nickname }, { remember: nick.form.getValues('remember') })
      router.push('/world')
    },
    describeError: describeDomainError,
  })
  const switchAccountTab = (next: 'login' | 'register') => {
    if (next === accountTab) return
    if (accountTab === 'login') saved.current.login = account.form.getValues()
    else saved.current.register = signup.form.getValues()
    setAccountTab(next)
  }
  useEffect(() => {
    // 還完就清：effect 因別的原因再跑（StrictMode、別的 state）不能把使用者剛打的字蓋回舊值（審查抓到的）。
    if (accountTab === 'login' && saved.current.login) {
      account.form.reset(saved.current.login)
      saved.current.login = undefined
    }
    if (accountTab === 'register' && saved.current.register) {
      signup.form.reset(saved.current.register)
      saved.current.register = undefined
    }
  }, [accountTab, account.form, signup.form])
  // `useWatch` 只訂閱這一欄（`form.watch()` 在 render 裡是整份訂閱，也是 React Compiler 認定的不相容用法）。
  const nickname = useWatch({ control: nick.form.control, name: 'nickname' })
  const nicknameRemaining = remaining(LIMITS.displayName, nickname)
  const nicknameViolation = violates(LIMITS.displayName, nickname)
  // 任一入場表單在送，別的都不能按（一個人一次只建立一個身分）；切換鈕也鎖（`FE-A08-S12`）。
  const anyBusy = nick.busy || recovery.busy || account.busy || signup.busy

  if (identity.state === 'signed-in') return <RecoveryKeyPanel identity={identity} />

  return (
    <div className="flex flex-col gap-section">
      <form className={FORM} aria-labelledby="nickname-heading" onSubmit={nick.onSubmit} noValidate>
        <h2 id="nickname-heading" className="text-title">
          取一個名字就可以進去
        </h2>
        <label className={FIELD_LABEL}>
          在世界裡顯示的名字
          <input
            className={FIELD}
            {...nick.form.register('nickname')}
            aria-describedby="nickname-remaining"
            aria-invalid={nicknameViolation === 'too-long' ? true : undefined}
          />
        </label>
        {/* 剩餘字數可為負：「超過 3 字」比「0」有用。`remaining` 對這個欄位永遠是數字（有上限）。
            這一行就是這個欄位的錯誤訊息（超過時變成「超過 N 字」），以 `aria-describedby` 掛在欄位上；不另外再畫一份 schema 的文案。 */}
        <p id="nickname-remaining" data-testid="nickname-remaining" data-remaining={nicknameRemaining} className="text-caption text-ink-muted">
          {nicknameRemaining !== null && nicknameRemaining < 0 ? `超過 ${-nicknameRemaining} 字` : `還可以輸入 ${nicknameRemaining ?? '—'} 字`}
        </p>
        <label className={CHECK_ROW}>
          <input type="checkbox" {...nick.form.register('remember')} />
          在這台裝置上記住我
        </label>
        {/* **預設不勾，而且要說出代價。** 規格：使用者要知道「沒有備份、
            又清掉瀏覽器資料的話，這個身分回不來」 */}
        <p className="text-caption text-ink-muted">
          不勾的話，這台裝置不會留下任何東西 —— 換裝置或清掉資料就要靠恢復金鑰回來。
        </p>
        <SubmitError message={nick.submitError} />
        {/* 只在**超過上限**時禁用；太短（含空）照 `FE-A01-S02` 按下去讓 alert 說出長度問題（兩位審查者一致）。
            `canSubmit` 已含 schema 的 too_big，但 RHF 的驗證晚一個 microtask；`violates` 是同一份 `LIMITS` 的同步判斷，
            讓「第 21 個字打下去」的那一幀鈕就已經是 disabled（`FE-O06-S06`／`S08` 同步斷言）。 */}
        <button type="submit" className={PRIMARY} disabled={anyBusy || !nick.canSubmit || nicknameViolation === 'too-long'}>
          進入世界
        </button>
      </form>

      <form className={FORM} aria-labelledby="resume-heading" onSubmit={recovery.onSubmit} noValidate>
        <h2 id="resume-heading" className="text-title">
          已經有身分了？
        </h2>
        {/* `S17`：手上有金鑰的人，在一台全新的裝置上回得去 */}
        <label className={FIELD_LABEL}>
          貼上你的恢復金鑰
          <input className={FIELD} {...recovery.form.register('key')} />
        </label>
        <SubmitError message={recovery.submitError} />
        <button type="submit" className={SECONDARY} disabled={anyBusy || !recovery.canSubmit}>
          用金鑰回來
        </button>
      </form>

      {/* 第三塊：帳號密碼（`FE-A08`）。這是三種入場方式裡唯一在驗證身分的那一種；匿名路仍是第一個表單、仍是主路。 */}
      <section className={FORM} aria-labelledby="account-heading" data-testid="account-section">
        <h2 id="account-heading" className="text-title">
          {ACCOUNT_LABELS.heading}
        </h2>
        <div role="group" aria-label={ACCOUNT_LABELS.heading} className="flex gap-gutter">
          <button type="button" className={SECONDARY} aria-pressed={accountTab === 'login'} disabled={anyBusy} onClick={() => switchAccountTab('login')}>
            {ACCOUNT_LABELS.tabLogin}
          </button>
          <button type="button" className={SECONDARY} aria-pressed={accountTab === 'register'} disabled={anyBusy} onClick={() => switchAccountTab('register')}>
            {ACCOUNT_LABELS.tabRegister}
          </button>
        </div>
        <label className={CHECK_ROW}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          {ACCOUNT_LABELS.showPassword}
        </label>
        {accountTab === 'login' ? (
          <form className={FORM} data-testid="account-login-form" onSubmit={account.onSubmit} noValidate>
            <AccountField api={account} name="login_id" label={ACCOUNT_LABELS.loginId} type="text" autoComplete="username" testId="account-login-form" />
            <AccountField
              api={account}
              name="password"
              label={ACCOUNT_LABELS.password}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              testId="account-login-form"
            />
            <SubmitError message={account.submitError} />
            <button type="submit" className={PRIMARY} disabled={anyBusy || !account.canSubmit}>
              {ACCOUNT_LABELS.submitLogin}
            </button>
          </form>
        ) : (
          <form className={FORM} data-testid="account-register-form" onSubmit={signup.onSubmit} noValidate>
            <AccountField api={signup} name="login_id" label={ACCOUNT_LABELS.loginId} type="text" autoComplete="username" testId="account-register-form" />
            {/* 註冊是**新**密碼：密碼管理員要存新的，不是拿舊的來填（審查抓到的）。 */}
            <AccountField
              api={signup}
              name="password"
              label={ACCOUNT_LABELS.password}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              testId="account-register-form"
            />
            <AccountField api={signup} name="nickname" label={ACCOUNT_LABELS.nickname} type="text" autoComplete="nickname" testId="account-register-form" />
            <SubmitError message={signup.submitError} />
            <button type="submit" className={PRIMARY} disabled={anyBusy || !signup.canSubmit}>
              {ACCOUNT_LABELS.submitRegister}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

/**
 * 帳號密碼表單的一欄：`register` 的 name 是 `FieldPath<T>`（型別跟 schema 綁著，拼錯欄位 typecheck 紅）。
 * 欄位錯誤：`aria-invalid` ＋ `aria-describedby`，不各自 `role="alert"`（`FE-X05`）。
 */
function AccountField<TInput extends FieldValues, TOutput extends FieldValues>({
  api,
  name,
  label,
  type,
  autoComplete,
  testId,
}: {
  api: FormApi<TInput, TOutput>
  name: FieldPath<TInput>
  label: string
  type: 'text' | 'password'
  autoComplete: 'username' | 'current-password' | 'new-password' | 'nickname'
  testId: string
}) {
  const error = api.visibleErrors[name]
  const errorId = `${testId}-error-${name}`
  return (
    <>
      <label className={FIELD_LABEL}>
        {label}
        <input className={FIELD} type={type} autoComplete={autoComplete} {...api.form.register(name)} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
      </label>
      {error && (
        <p id={errorId} data-testid={errorId} className="text-caption text-danger">
          {error}
        </p>
      )}
    </>
  )
}
