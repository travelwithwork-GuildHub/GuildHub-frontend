'use client'

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ChatIn } from '@/api/contract/ws'
import { FIELD, FIELD_LABEL, PRIMARY } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'

// 場景聊天的輸入。規格 `FE-K04`〈全空白不送、非空白原值送；沒有上限；只有 transport 接受了才清空、失敗保留〉（design D3、D4）。
//
// `send` 是注入的（`SceneChatHud` 給 `useSceneChat().send`；測試給假的）。沒有 `useForm`：沒有規則可驗（後端對 body 沒有任何限制，`FE-R11` D5），
// 但 alert 的位置與焦點照 `form-conventions`（`SubmitError`：在送出控制之前、`role="alert"`、出現時取焦點）。
// `trim()` 為空就不送（讓人知道要先輸入）；否則送**原字串**（含首尾空白，不 trim）。沒有 `maxLength`、沒有剩餘字數（沒有上限可數）。
// `send` 同步回來沒拋才清空；拋了（沒連線、沒 ready、socket 拋）就保留輸入、顯示受控的一句 —— 不印例外訊息、不自動重送（節流是 `FE-X11` 的事，
// 之後包在 `send` 外面，被節流也是「沒交給 transport」→ 同一條保留的路）。
// Enter 送、Shift+Enter 交給瀏覽器換行（不 preventDefault）。Escape 離開輸入框是 `--world` 那片接的（焦點回世界錨）。
// ⚠️ 這裡的字是元件常數，不是規格。

export const CHAT_COMPOSER_LABELS = {
  field: '說點什麼',
  submit: '送出',
  needInput: '先輸入內容再送出。',
  notSent: '沒送出去 —— 現在還連不上，等一下再試。',
}

export function SceneChatComposer({ send }: { send: (input: ChatIn) => void }) {
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = () => {
    if (value.trim() === '') {
      setProblem(CHAT_COMPOSER_LABELS.needInput)
      return
    }
    try {
      send({ t: 'chat', body: value })
    } catch {
      // 拋的是什麼都一樣：沒交給 transport 就保留、說一句受控的話。例外本身不進 DOM。
      setProblem(CHAT_COMPOSER_LABELS.notSent)
      return
    }
    setValue('')
    setProblem(null)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
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
        <textarea rows={2} className={`${FIELD} resize-none`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} data-testid="chat-input" />
      </label>
      <SubmitError message={problem} />
      <button type="submit" className={PRIMARY}>
        {CHAT_COMPOSER_LABELS.submit}
      </button>
    </form>
  )
}
