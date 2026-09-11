'use client'

import { useState } from 'react'
import { signInWithNickname, signInWithRecoveryKey } from '@/identity/session'
import { NicknameLengthError, RecoveryKeyRejectedError, type Identity } from '@/identity/types'
import { CHECK_ROW, FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { LIMITS, remaining, violates } from '@/api/contract/limits'

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
// 而不需要重新輸入暱稱」）。這是 `value` 綁 state 的自然結果，
// 但它是**被要求的行為**，不是實作細節 —— 判準守著它。

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

/** 錯誤訊息。**型別決定文案**，不在這裡重新判斷原因。 */
function messageFor(error: unknown): string {
  if (error instanceof NicknameLengthError) return error.message
  if (error instanceof RecoveryKeyRejectedError) return error.message
  return '現在連不上伺服器。你輸入的東西還在，可以直接再試一次。'
}

export function LoginForm() {
  const [nickname, setNickname] = useState('')
  const [remember, setRemember] = useState(false)
  const [key, setKey] = useState('')
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const nicknameRemaining = remaining(LIMITS.displayName, nickname)
  const nicknameViolation = violates(LIMITS.displayName, nickname)

  async function run(action: () => Promise<Identity>) {
    setBusy(true)
    setError(null)
    try {
      setIdentity(await action())
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  if (identity.state === 'signed-in') return <RecoveryKeyPanel identity={identity} />

  return (
    <div className="flex flex-col gap-section">
      <form
        className={FORM}
        aria-labelledby="nickname-heading"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => signInWithNickname(nickname, { remember }))
        }}
      >
        <h2 id="nickname-heading" className="text-title">
          取一個名字就可以進去
        </h2>
        <label className={FIELD_LABEL}>
          在世界裡顯示的名字
          <input className={FIELD} value={nickname} onChange={(e) => setNickname(e.target.value)} aria-describedby="nickname-remaining" />
        </label>
        {/* 剩餘字數可為負：「超過 3 字」比「0」有用。`remaining` 對這個欄位永遠是數字（有上限）。 */}
        <p id="nickname-remaining" data-testid="nickname-remaining" data-remaining={nicknameRemaining} className="text-caption text-ink-muted">
          {nicknameRemaining !== null && nicknameRemaining < 0 ? `超過 ${-nicknameRemaining} 字` : `還可以輸入 ${nicknameRemaining ?? '—'} 字`}
        </p>
        <label className={CHECK_ROW}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          在這台裝置上記住我
        </label>
        {/* **預設不勾，而且要說出代價。** 規格：使用者要知道「沒有備份、
            又清掉瀏覽器資料的話，這個身分回不來」 */}
        <p className="text-caption text-ink-muted">
          不勾的話，這台裝置不會留下任何東西 —— 換裝置或清掉資料就要靠恢復金鑰回來。
        </p>
        {/* 只在**超過上限**時禁用；太短（含空）照 `FE-A01-S02` 按下去讓 alert 說出長度問題（兩位審查者一致）。 */}
        <button type="submit" className={PRIMARY} disabled={busy || nicknameViolation === 'too-long'}>
          進入世界
        </button>
      </form>

      <form
        className={FORM}
        aria-labelledby="resume-heading"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => signInWithRecoveryKey(key, { remember }))
        }}
      >
        <h2 id="resume-heading" className="text-title">
          已經有身分了？
        </h2>
        {/* `S17`：手上有金鑰的人，在一台全新的裝置上回得去 */}
        <label className={FIELD_LABEL}>
          貼上你的恢復金鑰
          <input className={FIELD} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <button type="submit" className={SECONDARY} disabled={busy}>
          用金鑰回來
        </button>
      </form>

      {error !== null && (
        <p role="alert" className="text-danger">
          {messageFor(error)}
        </p>
      )}
    </div>
  )
}
