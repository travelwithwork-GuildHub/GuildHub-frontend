'use client'

import { SECONDARY } from '@/design/controls'
import { useIdentity } from '@/identity/IdentityProvider'
import { useInbox } from './InboxPanelProvider'

// 標題列的「收件匣」。規格 `FE-K01`〈收件匣是阻斷式面板，兩個入口〉—— 只在 `signed-in` 時出現（訪客沒有信）。
// 不顯示未讀數（`BE-G06`：沒有寫得到 `read_at` 的端點）。**必須在 `<InboxPanelProvider>` 底下。**

export const INBOX_BUTTON_LABEL = '收件匣'

export function InboxButton() {
  const identity = useIdentity()
  const { openList } = useInbox()
  if (identity.state !== 'signed-in') return null
  return (
    <button type="button" className={SECONDARY} data-testid="inbox-button" onClick={(e) => openList(e.currentTarget)}>
      {INBOX_BUTTON_LABEL}
    </button>
  )
}
