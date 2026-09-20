'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type RefObject } from 'react'
import { PAGE_SIZE } from '@/api/contract/limits'
import type { MessageOut } from '@/api/contract/rest'
import { getProfile, listMessages, sendMessage } from '@/api/operations'
import { CAPTION, HEADING, SECONDARY, withClass } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { PanelShell } from '@/panel/PanelShell'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { ComposeForm } from './ComposeForm'
import { RecipientGoneError } from './errors'
import { useInbox, type InboxValue } from './InboxPanelProvider'
import { mergeById, preview, shortId, type Thread } from './threads'

// 收件匣的 **lazy 內容**：操作邏輯（import 訊息 API）＋面板 UI。規格 `FE-K01`；`FE-X15` --panel-inbox（S04）。
// 由 `InboxPanel`（host）經 `PanelHost` 在開啟意圖成立後才載入 —— 開啟前這個 chunk（含 `getProfile`／`listMessages`／`sendMessage`）不進首屏。
//
// 狀態與競態 ref 在 eager 的 `InboxPanelProvider`（常駐、以 me 為 key）；這裡的操作用它給的 `store`（穩定 setters／refs）驅動那份狀態。
// **世界輸入鎖不在這裡**（`FE-X15` 之後由 host 注入給 `PanelHost` 持有）；讓位協定仍在（`PanelShell` 的 `panel`）。
// in-flight 的 closure 捕捉的是常駐 store —— 送出中關掉面板、內容卸載，201 回來照樣併（`S12`）。
//
// 兩個畫面：清單（對話）／對話（已載入的信 ＋ 寄信表單）。對話裡**沒有**「載入更多」（下一頁多半是別人的信）；更早的回清單載。
// 殼的關閉意圖：清單 → 關面板；對話 → 回清單（Escape 一層一層）。送出中不擋離開（`S12`）。

export const INBOX_LABELS = {
  title: '收件匣',
  thread: '對話',
  close: '關閉',
  back: '返回',
  loadMore: '載入更多',
  you: '你：',
  me: '你',
}

const isUnauthorized = (error: unknown) => toUiError(error).kind === 'authentication-required'

/** 需要訊息 API 的動作：只有這個 lazy 內容裡的 UI 用得到，所以走 UI-local context（不進 eager 的 `useInbox()`）。 */
interface InboxOps {
  /** 確保這些 id 的名字被解析過（同一批去重、成功的不再打、失敗的下一次開啟再試）。 */
  resolveNames: (ids: readonly string[]) => void
  loadMore: () => void
  retryFirst: () => void
  /** 寄一封。201 → 合併、重取第 0 頁、回 `true`；已有一封在送 → 什麼都不做、回 `false`；失敗拋出去。 */
  send: (withId: string, body: string) => Promise<boolean>
}
const InboxOpsContext = createContext<InboxOps | null>(null)
function useInboxOps(): InboxOps {
  const ops = useContext(InboxOpsContext)
  if (ops === null) throw new Error('useInboxOps 必須在 <OpenInboxPanel> 底下使用。')
  return ops
}

