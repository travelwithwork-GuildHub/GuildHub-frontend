'use client'

import { useState, type ReactNode } from 'react'
import { signInWithNickname } from '@/identity/session'
import { NicknameLengthError, type Identity } from '@/identity/types'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, TITLE } from '@/design/controls'

// 首次進入的流程本身。規格 `FE-A06`（`fe-a06-first-entry`，2026-09-21 反轉）。
//
// ⚠️ **只有一步：取一個名字 → 直接進世界。** 產品負責人在 demo 前撤掉了原本的「帶走恢復金鑰」閘 ——
// 匿名使用者不該被要求記下一串 UUID 才進得了世界（規格〈網站的根路徑是一條走得完的路〉的反轉說明）。
// 匿名身分綁在後端簽章的 session cookie（同瀏覽器重整、再訪都是同一個人；換瀏覽器就是新人）；
// 要跨裝置的持久身分走帳號密碼（`FE-A08`）。
//
// ⚠️ **同一個流程，兩種呈現。** `/` 用它當整頁（強制走完）、`/world` 用它當可關掉的引導層；
// `/login` 的暱稱路自己有取名字的表單（`LoginForm`），成功之後同樣直接進世界。**不得為任何一個入口各寫一套狀態機。**

export interface FirstEntryFlowProps {
  /**
   * 走完了（送出合法名字、建立身分）。`/` 導向世界，引導層則是關掉自己。
   *
   * **`identity` 一定要交出去。** 少了它，在世界裡走完流程之後標題列仍然
   * 顯示「訪客」，要重整才會變 —— 而那是端到端第一次跑就抓到的 bug。
   */
  onDone: (identity: Extract<Identity, { state: 'signed-in' }>) => void
  /**
   * 標題底下的一句說明（內文）。取名門檻（`FE-A06-S04`）用它說清楚「填名字即刻加入、不是登入」；
   * `/`、`/login` 不傳就沒有 —— 這個表面必備的層級由 `dom-visual-system` 各自規定。
   */
  description?: ReactNode
  /** 掛載時把焦點放到名字框（取名門檻是首屏、焦點該落在唯一要填的欄位）。 */
  autoFocus?: boolean
}

export function FirstEntryFlow({ onDone, description, autoFocus }: FirstEntryFlowProps) {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const identity = await signInWithNickname(nickname)
      // ⚠️ **成功就直接交出去** —— 沒有金鑰畫面、沒有中間步驟（規格 `FE-A06-S02`）。
      if (identity.state === 'signed-in') onDone(identity)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
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
      <h2 id="first-entry-heading" {...TITLE}>
        取一個名字就可以進去
      </h2>
      {description !== undefined && <p>{description}</p>}
      <label className={FIELD_LABEL}>
        在世界裡顯示的名字
        {/* autoFocus：門檻是首屏、焦點落唯一要填的欄位；`/`、`/login` 不傳就照舊不搶焦點。 */}
        <input {...FIELD} autoFocus={autoFocus} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <button type="submit" {...PRIMARY} disabled={busy}>
        進入世界
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
