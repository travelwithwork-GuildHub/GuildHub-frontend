'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import type { ListKind } from './paging'
import { CLOSED, parsePanelUrl, type PanelUrlState } from './urlState'

// 「現在開著哪一層」：哪一塊看板的面板、哪一筆詳情、第幾頁。規格 `FE-B01`〈走到看板前按 E，開得起對應的面板〉、
// 〈Escape 關閉面板，並把世界的輸入還回去〉；`FE-B09`〈網址表示開著哪一層，複製它就能還原〉。
//
// ⚠️ **開的動作在 Canvas 裡面（看板的 `onInteract`），面板本身在 Canvas 外面。**
// 兩邊要看到同一份狀態，所以這個 provider 要包住兩者 —— 跟 `InteractionProvider` 一樣。
//
// ⚠️ **必須在 `<InteractionProvider>` 底下。** 面板開著的時候要鎖住世界的移動輸入
// （`S18`），而那把鎖在互動層；沒有那一層的話這裡直接炸，不會靜默變成「面板開了人還在走」。
//
// ⚠️ **起始狀態從網址來**（`FE-B09-S01`～`S05`）：這個 provider 只在 `ssr: false` 的世界裡掛，
// 掛載那一刻就知道網址。之後網址 → 狀態（popstate）與狀態 → 網址在 `PanelUrlSync`；
// 這裡只持有狀態，不碰 `history`。

interface ListPanelValue {
  open: ListKind | null
  /** 開著的詳情（人才 id）；只有人才面板有。 */
  selected: string | null
  /** 清單畫面上呈現的頁次（0-based）。 */
  page: number
  openPanel: (kind: ListKind) => void
  closePanel: () => void
  selectProfile: (id: string | null) => void
  reportPage: (page: number) => void
  /** 網址說現在開著哪一層（掛載後的 popstate）：整份套上，鎖與焦點跟著走。 */
  restore: (route: PanelUrlState) => void
}

const ListPanelContext = createContext<ListPanelValue | null>(null)

export function useListPanel(): ListPanelValue {
  const value = useContext(ListPanelContext)
  if (value === null) throw new Error('useListPanel 必須在 <ListPanelProvider> 底下使用。')
  return value
}

function initialRoute(): PanelUrlState {
  return typeof window === 'undefined' ? CLOSED : parsePanelUrl(window.location.search)
}

export function ListPanelProvider({ children }: { children: ReactNode }) {
  const { holdInputLock } = useInteraction()
  const [route, setRoute] = useState<PanelUrlState>(initialRoute)
  /** 面板開著時持有的那一把；`null` = 沒持有。 */
  const releaseRef = useRef<(() => void) | null>(null)

  // 鎖跟著開關走，**同步持有**，不等 effect —— 開面板的那個 E 之後的第一個方向鍵就該被擋。
  // 面板已經開著時再開（換一塊看板）：不再持有第二把，那一把還在。
  const hold = useCallback(() => {
    releaseRef.current ??= holdInputLock('list-panel')
  }, [holdInputLock])
  const release = useCallback(() => {
    // ⚠️ **這一行是 `FE-B01-S17`。** 少了它，關掉面板之後人走不動，要用滑鼠點一下畫面
    // —— 而只驗 `S18` 的話，「開了就永遠鎖住」是全綠的。
    // 釋放的是**自己那一把**：輸入框還有焦點時它的那一把還在（`FE-X06-S10`）。
    releaseRef.current?.()
    releaseRef.current = null
    // 面板是按 E 開的，沒有 DOM 的開啟控制可以回去：焦點放到世界焦點錨（`FE-X06-S13`），
    // 不留在 `body`、不跑去標題列。錨是什麼元素不是這裡決定的 —— 用語意標記找。
    document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
  }, [])

  // 網址帶著面板進來（深連結）：掛載時沒有人按 E，鎖在這裡補上。
  const openedAtMount = route.panel !== null
  useEffect(() => {
    if (openedAtMount) hold()
  }, [openedAtMount, hold])

  const openPanel = useCallback(
    (kind: ListKind) => {
      hold()
      // 同一塊看板再按一次 E：什麼都不變（頁碼、詳情都留著）。換一塊：從第 0 頁重新開。
      setRoute((r) => (r.panel === kind ? r : { panel: kind, profile: null, page: 0 }))
    },
    [hold],
  )
  const closePanel = useCallback(() => {
    release()
    setRoute(CLOSED)
  }, [release])
  const selectProfile = useCallback((id: string | null) => {
    setRoute((r) => (r.panel !== 'profiles' || r.profile === id ? r : { ...r, profile: id }))
  }, [])
  const reportPage = useCallback((page: number) => {
    setRoute((r) => (r.panel === null || r.page === page ? r : { ...r, page }))
  }, [])
  const restore = useCallback(
    (next: PanelUrlState) => {
      if (next.panel === null) release()
      else hold()
      setRoute(next)
    },
    [hold, release],
  )

  // 這一層開著的時候被卸載（例如路由切走）：不還的話世界回來時人走不動。
  useEffect(
    () => () => {
      releaseRef.current?.()
      releaseRef.current = null
    },
    [],
  )

  const value = useMemo(
    () => ({
      open: route.panel,
      selected: route.profile,
      page: route.page,
      openPanel,
      closePanel,
      selectProfile,
      reportPage,
      restore,
    }),
    [route, openPanel, closePanel, selectProfile, reportPage, restore],
  )
  return <ListPanelContext.Provider value={value}>{children}</ListPanelContext.Provider>
}