/** 建立驅動常駐狀態的操作。所有 setState 與 ref 都指向 eager `store`（常駐），reactive 讀取（names/loading…）從 `inbox` 拿。 */
function useInboxOperations(inbox: InboxValue): InboxOps {
  const store = inbox.store

  const fetchPage = useCallback(
    async (page: number, mode: 'first' | 'more') => {
      const race = store.race
      if (race.inFlight) {
        if (mode === 'first') race.setPendingFirst(true)
        return
      }
      race.setInFlight(true)
      const generation = race.generation
      const dataGeneration = race.dataGeneration
      store.setFetching(true)
      if (mode === 'first') {
        store.setLoading(true)
        store.setLoadError(null)
      } else store.setMoreError(null)
      try {
        const list = await listMessages({ page })
        if (dataGeneration !== race.dataGeneration) return // 401／換身分之後的舊回應：丟
        store.setMessages((prev) => mergeById(prev, list))
        if (generation !== race.generation) return // 舊世代：只合併訊息，不動控制狀態
        store.setPagesLoaded(page + 1)
        store.setExhausted(list.length < PAGE_SIZE)
        store.setBlocked(false)
      } catch (error) {
        if (dataGeneration !== race.dataGeneration) return
        if (isUnauthorized(error)) {
          store.clearForUnauthorized(error)
          return
        }
        if (generation !== race.generation) return
        if (mode === 'first') store.setLoadError(error)
        else store.setMoreError(error)
      } finally {
        race.setInFlight(false)
        store.setFetching(false)
        if (mode === 'first' && generation === race.generation) store.setLoading(false)
        if (race.pendingFirst) {
          race.setPendingFirst(false)
          race.runFirst()
        }
      }
    },
    [store],
  )
  // 補跑第 0 頁的槽用最新的那份 `fetchPage`。
  useEffect(() => {
    store.race.setFetchPage(fetchPage)
  }, [store, fetchPage])
  // 開啟意圖（`beginOpenIntent` 已 generation＋1、`loading`＝true）：內容掛好／`openNonce` 變 → 真的打第 0 頁。
  useEffect(() => {
    void fetchPage(0, 'first')
  }, [inbox.openNonce, fetchPage])

  const loadMore = useCallback(() => {
    if (inbox.loading || inbox.exhausted) return
    void fetchPage(inbox.pagesLoaded, 'more')
  }, [fetchPage, inbox.loading, inbox.exhausted, inbox.pagesLoaded])
  const retryFirst = useCallback(() => void fetchPage(0, 'first'), [fetchPage])

  const resolveNames = useCallback(
    (ids: readonly string[]) => {
      const race = store.race
      const dataGeneration = race.dataGeneration
      for (const id of new Set(ids)) {
        if (race.askedHas(id)) continue
        race.askedAdd(id)
        // 成功的跨開關快取：已有名字就不打。
        if (typeof inbox.names[id] === 'string') continue
        void getProfile(id)
          .then((profile) => {
            if (dataGeneration !== race.dataGeneration) return
            store.setNames((prev) => ({ ...prev, [id]: profile.display_name }))
          })
          .catch(() => {
            if (dataGeneration !== race.dataGeneration) return
            store.setNames((prev) => (typeof prev[id] === 'string' ? prev : { ...prev, [id]: null }))
          })
      }
    },
    [inbox.names, store],
  )

  const send = useCallback(
    async (withId: string, body: string) => {
      const race = store.race
      if (race.sendInFlight) return false
      race.setSendInFlight(true)
      const dataGeneration = race.dataGeneration
      store.setSendingTo(withId)
      try {
        let sent: MessageOut
        try {
          sent = await sendMessage({ recipient_id: withId, body })
        } catch (error) {
          if (dataGeneration !== race.dataGeneration) throw error
          // POST 的 401 跟 GET 的一樣：session 沒了，整份私訊資料失效（審查抓到只處理了分頁）。
          if (isUnauthorized(error)) {
            store.clearForUnauthorized(error)
            throw error
          }
          // 只把**這一次** POST 的 404 轉成領域錯誤（收件人不存在）；其餘原樣拋、走 `toUiError`。
          if (toUiError(error).kind === 'not-found') throw new RecipientGoneError()
          throw error
        }
        if (dataGeneration !== race.dataGeneration) return false
        store.setMessages((prev) => mergeById(prev, [sent]))
        // offset 分頁被這封擠了一格：重取第 0 頁、合併（只增不減）；載入更多從第 1 頁重來。
        race.bumpGeneration()
        void fetchPage(0, 'first')
        return true
      } finally {
        race.setSendInFlight(false)
        store.setSendingTo(null)
      }
    },
    [fetchPage, store],
  )

  return useMemo(() => ({ resolveNames, loadMore, retryFirst, send }), [resolveNames, loadMore, retryFirst, send])
}

/** 清單焦點記憶：從對話返回時回剛剛那一列（`S07`）。屬於**這一個**面板實例（ref），不是模組層的全域（審查抓到會跨實例污染）。 */
type ReturnFocus = RefObject<string | null>

