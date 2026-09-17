'use client'

import { useState } from 'react'
import { browserClipboard, type ClipboardPort } from '@/identity/clipboard'
import type { Identity } from '@/identity/types'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'

// 「帶走這把鑰匙，再進去」—— 首次進入流程的後半段。規格 `FE-A06`〈金鑰要真的被帶走，才進得了世界〉
// 與 `fe-a06-login-entry`〈登入頁的每一條路都通到世界，而新建的名片要先帶走金鑰〉。
//
// ⚠️ **同一道閘，三種呈現。** `/` 整頁（`RootEntry` → `FirstEntryFlow`）、`/world` 引導層（`FirstEntryNotice`）、
// `/login` 的暱稱路（`LoginForm`）—— 三處都是「剛建了一張新名片」。**不得為任何一個入口另寫一套狀態機**
// （`fe-a06-first-entry` design D1、`fe-a06-login-entry` design D1）：`PROOF_LENGTH`、「寫入成功之後才設 copied」、
// 「填錯不放行」三條只能有一份，兩份一定會漂。`/login` 原本自己畫的 `RecoveryKeyPanel` 就是那份沒有閘的第二套。
//
// 恢復金鑰路與帳號密碼路**刻意不用它**：那兩條路的人手上已經有回來的憑證。
//
// ⚠️⚠️ **「進入世界」預設不能按，而那是這一整項的重點。**
// 兩個獨立的審查者都指出：急著體驗的人會直接按「進入世界」，**連看都不看那串亂碼**。
// 資訊在畫面上不等於資訊被帶走了。
//
// ⚠️ **這裡不落地任何東西。** 「走完了」由呼叫端在 `onDone` 裡記（`markFirstEntryDone()`）——
// 渲染這個畫面的那一刻就記下的話，「看到金鑰就關掉分頁」的人會被算成走完了（`FE-A06-S13`）。

/**
 * 要填回幾個字元。
 *
 * ⚠️ **兩個方向的代價不對稱，所以這個數字不是隨便挑的**（`fe-a06-first-entry` design D5）：
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

export type SignedIn = Extract<Identity, { state: 'signed-in' }>

export interface KeyHandoffProps {
  /** 剛從後端拿回來的那張新名片。金鑰就是它的 `profile.id`（今天的編碼；規格只說金鑰「指向」名片）。 */
  identity: SignedIn
  /** 過閘了。呼叫端自己決定去哪裡、要記什麼。 */
  onDone: (identity: SignedIn) => void
  clipboard?: ClipboardPort
}

export function KeyHandoff({ identity, onDone, clipboard = browserClipboard() }: KeyHandoffProps) {
  const [taken, setTaken] = useState<Taken>({ how: 'not-yet' })
  const [proof, setProof] = useState('')

  async function copy(key: string) {
    try {
      await clipboard.write(key)
      // ⚠️ **這一行一定要在 `await` 之後。** 放在前面（或放在 click handler
      // 的開頭）的話，寫入失敗時畫面照樣說「已複製」——
      // 而那正是 `S09`／`S15` 要擋的假實作。
      setTaken({ how: 'copied' })
    } catch (caught) {
      setTaken({
        how: 'copy-failed',
        reason: caught instanceof Error ? caught.message : '複製沒有成功。',
      })
    }
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
