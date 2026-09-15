import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatIn } from '@/api/contract/ws'
import { SceneChatComposer, CHAT_COMPOSER_LABELS } from '@/chat/SceneChatComposer'
import { SceneChatFeed } from '@/chat/SceneChatFeed'
import { RealtimeError } from '@/realtime/client'
import type { ChatRecord } from '@/realtime/sceneChat'

// 規格：openspec/changes/fe-k04-scene-chat-ui/specs/scene-chat-ui/spec.md
//   Requirement: 全空白不送、非空白原值送；沒有上限；只有 transport 接受了才清空、失敗保留 —— S05、S06、S07、S14
//
// transport 是注入的假 `send`（規格：jsdom 不連服務）。S06 的「回聲」由測試把一筆塞進 log 再 rerender 來模擬 —— 列表是 `SceneChatFeed`，
// 兩個元件一起掛，判準看的是畫面。**不連任何服務。**

const field = () => screen.getByLabelText(CHAT_COMPOSER_LABELS.field) as HTMLTextAreaElement
const submitButton = () => screen.getByRole('button', { name: CHAT_COMPOSER_LABELS.submit })
const alerts = () => screen.queryAllByRole('alert')
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const pressEnter = (shift = false) => fireEvent.keyDown(field(), { key: 'Enter', shiftKey: shift })
const rows = () => screen.queryAllByTestId('chat-row')

/** 兩個元件一起掛；`log` 由外面控制（模擬回聲）。 */
function Harness({ send, initialLog = [] }: { send: (input: ChatIn) => void; initialLog?: ChatRecord[] }) {
  const [log, setLog] = useState<ChatRecord[]>(initialLog)
  ;(globalThis as { __echo?: (r: ChatRecord) => void }).__echo = (r) => setLog((prev) => [...prev, r])
  return (
    <div>
      <SceneChatFeed log={log} />
      <SceneChatComposer send={send} />
    </div>
  )
}
const echo = (r: ChatRecord) => act(() => (globalThis as { __echo?: (r: ChatRecord) => void }).__echo?.(r))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('送出', () => {
  it('[FE-K04-S05] 空與全空白不送、辨識要先輸入；「  哈囉  」原字串送出', () => {
    const send = vi.fn()
    render(<Harness send={send} />)
    fireEvent.click(submitButton())
    type('   ')
    fireEvent.click(submitButton())
    expect(send).not.toHaveBeenCalled()
    expect(alerts(), '要能辨識要先輸入內容').toHaveLength(1)
    type('  哈囉  ')
    fireEvent.click(submitButton())
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ t: 'chat', body: '  哈囉  ' })
  })

  it.each<[string, () => Error]>([
    ['RealtimeError（沒 ready）', () => new RealtimeError('還不能送訊息（現在是 connecting，要 ready）。')],
    ['一般 Error（沒連線）', () => new Error('沒有即時連線，聊天訊息送不出去。')],
  ])('[FE-K04-S06] %s：保留、恰好一個 alert 在送出控制之前且取得焦點、不含例外訊息、不重送；接受後清空、回聲前列表沒有、回聲後恰好一列', (_name, cause) => {
    vi.useFakeTimers()
    const error = cause()
    let accept = false
    const send = vi.fn((_input: ChatIn) => {
      if (!accept) throw error
    })
    render(<Harness send={send} />)
    type('哈囉')
    fireEvent.click(submitButton())
    expect(field().value, '拋了就保留').toBe('哈囉')
    expect(alerts()).toHaveLength(1)
    const alert = alerts()[0] as HTMLElement
    expect(document.activeElement).toBe(alert)
    expect(alert.compareDocumentPosition(submitButton()) & Node.DOCUMENT_POSITION_FOLLOWING, 'alert 要在送出控制之前').toBeTruthy()
    expect(alert.textContent).not.toContain(error.message)
    expect(alert.textContent).not.toContain('RealtimeError')
    expect(rows()).toHaveLength(0)
    act(() => vi.runAllTimers())
    expect(send, '不自動重送').toHaveBeenCalledTimes(1)
    accept = true
    fireEvent.click(submitButton())
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ t: 'chat', body: '哈囉' })
    expect(field().value, '接受了才清空').toBe('')
    expect(alerts()).toHaveLength(0)
    expect(rows(), '回聲前列表不出現').toHaveLength(0)
    echo({ id: 'me', name: '我', body: '哈囉', truncated: false })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.textContent).toContain('哈囉')
  })

  it('[FE-K04-S07] 沒有 maxlength；2001 個 code point 完整送出', () => {
    const send = vi.fn()
    render(<Harness send={send} />)
    expect(field().hasAttribute('maxlength')).toBe(false)
    const long = '😀字'.repeat(1000) + '尾'
    expect([...long]).toHaveLength(2001)
    type(long)
    fireEvent.click(submitButton())
    expect(send).toHaveBeenCalledWith({ t: 'chat', body: long })
  })

  it('[FE-K04-S14] Enter 送、送出控制送、Shift+Enter 換行不送、含換行的 body 原樣', () => {
    const send = vi.fn()
    render(<Harness send={send} />)
    type('一')
    pressEnter()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith({ t: 'chat', body: '一' })
    expect(field().value).toBe('')
    type('二')
    fireEvent.click(submitButton())
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ t: 'chat', body: '二' })
    // Shift+Enter：瀏覽器的預設動作是在 textarea 插入換行；jsdom 不會，這裡由 change 事件模擬「換行進了欄位」，判準是沒送出且 preventDefault 沒被叫。
    type('三')
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
    field().dispatchEvent(shiftEnter)
    expect(send, 'Shift+Enter 不送').toHaveBeenCalledTimes(2)
    expect(shiftEnter.defaultPrevented, 'Shift+Enter 要讓瀏覽器插入換行（不 preventDefault）').toBe(false)
    type('三\n四')
    pressEnter()
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenLastCalledWith({ t: 'chat', body: '三\n四' })
  })
})
