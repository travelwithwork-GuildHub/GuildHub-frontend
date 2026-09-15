'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { SECONDARY } from '@/design/controls'
import { layer } from '@/design/layers'
import { useSceneChatIfProvided } from '@/realtime/SceneChatProvider'
import { SceneChatComposer } from './SceneChatComposer'
import { SceneChatFeed } from './SceneChatFeed'

// 場景聊天的 HUD：列表＋輸入。規格 `FE-K04`〈不必互動就看得到目前場景的 chat；只看不鎖世界，打字才鎖〉、〈新訊息不打斷正在讀舊訊息的人〉（design D1、D5）。
//
// 掛在 `WorldCanvas` 的焦點錨容器裡、`layer('hud')`，跟 `InteractionPrompt`／門標籤同一層 —— **不是** `PanelShell`（那會持世界命令鎖、
// 進 Escape 層級、focus trap），也不掛成 `useEscapeLayer` 的一層（常駐的東西掛成層會永遠是最上層，`FE-X06` 的「Escape 關最上層」就壞了）。
// 只看不鎖：鎖只在輸入框有焦點時由既有的 `EditableFocusLock` 持有；Escape 在輸入框裡 → 焦點回世界錨（不關 HUD、不導覽）。
// 版面：靠左下、寬度上限 20rem／30vw（`InteractionPrompt` 在下方正中央；1024 寬時 chat 右緣 ≈ 323px、提示左緣 ≈ 362px —— e2e 的 S15 量 rect 交集），
// 列表有最大高度（50vh；720 高時 feed 約 200px、8 行，40vh 只剩 5 行 —— 量過）、內部捲動。
//
// 捲動（D5）：新訊息到達時，使用者在底部附近 → 捲到最新；已往上讀 → 位置不動、出現「回到最新」的控制。「底部附近」＝距底 ≤ `NEAR_BOTTOM_PX`
// （量過：一列單行約 20px，一行以內算在底部；判準在 e2e 的 S11／S12，是可觀察結果不是這個數字）。
// 沒有 `SceneChatProvider`（單獨掛 `WorldCanvas` 的測試、預覽）就什麼都不畫。
// ⚠️ 這裡的字是元件常數，不是規格。

export const CHAT_HUD_LABELS = {
  region: '場景聊天',
  jumpToLatest: '回到最新',
}
/** 距底多少 px 以內算「在底部」。 */
export const NEAR_BOTTOM_PX = 24

const focusWorldAnchor = () => document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
const distanceToBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight

export function SceneChatHud() {
  const chat = useSceneChatIfProvided()
  const scroller = useRef<HTMLDivElement>(null)
  // 上一次量到的「在不在底部」：新訊息進來**之前**的狀態才算數（進來之後 scrollHeight 已經變了）。
  const atBottom = useRef(true)
  const [unseen, setUnseen] = useState(false)
  const log = chat?.log

  useLayoutEffect(() => {
    const el = scroller.current
    if (el === null || log === undefined || log.length === 0) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    else setUnseen(true)
  }, [log])

  if (chat === null) return null
  const onScroll = () => {
    const el = scroller.current
    if (el === null) return
    atBottom.current = distanceToBottom(el) <= NEAR_BOTTOM_PX
    if (atBottom.current) setUnseen(false)
  }
  const jumpToLatest = () => {
    const el = scroller.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
    atBottom.current = true
    setUnseen(false)
  }
  return (
    <section
      aria-label={CHAT_HUD_LABELS.region}
      data-testid="scene-chat"
      style={{ zIndex: layer('hud') }}
      className="bg-surface/90 border-line text-ink absolute bottom-gutter left-gutter flex w-[min(20rem,30vw)] max-h-[50vh] min-h-0 flex-col gap-2 rounded border p-2 backdrop-blur-sm"
    >
      {/* 兩層 flex：外層 `flex-1 min-h-0` 吃掉剩下的高度，內層再 `flex-1 min-h-0 overflow-y-auto` 才會真的捲（百分比 max-height 在 flex 子項裡不可靠）。 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} onScroll={onScroll} data-testid="chat-scroll" className="min-h-0 flex-1 overflow-y-auto">
          <SceneChatFeed log={chat.log} />
        </div>
        {unseen && (
          <button type="button" onClick={jumpToLatest} data-testid="chat-jump-latest" className={`${SECONDARY} absolute right-2 bottom-2 text-caption`}>
            {CHAT_HUD_LABELS.jumpToLatest}
          </button>
        )}
      </div>
      <SceneChatComposer send={chat.send} onEscape={focusWorldAnchor} />
    </section>
  )
}
