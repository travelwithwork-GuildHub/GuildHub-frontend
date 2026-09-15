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

let seq = 0
const rec = (name: string, body: string, truncated = false): ChatRecord => ({ seq: seq++, id: `id-${name}`, name, body, truncated })
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
    const mark = within(list[3] as HTMLElement).getByTestId('chat-truncated')
    expect(mark.textContent?.trim(), '標記要有字（空的、隱藏的都不算看得出來）').not.toBe('')
    expect(mark.getAttribute('aria-hidden')).toBeNull()
    expect(mark.hidden).toBe(false)
    expect(screen.queryByTestId('chat-empty')).toBeNull()
  })

  it('[FE-K04-S03] 列表常駐 role=log；滿了淘汰第一筆時既有的節點原地不動（live region 不重念舊的）', () => {
    const first = Array.from({ length: 3 }, (_, i) => rec(`人${i}`, `第${i}`))
    const view = render(<SceneChatFeed log={first} />)
    const logRegion = screen.getByRole('log', { name: /場景聊天/ })
    const before = rows()
    const next = [...first.slice(1), rec('新', '新的一則')]
    view.rerender(<SceneChatFeed log={next} />)
    expect(screen.getByRole('log', { name: /場景聊天/ }), 'role=log 要常駐同一個節點').toBe(logRegion)
    const after = rows()
    expect(after[0], '淘汰第一筆之後，原本第二筆的節點要還是同一個').toBe(before[1])
    expect(after[1]).toBe(before[2])
    expect(after[2]?.textContent).toContain('新的一則')
    expect(before.some((n) => n === after[2])).toBe(false)
  })

  it('[FE-K04-S04] 空的：有空狀態標記、沒有列；多一則：標記消失、恰好一列', () => {
    const view = render(<SceneChatFeed log={[]} />)
    const empty = screen.getByTestId('chat-empty')
    expect(empty.textContent?.trim(), '空狀態要有字').not.toBe('')
    expect(empty.hidden).toBe(false)
    expect(empty.getAttribute('aria-hidden')).toBeNull()
    expect(screen.getByRole('log', { name: /場景聊天/ }), '空的時候 role=log 也在').toBeTruthy()
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
