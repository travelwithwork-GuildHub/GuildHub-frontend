'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PAGE_SIZE } from '@/api/contract/limits'
import type { MessageOut } from '@/api/contract/rest'
import { getProfile, listMessages, sendMessage } from '@/api/operations'
import { toUiError } from '@/errors/uiError'
import { useIdentity } from '@/identity/IdentityProvider'
import { RecipientGoneError } from './errors'
import { groupThreads, mergeById, type Thread } from './threads'

// 收件匣的狀態**與資料**。規格 `FE-K01`；design `D1`／`D2`／`D3`。
//
// 掛在 `page.tsx`（`ProfilePanelProvider` 旁邊）：按鈕在標題列、面板在 `WorldCanvas` 裡，provider 要包住兩者。
// 世界輸入鎖**不在這裡**（`InteractionProvider` 在 `WorldCanvas` 裡面）—— `InboxPanel` 掛載時自己持。
//
// ⚠️ **資料放這裡不放面板**：送出中關掉面板，201 回來還是要合併（`S12`）；名字快取要跨開關存活（`S04`）。
//
// 分頁（design `D2`）：後端是 offset 分頁的混合清單。所有分頁請求（開啟的第 0 頁、載入更多、201 後的第 0 頁）
// 共用**一個 in-flight 槽**並帶 `generation`：舊世代的回應只合併訊息（以 `id`、只增不減），不動 `pagesLoaded`／`exhausted`／錯誤。
// 401 → 清掉信與名字、`dataGeneration` 加一：**所有**在飛的回應（含 POST 的 201、名字解析）回來一律丟掉（session 沒了不該再看到私訊）。
// 身分換了（登出、換帳號）同樣整份失效 —— 不能等某次請求剛好回 401。

export type InboxView = { kind: 'closed' } | { kind: 'list' } | { kind: 'thread'; with: string; openedFrom: 'list' | 'talent' }

export interface InboxValue {
  view: InboxView
  /** 標題列的按鈕開清單；`opener` 是那顆按鈕（關閉後焦點回它）。 */
  openList: (opener: HTMLElement | null) => void
  /** 從別人的名片進來：直接進對話；開啟者已經不在了（看板關了），關閉後焦點回世界焦點錨。 */
  openThreadFromTalent: (withId: string) => void
  /** 從清單進對話。 */
  enterThread: (withId: string) => void
  backToList: () => void
  closePanel: () => void
  /** 我的名片 id（`signed-in` 才有）。 */
  me: string | null
  /** 已載入的全部信（合併後、未分組）。 */
  messages: MessageOut[]
  threads: Thread[]
  /** 目前世代的第 0 頁還沒回來。 */
  loading: boolean
  /** 第 0 頁失敗的原因（`null` = 沒失敗）。401 也放這裡（`toUiError` 會分成 permission-blocked）。 */
  loadError: unknown
  /** 「載入更多」失敗的原因。 */
  moreError: unknown
  /** 已載入幾頁；翻到底了沒。 */
  pagesLoaded: number
  exhausted: boolean
  /** 有分頁請求在飛。 */
  fetching: boolean
  /** session 沒了（401）：資料已清、只顯示 permission-blocked。 */
  blocked: boolean
  loadMore: () => void
  retryFirst: () => void
  /** 對方名字：`undefined` = 還沒問／問到一半；`null` = 失敗（顯示縮短 id）。 */
  names: Record<string, string | null | undefined>
  /** 確保這些 id 的名字被解析過（同一批去重、成功的不再打、失敗的下一次開啟再試）。 */
  resolveNames: (ids: readonly string[]) => void
  /** 寄一封。201 → 合併、重取第 0 頁；失敗拋出去（`useForm` 接）。 */
  send: (withId: string, body: string) => Promise<void>
  /** 送出中的對方（任何一封在送，所有寄信表單都先不能再送）。 */
  sendingTo: string | null
}

const InboxContext = createContext<InboxValue | null>(null)

export function useInbox(): InboxValue {
  const value = useContext(InboxContext)
  if (value === null) throw new Error('useInbox 必須在 <InboxPanelProvider> 底下使用。')
  return value
}

/** 面板本體與「寄信給他」用：沒有 provider 就 `null`（`WorldCanvas`／`BoardPanel` 單獨渲染時沒有入口，面板不存在）。 */
export function useInboxIfProvided(): InboxValue | null {
  return useContext(InboxContext)
}

const isUnauthorized = (error: unknown) => toUiError(error).kind === 'authentication-required'

