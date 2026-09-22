import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// 規格：openspec/changes/fe-x17-hud-immersion/specs/dom-visual-system/spec.md
//   Requirement: 房間的主要離開方式是門，常駐的「回大廳」控制降級、不搶視線 — S06
//
// 「不搶眼」那一半（降級後夠不夠低調、門是不是第一眼會用的出口）由前後截圖 review 判。
// 這裡釘可機器驗的骨架：畫面上**沒有**可見具名文字、返回動作**鍵盤可達**（button＋aria-label）、點了觸發同一個 returnToHall。

const scene = vi.hoisted(() => ({ scene: { id: 'room' as string }, returnToHall: vi.fn() }))
vi.mock('@/world/scenes/SceneProvider', () => ({ useScene: () => scene }))

import { ReturnToHallButton, RETURN_TO_HALL_LABEL } from '@/world/scenes/ReturnToHallButton'

describe('回大廳鈕降級為 icon-only 後備（FE-X17-S06）', () => {
  it('[FE-X17-S06] 返回控制是有 aria-label 的 icon 鈕，畫面上沒有可見「回到 Guild Hall」文字，點了仍回大廳', () => {
    const { getByRole } = render(<ReturnToHallButton />)

    // 返回動作仍可達：一顆有無障礙名的按鈕（鍵盤 focus 得到、讀屏念得出）
    const btn = getByRole('button', { name: RETURN_TO_HALL_LABEL })
    expect(btn).toBeTruthy()

    // 但畫面上沒有可見的具名文字（icon-only，只有 aria-label）
    expect(btn.textContent?.trim()).toBe('')

    // 觸發的是同一個 returnToHall（動作不變，只降顯著度）
    btn.click()
    expect(scene.returnToHall).toHaveBeenCalledTimes(1)
  })
})
