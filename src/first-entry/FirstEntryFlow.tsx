'use client'

import { useState } from 'react'
import { browserClipboard, type ClipboardPort } from '@/identity/clipboard'
import { signInWithNickname } from '@/identity/session'
import { NicknameLengthError, type Identity } from '@/identity/types'
import { CHECK_ROW, FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'

// 首次進入的流程本身。規格 `FE-A06`。
//
// ⚠️ **同一個流程，兩種呈現。** `/` 用它當整頁（強制走完），
// `/world` 用它當可關掉的引導層。**不得為了兩個入口各寫一套狀態機** ——
// 那是封存前審查時 codex 的條件（design D1），而理由是兩套一定會漂。
//
// ⚠️⚠️ **按鈕要看起來像按鈕，而這件事是截圖抓到的。**
// Tailwind 的 preflight 把 `<button>` 的預設外觀清光了，所以在加上樣式之前
// 「複製鑰匙」與「進入世界」在畫面上是**兩行漂著的字** ——
// 18 條端到端斷言全綠，而那個 CTA 沒有人會認得出來。
// **這是 `FE-W12`「門看不出來是門」的同一種形狀**（那次也是測試全綠、
// 六扇門在畫面上是 10 像素的細縫）。
//
// ⚠️ 這裡的樣式是**這個流程自己的最小可用外觀**，不是設計系統。
// 表單與按鈕的一致性是 `FE-X05`（W2，未開始）——
// 它做完之後這幾個字串要換成共用的東西。
//
// ⚠️⚠️ **`/login`（`FE-A01`）有同一個問題**，而它已經封存了。要另外處理。
//
// ⚠️⚠️ **「進入世界」預設不能按，而那是這一整項的重點。**
// 今天的登入畫面已經顯示金鑰、也寫了兩句警語，而兩個獨立的審查者都指出：
// 急著體驗的人會直接按「進入世界」，**連看都不看那串亂碼**。
// 資訊在畫面上不等於資訊被帶走了。

/**
 * 要填回幾個字元。
 *
 * ⚠️ **兩個方向的代價不對稱，所以這個數字不是隨便挑的**（design D5）：
 *
 *   太短（1–2 碼）  猜得到 —— 16 進位的 UUID 尾碼一碼只有 16 種
 *   太長（整把 36） 等於逼人重打，會把**手抄的人擋在門外**
 *
 * codex 說末 6–8、Gemini 說最後 4，取中間。
 */
const PROOF_LENGTH = 6

/** 金鑰有沒有被帶走。**兩條路，而第二條不是裝飾。** */
type Taken =
  | { readonly how: 'not-yet' }
  /** 真的寫進剪貼簿了（寫入回報成功）。 */
  | { readonly how: 'copied' }
  /**
   * 使用者**證明**自己手上有這把金鑰（填回結尾那一小段）。
   *
   * ⚠️ **這裡原本是一個「我已經自己保存了」的勾選框，而它注定變成裝飾。**
   * 封存前送審時兩個審查者獨立指出同一件事 —— Gemini 逐字：
   * 「在『妥善保存一串金鑰』和『打勾以立刻獲得服務』之間，
   * 急躁的使用者會**毫不猶豫地選擇打勾**」。
   *
   * 換成填回尾碼之後，它證明的是**那串字已經離開這個畫面而且在他手上** ——
   * 而且**不依賴剪貼簿**：複製成功、手抄在紙上、用手機拍照都填得出來。
   */
  | { readonly how: 'proved' }
  /** 寫入失敗。**不是 `not-yet`** —— 畫面要說出發生了什麼，並給手動的路。 */
  | { readonly how: 'copy-failed'; readonly reason: string }

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

export function FirstEntryFlow({ onDone, clipboard = browserClipboard() }: FirstEntryFlowProps) {
  const [nickname, setNickname] = useState('')
  const [remember, setRemember] = useState(false)
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })
  const [taken, setTaken] = useState<Taken>({ how: 'not-yet' })
  const [proof, setProof] = useState('')
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
          <input className={FIELD} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <label className={CHECK_ROW}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          在這台裝置上記住我
        </label>
        <button type="submit" className={PRIMARY} disabled={busy}>
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
  const tail = key.slice(-PROOF_LENGTH)
  const done = taken.how === 'copied' || taken.how === 'proved'
  // **填錯要說得出來，但還沒填完不算填錯** —— 每打一個字就罵人是另一種騷擾
  const proofWrong = proof.length >= PROOF_LENGTH && proof.toLowerCase() !== tail.toLowerCase()

  return (
    <section aria-labelledby="key-heading" className={FORM}>
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

      <button type="button" className={SECONDARY} onClick={() => void copy(key)}>
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
          有些人本來就想手抄。判準 `S10` 驗的是它自己就放行得了。

          ⚠️⚠️ **它問的是「證明」不是「宣稱」。** 原本是一個勾選框，
          而兩個審查者獨立指出那注定變成裝飾 —— 填回尾碼才證明得了
          「那串字已經離開這個畫面」。 */}
      <label className={FIELD_LABEL}>
        <span>
          或者，把鑰匙<strong>最後 {PROOF_LENGTH} 個字</strong>填回來（抄的、拍照的都算）
        </span>
        <input
          className={FIELD}
          value={proof}
          onChange={(e) => {
            const next = e.target.value
            setProof(next)
            // ⚠️ **比對用小寫。** UUID 是 16 進位，使用者手抄時大小寫不一定一致，
            // 而「抄對了卻被說填錯」比沒有這條路更糟
            if (next.toLowerCase() === tail.toLowerCase()) setTaken({ how: 'proved' })
            else if (taken.how === 'proved') setTaken({ how: 'not-yet' })
          }}
        />
      </label>
      {proofWrong && (
        <p role="alert" className="text-danger">
          跟鑰匙的結尾對不上。
        </p>
      )}

      <button type="button" className={PRIMARY} disabled={!done} onClick={() => onDone(identity)}>
        進入世界
      </button>
    </section>
  )
}
