'use client'

import type { ReactNode } from 'react'
import { SECONDARY } from '@/design/controls'
import type { UiError } from '@/errors/uiError'

// 清單的空狀態。規格 `FE-X04`（empty-state）。**唯一一份。**
//
// 五種：首次無資料／篩選無結果／翻到底／載入失敗／權限阻擋。
// 前三種的字句在這裡（`COPY`）；後兩種**沒有自己的一句話** —— 那一句是 `FE-X03` 的
// `UiError.message`，這裡只裝幀（種類標記、重試、動作插槽）。兩份語彙各自唯一，不互相抄。
//
// ⚠️ **呼叫端只能說「失敗」，不能自己指定是載入失敗還是權限阻擋。** 那由 `error.kind` 決定
//（`failureKind`）—— 整個前端只有這一處在決定。讓呼叫端傳 `permission-blocked` 又傳一個
// `server-error` 的 error，元件會自相矛盾。
//
// ⚠️ **這個模組不讀 HTTP status、例外型別或後端 `detail`。** `HttpError`／`NetworkError`
// 的 import 有 lint 擋著（`FE-X03-S16`）；這裡連 `src/api/` 都不 import。
//
// ⚠️ **權限阻擋沒有重試。** 重試一百次也不會好。它有一個由呼叫端決定的選填動作 ——
// 要不要、去哪裡（登入？建立身分？）不是這個共用元件該知道的事。
//
// 「空狀態」是清單狀態呈現的統稱：續頁失敗時面板不是空的（容器留著舊卡片），
// 列表之後放的是同一個「載入失敗」版型 —— 差別在容器，不在這裡。

export type EmptyStateKind =
  | 'first-empty'
  | 'filtered-empty'
  | 'exhausted'
  | 'load-failed'
  | 'permission-blocked'

/** 前三種的字句。**只有這裡可以有這些句子。** */
const COPY: Record<'first-empty' | 'filtered-empty' | 'exhausted', string> = {
  'first-empty': '這裡還沒有東西。',
  'filtered-empty': '沒有符合條件的結果 —— 放寬一點試試。',
  exhausted: '都看完了。',
}

const RETRY_LABEL = '再試一次'

/** 哪一種失敗畫成哪一種。**整個前端只有這一處在決定。** 規格 `FE-X04-S04`～`S06`。 */
export function failureKind(error: UiError): 'load-failed' | 'permission-blocked' {
  return error.kind === 'authentication-required' || error.kind === 'permission-denied'
    ? 'permission-blocked'
    : 'load-failed'
}

export type EmptyStateProps =
  | { kind: 'first-empty' | 'filtered-empty' | 'exhausted' }
  | {
      kind: 'failure'
      error: UiError
      /** 清單容器給的「重試同一頁」。只在載入失敗時畫出來。 */
      retry: () => void
      /** 權限阻擋時呼叫端給的動作（去登入之類）。沒給就什麼都不畫。 */
      action?: ReactNode
    }

export function EmptyState(props: EmptyStateProps) {
  if (props.kind !== 'failure') {
    return (
      <p data-testid="empty-state" data-empty-state={props.kind} role="status" className="text-ink-muted">
        {COPY[props.kind]}
      </p>
    )
  }
  const kind = failureKind(props.error)
  return (
    <div
      data-testid="empty-state"
      data-empty-state={kind}
      role={kind === 'load-failed' ? 'alert' : 'status'}
      className="flex flex-col gap-2"
    >
      <p className="text-ink-muted">{props.error.message}</p>
      {kind === 'load-failed' && (
        <button type="button" className={SECONDARY} onClick={props.retry}>
          {RETRY_LABEL}
        </button>
      )}
      {kind === 'permission-blocked' && props.action}
    </div>
  )
}
