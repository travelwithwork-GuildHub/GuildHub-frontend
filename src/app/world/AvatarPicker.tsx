'use client'

import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { AVATAR_COUNT, avatarLook } from '@/design/avatar'
import { layer } from '@/design/layers'
import { FIELD_LABEL, PRIMARY, SECONDARY } from '@/design/controls'
import { useAvatarDraft } from '@/identity/AvatarDraftProvider'
import { useAdoptIdentity, useIdentity } from '@/identity/IdentityProvider'
import { myAvatar } from '@/identity/myAvatar'
import { saveAvatar } from '@/identity/saveAvatar'
import { useRealtimeGeneration } from '@/realtime/RealtimeGenerationProvider'
import { EscapeLayer } from '@/world/interaction/escapeLayers'

// 換角色。規格 `FE-A05`。
//
// ⚠️⚠️ **入口一直都在，而那是規格的一條 Requirement（`S11`）。**
//
// 這個專案在同一天踩了兩次「做了但使用者看不出來」，而且兩次都測試全綠：
// `world-interactive-objects` 的六扇門在畫面上是 10 像素的細縫（444 條測試
// 沒抓到）；`control-affordance` 的主要按鈕是一行漂著的字（18 條端到端斷言
// 全綠，使用者傳截圖來罵才發現）。**選擇器做好了而沒有人找得到入口，就是第三次。**
//
// ⚠️ **SHALL NOT 改成一次性提示。** 「一次性」要記住「看過了」——
// 那是額外的持久狀態；而且提示關掉之後，「入口在哪」這個問題原封不動。
//
// 鍵盤與焦點（`FE-X06`〈非阻斷式的彈出層〉）：Escape 關、Tab 走離就關、關閉後焦點回按鈕；
// **不鎖世界** —— 邊走邊看新外觀是 `FE-A05` 的產品意圖。
// 它開著時按 E 開出看板面板：面板取得焦點 → 這裡依「焦點移出就關」關掉，草稿被丟（等同取消，`S03`）。
// **失焦而關的時候不把焦點搶回按鈕** —— 焦點是刻意去別處的。

/** 存這件事現在走到哪。**「值域外」不在這裡** —— 那是前端的 bug，不是使用者看得懂的狀態。 */
type Saving =
  | { readonly at: 'idle' }
  | { readonly at: 'saving' }
  /** 存失敗。**SHALL NOT 重連**（`S06`）—— 重連有代價，為一次失敗的儲存付它毫無所得。 */
  | { readonly at: 'failed' }

