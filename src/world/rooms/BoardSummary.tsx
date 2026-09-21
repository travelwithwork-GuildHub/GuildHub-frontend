'use client'

import { useRef, type RefObject } from 'react'
import { CAPTION, withClass } from '@/design/controls'
import { EMPTY_STATE_COPY } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { BOARD_ANCHORS } from './boardAnchors'
import { BOARD_SUMMARY_COUNT, useBoardSummary, type BoardSummaryStatus } from './useBoardSummary'

// 兩塊看板面上的常駐摘要（`FE-W20`，畫面半邊；design D3／D5）。
//
// **Canvas 外面的 DOM**，每塊看板一塊釘在板面上的清單卡：位置由 `BoardSummaryProjector` 每幀寫（不進 React），
// 這裡只負責「有哪兩塊、裡面畫什麼」。四種狀態（載入中骨架／有內容／空的／讀不到）各自可辨，狀態訊號從出生點就分得出來。
//
// ⚠️ **看板是環境資訊、不奪焦**（design D3）：讀不到是 `role="status"`、**沒有 retry**（重試留給按 E 開出來的面板）；
// 空的沿用 `FE-X04` 的文案（`EMPTY_STATE_COPY`，不抄字串）；載入中畫骨架**不先畫空位**（先畫空會是謊，`FE-J13-S01` 同一條）。
// ⚠️ 文案是常數、失敗語彙走 `toUiError().message`（`FE-X03`），**不回顯後端字串**（`FE-N08` 同一條）。

/** 看板摘要節點的登記，鍵是看板 id（`board-project`／`board-talent`）。**身分穩定、不進 React state** —— 跟門標籤、工位錨點同一個做法。 */
export type BoardSummaryNodes = Map<string, HTMLElement>

export function useBoardNodes(): RefObject<BoardSummaryNodes> {
  return useRef<BoardSummaryNodes>(new Map())
}

/** 一塊看板要畫的東西：狀態＋已截到前 4 筆的**單一欄位文字**（標題／名字）＋失敗原因。 */
interface BoardView {
  readonly status: BoardSummaryStatus
  readonly labels: readonly string[]
  readonly error: unknown
}

export function BoardSummary({ nodesRef, enabled }: { nodesRef: RefObject<BoardSummaryNodes>; enabled: boolean }) {
  // hook 順序要穩定：兩塊看板固定各一個訂閱（`BOARD_ANCHORS` 是模組常數，長度不變）。
  const projects = useBoardSummary('projects', enabled)
  const profiles = useBoardSummary('profiles', enabled)
  const views: Record<string, BoardView> = {
    'board-project': { status: projects.status, labels: projects.items.map((p) => p.title), error: projects.error },
    'board-talent': { status: profiles.status, labels: profiles.items.map((p) => p.display_name), error: profiles.error },
  }

  return (
    <div data-testid="board-summaries" className="pointer-events-none absolute inset-0 overflow-hidden">
      {BOARD_ANCHORS.map((anchor) => (
        <div
          key={anchor.id}
          data-testid="board-summary-anchor"
          data-board-id={anchor.id}
          ref={(node) => {
            const nodes = nodesRef.current
            if (node === null) nodes.delete(anchor.id)
            else nodes.set(anchor.id, node)
          }}
          // 還沒被投影過之前先藏起來（也就不在無障礙樹裡）—— 投影器第一幀才知道它在哪、在不在畫面內。
          style={{ visibility: 'hidden', width: 0, height: 0 }}
          className="absolute top-0 left-0"
        >
          {/* 0×0 錨點的中心對齊投影點；卡片自己往中心的四周撐開（水平置中、垂直置中在板面上）。 */}
          <div className="absolute top-0 left-0 w-44 -translate-x-1/2 -translate-y-1/2">
            <BoardSummaryCard view={views[anchor.id] ?? { status: 'loading', labels: [], error: null }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 板面上的一塊摘要卡：不透明、對比高，遠處也讀得出「有東西／沒東西／讀不到／載入中」。 */
function BoardSummaryCard({ view }: { view: BoardView }) {
  const card = 'bg-surface-raised border-line text-ink shadow-panel rounded-panel border px-3 py-2'
  // 載入中：骨架卡，填住卡槽、不先畫空位（`S06`）。
  if (view.status === 'loading') {
    return (
      <div data-testid="board-summary" data-state="loading" role="status" aria-label="載入中" className={card}>
        <ul className="flex flex-col gap-1.5">
          {Array.from({ length: BOARD_SUMMARY_COUNT }, (_, i) => (
            <li key={i} className="h-4 rounded bg-line motion-safe:animate-pulse" />
          ))}
        </ul>
      </div>
    )
  }
  // 有內容：填了字的卡 ＋ 其餘空槽（`S01`）。stale 也走這裡（有舊資料就畫舊的，`S05`）。
  if (view.labels.length > 0) {
    const empties = Math.max(0, BOARD_SUMMARY_COUNT - view.labels.length)
    return (
      <div data-testid="board-summary" data-state={view.status === 'stale' ? 'stale' : 'ready'} className={card}>
        <ul className="flex flex-col gap-1.5">
          {view.labels.map((label, i) => (
            <li key={`item-${i}`} data-testid="board-summary-item" title={label} {...withClass(CAPTION, 'truncate leading-4 text-ink')}>
              {label}
            </li>
          ))}
          {Array.from({ length: empties }, (_, i) => (
            <li key={`empty-${i}`} data-testid="board-summary-slot" aria-hidden className="h-4 rounded border border-dashed border-line/60" />
          ))}
        </ul>
      </div>
    )
  }
  // 讀不到：環境化錯誤，`role="status"`、**無 retry**（`S05`）。語彙走 `FE-X03`，不回顯後端字串。
  if (view.status === 'failed') {
    return (
      <div data-testid="board-summary" data-state="failed" role="status" className={card}>
        <p {...withClass(CAPTION, 'text-ink-muted')}>{toUiError(view.error).message}</p>
      </div>
    )
  }
  // 空的：`FE-X04` 的「這裡還沒有東西。」看板版，`role="status"`（`S04`）。
  return (
    <div data-testid="board-summary" data-state="empty" role="status" className={card}>
      <p {...withClass(CAPTION, 'text-ink-muted')}>{EMPTY_STATE_COPY['first-empty']}</p>
    </div>
  )
}