export function InboxPanelProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  const me = identity.state === 'signed-in' ? identity.profile.id : null

  const [view, setView] = useState<InboxView>({ kind: 'closed' })
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef<'opener' | 'world' | null>(null)

  const [messages, setMessages] = useState<MessageOut[]>([])
  const [pagesLoaded, setPagesLoaded] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [moreError, setMoreError] = useState<unknown>(null)
  const [blocked, setBlocked] = useState(false)
  const [names, setNames] = useState<Record<string, string | null | undefined>>({})
  const [sendingTo, setSendingTo] = useState<string | null>(null)

  // 世代：`generation` 每次從關閉打開＋1（分頁控制狀態只聽目前世代）；`dataGeneration` 401／換身分時＋1（所有在飛的回應都丟）。
  const generationRef = useRef(0)
  const dataGenerationRef = useRef(0)
  const inFlightRef = useRef(false)
  /** 槽被占著時想重取第 0 頁（201 之後、重開撞上）：等前一個結束再發（design `D2`）。 */
  const pendingFirstRef = useRef(false)
  /** 這一次開啟內問過（含失敗）的名字：失敗只在這一次開啟內去重。 */
  const askedThisOpenRef = useRef(new Set<string>())

  const clearForUnauthorized = useCallback((error: unknown) => {
    dataGenerationRef.current += 1
    setMessages([])
    setNames({})
    setPagesLoaded(0)
    setExhausted(false)
    setLoadError(error) // `toUiError` 會把它分成 permission-blocked（`FE-X04`）
    setMoreError(null)
    setBlocked(true)
  }, [])

  const fetchPageRef = useRef<(page: number, mode: 'first' | 'more') => Promise<void>>(async () => {})
  /** 一次一個分頁請求；帶著發出時的世代，回來時比對。 */
  const fetchPage = useCallback(
    async (page: number, mode: 'first' | 'more') => {
      if (inFlightRef.current) {
        if (mode === 'first') pendingFirstRef.current = true
        return
      }
      inFlightRef.current = true
      const generation = generationRef.current
      const dataGeneration = dataGenerationRef.current
      setFetching(true)
      if (mode === 'first') {
        setLoading(true)
        setLoadError(null)
      } else setMoreError(null)
      try {
        const list = await listMessages({ page })
        if (dataGeneration !== dataGenerationRef.current) return // 401／換身分之後的舊回應：丟
        setMessages((prev) => mergeById(prev, list))
        if (generation !== generationRef.current) return // 舊世代：只合併訊息，不動控制狀態
        setPagesLoaded(page + 1)
        setExhausted(list.length < PAGE_SIZE)
        setBlocked(false)
      } catch (error) {
        if (dataGeneration !== dataGenerationRef.current) return
        if (isUnauthorized(error)) {
          clearForUnauthorized(error)
          return
        }
        if (generation !== generationRef.current) return
        if (mode === 'first') setLoadError(error)
        else setMoreError(error)
      } finally {
        inFlightRef.current = false
        setFetching(false)
        if (mode === 'first' && generation === generationRef.current) setLoading(false)
        if (pendingFirstRef.current) {
          pendingFirstRef.current = false
          void fetchPageRef.current(0, 'first')
        }
      }
    },
    [clearForUnauthorized],
  )
  useEffect(() => {
    fetchPageRef.current = fetchPage
  }, [fetchPage])

  /** 從關閉打開：新世代、重取第 0 頁（舊資料仍可見，`loading` 期間載入更多不可按）。 */
  const beginOpen = useCallback(() => {
    generationRef.current += 1
    askedThisOpenRef.current = new Set()
    setBlocked(false)
    setMoreError(null)
    void fetchPage(0, 'first')
  }, [fetchPage])

  const openList = useCallback(
    (opener: HTMLElement | null) => {
      openerRef.current = opener
      restoreFocusRef.current = 'opener'
      setView({ kind: 'list' })
      beginOpen()
    },
    [beginOpen],
  )
  const openThreadFromTalent = useCallback(
    (withId: string) => {
      openerRef.current = null
      restoreFocusRef.current = 'world'
      setView({ kind: 'thread', with: withId, openedFrom: 'talent' })
      beginOpen()
    },
    [beginOpen],
  )
  const enterThread = useCallback((withId: string) => setView({ kind: 'thread', with: withId, openedFrom: 'list' }), [])
  const backToList = useCallback(() => setView({ kind: 'list' }), [])
  const [closedAt, setClosedAt] = useState(0)
  const closePanel = useCallback(() => {
    setView({ kind: 'closed' })
    setClosedAt((n) => n + 1)
  }, [])
  // 關閉後還焦點：等面板真的卸載之後（effect），回開啟者；開啟者不在了就回世界焦點錨（`FE-X06-S13`）。
  useEffect(() => {
    if (view.kind !== 'closed' || restoreFocusRef.current === null) return
    const where = restoreFocusRef.current
    restoreFocusRef.current = null
    const opener = openerRef.current
    openerRef.current = null
    if (where === 'opener' && opener?.isConnected) opener.focus()
    else document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
  }, [view.kind, closedAt])

  const loadMore = useCallback(() => {
    if (loading || exhausted) return
    void fetchPage(pagesLoaded, 'more')
  }, [fetchPage, loading, exhausted, pagesLoaded])
  const retryFirst = useCallback(() => void fetchPage(0, 'first'), [fetchPage])

  const resolveNames = useCallback(
    (ids: readonly string[]) => {
      const dataGeneration = dataGenerationRef.current
      for (const id of new Set(ids)) {
        if (askedThisOpenRef.current.has(id)) continue
        askedThisOpenRef.current.add(id)
        // 成功的跨開關快取：已有名字就不打。
        if (typeof names[id] === 'string') continue
        void getProfile(id)
          .then((profile) => {
            if (dataGeneration !== dataGenerationRef.current) return
            setNames((prev) => ({ ...prev, [id]: profile.display_name }))
          })
          .catch(() => {
            if (dataGeneration !== dataGenerationRef.current) return
            setNames((prev) => (typeof prev[id] === 'string' ? prev : { ...prev, [id]: null }))
          })
      }
    },
    [names],
  )

  /** provider 層的 guard（同步 ref）：`sendingTo` 是 UI 狀態，擋不住同一批次的第二次。 */
  const sendInFlightRef = useRef(false)
  /** 寄信的世代：身分換了就＋1，舊請求的 `finally` 不能清掉新世代的鎖（審查抓到）。 */
  const sendGenerationRef = useRef(0)
  const send = useCallback(
    async (withId: string, body: string) => {
      if (sendInFlightRef.current) return
      sendInFlightRef.current = true
      const dataGeneration = dataGenerationRef.current
      const sendGeneration = sendGenerationRef.current
      setSendingTo(withId)
      try {
        let sent: MessageOut
        try {
          sent = await sendMessage({ recipient_id: withId, body })
        } catch (error) {
          if (dataGeneration !== dataGenerationRef.current) throw error
          // POST 的 401 跟 GET 的一樣：session 沒了，整份私訊資料失效（審查抓到只處理了分頁）。
          if (isUnauthorized(error)) {
            clearForUnauthorized(error)
            throw error
          }
          // 只把**這一次** POST 的 404 轉成領域錯誤（收件人不存在）；其餘原樣拋、走 `toUiError`。
          if (toUiError(error).kind === 'not-found') throw new RecipientGoneError()
          throw error
        }
        if (dataGeneration !== dataGenerationRef.current) return
        setMessages((prev) => mergeById(prev, [sent]))
        // offset 分頁被這封擠了一格：重取第 0 頁、合併（只增不減）；載入更多從第 1 頁重來。
        generationRef.current += 1
        void fetchPage(0, 'first')
      } finally {
        if (sendGeneration === sendGenerationRef.current) {
          sendInFlightRef.current = false
          setSendingTo(null)
        }
      }
    },
    [fetchPage, clearForUnauthorized],
  )

  // 身分換了（登出、換帳號）：整份私訊資料失效 —— 不能等某次請求剛好回 401（審查抓到的）。
  const previousMeRef = useRef(me)
  useEffect(() => {
    if (previousMeRef.current === me) return
    previousMeRef.current = me
    dataGenerationRef.current += 1
    generationRef.current += 1
    sendGenerationRef.current += 1
    sendInFlightRef.current = false
    setSendingTo(null)
    pendingFirstRef.current = false
    askedThisOpenRef.current = new Set()
    setMessages([])
    setNames({})
    setPagesLoaded(0)
    setExhausted(false)
    setLoadError(null)
    setMoreError(null)
    setBlocked(false)
    setView({ kind: 'closed' })
  }, [me])

  const threads = useMemo(() => (me === null ? [] : groupThreads(messages, me)), [messages, me])

  const value = useMemo<InboxValue>(
    () => ({
      view,
      openList,
      openThreadFromTalent,
      enterThread,
      backToList,
      closePanel,
      me,
      messages,
      threads,
      loading,
      loadError,
      moreError,
      pagesLoaded,
      exhausted,
      fetching,
      blocked,
      loadMore,
      retryFirst,
      names,
      resolveNames,
      send,
      sendingTo,
    }),
    [view, openList, openThreadFromTalent, enterThread, backToList, closePanel, me, messages, threads, loading, loadError, moreError, pagesLoaded, exhausted, fetching, blocked, loadMore, retryFirst, names, resolveNames, send, sendingTo],
  )
  return <InboxContext value={value}>{children}</InboxContext>
}
