import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'

// 規格：openspec/changes/fe-b03-project-detail/specs/deep-link/spec.md —— `FE-B09-S14` 的 provider 半邊：
//   `selected` 是「開著的面板裡選中的那一筆」（人才或案件）；`selectProject` 只在案件面板下有效、`selectProfile` 只在人才面板下有效。
//   整棵樹（網址 ⇄ 狀態、push／replace）在 `deep-link.test.tsx`。不連任何外部服務。

const PID = '44444444-4444-4444-4444-000000000009'
const ID = '33333333-3333-3333-3333-000000000007'
const wrapper = ({ children }: { children: ReactNode }) => (
  <InteractionProvider>
    <ListPanelProvider>{children}</ListPanelProvider>
  </InteractionProvider>
)

describe('provider：選中的案件', () => {
  it('[FE-B09-S14] restore 帶 project：面板是案件、selected 是那一筆；帶 profile：selected 是人才那一筆', () => {
    const { result } = renderHook(() => useListPanel(), { wrapper })
    act(() => result.current.restore({ panel: 'projects', profile: null, project: PID, page: 1 }))
    expect(result.current.open).toBe('projects')
    expect(result.current.selected).toBe(PID)
    expect(result.current.page).toBe(1)
    act(() => result.current.restore({ panel: 'profiles', profile: ID, project: null, page: 0 }))
    expect(result.current.selected).toBe(ID)
  })

  it('[FE-B09-S14] selectProject 只在案件面板下有效；selectProfile 只在人才面板下有效；換面板選中清掉', () => {
    const { result } = renderHook(() => useListPanel(), { wrapper })
    act(() => result.current.openPanel('profiles'))
    act(() => result.current.selectProject(PID))
    expect(result.current.selected, '人才面板下選案件不該生效').toBeNull()
    act(() => result.current.openPanel('projects'))
    expect(result.current.selected).toBeNull()
    act(() => result.current.selectProject(PID))
    expect(result.current.selected).toBe(PID)
    act(() => result.current.selectProfile(ID))
    expect(result.current.selected, '案件面板下選人才不該生效').toBe(PID)
    act(() => result.current.selectProject(null))
    expect(result.current.selected).toBeNull()
    act(() => result.current.selectProject(PID))
    act(() => result.current.openPanel('profiles'))
    expect(result.current.selected, '換一塊看板要從頭開始').toBeNull()
  })
})
