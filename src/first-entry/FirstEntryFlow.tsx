'use client'

import { useState } from 'react'
import type { ClipboardPort } from '@/identity/clipboard'
import { signInWithNickname } from '@/identity/session'
import { NicknameLengthError, type Identity } from '@/identity/types'
import { CHECK_ROW, FIELD, FIELD_LABEL, FORM, PRIMARY } from '@/design/controls'
import { KeyHandoff } from './KeyHandoff'

// 首次進入的流程本身。規格 `FE-A06`。
//
// ⚠️ **同一個流程，三種呈現。** `/` 用它當整頁（強制走完）、`/world` 用它當可關掉的引導層；
// `/login` 的暱稱路自己有取名字的表單，但**後半段「帶走鑰匙」是同一個 `KeyHandoff`**
//（`fe-a06-login-entry` design D1）。**不得為任何一個入口各寫一套狀態機** ——
// 那是封存前審查時 codex 的條件（design D1），而理由是兩套一定會漂。
// 這個檔案只剩「取名字」那一半；閘在 `KeyHandoff.tsx`。
//
// ⚠️⚠️ **按鈕要看起來像按鈕，而這件事是截圖抓到的。**
// Tailwind 的 preflight 把 `<button>` 的預設外觀清光了，所以在加上樣式之前
// 「複製鑰匙」與「進入世界」在畫面上是**兩行漂著的字** ——
// 18 條端到端斷言全綠，而那個 CTA 沒有人會認得出來。
// **這是 `FE-W12`「門看不出來是門」的同一種形狀**（那次也是測試全綠、
// 六扇門在畫面上是 10 像素的細縫）。

export interface FirstEntryFlowProps {
  /**
   * 走完了。`/` 導向世界，引導層則是關掉自己。
   *
   * **`identity` 一定要交出去。** 少了它，在世界裡走完流程之後標題列仍然
   * 顯示「訪客」，要重整才會變 —— 而那是端到端第一次跑就抓到的 bug。
   */
  onDone: (identity: Identity) => void
  clipboard?: ClipboardPort
}

export function FirstEntryFlow({ onDone, clipboard }: FirstEntryFlowProps) {
  const [nickname, setNickname] = useState('')
  const [remember, setRemember] = useState(false)
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })
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

  if (identity.state === 'signed-in') {
    return <KeyHandoff identity={identity} clipboard={clipboard} onDone={onDone} />
  }

  return (
    <form
      className={FORM}
      aria-labelledby="first-entry-heading"
      onSubmit={(event) => {
        event.preventDefault()
        void create()
      }}
    >
      <h2 id="first-entry-heading" className="text-title">
        取一個名字就可以進去
      </h2>
      <label className={FIELD_LABEL}>
        在世界裡顯示的名字
        <input {...FIELD} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <label className={CHECK_ROW}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        在這台裝置上記住我
      </label>
      <button type="submit" {...PRIMARY} disabled={busy}>
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
