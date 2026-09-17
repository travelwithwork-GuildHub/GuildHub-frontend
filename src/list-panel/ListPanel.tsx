'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { SECONDARY } from '@/design/controls'
import { PanelShell } from '@/panel/PanelShell'
import { edgeState, type ListKind } from './paging'
import { useListPage, type ListItemOf } from './useListPage'

// 共用的清單容器：一份版型＋列表＋翻頁，案件與人才都用它。規格 `FE-B01`
// 〈案件與人才共用同一個容器〉、〈只做狀態，不做文案〉、〈Escape 關閉面板〉。
//
// ⚠️⚠️ **這個檔案裡沒有任何一個使用者看得到的字。** 剝掉註解之後，
// 原始碼裡 SHALL NOT 出現 CJK 字元（`tests/list-panel-container.test.tsx` 掃它）。
// 「首次無資料」「翻到底」「載入失敗」的文案歸 `FE-X04`／`FE-X03`（都標著「唯一一份」），
// 標題、按鈕上的字由呼叫端帶進來 —— 這裡先寫一份「暫時的」，就是第二份，之後要有人來拔。
//
// ⚠️ **資料種類只是輸入。** 端點是誰、卡片長什麼樣，這裡都不知道：
// 前者在 `useListPage`，後者是呼叫端的 `renderItem`。
//
// 殼（section、Escape 層、focus trap、關閉鈕、overlay 的 `inert`）是 `src/panel/PanelShell`（`FE-A04` design `D1` 抽出去的）；
// 這裡只剩清單：列表、翻頁、邊界狀態、焦點進列表。

/** overlay 拿得到的清單動作：`reload` 回第 0 頁重取（`FE-J01` design D2 的二選一，選了 render-prop）。 */
export interface ListPanelSlot {
  reload: () => void
}

export interface ListPanelProps<K extends ListKind> {
  kind: K
  /** 面板的名字（也是 `aria-label`）。 */
  title: string
  labels: { next: string; close: string }
  /** `fetchedAt`：這一頁回來的時刻（epoch ms）—— 要畫相對時間（剩幾天）的卡片用它當時鐘，不自己讀 `Date.now()`。 */
  renderItem: (item: ListItemOf[K], ctx: { fetchedAt: number }) => ReactNode
  /** 首次無資料時顯示的節點。沒給就什麼都不顯示（`S13`）。 */
  empty?: ReactNode
  /** 翻到底時顯示的節點。 */
  exhausted?: ReactNode
  /**
   * 請求失敗時顯示的節點；拿到「重試同一頁」的動作（`S11`）與**原始的失敗**。
   *
   * ⚠️ **這裡不翻譯。** 容器是通用的狀態機，把 `FE-X03` 的語彙塞進來會讓之後每一個
   * 消費者都被迫接受同一套翻譯。`cause` 原樣往外傳，知道自己打哪支 API 的呼叫端
   * 自己 `toUiError(cause)`（`FE-X04` design `D3`）。
   */
  error?: (slot: { retry: () => void; cause: unknown }) => ReactNode
  /**
   * 蓋在列表上的東西（例如一筆的詳情，`FE-B04`）。有它的時候列表**不卸載、不 `display: none`**，
   * 只標成 `inert` —— 頁碼與捲動位置才留得住（`FE-B04-S11`／`S12`／`S16`）。
   */
  overlay?: ReactNode | ((slot: ListPanelSlot) => ReactNode)
  /** 列表上方的動作（例如「發案」，`FE-J01`）。跟列表一起在內容區，overlay 開著時一樣 `inert`。 */
  toolbar?: ReactNode
  onClose: () => void
  /** 要看的頁與頁次回報（`FE-B09`）：見 `useListPage` 的 `ListPageOptions`。 */
  page?: number
  onShownPage?: (page: number) => void
}

export function ListPanel<K extends ListKind>({
  kind,
  title,
  labels,
  renderItem,
  empty,
  exhausted,
  error,
  overlay,
  toolbar,
  onClose,
  page,
  onShownPage,
}: ListPanelProps<K>) {
  const { state, next, retry, reload } = useListPage(kind, { page, onShownPage })
  const overlayNode = typeof overlay === 'function' ? overlay({ reload }) : overlay
  const edge = edgeState(state)
  const items = state.shown?.items ?? []
  const fetchedAt = state.shown?.at ?? 0
  // 沒有項目時列表不佔空間，狀態節點（首次無資料、權限阻擋⋯⋯）從上面開始，
  // 不是躲在一個空白大框的底下。列表仍然在（`aria-busy` 與 `role="list"` 的判準要找得到它）。
  const hasItems = items.length > 0
  const list = useRef<HTMLUListElement>(null)

  // 焦點進**列表**：之後的方向鍵捲的是它。焦點要落在那個真的會捲動的元素上 ——
  // 落在外層 `<section>` 的話，瀏覽器捲的是頁面不是清單。
  // 詳情（overlay）關掉的時候也要把焦點還給列表：不還的話鍵盤使用者的焦點掉到 body，
  // 下一個 Tab 跑去標題列 —— 真瀏覽器的 e2e 抓到的。呼叫端可以再覆蓋（`BoardPanel` 把焦點放回那張卡）。
  // **這不是 `FE-B01-S18` 的防禦** —— 那把鎖在 `InteractionProvider`，就算焦點被搶走，人也不會走。
  const overlayOpen = overlayNode !== undefined && overlayNode !== null
  useEffect(() => {
    if (!overlayOpen) list.current?.focus()
  }, [overlayOpen])

  return (
    <PanelShell
      title={title}
      closeLabel={labels.close}
      testId="list-panel"
      bodyTestId="list-panel-list"
      overlayTestId="list-panel-overlay"
      data={{ 'data-kind': kind }}
      overlay={overlayNode}
      onCloseRequest={onClose}
    >
      {toolbar}
      <ul
        ref={list}
        tabIndex={-1}
        aria-busy={state.phase === 'loading'}
        className={
          hasItems
            ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'
            : 'h-0 flex-none overflow-hidden'
        }
      >
        {items.map((item) => (
          <li key={item.id}>{renderItem(item, { fetchedAt })}</li>
        ))}
      </ul>

      <footer
        data-testid="list-panel-edge"
        className={hasItems ? 'flex flex-col gap-2' : 'flex flex-1 flex-col gap-2'}
      >
        {edge === 'error' && error?.({ retry, cause: state.error })}
        {edge === 'first-empty' && empty}
        {edge === 'exhausted' && exhausted}
        {edge === null && state.shown !== null && (
          <button
            type="button"
            className={SECONDARY}
            disabled={state.phase === 'loading'}
            onClick={next}
          >
            {labels.next}
          </button>
        )}
      </footer>
    </PanelShell>
  )
}
