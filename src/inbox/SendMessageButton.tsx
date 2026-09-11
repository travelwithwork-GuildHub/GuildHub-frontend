'use client'

import { SECONDARY } from '@/design/controls'
import { useIdentity } from '@/identity/IdentityProvider'
import { useInboxIfProvided } from './InboxPanelProvider'

// 別人名片上的「寄信給他」。規格 `FE-K01`〈收件匣是阻斷式面板，兩個入口〉：關掉看板面板、開收件匣直接進對話。
//
// 只在 `signed-in`、對方不是我、而且有收件匣 provider 時才長出來：訪客沒有信、自己不能寄給自己（後端 `no_self_send`）、
// `BoardPanel` 單獨渲染（既有測試）時沒有入口。**它不在 `TalentFacts` 裡**（那是純呈現）—— 由呼叫端（`BoardPanel`）塞進 `TalentDetail` 的 `actions` 槽。

export const SEND_MESSAGE_LABEL = '寄信給他'

export function SendMessageButton({ to, onBeforeOpen }: { to: string; onBeforeOpen: () => void }) {
  const identity = useIdentity()
  const inbox = useInboxIfProvided()
  if (inbox === null || identity.state !== 'signed-in' || identity.profile.id === to) return null
  return (
    <button
      type="button"
      className={SECONDARY}
      data-testid="send-message"
      onClick={() => {
        // 先關看板（它會把焦點放到世界錨、放掉它那把鎖），再開收件匣（掛載時持自己那把、把焦點拿進來）。design `D1` 的交接。
        onBeforeOpen()
        inbox.openThreadFromTalent(to)
      }}
    >
      {SEND_MESSAGE_LABEL}
    </button>
  )
}
