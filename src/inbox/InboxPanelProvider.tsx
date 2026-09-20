'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { MessageOut } from '@/api/contract/rest'
import { useIdentity } from '@/identity/IdentityProvider'
import { BlockingPanelCoordinator, useActivePanel, useBlockingPanels } from '@/panel/BlockingPanelCoordinator'
import { groupThreads, type Thread } from './threads'

// 收件匣的**協調與狀態**。規格 `FE-K01`；design `D1`／`D2`／`D3`；`FE-X15` --panel-inbox（design D3／D4）。
//
// ⚠️ **拆成 eager 協調＋lazy 引擎（`FE-X15-S04`）**：這一層（eager）不 import 訊息 API（`getProfile`／`listMessages`／`sendMessage`）
// 也不 import 面板 UI —— 開啟前零 chunk。它持有整份資料**狀態**與**競態 ref**（generation／dataGeneration／inFlight／pendingFirst／
// askedThisOpen／sendInFlight），以 `me` 為 key 常駐；把這些用一個穩定的 `store` 交給 lazy 內容（`OpenInboxPanel`，由 `PanelHost` 載入）。
// 內容裡的操作（fetchPage／send／resolveNames，import 訊息 API）驅動這份狀態；in-flight 的 closure 捕捉的是常駐的 setters／refs ——
// 送出中關掉面板、內容卸載，201 回來照樣併進常駐狀態（`S12`）；`me` 換了整棵重掛，舊 closure 落在已卸載的元件上成 no-op（帳號隔離）。
//
// 「開啟意圖」是同步的（`beginOpenIntent`）：generation＋1、`loading` 立刻為真、`openNonce`＋1 —— 內容掛好才真的打第 0 頁。
// 這樣 chunk 載入那段空窗 `loading` 已是 true（`S11`：載入中不是空），而 API 仍只在內容 chunk 裡。
//
// 掛在 `page.tsx`（`ProfilePanelProvider` 旁邊）：按鈕在標題列、面板在 `WorldCanvas` 裡，provider 要包住兩者。
// 世界輸入鎖**不在這裡**（`InteractionProvider` 在 `WorldCanvas` 裡）—— `FE-X15` 之後由 `InboxPanel`（host）注入給 `PanelHost` 持有。
// **「開不開」在協調者**（`FE-X16`）：`view` 只是子狀態，掛不掛看 `useActivePanel() === 'inbox-panel'`；開＝ `openList()`／`openThreadFromTalent()`（被拒回 `false`）、關＝ `closePanel()`、讓位＝ `yieldPanel`（不還焦點）。

export type InboxView = { kind: 'closed' } | { kind: 'list' } | { kind: 'thread'; with: string; openedFrom: 'list' | 'talent' }

/**
 * 收件匣的競態機器（分頁世代＋在飛旗標）。**一個純物件、只用自己的方法改自己的欄位** ——
 * 欄位讀取沒問題，但賦值一律走方法：這樣 lazy 內容拿到它（經 `store`）驅動時，是「呼叫方法」不是「改 prop」，
 * 不會踩到 `react-hooks/immutability`（改 hook 參數／prop 會被擋）。以 `me` 為 key 常駐（隨 `InboxState` 重建）。
 */
export interface InboxRace {
  /** 每次從關閉打開＋1（分頁控制狀態只聽目前世代）。 */
  generation: number
  /** 401 時＋1（所有在飛的回應都丟）。 */
  dataGeneration: number
  /** 有分頁請求在飛。 */
  inFlight: boolean
  /** 槽被占著時想重取第 0 頁（201 之後、重開撞上）：等前一個結束再發（design `D2`）。 */
  pendingFirst: boolean
  /** provider 層的送出 guard（同步）：`sendingTo` 是晚一格的 UI 狀態。 */
  sendInFlight: boolean
  bumpGeneration(): void
  bumpDataGeneration(): void
  setInFlight(v: boolean): void
  setPendingFirst(v: boolean): void
  setSendInFlight(v: boolean): void
  /** 這一次開啟內問過（含失敗）的名字：失敗只在這一次開啟內去重。 */
  askedHas(id: string): boolean
  askedAdd(id: string): void
  resetAsked(): void
  /** 內容每次掛好把最新的 `fetchPage` 放進來；被占著的槽清空後用它補跑第 0 頁（design `D2`）。 */
  setFetchPage(fn: (page: number, mode: 'first' | 'more') => Promise<void>): void
  runFirst(): void
}

