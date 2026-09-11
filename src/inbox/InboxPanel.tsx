'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { MessageOut } from '@/api/contract/rest'
import { SECONDARY } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { PanelShell } from '@/panel/PanelShell'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import { ComposeForm } from './ComposeForm'
import { useInboxIfProvided, type InboxValue } from './InboxPanelProvider'
import { preview, shortId, type Thread } from './threads'

// 收件匣面板。規格 `FE-K01`。渲染在 `WorldCanvas` 裡（跟 `BoardPanel`／`ProfilePanel` 同一個位置與定位基準）；開關與資料在 `InboxPanelProvider`。
//
// 兩個畫面：清單（對話）／對話（已載入的信 ＋ 寄信表單）。對話裡**沒有**「載入更多」（下一頁多半是別人的信）；更早的回清單載。
// 殼的關閉意圖：清單 → 關面板；對話 → 回清單（Escape 一層一層）。送出中不擋離開（`S12`）。

export const INBOX_LABELS = {
  title: '收件匣',
  close: '關閉',
  back: '返回',
  loadMore: '載入更多',
  you: '你：',
  me: '你',
}

/** 清單焦點記憶：從對話返回時回剛剛那一列（`S07`）。屬於**這一個**面板實例（ref），不是模組層的全域（審查抓到會跨實例污染）。 */
type ReturnFocus = RefObject<string | null>

function OpenInboxPanel({ inbox }: { inbox: InboxValue }) {
  const { holdInputLock } = useInteraction()
  useEffect(() => holdInputLock('inbox-panel'), [holdInputLock])
  const returnFocusRef = useRef<string | null>(null)
  const view = inbox.view
  // 殼的關閉意圖：清單就關；對話就回清單。對話自己也是一個 Escape 層（在殼之上），所以 Escape 先回清單再關。
  return (
    <PanelShell title={INBOX_LABELS.title} closeLabel={INBOX_LABELS.close} testId="inbox-panel" onCloseRequest={inbox.closePanel}>
      {view.kind === 'thread' ? (
        <ThreadView inbox={inbox} withId={view.with} openedFrom={view.openedFrom} returnFocusRef={returnFocusRef} />
      ) : (
        <ThreadList inbox={inbox} returnFocusRef={returnFocusRef} />
      )}
    </PanelShell>
  )
}

function ThreadList({ inbox, returnFocusRef }: { inbox: InboxValue; returnFocusRef: ReturnFocus }) {
  const { threads, names, resolveNames, loading, loadError, moreError, exhausted, fetching, blocked, loadMore, retryFirst, enterThread, me } = inbox
  const root = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const ids = threads.map((t) => t.with)
  const key = ids.join(',')
  useEffect(() => {
    resolveNames(key === '' ? [] : key.split(','))
  }, [key, resolveNames])
  // 掛載：從對話返回的話焦點回那一列；沒有那一列（從人才詳情進來、沒寄）就回標題；初次打開回容器。
  useEffect(() => {
    const target = returnFocusRef.current
    returnFocusRef.current = null
    if (target !== null) {
      const row = root.current?.querySelector<HTMLElement>(`[data-testid="inbox-thread-item"][data-with="${target}"]`)
      ;(row ?? heading.current)?.focus()
    } else root.current?.focus()
  }, [returnFocusRef])

  const firstEmpty = !loading && !blocked && loadError === null && threads.length === 0
  return (
    <div ref={root} tabIndex={-1} data-testid="inbox-list" aria-busy={loading || fetching} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
      <h3 ref={heading} tabIndex={-1} className="text-caption text-ink-muted outline-none">
        對話
      </h3>
      {/* 第 0 頁失敗（含 401 → `permission-blocked`，此時 provider 已把信清掉）：`FE-X04` 的失敗節點、可重試。 */}
      {loadError !== null && <EmptyState kind="failure" error={toUiError(loadError)} retry={retryFirst} />}
      {firstEmpty && <EmptyState kind="first-empty" />}
      {!blocked && (
        <ul className="flex flex-col gap-2">
          {threads.map((t) => (
            <li key={t.with}>
              <ThreadRow thread={t} name={names[t.with]} me={me} onOpen={() => enterThread(t.with)} />
            </li>
          ))}
        </ul>
      )}
      {!blocked && threads.length > 0 && (
        <footer data-testid="inbox-edge" className="flex flex-col gap-2">
          {moreError !== null && <EmptyState kind="failure" error={toUiError(moreError)} retry={loadMore} />}
          {moreError === null && exhausted && <EmptyState kind="exhausted" />}
          {moreError === null && !exhausted && (
            <button type="button" className={SECONDARY} disabled={loading || fetching} onClick={loadMore}>
              {INBOX_LABELS.loadMore}
            </button>
          )}
        </footer>
      )}
    </div>
  )
}

