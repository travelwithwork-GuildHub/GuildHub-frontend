'use client'

import { useEffect, useRef } from 'react'
import type { ProfileOut } from '@/api/contract/rest'
import { useIdentity } from '@/identity/IdentityProvider'
import { PanelShell } from '@/panel/PanelShell'
import { TalentFacts } from '@/talent/TalentFacts'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import { useProfilePanel, useProfilePanelIfProvided } from './ProfilePanelProvider'

// 「我的名片」面板。規格 `FE-A04`〈名字是入口，面板是阻斷式的〉、〈顯示我的名片，用同一個呈現元件〉。
//
// 渲染在 `WorldCanvas` 裡（跟 `BoardPanel` 同一個位置：`InteractionProvider` 底下、`data-focus-anchor` 那個 div 裡 —— 同一個定位基準）。
// 開關狀態在 `ProfilePanelProvider`（標題列的按鈕在 `WorldCanvas` 外面，所以 provider 在更上面）。
//
// ⚠️ **鎖在這裡持有**（design `D1` 修正）：掛載時 `holdInputLock`、卸載釋放。晚一個 effect 沒關係 —— 面板是滑鼠點標題列開的，
// 不是世界裡的鍵，沒有「下一個方向鍵要立刻被擋」的問題。
//
// ⚠️ **內容來自 `IdentityProvider` 手上那份 `ProfileOut`**，同步可得，不打 `GET /api/profiles/{id}`（`S03`）。
// 身分不是 `signed-in` 時入口按鈕本來就不存在，所以這裡沒有「載入失敗」那條路；萬一面板開著時身分變了（登出、問不到），面板就消失。

export const PROFILE_PANEL_LABELS = { title: '我的名片', close: '關閉' }

function OpenProfilePanel({ profile }: { profile: ProfileOut }) {
  const { closePanel } = useProfilePanel()
  const { holdInputLock } = useInteraction()
  const root = useRef<HTMLElement>(null)

  // 世界輸入鎖：面板開著人不能走（`S01`）；關了要放（`S02`）。
  useEffect(() => holdInputLock('profile-panel'), [holdInputLock])
  // 焦點進面板（`S01`）：Tab 從這裡開始在面板內循環。
  useEffect(() => {
    root.current?.focus()
  }, [])

  return (
    <PanelShell title={PROFILE_PANEL_LABELS.title} closeLabel={PROFILE_PANEL_LABELS.close} testId="profile-panel" onCloseRequest={closePanel}>
      <section ref={root} tabIndex={-1} aria-label={PROFILE_PANEL_LABELS.title} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
        <TalentFacts profile={profile} />
      </section>
    </PanelShell>
  )
}

export function ProfilePanel() {
  // 沒有 provider（`WorldCanvas` 單獨渲染）：沒有開啟按鈕，面板不存在。
  const panel = useProfilePanelIfProvided()
  const identity = useIdentity()
  const open = panel?.open ?? false
  const signedIn = identity.state === 'signed-in'
  const closePanel = panel?.closePanel
  // 面板開著時身分不再是 signed-in（登出、問不到）：關掉，鎖跟著卸載一起放。
  useEffect(() => {
    if (open && !signedIn) closePanel?.()
  }, [open, signedIn, closePanel])
  // 關著的時候整個不掛：Escape 層與鎖都跟著掛載走。
  if (!open || identity.state !== 'signed-in') return null
  return <OpenProfilePanel profile={identity.profile} />
}
