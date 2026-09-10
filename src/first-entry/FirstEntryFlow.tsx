'use client'

import { useState } from 'react'
import { browserClipboard, type ClipboardPort } from '@/identity/clipboard'
import { signInWithNickname } from '@/identity/session'
import { NicknameLengthError, type Identity } from '@/identity/types'

// 首次進入的流程本身。規格 `FE-A06`。
//
// ⚠️ **同一個流程，兩種呈現。** `/` 用它當整頁（強制走完），
// `/world` 用它當可關掉的引導層。**不得為了兩個入口各寫一套狀態機** ——
// 那是封存前審查時 codex 的條件（design D1），而理由是兩套一定會漂。
//
// ⚠️⚠️ **「進入世界」預設不能按，而那是這一整項的重點。**
// 今天的登入畫面已經顯示金鑰、也寫了兩句警語，而兩個獨立的審查者都指出：
// 急著體驗的人會直接按「進入世界」，**連看都不看那串亂碼**。
// 資訊在畫面上不等於資訊被帶走了。

/** 金鑰有沒有被帶走。**兩條路，而第二條不是裝飾。** */
type Taken =
  | { readonly how: 'not-yet' }
  /** 真的寫進剪貼簿了（寫入回報成功）。 */
  | { readonly how: 'copied' }
  /** 使用者明確表示自己保存了。**剪貼簿不可用時這是唯一的路。** */
  | { readonly how: 'declared' }
  /** 寫入失敗。**不是 `not-yet`** —— 畫面要說出發生了什麼，並給手動的路。 */
  | { readonly how: 'copy-failed'; readonly reason: string }

export interface FirstEntryFlowProps {
  /** 走完了。`/` 導向世界，引導層則是關掉自己。 */
  onDone: () => void
  clipboard?: ClipboardPort
}

export function FirstEntryFlow({ onDone, clipboard = browserClipboard() }: FirstEntryFlowProps) {
  const [nickname, setNickname] = useState('')
  const [remember, setRemember] = useState(false)
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })
  const [taken, setTaken] = useState<Taken>({ how: 'not-yet' })
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      setIdentity(await signInWithNickname(nickname, { remember }))
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  async function copy(key: string) {
    try {
      await clipboard.write(key)
      // ⚠️ **這一行一定要在 `await` 之後。** 放在前面（或放在 click handler
      // 的開頭）的話，寫入失敗時畫面照樣說「已複製」——
      // 而那正是 `S09` 要擋的假實作。
      setTaken({ how: 'copied' })
    } catch (caught) {
      setTaken({
        how: 'copy-failed',
        reason: caught instanceof Error ? caught.message : '複製沒有成功。',
      })
    }
  }

  if (identity.state !== 'signed-in') {
    return (
      <form
        aria-labelledby="first-entry-heading"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <h2 id="first-entry-heading" className="text-title">
          取一個名字就可以進去
        </h2>
        <label>
          在世界裡顯示的名字
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          在這台裝置上記住我
        </label>
        <button type="submit" disabled={busy}>
          建立我的身分
        </button>
        {error !== null && (
          <p role="alert" className="text-danger">
            {error instanceof NicknameLengthError
              ? error.message
              : '現在連不上伺服器。你輸入的東西還在，可以直接再試一次。'}
          </p>
        )}
      </form>
    )
  }

  const key = identity.profile.id
  const done = taken.how === 'copied' || taken.how === 'declared'

  return (
    <section aria-labelledby="key-heading" className="flex flex-col gap-gutter">
      <h2 id="key-heading" className="text-title">
        帶走這把鑰匙，再進去
      </h2>
      <p>
        歡迎，<strong>{identity.profile.display_name}</strong>。
      </p>
      {/* **金鑰要選得起來。** 剪貼簿不可用的人只剩下「自己選起來複製」這條路 */}
      <p>
        <code data-testid="recovery-key">{key}</code>
      </p>
      <p className="text-danger">拿到這把鑰匙的人，就能成為你 —— 它不是密碼，不會驗證任何身分。</p>
      <p className="text-danger">
        沒有把它帶走、又清掉瀏覽器資料的話，這個身分就回不來了。
      </p>

      <button type="button" onClick={() => void copy(key)}>
        複製鑰匙
      </button>

      {taken.how === 'copied' && <p role="status">已經複製了。</p>}

      {taken.how === 'copy-failed' && (
        <div role="alert" className="text-danger">
          {/* **不說「已複製」，而且要說得出下一步。**
              只說「複製失敗」的話，使用者不知道自己還能怎麼辦 */}
          <p>{taken.reason}請把上面那一串自己選起來複製，或抄下來。</p>
        </div>
      )}

      {/* ⚠️ **這條路一定要在，而且不能只在複製失敗時出現。**
          有些人本來就想手抄。判準 `S10` 驗的是它自己就放行得了 */}
      <label>
        <input
          type="checkbox"
          checked={taken.how === 'declared'}
          onChange={(e) => setTaken(e.target.checked ? { how: 'declared' } : { how: 'not-yet' })}
        />
        我已經自己保存了這把鑰匙
      </label>

      <button type="button" disabled={!done} onClick={onDone}>
        進入世界
      </button>
    </section>
  )
}
