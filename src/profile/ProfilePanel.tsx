'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProfileOut } from '@/api/contract/rest'
import { useIdentity } from '@/identity/IdentityProvider'
import { SECONDARY } from '@/design/controls'
import { PanelShell } from '@/panel/PanelShell'
import { TalentFacts } from '@/talent/TalentFacts'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import { DiscardConfirm } from './DiscardConfirm'
import { ProfileForm } from './ProfileForm'
import { useProfilePanel, useProfilePanelIfProvided } from './ProfilePanelProvider'

// 「我的名片」面板。規格 `FE-A04`〈名字是入口，面板是阻斷式的〉、〈顯示我的名片，用同一個呈現元件〉、〈編輯四欄⋯⋯〉、〈未儲存就關要確認⋯⋯〉。
//
// 兩個模式：顯示（`TalentFacts` ＋ 編輯鈕）、編輯（`ProfileForm`）。按「編輯」在**同一個面板原地**切成表單；成功、丟棄、乾淨的取消都回到顯示。
// 殼的關閉意圖（Escape、關閉鈕）在編輯模式交給表單裁決（送出中無效、dirty 先問）；顯示模式直接關。
//
// 渲染在 `WorldCanvas` 裡（跟 `BoardPanel` 同一個位置：`InteractionProvider` 底下、`data-focus-anchor` 那個 div 裡 —— 同一個定位基準）。
// 開關狀態在 `ProfilePanelProvider`（標題列的按鈕在 `WorldCanvas` 外面，所以 provider 在更上面）。
//
// ⚠️ **鎖在這裡持有**（design `D1` 修正）：掛載時 `holdInputLock`、卸載釋放。晚一個 effect 沒關係 —— 面板是滑鼠點標題列開的，
// 不是世界裡的鍵，沒有「下一個方向鍵要立刻被擋」的問題。
//
// ⚠️ **內容來自 `IdentityProvider` 手上那份 `ProfileOut`**，同步可得，不打 `GET /api/profiles/{id}`（`S03`）。
// 身分不是 `signed-in` 時入口按鈕本來就不存在，所以這裡沒有「載入失敗」那條路；萬一面板開著時身分變了（登出、問不到），面板就消失。

export const PROFILE_PANEL_LABELS = { title: '我的名片', close: '關閉', edit: '編輯' }

function OpenProfilePanel({ profile }: { profile: ProfileOut }) {
  const { closePanel } = useProfilePanel()
  const { holdInputLock } = useInteraction()
  const root = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [confirming, setConfirming] = useState(false)
  // 表單掛上來的「關閉意圖」處理（送出中無效、dirty 先問、否則回顯示）。顯示模式沒有表單：直接關面板。
  const closeIntentRef = useRef<(() => void) | null>(null)
  // 確認層是殼的 overlay（表單變 inert）；「繼續編輯」之後焦點要回到剛剛在的地方（overlay 卸載時焦點會掉到 body）。
  const focusBeforeConfirm = useRef<HTMLElement | null>(null)

  // 世界輸入鎖：面板開著人不能走（`S01`）；關了要放（`S02`）。
  useEffect(() => holdInputLock('profile-panel'), [holdInputLock])
  // 焦點進面板（`S01`）：Tab 從這裡開始在面板內循環。
  useEffect(() => {
    root.current?.focus()
  }, [])

  const onCloseRequest = () => {
    if (mode === 'edit') closeIntentRef.current?.()
    else closePanel()
  }
  const editButton = useRef<HTMLButtonElement>(null)
  const backToView = () => {
    setConfirming(false)
    setMode('view')
  }
  // 回到顯示（成功、丟棄、取消）：焦點到「編輯」鈕 —— 表單卸載了，不接的話焦點掉到 body（審查抓到的）。
  // **只在 edit → view 時**：初次打開的焦點策略是面板根節點（上面那個 effect），不被這裡搶走。
  const wasEditing = useRef(false)
  useEffect(() => {
    if (mode === 'view' && wasEditing.current) editButton.current?.focus()
    wasEditing.current = mode === 'edit'
  }, [mode])
  const askDiscard = () => {
    focusBeforeConfirm.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirming(true)
  }
  const keepEditing = () => {
    setConfirming(false)
    const back = focusBeforeConfirm.current
    focusBeforeConfirm.current = null
    // overlay 卸載之後再還焦點（同一個 commit 之後）。
    queueMicrotask(() => back?.focus())
  }

  return (
    <PanelShell
      title={PROFILE_PANEL_LABELS.title}
      closeLabel={PROFILE_PANEL_LABELS.close}
      testId="profile-panel"
      onCloseRequest={onCloseRequest}
      overlay={confirming ? <DiscardConfirm onDiscard={backToView} onKeep={keepEditing} /> : null}
    >
      {/* 只是捲動容器與初始焦點，不是第二個 landmark（殼的 section 已經叫「我的名片」）。 */}
      <div ref={root} tabIndex={-1} data-mode={mode} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
        {mode === 'view' ? (
          <>
            <TalentFacts profile={profile} />
            {/* 編輯鈕在面板層，不在 `TalentFacts`（design `D2`）：別人的名片走 `BoardPanel`，那裡沒有它（`S03`）。 */}
            <button ref={editButton} type="button" className={SECONDARY} onClick={() => setMode('edit')}>
              {PROFILE_PANEL_LABELS.edit}
            </button>
          </>
        ) : (
          <ProfileForm profile={profile} onDone={backToView} closeIntentRef={closeIntentRef} askDiscard={askDiscard} />
        )}
      </div>
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
