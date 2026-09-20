'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProfileOut } from '@/api/contract/rest'
import { SECONDARY, withClass } from '@/design/controls'
import { useIdentity } from '@/identity/IdentityProvider'
import { PanelShell } from '@/panel/PanelShell'
import { TalentFacts } from '@/talent/TalentFacts'
import { DiscardConfirm } from './DiscardConfirm'
import { ProfileForm, type CloseIntent } from './ProfileForm'
import { useProfilePanel } from './ProfilePanelProvider'

// 「我的名片」面板的**內容**。規格 `FE-A04`〈名字是入口，面板是阻斷式的〉、〈顯示我的名片〉、〈編輯四欄⋯⋯〉、〈未儲存就關要確認⋯⋯〉。
//
// ⚠️ **這個檔案被 `PanelHost` lazy 載入**（`FE-X15` --panel-profile；design D3）：它是名片的重模組（帶 `ProfileForm`／`TalentFacts`），
// 開啟意圖成立前不進首屏 chunk。**世界輸入鎖已上移到 host** —— 面板 lazy 後，鎖要在 chunk 抵達前就成立，
// 只有 eager 的 host 做得到；這裡原本掛載時 `holdInputLock('profile-panel')` 的那段移走了。
//
// 兩個模式：顯示（`TalentFacts` ＋ 編輯鈕）、編輯（`ProfileForm`）。殼的關閉意圖在編輯模式交給表單裁決（送出中無效、dirty 先問）。
// ⚠️ 內容來自 `IdentityProvider` 手上那份 `ProfileOut`，同步可得，不打 `GET /api/profiles/{id}`（`S03`）。

export const PROFILE_PANEL_LABELS = { title: '我的名片', close: '關閉', edit: '編輯' }

function OpenProfilePanel({ profile }: { profile: ProfileOut }) {
  const { closePanel, yieldPanel } = useProfilePanel()
  const root = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [confirming, setConfirming] = useState(false)
  const closeIntentRef = useRef<CloseIntent | null>(null)
  const focusBeforeConfirm = useRef<HTMLElement | null>(null)

  // 焦點進面板（`S01`）：Tab 從這裡開始在面板內循環。（世界輸入鎖在 host，不在這裡。）
  // 載入殼先取得焦點、內容掛上來後這個 effect 把焦點接過來 —— 交棒在同一個 commit，不會掉到 body。
  useEffect(() => {
    root.current?.focus()
  }, [])

  const onCloseRequest = () => {
    if (mode === 'edit') closeIntentRef.current?.requestClose()
    else closePanel()
  }
  // 讓位協定（`FE-X16-S14`）：顯示模式隨時可以；編輯中問表單（送出中、dirty → 不行）。
  const panel = { id: 'profile-panel' as const, canYield: () => mode !== 'edit' || (closeIntentRef.current?.canYield() ?? true), onYield: yieldPanel }
  const editButton = useRef<HTMLButtonElement>(null)
  const backToView = () => {
    setConfirming(false)
    setMode('view')
  }
  // 回到顯示（成功、丟棄、取消）：焦點到「編輯」鈕 —— 表單卸載了，不接的話焦點掉到 body。**只在 edit → view 時**。
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
    // 視窗卸載、inert 拿掉之後再還焦點（同一個 commit 之後）。
    queueMicrotask(() => back?.focus())
  }

  return (
    <PanelShell
      title={PROFILE_PANEL_LABELS.title}
      closeLabel={PROFILE_PANEL_LABELS.close}
      testId="profile-panel"
      panel={panel}
      onCloseRequest={onCloseRequest}
    >
      {/* 只是捲動容器與初始焦點，不是第二個 landmark（殼的 section 已經叫「我的名片」）。 */}
      <div ref={root} tabIndex={-1} data-mode={mode} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
        {mode === 'view' ? (
          <>
            <TalentFacts profile={profile} />
            {/* 編輯鈕在面板層，不在 `TalentFacts`：別人的名片走 `BoardPanel`，那裡沒有它（`S03`）。 */}
            <button ref={editButton} type="button" {...withClass(SECONDARY, 'self-start')} onClick={() => setMode('edit')}>
              {PROFILE_PANEL_LABELS.edit}
            </button>
          </>
        ) : (
          <ProfileForm profile={profile} onDone={backToView} closeIntentRef={closeIntentRef} askDiscard={askDiscard} />
        )}
      </div>
      {/* 放棄修改確認：`PanelDialog` 把它掛到內容區上（遮罩＋內容區 inert）。 */}
      {confirming && <DiscardConfirm onDiscard={backToView} onKeep={keepEditing} />}
    </PanelShell>
  )
}

// `PanelHost` 的 `load` 拿到的 default：讀身分、渲染內容。host 只在身分 signed-in 時開這個面板，
// 但萬一開著時身分變了（登出、問不到），這裡再擋一層（`ProfilePanel` 也會同步把協調者的 active 關掉）。
export default function ProfilePanelContent() {
  const identity = useIdentity()
  if (identity.state !== 'signed-in') return null
  return <OpenProfilePanel profile={identity.profile} />
}
