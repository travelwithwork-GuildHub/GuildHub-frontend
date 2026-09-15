'use client'

import { layer } from '@/design/layers'
import { useSceneChatIfProvided } from '@/realtime/SceneChatProvider'
import { SceneChatComposer } from './SceneChatComposer'
import { SceneChatFeed } from './SceneChatFeed'

// 場景聊天的 HUD：列表＋輸入。規格 `FE-K04`〈不必互動就看得到目前場景的 chat；只看不鎖世界，打字才鎖〉（design D1）。
//
// 掛在 `WorldCanvas` 的焦點錨容器裡、`layer('hud')`，跟 `InteractionPrompt`／門標籤同一層 —— **不是** `PanelShell`（那會持世界命令鎖、
// 進 Escape 層級、focus trap），也不掛成 `useEscapeLayer` 的一層（常駐的東西掛成層會永遠是最上層，`FE-X06` 的「Escape 關最上層」就壞了）。
// 只看不鎖：鎖只在輸入框有焦點時由既有的 `EditableFocusLock` 持有；Escape 在輸入框裡 → 焦點回世界錨（不關 HUD、不導覽）。
// 版面：靠左下、寬度上限 20rem／30vw（`InteractionPrompt` 在下方正中央；1024 寬時 chat 右緣 ≈ 323px、提示左緣 ≈ 362px —— e2e 的 S15 量 rect 交集），
// 列表有最大高度、內部捲動（捲動行為是 `--scroll` 那片）。
// 沒有 `SceneChatProvider`（單獨掛 `WorldCanvas` 的測試、預覽）就什麼都不畫。

const focusWorldAnchor = () => document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()

export function SceneChatHud() {
  const chat = useSceneChatIfProvided()
  if (chat === null) return null
  return (
    <section
      aria-label="場景聊天"
      data-testid="scene-chat"
      style={{ zIndex: layer('hud') }}
      className="bg-surface/90 border-line text-ink absolute bottom-gutter left-gutter flex w-[min(20rem,30vw)] max-h-[40vh] min-h-0 flex-col gap-2 rounded border p-2 backdrop-blur-sm"
    >
      <div data-testid="chat-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <SceneChatFeed log={chat.log} />
      </div>
      <SceneChatComposer send={chat.send} onEscape={focusWorldAnchor} />
    </section>
  )
}
