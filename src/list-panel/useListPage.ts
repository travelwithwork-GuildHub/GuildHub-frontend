import { useCallback, useEffect, useReducer } from 'react'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { listProfiles, listProjects } from '@/api/operations'
import { opened, reduce, type ListKind, type PagingState } from './paging'

// 翻頁狀態機的驅動層：identity 變了就請求、回來了就交給 `reduce` 判斷能不能提交。
// 規格 `FE-B01`〈翻頁只用契約真正提供的參數〉、〈晚到的回應不得覆蓋畫面〉。
//
// ⚠️ **這裡沒有 `fetch`。** 資料存取走 `src/api/`（`CLAUDE.md`）。

export interface ListItemOf {
  projects: ProjectOut
  profiles: ProfileOut
}

/** 資料種類 → 對應的 operation。**只在這一處對應**，容器不知道端點是誰。 */
const FETCH: { [K in ListKind]: (page: number, signal: AbortSignal) => Promise<ListItemOf[K][]> } = {
  projects: (page, signal) => listProjects({ page, signal }),
  profiles: (page, signal) => listProfiles({ page, signal }),
}

export interface ListPage<K extends ListKind> {
  state: PagingState<ListItemOf[K]>
  next: () => void
  retry: () => void
}

export function useListPage<K extends ListKind>(kind: K): ListPage<K> {
  const [state, dispatch] = useReducer(reduce<ListItemOf[K]>, kind, opened<ListItemOf[K]>)

  // 呼叫端換了資料種類：整個重來，舊種類的回應之後靠 identity 擋掉（`S15`）。
  useEffect(() => {
    dispatch({ type: 'open', kind })
  }, [kind])

  const { phase } = state
  const { kind: activeKind, page } = state.identity
  useEffect(() => {
    if (phase !== 'loading') return
    // ⚠️ **捕捉此刻的 identity。** 回應到達時 `state.identity` 可能已經是別的東西，
    // 而「能不能提交」要用**發出請求時**的那一個去比。
    const identity = { kind: activeKind, page }
    const controller = new AbortController()
    void FETCH[activeKind](page, controller.signal).then(
      (items) => dispatch({ type: 'resolved', identity, items: items as ListItemOf[K][] }),
      (error: unknown) => {
        // 被自己中止的請求不是失敗。identity 變了的那種，reducer 會擋；
        // **identity 沒變、效果卻被重跑的那種擋不住** —— React StrictMode 在開發模式
        // 會掛載兩次，第一次的中止帶著仍然有效的 identity，不擋就是一個開發時才有的錯誤畫面。
        if (controller.signal.aborted) return
        dispatch({ type: 'failed', identity, error })
      },
    )
    return () => controller.abort()
    // ⚠️ `phase` 一定要在相依裡：重試不會改 identity，只會把 `error` 變回 `loading`。
    // 少了它，「重試」按下去什麼都不會發生（`S11`）。
    // 相依用兩個純量而不是 identity 物件：`open` 會造出內容相同的新物件，
    // 用物件的話掛載時會中止第一個請求再送一次一模一樣的。
  }, [activeKind, page, phase])

  const next = useCallback(() => dispatch({ type: 'next' }), [])
  const retry = useCallback(() => dispatch({ type: 'retry' }), [])
  return { state, next, retry }
}
