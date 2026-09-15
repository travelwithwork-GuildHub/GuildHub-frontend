'use client'

import { useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ChatIn } from '@/api/contract/ws'
import { FIELD, FIELD_LABEL, PRIMARY } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'

// 場景聊天的輸入。規格 `FE-K04`〈全空白不送、非空白原值送；沒有上限；只有 transport 接受了才清空、失敗保留〉（design D3、D4）。
//
// `send` 是注入的（`SceneChatHud` 給 `useSceneChat().send`；測試給假的）。沒有 `useForm`：沒有規則可驗（後端對 body 沒有任何限制，`FE-R11` D5），
// 但 alert 的位置與焦點照 `form-conventions`（`SubmitError`：在送出控制之前、`role="alert"`、出現時取焦點）。
// `trim()` 為空就不送：那是**欄位級**的、可修正的問題 —— 照 `form-conventions` 的欄位錯誤（`aria-invalid`＋`aria-describedby` 掛在欄位下），
// 不是 `role="alert"`、不搶焦點（chat 是高頻操作，空的 Enter 不該把人從輸入框拉走；審查抓到的）。否則送**原字串**（含首尾空白，不 trim）。
// 沒有 `maxLength`、沒有剩餘字數（沒有上限可數）。
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

  const submit = () => {
    if (value.trim() === '') {
      setNeedInput(true)
      return
    }
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
          className={`${FIELD} resize-none`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setNeedInput(false)
            setFailures(0)
          }}
          onKeyDown={onKeyDown}
          aria-invalid={needInput || undefined}
          aria-describedby={needInput ? hintId : undefined}
          data-testid="chat-input"
        />
      </label>
      {needInput && (
        <p id={hintId} data-testid="chat-need-input" className="text-danger text-caption">
          {CHAT_COMPOSER_LABELS.needInput}
        </p>
      )}
      <SubmitError key={failures} message={failures > 0 ? CHAT_COMPOSER_LABELS.notSent : null} />
      <button type="submit" className={PRIMARY}>
        {CHAT_COMPOSER_LABELS.submit}
      </button>
    </form>
  )
}
