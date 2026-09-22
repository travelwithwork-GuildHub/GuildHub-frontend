'use client'

import { HUD_ICON_BUTTON } from '@/design/controls'
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
    <button type="button" className={HUD_ICON_BUTTON} aria-label={INBOX_BUTTON_LABEL} data-testid="inbox-button" onClick={(e) => openList(e.currentTarget)}>
      {/* 信封（Heroicons「envelope」風）。`aria-label` 給名字。 */}
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    </button>
  )
}
