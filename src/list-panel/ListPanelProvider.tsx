'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BlockingPanelCoordinator, useActivePanel, useBlockingPanelOpen, useBlockingPanels } from '@/panel/BlockingPanelCoordinator'
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
// ⚠️ **「開不開」不在這裡**（`FE-X16`）：協調者持有 `active`，`open` ＝ `active === 'list-panel'` 時的 `route.panel`；開＝ `requestOpen()`（被拒回 `false`）、
// 關＝ `requestClose()`、讓位＝ `onYield`（關的副作用、不還焦點）。鎖跟著**殼的掛載**走（持有者是這裡，`InteractionProvider` 在這一層）—— 沒掛成的請求什麼都不留。
//
// ⚠️ **起始狀態從網址來**（`FE-B09-S01`～`S05`）：這個 provider 只在 `ssr: false` 的世界裡掛，
// 掛載那一刻就知道網址。之後網址 → 狀態（popstate）與狀態 → 網址在 `PanelUrlSync`（`WorldUrlSync`）；
// 這裡只持有狀態，不碰 `history`。

interface ListPanelValue {
  open: ListKind | null
  /** 開著的面板裡選中的那一筆：人才面板是 profile id、案件面板是 project id（`FE-B03`）。 */
  selected: string | null
  /** 清單畫面上呈現的頁次（0-based）。 */
  page: number
  /** 回 `false` = 現在開著的面板拒絕讓位（送出中、有未儲存的修改），什麼都沒變。 */
  openPanel: (kind: ListKind) => boolean
  closePanel: () => void
  /** 被協調者讓位：關的副作用、不還焦點（`PanelShell` 的 `onYield`）。 */
  yieldPanel: () => void
  /** 只在人才面板下有效。 */
  selectProfile: (id: string | null) => void
  /** 只在案件面板下有效（`FE-B03`）。 */
  selectProject: (id: string | null) => void
  reportPage: (page: number) => void
  /** 網址說現在開著哪一層（掛載後的 popstate）：整份套上。回 `false` = 要開但被拒（`FE-X16-S17`：呼叫端把那一筆改回實際狀態）。 */
  restore: (route: PanelUrlState) => boolean
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

const ID = 'list-panel'

export const ListPanelProvider = ({ children }: { children: ReactNode }) => (
  <BlockingPanelCoordinator>
    <ListPanelState>{children}</ListPanelState>
  </BlockingPanelCoordinator>
)

function ListPanelState({ children }: { children: ReactNode }) {
  const { holdInputLock } = useInteraction()
  const { requestOpen, requestClose } = useBlockingPanels()
  // 網址帶著面板進來（深連結）：**在初始化時**就向協調者要（那時 `active` 是空的，一定成功；重複呼叫是 no-op）——
  // 第一次繪製 `open` 就要是對的，不然 `WorldUrlSync` 的 effect 會先看到「關著」而把網址退掉（子 effect 先跑）。
  const [route, setRoute] = useState<PanelUrlState>(() => {
    const initial = initialRoute()
    if (initial.panel !== null) requestOpen(ID)
    return initial
  })
  // 「開著」從協調者推導；子狀態（kind／page／selected）留在這裡。不是我的時候整份當關著（`selected` 才不會冒出來）。
  const mine = useActivePanel() === ID
  const panel = mine ? route : CLOSED
  const open = panel.panel

  // 鎖跟著殼的掛載走：殼登記了才持、卸載了才放（`FE-B01-S17`／`S18`；深連結掛載時沒有人按 E，也是這裡）。
  // ⚠️ 少了 cleanup 關掉面板之後人走不動，要用滑鼠點一下畫面 —— 只驗 `S18` 的話「開了就永遠鎖住」是全綠的。
  const shellMounted = useBlockingPanelOpen() && mine
  useEffect(() => (shellMounted ? holdInputLock(ID) : undefined), [shellMounted, holdInputLock])

  const openPanel = useCallback(
    (kind: ListKind) => {
      if (!requestOpen(ID)) return false
      // 同一塊看板再按一次 E：什麼都不變（頁碼、詳情都留著）。換一塊、或剛被讓位過：從第 0 頁重新開。
      setRoute((r) => (r.panel === kind ? r : { panel: kind, profile: null, project: null, page: 0 }))
      return true
    },
    [requestOpen],
  )
  const closePanel = useCallback(() => {
    requestClose(ID)
    setRoute(CLOSED)
    // 面板是按 E 開的，沒有 DOM 的開啟控制可以回去：焦點放到世界焦點錨（`FE-X06-S13`），
    // 不留在 `body`、不跑去標題列。錨是什麼元素不是這裡決定的 —— 用語意標記找。
    document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
  }, [requestClose])
  const yieldPanel = useCallback(() => setRoute(CLOSED), [])
  const selectProfile = useCallback((id: string | null) => {
    setRoute((r) => (r.panel !== 'profiles' || r.profile === id ? r : { ...r, profile: id }))
  }, [])
  const selectProject = useCallback((id: string | null) => {
    setRoute((r) => (r.panel !== 'projects' || r.project === id ? r : { ...r, project: id }))
  }, [])
  const reportPage = useCallback((page: number) => {
    setRoute((r) => (r.panel === null || r.page === page ? r : { ...r, page }))
  }, [])
  const restore = useCallback(
    (next: PanelUrlState) => {
      if (next.panel === null) requestClose(ID)
      else if (!requestOpen(ID)) return false
      setRoute(next)
      return true
    },
    [requestOpen, requestClose],
  )

  const value = useMemo(
    () => ({
      open,
      // 三種面板狀態各自分支：關著時一定是 null（`restore` 拿到錯位的組合也不會冒出一個選中）
      selected: panel.panel === 'projects' ? panel.project : panel.panel === 'profiles' ? panel.profile : null,
      page: panel.page,
      openPanel,
      closePanel,
      yieldPanel,
      selectProfile,
      selectProject,
      reportPage,
      restore,
    }),
    [panel, open, openPanel, closePanel, yieldPanel, selectProfile, selectProject, reportPage, restore],
  )
  return <ListPanelContext.Provider value={value}>{children}</ListPanelContext.Provider>
}
