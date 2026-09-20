'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useIdentity } from '@/identity/IdentityProvider'
import { PanelHost } from '@/panel/PanelHost'
import { useInteractionIfProvided } from '@/world/interaction/InteractionProvider'
import { useProfilePanelIfProvided } from './ProfilePanelProvider'

// 「我的名片」面板的**掛載點**。規格 `FE-A04`；`FE-X15` --panel-profile（design D3）：
// 改用 `PanelHost` lazy 載入內容（`OpenProfilePanel`）、**世界輸入鎖上移到 host**。
//
// 渲染在 `WorldCanvas` 裡（`InteractionProvider` 底下）—— host 的世界輸入鎖從這裡拿。
// 「開不開」在協調者（`useProfilePanelIfProvided().open`）；名片重模組在開啟意圖成立後才 import（S04）。
// 沒有 provider（`WorldCanvas` 單獨渲染的既有測試）：沒有入口，面板不存在。

export function ProfilePanel() {
  const panel = useProfilePanelIfProvided()
  const identity = useIdentity()
  const interaction = useInteractionIfProvided()
  const signedIn = identity.state === 'signed-in'
  const panelOpen = panel?.open ?? false
  const closePanel = panel?.closePanel

  // 面板開著時登出／問不到：關掉協調者的 active（host 的 open 會因 signedIn=false 而 false、鎖跟著釋放）。
  useEffect(() => {
    if (panelOpen && !signedIn) closePanel?.()
  }, [panelOpen, signedIn, closePanel])

  // 注入給 host 的世界輸入鎖：open 當下 host 呼叫 `acquire()`（chunk 抵達前就鎖，S04）。
  // 真的要鎖卻沒有 `InteractionProvider` 時在 acquire 當下炸（不靜默）—— 但只有「開啟」才會走到，關著不炸。
  const lock = useMemo(
    () => ({
      acquire: () => {
        if (interaction === null) throw new Error('名片面板要在 <InteractionProvider> 底下才能鎖世界輸入。')
        return interaction.holdInputLock('profile-panel')
      },
    }),
    [interaction],
  )
  // 穩定的 loader（`import()` 直接指到 lazy 模組、不經 barrel）：不 memo 的話每次 render 都是新函式，host 的載入 effect 會反覆重跑。
  const load = useCallback(() => import('./OpenProfilePanel'), [])
  const onExit = useCallback(() => closePanel?.(), [closePanel])

  if (panel === null) return null
  return (
    <PanelHost open={panelOpen && signedIn} panelId="profile-panel" title="我的名片" load={load} lock={lock} onExit={onExit} />
  )
}
