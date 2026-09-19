'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CAPTION, SECONDARY, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { useBlockingPanelOpen } from '@/panel/BlockingPanelCoordinator'
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
// 捲動（D5）：新訊息到達時，使用者在底部 → 捲到最新；已往上讀 → 位置不動、出現「回到最新」的控制。
// 「在底部」＝**最後一列完整落在捲動容器的可見區裡**（就是規格 S11／S12 的定義；不是一個像素閾值 —— 第一版的 24px 會讓「最後一列被切掉一點」時仍被拉到底，跟 S12 的前提衝突，審查抓到的）。
// 收起（`FE-X16-S16`，design D5）：阻斷式面板開著時只畫一行（區域名稱＋期間新到的數；沒有列表、沒有輸入框，所以不可能持鎖）。
// `log` 照舊由 provider 持有，展開時訊息都在；「期間新到的數」＝ `log.length − 收起時的長度`（換場景清空時歸零）。
// 捲動位置：列表卸載會丟 `scrollTop`，所以 `onScroll` 一直記著最後一次的值，展開後在 layout effect 還原（在底部 → 捲到底；不在 → 還原、有新的就亮「回到最新」）。
// 沒有 `SceneChatProvider`（單獨掛 `WorldCanvas` 的測試、預覽）就什麼都不畫。
// ⚠️ 這裡的字是元件常數，不是規格。

export const CHAT_HUD_LABELS = {
  region: '場景聊天',
  jumpToLatest: '回到最新',
  newWhileCollapsed: (n: number) => `新訊息 ${n}`,
}
const focusWorldAnchor = () => document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
/** 最後一列是不是完整在可見區裡（沒有列＝在底部）。次像素容差 0.5px。 */
function lastRowFullyVisible(el: HTMLElement): boolean {
  const rows = el.querySelectorAll('[data-testid="chat-row"]')
  const last = rows[rows.length - 1]
  if (last === undefined) return true
  const a = last.getBoundingClientRect()
  const b = el.getBoundingClientRect()
  return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5
}

export function SceneChatHud() {
  const chat = useSceneChatIfProvided()
  const scroller = useRef<HTMLDivElement>(null)
  // 上一次量到的「在不在底部」：新訊息進來**之前**的狀態才算數（進來之後 scrollHeight 已經變了）。
  const atBottom = useRef(true)
  const [unseen, setUnseen] = useState(false)
  const log = chat?.log
  const lastScrollTop = useRef(0)

  // 收起：記下那一刻的 log 長度（「上一次繪製的值」模式，繪製期間 setState，不等 effect）
  const blocking = useBlockingPanelOpen()
  const [collapsedFrom, setCollapsedFrom] = useState<number | null>(null)
  if (log !== undefined) {
    if (blocking && collapsedFrom === null) setCollapsedFrom(log.length)
    else if (!blocking && collapsedFrom !== null) setCollapsedFrom(null)
    else if (collapsedFrom !== null && log.length < collapsedFrom) setCollapsedFrom(0) // 換場景清空：從 0 數
  }
  // 展開：還原捲動；收起期間有新的而且不在底部 → 亮「回到最新」
  const wasCollapsedFrom = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (collapsedFrom !== null) {
      wasCollapsedFrom.current = collapsedFrom
      return
    }
    const from = wasCollapsedFrom.current
    wasCollapsedFrom.current = null
    const el = scroller.current
    if (from === null || el === null || log === undefined) return
    if (atBottom.current) {
      el.scrollTop = el.scrollHeight
      return
    }
    el.scrollTop = lastScrollTop.current
    if (log.length <= from) return
    const frame = requestAnimationFrame(() => {
      if (!atBottom.current) setUnseen(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [collapsedFrom, log])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el === null || log === undefined) return
    // 換場景清空時不用重設 `atBottom`：內容一縮，瀏覽器把 `scrollTop` 夾回 0 並發 scroll 事件 → `onScroll` 量到距底 0 → 在底部。
    // （曾加過「空了就重設」，e2e 的「上一個場景往上讀過、新場景仍從底部跟隨」拿掉它也綠 —— 是瀏覽器在做，不是這裡。）
    // 按鈕的顯示在 render 時 `&& log.length > 0`，空的時候自然不顯示。
    if (log.length === 0) return
    if (atBottom.current) {
      el.scrollTop = el.scrollHeight
      return
    }
    // 不在底部：下一幀再把「有新的」亮起來（effect 裡不直接 setState —— lint 擋的；一幀的延遲對「辨識有新訊息」沒差）。
    // 那一幀之內使用者可能已經拖回底部（`onScroll` 把 `atBottom` 翻成 true）—— 亮之前再看一次（審查抓到的；一幀的窗口，沒有判準能穩定重現，記在 tasks）。
    const frame = requestAnimationFrame(() => {
      if (!atBottom.current) setUnseen(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [log])
  // 視窗變矮／變高不會發 scroll 事件，但「距底多少」變了：用 ResizeObserver 重算（jsdom 沒有，跳過）。
  useEffect(() => {
    const el = scroller.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      atBottom.current = lastRowFullyVisible(el)
      if (atBottom.current) setUnseen(false)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [chat, collapsedFrom])

  if (chat === null) return null
  if (collapsedFrom !== null) {
    return (
      <section aria-label={CHAT_HUD_LABELS.region} data-testid="scene-chat" data-collapsed="" style={{ zIndex: layer('hud') }} className="bg-surface/90 border-line text-ink absolute bottom-gutter left-gutter w-[min(20rem,30vw)] rounded border p-2 backdrop-blur-sm">
        <p {...withClass(CAPTION, 'text-ink-muted')}>
          {CHAT_HUD_LABELS.region} · {CHAT_HUD_LABELS.newWhileCollapsed(chat.log.length - collapsedFrom)}
        </p>
      </section>
    )
  }
  const onScroll = () => {
    const el = scroller.current
    if (el === null) return
    lastScrollTop.current = el.scrollTop
    atBottom.current = lastRowFullyVisible(el)
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scroller} onScroll={onScroll} data-testid="chat-scroll" className="min-h-0 flex-1 overflow-y-auto">
          <SceneChatFeed log={chat.log} />
        </div>
        {/* 控制在列表**下面**自己的一列，不浮在列表上 —— 浮著會蓋住正在讀的舊訊息（審查抓到的）。 */}
        {unseen && chat.log.length > 0 && (
          <div className="flex justify-center pt-1">
            <button type="button" onClick={jumpToLatest} data-testid="chat-jump-latest" {...withClass(SECONDARY, CAPTION.className)}>
              {CHAT_HUD_LABELS.jumpToLatest}
            </button>
          </div>
        )}
      </div>
      <SceneChatComposer send={chat.send} onEscape={focusWorldAnchor} />
    </section>
  )
}