function ThreadRow({ thread, name, me, onOpen }: { thread: Thread; name: string | null | undefined; me: string | null; onOpen: () => void }) {
  const latest = thread.latest
  const mine = latest.sender_id === me
  return (
    <button
      type="button"
      data-testid="inbox-thread-item"
      data-with={thread.with}
      onClick={onOpen}
      className="border-line flex w-full flex-col items-start gap-1 rounded border p-2 text-left"
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <span data-testid="inbox-thread-name" className="font-medium">
          {typeof name === 'string' ? name : shortId(thread.with)}
        </span>
        <time dateTime={latest.created_at} className="text-caption text-ink-muted">
          {new Date(latest.created_at).toLocaleString('zh-TW')}
        </time>
      </span>
      <span data-testid="inbox-thread-preview" className="text-caption text-ink-muted">
        {mine ? INBOX_LABELS.you : ''}
        {preview(latest.body)}
      </span>
    </button>
  )
}

function ThreadView({ inbox, withId, openedFrom, returnFocusRef }: { inbox: InboxValue; withId: string; openedFrom: 'list' | 'talent'; returnFocusRef: ReturnFocus }) {
  const { threads, names, resolveNames, loading, me, backToList, send, sendingTo } = inbox
  const thread = threads.find((t) => t.with === withId)
  const root = useRef<HTMLElement>(null)
  const back = () => {
    // 返回時焦點回清單那一列（有的話；`S07`）—— Escape 與「返回」鈕走同一條（審查抓到 Escape 漏了）。
    returnFocusRef.current = withId
    void openedFrom
    backToList()
  }
  // 對話是殼之上的一層：Escape 先回清單（面板留著）。帶自己的元素：跟殼同一個 commit 掛載也在它上面。
  useEscapeLayer(back, root)
  useEffect(() => {
    root.current?.focus()
  }, [])
  useEffect(() => {
    resolveNames([withId])
  }, [withId, resolveNames])
  const name = names[withId]
  const messages: MessageOut[] = thread?.messages ?? []
  return (
    <article ref={root} tabIndex={-1} data-testid="inbox-thread" data-with={withId} aria-busy={loading} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
      <header className="flex items-center gap-3">
        <button type="button" className={SECONDARY} onClick={back}>
          {INBOX_LABELS.back}
        </button>
        <h3 className="text-title" data-testid="inbox-thread-name">
          {typeof name === 'string' ? name : shortId(withId)}
        </h3>
      </header>
      {!loading && messages.length === 0 && <EmptyState kind="first-empty" />}
      <ol className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.sender_id === me
          return (
            <li key={m.id} data-testid="inbox-message" data-mine={mine} className={mine ? 'self-end text-right' : 'self-start'}>
              <p className="text-caption text-ink-muted">
                {mine ? INBOX_LABELS.me : typeof name === 'string' ? name : shortId(withId)} ·{' '}
                <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('zh-TW')}</time>
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          )
        })}
      </ol>
      {/* 任何一封在送就先不能再送（provider 層也有同步的 guard）：第二封會把第一封的狀態蓋掉。 */}
      <ComposeForm onSend={(body) => send(withId, body)} sending={sendingTo !== null} />
    </article>
  )
}

export function InboxPanel() {
  const inbox = useInboxIfProvided()
  if (inbox === null || inbox.view.kind === 'closed' || inbox.me === null) return null
  return <OpenInboxPanel inbox={inbox} />
}
