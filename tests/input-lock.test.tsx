import { afterEach, describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { EditableFocusLock } from '@/world/interaction/EditableFocusLock'
import { Interactable } from '@/world/interaction/Interactable'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { LocalPlayer } from '@/world/player/LocalPlayer'
import { FACING } from '@/world/coords'

// 規格：openspec/changes/fe-x06-keyboard-focus/specs/keyboard-focus/spec.md
//   Requirement: 世界命令有一把可合成的鎖 —— S03／S04／S05／S06
//   Requirement: 焦點在能輸入文字的控制上時，打字不是走路 —— S07／S09／S10
//   （內部不變量「輸入框間轉移不放鎖」也在這裡：看 focus() 回來那一刻的鎖）
//
// 走真的 `LocalPlayer`（含物理）與真的 `SpatialInteraction`；量的是 pose 與 `onInteract` 的呼叫。
// **不連任何外部服務。**

type Grabbed = ReturnType<typeof useInteraction>
const grabbed: { value: Grabbed | null } = { value: null }
function Grab() {
  const value = useInteraction()
  useEffect(() => {
    grabbed.value = value
  }, [value])
  return null
}
const ctx = () => {
  if (grabbed.value === null) throw new Error('provider 還沒掛好')
  return grabbed.value
}

/** 角色站在一個互動目標前面（面向 −Z，目標在正前方 1 單位）。 */
const AT_TARGET = { x: 0, z: 0, f: FACING.up }

// ⚠️ **每一條測試結束要卸載。** `LocalPlayer` 的監聽掛在 `window`；不卸的話上一條測試那個
// （鎖是開的）會在這一條裡把方向鍵 preventDefault —— S06 因此紅過一次，而紅的原因跟被測的東西無關。
const mountedRenderers: Array<Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>> = []
afterEach(async () => {
  for (const r of mountedRenderers.splice(0)) await ReactThreeTestRenderer.act(async () => r.unmount())
})

async function mounted(options: { editable?: boolean } = {}) {
  const poseRef = { current: { ...AT_TARGET } }
  const onInteract = vi.fn()
  const renderer = await ReactThreeTestRenderer.create(
    <InteractionProvider>
      <Grab />
      {options.editable && <EditableFocusLock />}
      <Interactable id="thing" x={0} z={-1} label="看東西" onInteract={onInteract} />
      <SpatialInteraction poseRef={poseRef} />
      <LocalPlayer targetRef={{ current: new Vector3() }} poseRef={poseRef} />
    </InteractionProvider>,
  )
  mountedRenderers.push(renderer)
  await ReactThreeTestRenderer.act(async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0))
  })
  // 讓 SpatialInteraction 算一幀，把目標選出來。
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(2, 1 / 60)
  })
  return { renderer, poseRef, onInteract }
}
const frames = (r: Awaited<ReturnType<typeof mounted>>['renderer'], n: number) =>
  ReactThreeTestRenderer.act(async () => {
    await r.advanceFrames(n, 1 / 60)
  })
/** 派送一個可取消的 keydown，回傳它有沒有被 preventDefault。 */
async function press(code: string): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true })
  await ReactThreeTestRenderer.act(async () => {
    window.dispatchEvent(event)
  })
  return event.defaultPrevented
}
const release = (code: string) =>
  ReactThreeTestRenderer.act(async () => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
  })
/** 等 microtask 與下一個 task 都跑完（`EditableFocusLock` 的重算排在那兩個地方）。 */
const settle = () =>
  ReactThreeTestRenderer.act(async () => {
    await new Promise((r) => setTimeout(r, 5))
  })

describe('世界命令有一把可合成的鎖', () => {
  it('[FE-X06-S03] 兩個持有者，放掉一個不算放；都放了才恢復', async () => {
    const { renderer, poseRef } = await mounted()
    const a = ctx().holdInputLock('a')
    const b = ctx().holdInputLock('b')
    a()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, '還有一個持有者，人卻走了 —— 鎖是單一 boolean？').toBe(0)
    await release('ArrowRight')
    b()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, '兩個都放了，人還是不動').toBeGreaterThan(0)
    await release('ArrowRight')
  })

  it('[FE-X06-S04] 釋放兩次不影響別人', async () => {
    const { renderer, poseRef } = await mounted()
    const a = ctx().holdInputLock('a')
    ctx().holdInputLock('b')
    a()
    a()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, 'a 的釋放呼叫兩次把 b 的也放掉了').toBe(0)
    await release('ArrowRight')
  })

  it('[FE-X06-S05] 鎖著時 E 不觸發互動；放開就會', async () => {
    const { onInteract } = await mounted()
    const releaseLock = ctx().holdInputLock('test')
    await press('KeyE')
    expect(onInteract, '鎖著還是觸發了互動 —— 輸入框裡打一個 e 會開出面板').not.toHaveBeenCalled()
    releaseLock()
    await press('KeyE')
    expect(onInteract, '對照：放開之後 E 要有用（不然上一條是恆真的）').toHaveBeenCalledTimes(1)
  })

  it('[FE-X06-S06] 鎖著時世界不吃掉方向鍵與 E 的預設行為', async () => {
    await mounted()
    ctx().holdInputLock('test')
    expect(await press('ArrowDown'), '鎖著還 preventDefault —— 面板裡按 ↓ 什麼都不會捲').toBe(false)
    expect(await press('KeyE')).toBe(false)
    await release('ArrowDown')
  })
})

