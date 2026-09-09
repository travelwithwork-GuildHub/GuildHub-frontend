import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { InteractionPrompt } from '@/world/interaction/InteractionPrompt'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'

// 規格：openspec/specs/spatial-interaction/spec.md
//   Requirement: 提示是 DOM，不是 3D 物件 —— Scenario FE-W06-S13 / FE-W06-S14
//
// ⚠️ **受測的是真的 `InteractionPrompt` 與真的 `InteractionProvider`。**
// 測試自己的只有下面那個把 `setTarget` 交出來的小元件 ——
// 正常路徑上呼叫它的是 `SpatialInteraction`（在 Canvas 裡，用 `useFrame`），
// 而那條路徑由 `tests/interaction-loop.test.tsx` 驗。

let setTarget: ReturnType<typeof useInteraction>['setTarget']

function Handle() {
  setTarget = useInteraction().setTarget
  return null
}

function mount() {
  return render(
    <InteractionProvider>
      <Handle />
      <InteractionPrompt />
    </InteractionProvider>,
  )
}

describe('互動提示', () => {
  it('[FE-W06-S13] 有目標時提示出現，而且指名是哪一個物件', () => {
    mount()
    expect(screen.queryByTestId('interaction-prompt')).toBeNull()

    act(() => setTarget({ id: 'board:main', label: '專案看板', distance: 1.2 }))

    const prompt = screen.getByTestId('interaction-prompt')
    // 規格的字面要求：**不能只寫「按 E」** ——
    // 兩個物件靠很近時，那句話沒有回答「按下去會發生什麼」
    expect(prompt.textContent).toContain('專案看板')
    expect(prompt.textContent).toContain('E')
  })

  it('[FE-W06-S14] 目標換人時，提示的內容跟著換', () => {
    mount()
    act(() => setTarget({ id: 'a', label: '專案看板', distance: 1 }))
    expect(screen.getByTestId('interaction-prompt').textContent).toContain('專案看板')

    act(() => setTarget({ id: 'b', label: '人才看板', distance: 1 }))

    const prompt = screen.getByTestId('interaction-prompt')
    expect(prompt.textContent).toContain('人才看板')
    expect(prompt.textContent, '換了目標，舊的名字還留著').not.toContain('專案看板')
  })

  it('[FE-W06-S09] 沒有目標時提示消失', () => {
    mount()
    act(() => setTarget({ id: 'a', label: '專案看板', distance: 1 }))
    expect(screen.queryByTestId('interaction-prompt')).not.toBeNull()

    act(() => setTarget({ id: null, label: null, distance: null }))

    expect(screen.queryByTestId('interaction-prompt')).toBeNull()
  })
})
