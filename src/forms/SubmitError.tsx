'use client'

import { useEffect, useRef } from 'react'

// 送出失敗的訊息。規格 `FE-X05`〈送出中、失敗、重試〉：放在送出鈕**上方**（DOM 順序在鈕之前）、`role="alert"`、
// 出現時取得焦點（長表單按了底部的鈕、錯誤出現在看不到的地方 —— 螢幕閱讀器與鍵盤使用者要知道發生了什麼）。
// 文案是呼叫端從 `toUiError` 拿的；這裡不翻譯任何錯誤。

export function SubmitError({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message !== null) ref.current?.focus()
  }, [message])
  if (message === null) return null
  return (
    <p ref={ref} role="alert" tabIndex={-1} data-testid="submit-error" className="text-danger">
      {message}
    </p>
  )
}