describe('焦點在能輸入文字的控制上時，打字不是走路', () => {
  const input = (type?: string) => {
    const el = document.createElement('input')
    if (type !== undefined) el.type = type
    document.body.appendChild(el)
    return el
  }

  it('[FE-X06-S07] 輸入框有焦點時 W 不走路、E 不互動、字進得了欄位', async () => {
    const { renderer, poseRef, onInteract } = await mounted({ editable: true })
    // 物理載入後角色在出生點（z = −1），不是 poseRef 的初始值 —— 拿按鍵之前的位置當基準。
    await frames(renderer, 2)
    const before = { ...poseRef.current }
    const el = input()
    el.focus()
    await settle()
    expect(await press('KeyW'), 'W 被 preventDefault 了 —— 字進不了欄位').toBe(false)
    expect(await press('KeyE')).toBe(false)
    await frames(renderer, 20)
    expect(poseRef.current.z, '輸入框有焦點，人還是走了').toBeCloseTo(before.z, 6)
    expect(poseRef.current.x).toBeCloseTo(before.x, 6)
    expect(onInteract).not.toHaveBeenCalled()
    await release('KeyW')
    el.remove()
  })

  it('[FE-X06-S09] 焦點離開輸入框（到按鈕、到 body）之後，人走得動', async () => {
    const { renderer, poseRef } = await mounted({ editable: true })
    const el = input()
    const button = document.createElement('button')
    document.body.appendChild(button)
    el.focus()
    await settle()
    button.focus()
    await settle()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, '焦點已經在按鈕上，人還是不動 —— 鎖沒放').toBeGreaterThan(0)
    await release('ArrowRight')
    el.remove()
    button.remove()
  })

  it('[FE-X06-S09] checkbox 不算能輸入文字：有焦點時照樣走路', async () => {
    const { renderer, poseRef } = await mounted({ editable: true })
    const el = input('checkbox')
    el.focus()
    await settle()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, 'checkbox 有焦點被當成輸入框，人不動了').toBeGreaterThan(0)
    await release('ArrowRight')
    el.remove()
  })

  it('[FE-X06-S10] 面板關了但輸入框還有焦點，仍然鎖著', async () => {
    const { renderer, poseRef } = await mounted({ editable: true })
    const el = input()
    el.focus()
    await settle()
    // 「面板」= 另一個持有者，開了又關。
    const panel = ctx().holdInputLock('list-panel')
    panel()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, '面板關了就把鎖整個放掉 —— 輸入框還有焦點，打字變走路').toBe(0)
    await release('ArrowRight')
    el.blur()
    await settle()
    await press('ArrowRight')
    await frames(renderer, 20)
    expect(poseRef.current.x, '對照：焦點離開之後要走得動').toBeGreaterThan(0)
    await release('ArrowRight')
    el.remove()
  })

  it('內部不變量：從一個輸入框直接移到另一個，中間不放鎖', async () => {
    // 不是 Scenario（使用者觀察不到「中間」），是 design D3 的不變量。
    // `focus()` 會同步派送 focusout／focusin；在它回來的那一刻（重算還沒跑）看鎖 ——
    // 「focusout 當下就釋放」的實作在這一刻是 false。
    await mounted({ editable: true })
    const a = input()
    const b = input()
    a.focus()
    await settle()
    expect(ctx().inputLockRef.current).toBe(true)
    b.focus()
    expect(ctx().inputLockRef.current, '從一個輸入框移到另一個，中間鎖被放掉了 —— focusout 當下就決定了').toBe(true)
    await settle()
    expect(ctx().inputLockRef.current).toBe(true)
    b.blur()
    await settle()
    expect(ctx().inputLockRef.current).toBe(false)
    a.remove()
    b.remove()
  })
})
