'use client'

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CAPTION, withClass } from '@/design/controls'
import { layer } from '@/design/layers'

// 「哪一個阻斷式面板是開的」的唯一持有者。規格 `FE-X16`〈同一時間只有一個阻斷式面板；讓位有協定〉；design D3、ADR 0011。
//
// `active: id | null` 住在這裡；三個面板 provider 的「開著」＝ `useActivePanel() === 自己的 id`，不各自 `useState(open)` ——
// 「≤ 1」於是是結構上的事：一個值只能指向一個 id，延遲 commit 的舊請求掛不出第二個面板（掛不掛由 `active` 決定）。
// **同步決定**（直接讀 store，不等 commit）：`active` 空、或指向還沒登記的 id（殼還沒掛成）→ 取代；已登記且 `canYield()` → 先 `onYield()` 再取代；否則拒絕、`active` 不變、`role="status"` 回饋（`S14`）。
// 同一次事件裡的兩個請求：後者對前者做同一套判斷，前者還沒掛成就被取代（`S21`／`S22`）。
// **殼的卸載不動 `active`**（Strict Mode 的模擬卸載跟真卸載是同一條 cleanup）：登記是有身分的一筆、cleanup 只刪自己那筆（同 id 多筆時留下的仍算數，最晚登記的那筆是持有者 —— 審查抓到只留最後一筆會讓先登記的在後者解除時一起消失）；`active` 只由 `requestClose(id)`（compare-and-clear）與被取代改變。
// 「有阻斷式面板開著」＝ `active` 指向的殼**已登記**，不是 `active !== null` —— 幽靈 `active`（provider 在 commit 前卸載）對畫面沒有作用。
//
// ⚠️ 巢狀時**內層沿用外層**（不拋錯）：`ListPanelProvider` 在 `WorldCanvas` 裡、另外兩個在 `page.tsx`，三個 provider 各自確保上面有協調者 ——
// 頁面上只有 `page.tsx` 那一個是真的，單獨掛某個 provider 的測試才會自己長一個。兩個**不同**的協調者才是會靜默壞掉的形狀（面板互相看不見）。

export type BlockingPanelId = 'list-panel' | 'inbox-panel' | 'profile-panel'
export interface PanelRegistration {
  id: BlockingPanelId
  /** 送出中、有未儲存的修改 → `false`（同步）。 */
  canYield: () => boolean
  /** 被讓位時的收尾：走既有關閉路徑的副作用，**不**還焦點給開啟者。 */
  onYield: () => void
}
/** `open`：`active` 指向的殼已登記；`rejected`：拒絕的次數（回饋用）。 */
type Snapshot = { active: BlockingPanelId | null; open: boolean; rejected: number }
type Store = ReturnType<typeof createStore>

function createStore() {
  let active: BlockingPanelId | null = null
  let rejected = 0
  const registrations = new Map<BlockingPanelId, PanelRegistration[]>()
  const holder = (id: BlockingPanelId | null) => (id === null ? undefined : registrations.get(id)?.at(-1))
  const listeners = new Set<() => void>()
  let snapshot: Snapshot = { active, open: false, rejected }
  const emit = () => {
    snapshot = { active, open: holder(active) !== undefined, rejected }
    for (const l of listeners) l()
  }
  return {
    requestOpen: (id: BlockingPanelId): boolean => {
      const current = holder(active)
      if (current !== undefined && current.id !== id) {
        if (!current.canYield()) {
          rejected += 1
          emit()
          return false
        }
        current.onYield()
      }
      if (active !== id) {
        active = id
        emit()
      }
      return true
    },
    requestClose: (id: BlockingPanelId) => {
      if (active !== id) return
      active = null
      emit()
    },
    register: (registration: PanelRegistration) => {
      registrations.set(registration.id, [...(registrations.get(registration.id) ?? []), registration])
      emit()
      return () => {
        registrations.set(registration.id, (registrations.get(registration.id) ?? []).filter((r) => r !== registration))
        emit()
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (): Snapshot => snapshot,
  }
}

const Ctx = createContext<Store | null>(null)
// 沒有協調者時讀到的（同一個物件：`useSyncExternalStore` 每次拿到新物件會無限重繪）
const EMPTY: Snapshot = { active: null, open: false, rejected: 0 }
const NONE: Store = { requestOpen: () => true, requestClose: () => {}, register: () => () => {}, subscribe: () => () => {}, getSnapshot: () => EMPTY }

/** 拒絕時的回饋（`role="status"`，內容不是契約；3～5 秒自動消失 —— `ui-ux-pro-max` 的 toast 規則）。 */
export const YIELD_REFUSED_MESSAGE = '先完成目前面板裡的事，再開別的。'
const STATUS_MS = 4000

export function BlockingPanelCoordinator({ children }: { children: ReactNode }) {
  const above = useContext(Ctx)
  const [own] = useState(createStore)
  if (above !== null) return children
  return (
    <Ctx.Provider value={own}>
      {children}
      <RefusalStatus store={own} />
    </Ctx.Provider>
  )
}

function RefusalStatus({ store }: { store: Store }) {
  const { rejected } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [cleared, setCleared] = useState(0)
  useEffect(() => {
    if (rejected === 0) return
    const timer = setTimeout(() => setCleared(rejected), STATUS_MS)
    return () => clearTimeout(timer)
  }, [rejected])
  // 第一次拒絕之後才掛 live region（之後常駐、只換內容）：協調者也會被沒有 DOM 的樹自動長出來（R3F test renderer 底下的 `ListPanelProvider`）。在 `toast` 層、不吃事件
  if (rejected === 0) return null
  return (
    <div role="status" aria-live="polite" style={{ zIndex: layer('toast') }} className="pointer-events-none fixed bottom-gutter left-1/2 -translate-x-1/2">
      {rejected > cleared && <p {...withClass(CAPTION, 'bg-surface-raised border-line text-ink shadow-dialog rounded-panel border px-gutter py-2')}>{YIELD_REFUSED_MESSAGE}</p>}
    </div>
  )
}

/** 殼用：掛載時登記一筆（有身分；cleanup 只刪自己那筆、不動 `active`）。`canYield`／`onYield` 每次呼叫讀最新的那份。沒有協調者（單獨掛殼的測試）就不登記。 */
export function useRegisterBlockingPanel(panel: PanelRegistration): void {
  const store = useContext(Ctx)
  const latest = useRef(panel)
  useEffect(() => {
    latest.current = panel
  })
  useEffect(() => store?.register({ id: panel.id, canYield: () => latest.current.canYield(), onYield: () => latest.current.onYield() }), [store, panel.id])
}
/** 面板 provider 用：請求開、關。沒有協調者就炸 —— 開面板的那一方一定在它底下。 */
export function useBlockingPanels(): Pick<Store, 'requestOpen' | 'requestClose'> {
  const store = useContext(Ctx)
  if (store === null) throw new Error('useBlockingPanels 必須在 <BlockingPanelCoordinator> 底下使用。')
  return store
}
/** 哪一個面板是開的（`null` = 沒有）。 */
export function useActivePanel(): BlockingPanelId | null {
  const store = useContext(Ctx) ?? NONE
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).active
}
/** 非阻斷的表面（訪客提示、聊天框、彈出層）讀：有阻斷式面板**掛著**。沒有協調者（單獨掛的測試）就是 `false`。 */
export function useBlockingPanelOpen(): boolean {
  const store = useContext(Ctx) ?? NONE
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).open
}