export function AvatarPicker() {
  const identity = useIdentity()
  const adopt = useAdoptIdentity()
  const { draft, setDraft, clearDraft } = useAvatarDraft()
  const { rejoin } = useRealtimeGeneration()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<Saving>({ at: 'idle' })

  const saved = myAvatar(identity)
  // ⚠️ **`??` 不是 `||`** —— 索引 `0` 是 falsy，寫成 `||` 的話
  // 挑第一款角色時畫面會退回原本那一款（見 `avatarDraft.ts`）。
  const showing = draft ?? saved
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLElement>(null)
  // 開的時候焦點要進來（第一個選項），「Tab 走離就關」才有意義 —— 焦點沒進來的話它永遠不會離開。
  useEffect(() => {
    if (open) popover.current?.querySelector<HTMLElement>('button')?.focus()
  }, [open])

  function close() {
    // `S03`：放棄之後預覽要回到已儲存的那一個。
    clearDraft()
    setSaving({ at: 'idle' })
    setOpen(false)
  }
  /** Escape 或按「取消」：關掉，焦點回按鈕（`FE-X06-S15`）。 */
  function dismiss() {
    close()
    trigger.current?.focus()
  }
  /** 焦點移出範圍就關（`FE-X06-S16`／`S17`），**不**搶回焦點 —— 它是刻意去別處的。 */
  function onBlur(e: FocusEvent<HTMLElement>) {
    const next = e.relatedTarget
    if (next instanceof Node && popover.current?.contains(next)) return
    close()
  }

  async function save() {
    if (draft === undefined) return
    setSaving({ at: 'saving' })
    const result = await saveAvatar(draft)
    if (!result.ok) {
      // ⚠️ **失敗時 SHALL NOT 重連**（`S06`），而且**預覽要復原**（`S03`）——
      // 留著預覽的話，畫面顯示的是一個沒有存成功的選擇，
      // 而使用者下次進來會發現自己「變回去了」。
      clearDraft()
      setSaving({ at: 'failed' })
      return
    }
    // 名片換了，畫面上的身分要跟著換。
    adopt({ state: 'signed-in', profile: result.profile })
    clearDraft()
    setSaving({ at: 'idle' })
    setOpen(false)
    // ⚠️⚠️ **這一行是整列存在的理由**（`S04`）。
    // 沒有它，`PATCH` 成功了而**已經在場的其他人看到的仍然是舊外觀** ——
    // 因為即時層的 `av` 來自那條連線背後的 session，而後端是在登入時
    // 寫進去的。代價寫在規格 `S05`：別人可能短暫看到你離開又進來。
    rejoin()
  }

  return (
    <>
      {/* ⚠️ **入口在標題列裡，也就是 `<Canvas>` 的兄弟而不是它的子孫** ——
          所以它天生不會被 3D 畫面蓋住（`S13`）。 */}
      <button ref={trigger} type="button" className={SECONDARY} onClick={() => setOpen((v) => !v)}>
        更換角色
      </button>

      {open && (
        <section
          ref={popover}
          onBlur={onBlur}
          // `tabIndex=-1`：點到裡面沒有可聚焦的地方（空白、字）時焦點落在這個容器上，不是 `body` ——
          // 不然 `relatedTarget` 是 null、當成「移出範圍」把自己關了（審查抓到的）。
          tabIndex={-1}
          aria-label="更換角色"
          // 面板是浮的，所以它要自己宣告層級。**堆疊層級走 `design/layers`**
          // —— 散在各處的 z-index 會互相打架，而症狀是「有時候被蓋住」。
          style={{ zIndex: layer('panel') }}
          className="bg-surface-raised border-control-edge absolute top-full left-0 mt-2 flex flex-col gap-gutter rounded border p-gutter"
        >
          {/* 開著才在 Escape 的堆疊裡；面板開著時它在下面（但會先因失焦而關）。 */}
          <EscapeLayer onEscape={dismiss} element={popover} />
          <div className={FIELD_LABEL}>
            <span>選一個角色</span>
            <div className="flex gap-2">
              {Array.from({ length: AVATAR_COUNT }, (_, index) => {
                const look = avatarLook(index)
                const picked = showing === index
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setDraft(index)}
                    className={`${SECONDARY} flex items-center gap-2`}
                  >
                    {/* ⚠️ **色票的顏色從 `avatarLook()` 拿，不是自己寫一份。**
                        寫死的話，換色的那天選擇器上的顏色不會跟著改 ——
                        而畫面上的角色會，兩邊就對不起來了。 */}
                    <span
                      aria-hidden
                      style={{ background: look.body }}
                      className="border-control-edge inline-block size-4 rounded-full border"
                    />
                    角色 {index + 1}
                    {picked && '（現在）'}
                  </button>
                )
              })}
            </div>
          </div>

          {saving.at === 'failed' && (
            <p role="alert" className="text-danger">
              沒有存成功，你的角色還是原來那一個。可以再試一次。
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className={PRIMARY}
              // 沒選過就不能存 —— 也順便擋掉「送出一個沒有變化的更新」。
              disabled={draft === undefined || saving.at === 'saving'}
              onClick={() => void save()}
            >
              {saving.at === 'saving' ? '儲存中⋯' : '就用這個'}
            </button>
            <button type="button" className={SECONDARY} onClick={dismiss}>
              取消
            </button>
          </div>
        </section>
      )}
    </>
  )
}
