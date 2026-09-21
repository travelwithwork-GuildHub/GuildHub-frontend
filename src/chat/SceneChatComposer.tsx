'use client'

import { useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { LIMITS, remaining, violates } from '@/api/contract/limits'
import type { ChatIn } from '@/api/contract/ws'
import { CAPTION, FIELD, FIELD_LABEL, SECONDARY, withClass } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'

// 場景聊天的輸入。規格 `FE-K04`〈全空白不送、非空白原值送；沒有上限；只有 transport 接受了才清空、失敗保留〉（design D3、D4）。
//
// `send` 是注入的（`SceneChatHud` 給 `useSceneChat().send`；測試給假的）。沒有 `useForm`：規則只有「trim 空不送」＋「送出上限 500」，
// 但 alert 的位置與焦點照 `form-conventions`（`SubmitError`：在送出控制之前、`role="alert"`、出現時取焦點）。
// `trim()` 為空就不送：那是**欄位級**的、可修正的問題 —— 照 `form-conventions` 的欄位錯誤（`aria-invalid`＋`aria-describedby` 掛在欄位下），
// 不是 `role="alert"`、不搶焦點（chat 是高頻操作，空的 Enter 不該把人從輸入框拉走；審查抓到的）。否則送**原字串**（含首尾空白，不 trim）。
// **送出上限 500**（`LIMITS.chatBody`，正式閘道 relay 對 >500 code point 靜默丟棄的事實，`FE-K04-S16`）：用 `remaining`／`violates`（**code point**，對上後端 `len()`），
// **不用原生 `maxLength`**（它數 UTF-16 code unit、emoji 誤判）。欄位不設限、可自由輸入／貼上超過（貼上超長保留全文不截斷），擋的是**送出**：超過就顯示負剩餘字數（欄位級、`aria-invalid`，不是 alert）、
// 禁用送出、且 `submit()` 自己也擋（Enter／form submit 不經按鈕的 disabled）。剩餘字數走 `aria-describedby` 掛在欄位上（`FE-K04-S17`）。
// `send` 同步回來沒拋才清空；拋了（沒連線、沒 ready、socket 拋）就保留輸入、`SubmitError`（`role="alert"`、在送出控制之前、取焦點）說一句受控的話 ——
// 不印例外訊息、不自動重送（節流是 `FE-X11` 的事，之後包在 `send` 外面，被節流也是「沒交給 transport」→ 同一條保留的路）。
// 兩種提示都在使用者再動鍵盤（`onChange`）時清掉 —— 提示是給「上一次送出」的，不該掛到下一次。
// Enter 送、Shift+Enter 交給瀏覽器換行（不 preventDefault）。Escape → `onEscape`（HUD 給「焦點回世界錨」；沒給就交給上層）。
// ⚠️ 這裡的字是元件常數，不是規格。

export const CHAT_COMPOSER_LABELS = {
  field: '說點什麼',
  submit: '送出',
  needInput: '先輸入內容再送出。',
  notSent: '沒送出去 —— 現在還連不上，等一下再試。',
}

export function SceneChatComposer({ send, onEscape }: { send: (input: ChatIn) => void; onEscape?: () => void }) {
  const [value, setValue] = useState('')
  /** 欄位級：空的（不是 alert）。 */
  const [needInput, setNeedInput] = useState(false)
  /** 送出級：transport 拒了幾次（0 ＝ 沒有 alert）。**用次數不用布林**：同一內容連續失敗兩次，第二次 alert 也要重新取焦點 —— `SubmitError` 只在 message 變時聚焦，用 `key` 讓它每次失敗都重掛（審查抓到的）。 */
  const [failures, setFailures] = useState(0)
  const hintId = useId()
  const remainingId = useId()

  // 送出上限 500（code point）：剩餘可為負（「超過 N 字」），超過就擋在送出端。`remaining`／`violates` 對 chatBody 永遠是數字（有上限）。
  const rem = remaining(LIMITS.chatBody, value) ?? 0
  const tooLong = violates(LIMITS.chatBody, value) === 'too-long'

  const submit = () => {
    if (value.trim() === '') {
      setNeedInput(true)
      return
    }
    // 超過 500：擋在送出端（不只是禁用按鈕 —— Enter／form submit 也走這裡）。剩餘字數已顯示負值＋`aria-invalid`，不另開 alert。
    if (tooLong) return
    try {
      send({ t: 'chat', body: value })
    } catch {
      // 拋的是什麼都一樣：沒交給 transport 就保留、說一句受控的話。例外本身不進 DOM。
      setFailures((n) => n + 1)
      return
    }
    setValue('')
    setNeedInput(false)
    setFailures(0)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    // Escape：離開輸入框（HUD 給的是「焦點回世界錨」）。不關 HUD、不清值、不導覽 —— 這裡就處理掉，不讓它往上冒到 Escape 層級。
    if (e.key === 'Escape' && onEscape !== undefined) {
      e.preventDefault()
      e.stopPropagation()
      onEscape()
      return
    }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    submit()
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      noValidate
    >
      <label className={FIELD_LABEL}>
        {CHAT_COMPOSER_LABELS.field}
        <textarea
          rows={2}
          {...withClass(FIELD, 'resize-none')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setNeedInput(false)
            setFailures(0)
          }}
          onKeyDown={onKeyDown}
          aria-invalid={needInput || tooLong || undefined}
          aria-describedby={needInput ? `${hintId} ${remainingId}` : remainingId}
          data-testid="chat-input"
        />
      </label>
      {needInput && (
        <p id={hintId} data-testid="chat-need-input" {...withClass(CAPTION, 'text-danger')}>
          {CHAT_COMPOSER_LABELS.needInput}
        </p>
      )}
      {/* 剩餘字數（欄位級）：可為負 ＝「超過 N 字」，超過用 danger 色。以 `aria-describedby` 掛在欄位上，不是 alert（那句留給送出真的失敗，`S06`／`S17`）。 */}
      <p
        id={remainingId}
        data-testid="chat-remaining"
        data-remaining={rem}
        {...withClass(CAPTION, tooLong ? 'text-danger' : 'text-ink-muted')}
      >
        {rem < 0 ? `超過 ${-rem} 字` : `還可以輸入 ${rem} 字`}
      </p>
      <SubmitError key={failures} message={failures > 0 ? CHAT_COMPOSER_LABELS.notSent : null} />
      {/* 聊天框是非阻斷的表面：送出是次要，不跟面板的主要動作搶（`FE-X16-S09`） */}
      <button type="submit" {...SECONDARY} disabled={tooLong}>
        {CHAT_COMPOSER_LABELS.submit}
      </button>
    </form>
  )
}
