import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// 規格：openspec/changes/fe-x17-hud-immersion/specs/dom-visual-system/spec.md
//   Requirement: 情境互動提示是世界膠囊、鍵盤鍵帽在畫面正下方，不是白盒 — S05
//
// jsdom 量不到合成 alpha／backdrop-filter（那一半在 FE-X17 §6 真瀏覽器＋截圖驗）。這裡釘可回歸的**結構**：
// 世界膠囊（`.glass-panel`、不是 `bg-surface` 白盒）、獨立鍵帽（`kbd.keycap`）、畫面正下方中央、仍指名物件。

const interaction = vi.hoisted(() => ({ target: { id: 'room-exit' as string | null, label: '回到大廳' } }))
vi.mock('@/world/interaction/InteractionProvider', () => ({ useInteraction: () => interaction }))

import { InteractionPrompt } from '@/world/interaction/InteractionPrompt'

describe('情境互動提示的視覺（FE-X17-S05）', () => {
  it('[FE-X17-S05] 提示是 glass 膠囊＋獨立鍵帽、置於畫面正下方中央，不是白盒', () => {
    const { getByTestId } = render(<InteractionPrompt />)
    const prompt = getByTestId('interaction-prompt')
    const cls = prompt.className

    // 世界膠囊，不是網頁白盒（S05 的病灶就是 `bg-surface` 白盒）
    expect(cls).toContain('glass-panel')
    expect(cls).not.toContain('bg-surface')

    // 位置維持畫面正下方中央（沿用 FE-W06 的螢幕錨定）
    expect(cls).toContain('bottom-gutter')
    expect(cls).toContain('left-1/2')

    // E 是獨立鍵帽元素，不是內文裡的一個字元
    const kbd = prompt.querySelector('kbd.keycap')
    expect(kbd?.textContent).toBe('E')

    // 仍指名物件：回答「按下去會發生什麼」
    expect(prompt.textContent).toContain('回到大廳')
  })
})