export default function OpenInboxPanel() {
  const inbox = useInbox()
  const ops = useInboxOperations(inbox)
  const returnFocusRef = useRef<string | null>(null)
  const view = inbox.view
  // 讓位協定（`FE-X16-S14`）：有一封在送就不讓（問 provider 的同步 guard，不看晚一格的 state）
  const panel = { id: 'inbox-panel' as const, canYield: () => !inbox.sending(), onYield: inbox.yieldPanel }
  // 返回：焦點回清單那一列（有的話；`S07`）—— 殼標題列的返回鈕（`FE-X16-S07`）與對話的 Escape 走同一條（審查抓到 Escape 漏了）。
  const backToList = () => {
    if (view.kind === 'thread') returnFocusRef.current = view.with
    inbox.backToList()
  }
  // 殼的關閉意圖：清單就關；對話就回清單。對話自己也是一個 Escape 層（在殼之上），所以 Escape 先回清單再關。
  return (
    <InboxOpsContext value={ops}>
      <PanelShell
        title={view.kind === 'thread' ? INBOX_LABELS.thread : INBOX_LABELS.title}
        back={view.kind === 'thread' ? { label: INBOX_LABELS.back, onBack: backToList } : undefined}
        closeLabel={INBOX_LABELS.close}
        testId="inbox-panel"
        panel={panel}
        onCloseRequest={inbox.closePanel}
      >
        {view.kind === 'thread' ? (
          <ThreadView inbox={inbox} withId={view.with} onBack={backToList} />
        ) : (
          <ThreadList inbox={inbox} returnFocusRef={returnFocusRef} />
        )}
      </PanelShell>
    </InboxOpsContext>
  )
}

function ThreadList({ inbox, returnFocusRef }: { inbox: InboxValue; returnFocusRef: ReturnFocus }) {
  const { threads, names, loading, loadError, moreError, exhausted, fetching, blocked, enterThread, me } = inbox
  const { resolveNames, loadMore, retryFirst } = useInboxOps()
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
      <h3 ref={heading} tabIndex={-1} {...withClass(CAPTION, 'text-ink-muted outline-none')}>
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
            <button type="button" {...SECONDARY} disabled={loading || fetching} onClick={loadMore}>
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
      className="border-line hover:bg-surface-sunken flex w-full flex-col items-start gap-1 rounded border p-2 text-left"
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <span data-testid="inbox-thread-name" className="font-medium">
          {typeof name === 'string' ? name : shortId(thread.with)}
        </span>
        <time dateTime={latest.created_at} {...withClass(CAPTION, 'text-ink-muted')}>
          {new Date(latest.created_at).toLocaleString('zh-TW')}
        </time>
      </span>
      <span data-testid="inbox-thread-preview" {...withClass(CAPTION, 'text-ink-muted')}>
        {mine ? INBOX_LABELS.you : ''}
        {preview(latest.body)}
      </span>
    </button>
  )
}

function ThreadView({ inbox, withId, onBack }: { inbox: InboxValue; withId: string; onBack: () => void }) {
  const { threads, names, loading, me, sendingTo } = inbox
  const { resolveNames, send } = useInboxOps()
  const thread = threads.find((t) => t.with === withId)
  const root = useRef<HTMLElement>(null)
  // 對話是殼之上的一層：Escape 先回清單（面板留著）。帶自己的元素：跟殼同一個 commit 掛載也在它上面。
  useEscapeLayer(onBack, root)
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
      <h3 {...HEADING} data-testid="inbox-thread-name">
        {typeof name === 'string' ? name : shortId(withId)}
      </h3>
      {!loading && messages.length === 0 && <EmptyState kind="first-empty" />}
      <ol className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.sender_id === me
          return (
            <li key={m.id} data-testid="inbox-message" data-mine={mine} className={mine ? 'self-end text-right' : 'self-start'}>
              <p {...withClass(CAPTION, 'text-ink-muted')}>
                {mine ? INBOX_LABELS.me : typeof name === 'string' ? name : shortId(withId)} ·{' '}
                <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('zh-TW')}</time>
              </p>
              <p data-testid="inbox-message-body" className="whitespace-pre-wrap">
                {m.body}
              </p>
            </li>
          )
        })}
      </ol>
      {/* 任何一封在送就先不能再送（provider 層也有同步的 guard）：第二封會把第一封的狀態蓋掉。 */}
      <ComposeForm onSend={(body) => send(withId, body)} sending={sendingTo !== null} />
    </article>
  )
}
