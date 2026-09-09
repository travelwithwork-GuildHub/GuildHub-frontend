import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act, useEffect, type RefObject } from 'react'
import { InteractionPrompt } from '@/world/interaction/InteractionPrompt'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'

// 規格：openspec/specs/spatial-interaction/spec.md
//   Requirement: 提示是 DOM，不是 3D 物件 —— Scenario FE-W06-S13 / FE-W06-S14
//
// ⚠️ **受測的是真的 `InteractionPrompt` 與真的 `InteractionProvider`。**
// 測試自己的只有下面那個把 `setTarget` 交出來的小元件 ——
// 正常路徑上呼叫它的是 `SpatialInteraction`（在 Canvas 裡，用 `useFrame`），
// 而那條路徑由 `tests/interaction-loop.test.tsx` 驗。

type SetTarget = ReturnType<typeof useInteraction>['setTarget']

/**
 * 把 `setTarget` 交到測試手上。
 *
 * ⚠️ **用 ref 當 prop、只在 effect 裡寫。** 在 render 期間指派給外部變數會被
 * `react-hooks/globals` 擋，直接改 prop 物件會被 `react-hooks/immutability` 擋 ——
 * **兩條規則都是對的**。傳 ref 是這個 repo 既有的模式（`targetRef`、`poseRef`）。
 */
function Handle({ handleRef }: { handleRef: RefObject<{ setTarget?: SetTarget }> }) {
  const { setTarget } = useInteraction()
  useEffect(() => {
    handleRef.current.setTarget = setTarget
  }, [handleRef, setTarget])
  return null
}

function mount() {
  const handleRef: RefObject<{ setTarget?: SetTarget }> = { current: {} }
  render(
    <InteractionProvider>
      <Handle handleRef={handleRef} />
      <InteractionPrompt />
    </InteractionProvider>,
  )
  return (target: Parameters<SetTarget>[0]) => {
    act(() => handleRef.current.setTarget?.(target))
  }
}

describe('互動提示', () => {
  it('[FE-W06-S13] 有目標時提示出現，而且指名是哪一個物件', () => {
    const setTarget = mount()
    expect(screen.queryByTestId('interaction-prompt')).toBeNull()

    setTarget({ id: 'board:main', label: '專案看板', distance: 1.2 })

    const prompt = screen.getByTestId('interaction-prompt')
    // 規格的字面要求：**不能只寫「按 E」** ——
    // 兩個物件靠很近時，那句話沒有回答「按下去會發生什麼」
    expect(prompt.textContent).toContain('專案看板')
    expect(prompt.textContent).toContain('E')
  })

  it('[FE-W06-S14] 目標換人時，提示的內容跟著換', () => {
    const setTarget = mount()
    setTarget({ id: 'a', label: '專案看板', distance: 1 })
    expect(screen.getByTestId('interaction-prompt').textContent).toContain('專案看板')

    setTarget({ id: 'b', label: '人才看板', distance: 1 })

    const prompt = screen.getByTestId('interaction-prompt')
    expect(prompt.textContent).toContain('人才看板')
    expect(prompt.textContent, '換了目標，舊的名字還留著').not.toContain('專案看板')
  })

  it('[FE-W06-S09] 沒有目標時提示消失', () => {
    const setTarget = mount()
    setTarget({ id: 'a', label: '專案看板', distance: 1 })
    expect(screen.queryByTestId('interaction-prompt')).not.toBeNull()

    setTarget({ id: null, label: null, distance: null })

    expect(screen.queryByTestId('interaction-prompt')).toBeNull()
  })
})
