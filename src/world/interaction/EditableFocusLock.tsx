'use client'

import { useEffect } from 'react'
import { useInteraction } from './InteractionProvider'

// 焦點在能輸入文字的控制上時，打字不是走路。規格 `FE-X06`〈焦點在能輸入文字的控制上時，打字不是走路〉。
//
// 今天世界裡沒有任何文字輸入框（狀態文字、聊天、搜尋都還沒做）。這個元件先掛著，
// 等第一個輸入框來的時候不必再發明一次鎖 —— 那正是 Alarm 說的「晚做要改每一個面板」。
//
// ⚠️ **不在 `focusout` 當下決定。** 那一刻的 `activeElement` 不是可靠的最終焦點（各瀏覽器可能是
// 舊元素、新元素或 `body`）。每次焦點事件之後排一次重算：**microtask**（正常的焦點轉移是同步
// 完成的）**＋下一個 task**（給「某個平台把後續 `focus()` 延到另一個 task」的保險）。
// 重算是冪等的：該持有就確保持有一把，不該就釋放 —— 從一個輸入框直接移到另一個，token 不換。
//
// ⚠️ **只算能接受文字的控制。** checkbox／radio／button 有焦點時按 W 就是要走路。

/** 能接受文字的 `input` 型別。沒有 `type` 就是 `text`。 */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number'])

export function isTextEditable(element: Element | null): boolean {
  if (element === null) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has((element.type || 'text').toLowerCase())
  // `contenteditable`：元素本身或祖先。
  return element instanceof HTMLElement && element.isContentEditable
}

export function EditableFocusLock() {
  const { holdInputLock } = useInteraction()

  useEffect(() => {
    let release: (() => void) | null = null
    const recompute = () => {
      if (isTextEditable(document.activeElement)) {
        release ??= holdInputLock('editable-focus')
      } else {
        release?.()
        release = null
      }
    }
    const schedule = () => {
      queueMicrotask(recompute)
      setTimeout(recompute, 0)
    }
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    recompute()
    return () => {
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
      release?.()
      release = null
    }
  }, [holdInputLock])

  return null
}