function createInboxRace(): InboxRace {
  const s = {
    generation: 0,
    dataGeneration: 0,
    inFlight: false,
    pendingFirst: false,
    sendInFlight: false,
    asked: new Set<string>(),
    fetchPage: (async () => {}) as (page: number, mode: 'first' | 'more') => Promise<void>,
  }
  return {
    get generation() { return s.generation },
    get dataGeneration() { return s.dataGeneration },
    get inFlight() { return s.inFlight },
    get pendingFirst() { return s.pendingFirst },
    get sendInFlight() { return s.sendInFlight },
    bumpGeneration() { s.generation += 1 },
    bumpDataGeneration() { s.dataGeneration += 1 },
    setInFlight(v) { s.inFlight = v },
    setPendingFirst(v) { s.pendingFirst = v },
    setSendInFlight(v) { s.sendInFlight = v },
    askedHas(id) { return s.asked.has(id) },
    askedAdd(id) { s.asked.add(id) },
    resetAsked() { s.asked = new Set() },
    setFetchPage(fn) { s.fetchPage = fn },
    runFirst() { void s.fetchPage(0, 'first') },
  }
}

/** lazy 內容驅動常駐狀態用的把手：穩定的 setters ＋常駐的 `race`（`store` 本身也穩定），內容的操作 closure 捕捉它。 */
export interface InboxStore {
  setMessages: Dispatch<SetStateAction<MessageOut[]>>
  setPagesLoaded: Dispatch<SetStateAction<number>>
  setExhausted: Dispatch<SetStateAction<boolean>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setFetching: Dispatch<SetStateAction<boolean>>
  setLoadError: Dispatch<SetStateAction<unknown>>
  setMoreError: Dispatch<SetStateAction<unknown>>
  setBlocked: Dispatch<SetStateAction<boolean>>
  setNames: Dispatch<SetStateAction<Record<string, string | null | undefined>>>
  setSendingTo: Dispatch<SetStateAction<string | null>>
  race: InboxRace
  /** 401：清信與名字、`dataGeneration`＋1（所有在飛的回應一律丟）。不 import API，放這裡（eager）。 */
  clearForUnauthorized: (error: unknown) => void
}

export interface InboxValue {
  /** 面板掛不掛看這個（協調者說是我、而且有畫面）；關著一律 `closed`。 */
  view: InboxView
  /** 標題列的按鈕開清單；`opener` 是那顆按鈕（關閉後焦點回它）。回 `false` = 現在開著的面板拒絕讓位。 */
  openList: (opener: HTMLElement | null) => boolean
  /** 從別人的名片進來：直接進對話；開啟者已經不在了（看板讓位），關閉後焦點回世界焦點錨。 */
  openThreadFromTalent: (withId: string) => boolean
  /** 從清單進對話。 */
  enterThread: (withId: string) => void
  backToList: () => void
  closePanel: () => void
  /** 被協調者讓位：不還焦點。 */
  yieldPanel: () => void
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
  /** 對方名字：`undefined` = 還沒問／問到一半；`null` = 失敗（顯示縮短 id）。 */
  names: Record<string, string | null | undefined>
  /** 送出中的對方（任何一封在送，所有寄信表單都先不能再送）。 */
  sendingTo: string | null
  /** 同步版：現在有沒有一封在送（讓位協定用；`sendingTo` 是晚一格的 UI 狀態）。 */
  sending: () => boolean
  /** 開啟意圖的計數：每次 `beginOpenIntent` ＋1；lazy 內容以它為訊號重取第 0 頁。 */
  openNonce: number
  /** lazy 內容驅動常駐狀態用的把手。 */
  store: InboxStore
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

const CLOSED_VIEW: InboxView = { kind: 'closed' }
const ID = 'inbox-panel'

export function InboxPanelProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  const me = identity.state === 'signed-in' ? identity.profile.id : null
  // 身分換了（登出、換帳號）：整份私訊資料失效 —— 用 `key` 讓整個狀態樹重建，不靠 effect 一個一個清（effect 是渲染之後才跑，
  // 會有一幀用新的 me 配舊的信；審查提醒）。舊實例在飛的請求回來時 setState 落在已卸載的元件上，什麼都不會寫。
  return (
    <BlockingPanelCoordinator>
      <InboxState key={me ?? 'anon'} me={me}>{children}</InboxState>
    </BlockingPanelCoordinator>
  )
}

