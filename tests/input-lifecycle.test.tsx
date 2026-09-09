import { afterEach, describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Vector3 } from 'three'
import { LocalPlayer } from '@/world/player/LocalPlayer'

// 規格：openspec/changes/fe-r04-background-tab/specs/world-player/spec.md
//   Requirement: 失去焦點或分頁隱藏時清掉按鍵狀態 —— FE-R04-S03 / S04
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// ⚠️ **這些測試驗的是「我們對這些事件的反應」，不是「瀏覽器真的會派送它們」。**
// headless Chromium **重現不了背景分頁**（design.md 的 D4 有量到的數字：
// `bringToFront` 之後另一頁的 `visibilityState` 仍然是 `visible`、rAF 照跑 42 FPS；
// CDP 的 `setWebLifecycleState` 不接受 `'hidden'`，送 `'frozen'` 之後 rAF
// 仍然跑了 2487 次／43 秒）。真實瀏覽器那一半是人工檢查，寫在 tasks.md 的 5.1。

/** jsdom 的 `document.visibilityState` 是唯讀的，要蓋掉它才能派送有意義的事件。 */
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
}
afterEach(() => setVisibility('visible'))

async function mounted() {
  const targetRef = { current: new Vector3(0, 0, 0) }
  const poseRef = { current: { x: 0, z: 0, f: 0 } }
  const renderer = await ReactThreeTestRenderer.create(
    <LocalPlayer targetRef={targetRef} poseRef={poseRef} />,
  )
  // **等物理世界真的載進來**（Rapier 是 `await import(...)` ＋ `await init()`）。
  // 不等的話走的是「還在載入」那一支的純位移 fallback —— 測試照樣綠，
  // 但驗到的不是正式路徑。理由同 `local-pose-ref.test.tsx`。
  await ReactThreeTestRenderer.act(async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0))
  })
  return { renderer, poseRef }
}

const frames = (r: Awaited<ReturnType<typeof mounted>>['renderer'], n: number) =>
  ReactThreeTestRenderer.act(async () => {
    await r.advanceFrames(n, 1 / 60)
  })

const press = (code: string) =>
  ReactThreeTestRenderer.act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }))
  })

describe('分頁切走時角色要停下來', () => {
  it('[FE-R04-S03] 分頁隱藏時角色停下來', async () => {
    const { renderer, poseRef } = await mounted()

    await press('ArrowRight')
    await frames(renderer, 20)
    const moving = poseRef.current.x
    expect(moving, '前置條件：角色要真的在走').toBeGreaterThan(0)

    // **不派送 keyup** —— 這正是「按著鍵切走」的情況。
    setVisibility('hidden')
    await ReactThreeTestRenderer.act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await frames(renderer, 40)
    expect(
      poseRef.current.x,
      '分頁隱藏之後角色還在走 —— 按著的鍵沒有被清掉，回到前景會自己一直走',
    ).toBeCloseTo(moving, 6)
  })

  it('[FE-R04-S04] pagehide 與 blur 也要清', async () => {
    const { renderer, poseRef } = await mounted()

    await press('ArrowRight')
    await frames(renderer, 20)
    const afterPageHideStart = poseRef.current.x
    expect(afterPageHideStart, '前置條件：角色要真的在走').toBeGreaterThan(0)

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })
    await frames(renderer, 40)
    expect(poseRef.current.x, 'pagehide 之後角色還在走').toBeCloseTo(afterPageHideStart, 6)

    // 重新按一次，換 blur。
    await press('ArrowRight')
    await frames(renderer, 20)
    const movingAgain = poseRef.current.x
    expect(movingAgain, '重新按鍵之後角色要再動起來').toBeGreaterThan(afterPageHideStart)

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    await frames(renderer, 40)
    expect(poseRef.current.x, 'blur 之後角色還在走').toBeCloseTo(movingAgain, 6)
  })

  it('切回前景那一次不清 —— 不然會吃掉剛好在那一刻按下的鍵', async () => {
    const { renderer, poseRef } = await mounted()

    await press('ArrowRight')
    await frames(renderer, 10)
    const before = poseRef.current.x

    // `visibilityState` 是 `visible` 時派送 —— 這是切「回」前景那一次。
    setVisibility('visible')
    await ReactThreeTestRenderer.act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await frames(renderer, 20)

    expect(
      poseRef.current.x,
      '切回前景那一次也把按鍵清掉了 —— 那會吃掉使用者當下按著的鍵',
    ).toBeGreaterThan(before)
  })
})
