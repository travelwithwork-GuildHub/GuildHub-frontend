import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatRecord } from '@/realtime/sceneChat'
import { SceneChatFeed } from '@/chat/SceneChatFeed'

// 規格：openspec/changes/fe-k04-scene-chat-ui/specs/scene-chat-ui/spec.md
//   Requirement: 列表依接收順序呈現發言者與原始文字；被截斷的看得出來；空狀態不偽造結論 —— S03、S04
// 規格：openspec/changes/fe-k04-scene-chat-ui/specs/output-safety/spec.md
//   Requirement: 使用者提供的字串以文字呈現（具名元件）—— S13
//
// 記憶體是注入的 `ChatRecord[]`（不經 transport：截與不截是 `FE-R11` 的事，這裡只驗畫面忠實顯示交來的）。**不連任何服務。**

const rec = (name: string, body: string, truncated = false): ChatRecord => ({ id: `id-${name}`, name, body, truncated })
const rows = () => screen.queryAllByTestId('chat-row')
const nameOf = (row: HTMLElement) => within(row).getByTestId('chat-name')
const bodyOf = (row: HTMLElement) => within(row).getByTestId('chat-body')

afterEach(cleanup)

describe('列表', () => {
  it('[FE-K04-S03] 依接收順序、每列認得出誰講的；標了 truncated 的那一列有標記、body 就是交來的', () => {
    render(<SceneChatFeed log={[rec('阿福', '一'), rec('小美', '二'), rec('阿福', '三'), rec('丁', '被截過的內容', true)]} />)
    const list = rows()
    expect(list).toHaveLength(4)
    expect(list.map((r) => bodyOf(r).textContent)).toEqual(['一', '二', '三', '被截過的內容'])
    expect(list.map((r) => nameOf(r).textContent)).toEqual(['阿福', '小美', '阿福', '丁'])
    expect(list.map((r) => within(r).queryByTestId('chat-truncated') !== null), '只有第四列有截斷標記').toEqual([false, false, false, true])
    expect(screen.queryByTestId('chat-empty')).toBeNull()
  })

  it('[FE-K04-S04] 空的：有空狀態標記、沒有列；多一則：標記消失、恰好一列', () => {
    const view = render(<SceneChatFeed log={[]} />)
    expect(screen.getByTestId('chat-empty')).toBeTruthy()
    expect(rows()).toHaveLength(0)
    view.rerender(<SceneChatFeed log={[rec('阿福', '早安')]} />)
    expect(screen.queryByTestId('chat-empty')).toBeNull()
    expect(rows()).toHaveLength(1)
  })
})

describe('輸出安全', () => {
  it('[FE-K04-S13] name 與 body 含 HTML：文字節點、沒有子元素；整區沒有 script／img／javascript: 的 a', () => {
    const NAME = '<img src=x onerror=alert(1)>'
    const BODY = '<script>alert(2)</script><a href="javascript:alert(3)">x</a>'
    render(<SceneChatFeed log={[rec(NAME, BODY)]} />)
    const row = rows()[0] as HTMLElement
    expect(nameOf(row).textContent).toBe(NAME)
    expect(nameOf(row).children).toHaveLength(0)
    expect(bodyOf(row).textContent).toBe(BODY)
    expect(bodyOf(row).children).toHaveLength(0)
    const feed = screen.getByTestId('chat-feed')
    for (const sel of ['script', 'img', 'a[href^="javascript"]']) expect(feed.querySelector(sel), `冒出了 ${sel}`).toBeNull()
  })
})
