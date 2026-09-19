'use client'

import { PRIMARY } from '@/design/controls'
import { useIdentity } from '@/identity/IdentityProvider'
import { useInboxIfProvided } from './InboxPanelProvider'

// 別人名片上的「寄信給他」。規格 `FE-K01`〈收件匣是阻斷式面板，兩個入口〉：開收件匣直接進對話，看板由協調者讓位（`FE-X16-S13`）。
//
// 只在 `signed-in`、對方不是我、而且有收件匣 provider 時才長出來：訪客沒有信、自己不能寄給自己（後端 `no_self_send`）、
// `BoardPanel` 單獨渲染（既有測試）時沒有入口。**它不在 `TalentFacts` 裡**（那是純呈現）—— 由呼叫端（`BoardPanel`）塞進 `TalentDetail` 的 `actions` 槽。

export const SEND_MESSAGE_LABEL = '寄信給他'

export function SendMessageButton({ to, label = SEND_MESSAGE_LABEL }: { to: string; /** 案件詳情上叫「私訊發案者」（`FE-B03`）；同一顆按鈕、同一條路。 */ label?: string }) {
  const identity = useIdentity()
  const inbox = useInboxIfProvided()
  if (inbox === null || identity.state !== 'signed-in' || identity.profile.id === to) return null
  return (
    <button
      type="button"
      // 這個詳情上唯一的前進動作 → 主要（`FE-X16-S09`）
      {...PRIMARY}
      data-testid="send-message"
      // 協調者讓看板讓位（不還焦點），收件匣掛載時持自己那把鎖、把焦點拿進來。design `D1` 的交接。
      onClick={() => inbox.openThreadFromTalent(to)}
    >
      {label}
    </button>
  )
}