function InboxState({ me, children }: { me: string | null; children: ReactNode }) {
  const { requestOpen, requestClose } = useBlockingPanels()
  const [screen, setScreen] = useState<InboxView>({ kind: 'closed' })
  const view: InboxView = useActivePanel() === ID ? screen : CLOSED_VIEW
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
  /** 開啟意圖的訊號：每次 `beginOpenIntent`＋1，lazy 內容以它為 dep 重取第 0 頁。 */
  const [openNonce, setOpenNonce] = useState(0)

  // 競態機器（世代＋在飛旗標）：常駐純物件，以 `me` 為 key 隨 `InboxState` 重建。lazy 內容經 `store.race` 驅動它。
  const [race] = useState(createInboxRace)

  const clearForUnauthorized = useCallback(
    (error: unknown) => {
      race.bumpDataGeneration()
      setMessages([])
      setNames({})
      setPagesLoaded(0)
      setExhausted(false)
      setLoadError(error) // `toUiError` 會把它分成 permission-blocked（`FE-X04`）
      setMoreError(null)
      setBlocked(true)
    },
    [race],
  )

  // 給 lazy 內容的把手。**必須是「保證穩定」的參照，不能用 `useMemo`**：`useMemo` 是效能提示、
  // React 允許在記憶體壓力下丟掉快取重算（官方明文），一旦 `store` 換了參照，內容裡 `fetchPage`（deps `[store]`）
  // 跟著換，`openNonce` 的 drain effect（deps `[openNonce, fetchPage]`）就會誤觸、多打一次第 0 頁（違反 S01；Gemini 覆核抓到）。
  // 成員（useState 的 setters、`race`、`clearForUnauthorized`）都是終身穩定的，用 `useState` 初始化器建一次就對。
  const [store] = useState<InboxStore>(() => ({
    setMessages,
    setPagesLoaded,
    setExhausted,
    setLoading,
    setFetching,
    setLoadError,
    setMoreError,
    setBlocked,
    setNames,
    setSendingTo,
    race,
    clearForUnauthorized,
  }))

  /** 從關閉打開（同步、不 import API）：新世代、`loading` 立刻為真、`openNonce`＋1 讓內容重取第 0 頁。舊資料仍可見。 */
  const beginOpenIntent = useCallback(() => {
    race.bumpGeneration()
    race.resetAsked()
    setBlocked(false)
    setMoreError(null)
    setLoading(true)
    setFetching(true)
    setOpenNonce((n) => n + 1)
  }, [race])

  const openList = useCallback(
    (opener: HTMLElement | null) => {
      if (!requestOpen(ID)) return false
      openerRef.current = opener
      restoreFocusRef.current = 'opener'
      setScreen({ kind: 'list' })
      beginOpenIntent()
      return true
    },
    [beginOpenIntent, requestOpen],
  )
  const openThreadFromTalent = useCallback(
    (withId: string) => {
      if (!requestOpen(ID)) return false
      openerRef.current = null
      restoreFocusRef.current = 'world'
      setScreen({ kind: 'thread', with: withId, openedFrom: 'talent' })
      beginOpenIntent()
      return true
    },
    [beginOpenIntent, requestOpen],
  )
  const yieldPanel = useCallback(() => {
    restoreFocusRef.current = null
    openerRef.current = null
    setScreen(CLOSED_VIEW)
  }, [])
  const enterThread = useCallback((withId: string) => setScreen({ kind: 'thread', with: withId, openedFrom: 'list' }), [])
  const backToList = useCallback(() => setScreen({ kind: 'list' }), [])
  const closePanel = useCallback(() => {
    // 關閉時還焦點：回開啟者；開啟者不在了就回世界焦點錨（`FE-X06-S13`）。
    // **在 requestClose 之前、同步做**：兩者都在面板外面，先把焦點放過去再卸載面板，焦點就不會掉到 body。
    const where = restoreFocusRef.current
    restoreFocusRef.current = null
    const opener = openerRef.current
    openerRef.current = null
    if (where === 'opener' && opener?.isConnected) opener.focus()
    else if (where !== null) document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
    requestClose(ID)
    setScreen(CLOSED_VIEW)
  }, [requestClose])

  const sending = useCallback(() => race.sendInFlight, [race])
  const threads = useMemo(() => (me === null ? [] : groupThreads(messages, me)), [messages, me])

  const value = useMemo<InboxValue>(
    () => ({
      view,
      openList,
      openThreadFromTalent,
      enterThread,
      backToList,
      closePanel,
      yieldPanel,
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
      names,
      sendingTo,
      sending,
      openNonce,
      store,
    }),
    [view, openList, openThreadFromTalent, enterThread, backToList, closePanel, yieldPanel, me, messages, threads, loading, loadError, moreError, pagesLoaded, exhausted, fetching, blocked, names, sendingTo, sending, openNonce, store],
  )
  return <InboxContext value={value}>{children}</InboxContext>
}
