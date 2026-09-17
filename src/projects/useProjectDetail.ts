import { useCallback, useEffect, useState } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { getProject } from '@/api/operations'

// 案件詳情的載入。規格 `FE-B03`〈詳情在同一個面板裡，案子本體一律來自 `GET /api/projects/{id}`〉。
//
// 跟 `useProfileDetail` 是同一套紀律（identity = `id`、換 `id` 在繪製期間重來、effect 清理中止前一個、被中止的不進狀態、
// `phase` 決定畫面），**刻意複製一份而不是抽泛型**（design D1：第三個消費者出現再抽）。改這裡的規則時去看那一份有沒有同一個洞。
//
// ⚠️ **畫面上的載入中／失敗標記看 `phase`，不看 `project` 有沒有值。** `loading`／`error` 時 `project` 是列表那一筆（預覽）。

export interface ProjectDetail {
  phase: 'loading' | 'ready' | 'error'
  /** `loading`／`error`：預覽（列表那一筆，可能沒有）；`ready`：`GET /api/projects/{id}` 的回應。 */
  project: ProjectOut | undefined
  error: unknown
  /** 回應到達的時刻（epoch ms）：「剩幾天」的時鐘，跟資料同一次取回（`FE-B02` design D2 同一個理由）。`ready` 之前是 `null`。 */
  fetchedAt: number | null
  /** 重試同一個 `id`。 */
  retry: () => void
}

interface State {
  id: string
  phase: ProjectDetail['phase']
  fetched: ProjectOut | undefined
  fetchedAt: number | null
  error: unknown
  attempt: number
}

const fresh = (id: string): State => ({ id, phase: 'loading', fetched: undefined, fetchedAt: null, error: null, attempt: 0 })

export function useProjectDetail(id: string, preview: ProjectOut | undefined): ProjectDetail {
  const [state, setState] = useState<State>(() => fresh(id))

  // `id` 換了：整個重來，**在繪製期間**就換 —— 換 `id` 的那一格才不會把舊案子的資料交給畫面。
  // 舊 `id` 的回應有兩道防線：effect 清理時**中止**它；沒中止到的靠 `s.id === captured` 擋。
  if (state.id !== id) setState(fresh(id))

  const { phase, attempt } = state
  const stateId = state.id
  useEffect(() => {
    if (phase !== 'loading' || stateId !== id) return
    const controller = new AbortController()
    const captured = id
    void getProject(captured, { signal: controller.signal }).then(
      (project) => {
        if (controller.signal.aborted) return
        // 時鐘在這裡讀（回呼），不在 render 裡
        const at = Date.now()
        setState((s) => (s.id === captured ? { ...s, phase: 'ready', fetched: project, fetchedAt: at, error: null } : s))
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState((s) => (s.id === captured ? { ...s, phase: 'error', error } : s))
      },
    )
    return () => controller.abort()
  }, [id, phase, attempt, stateId])

  const retry = useCallback(() => {
    setState((s) => (s.phase === 'error' ? { ...s, phase: 'loading', error: null, attempt: s.attempt + 1 } : s))
  }, [])

  // 繪製期間 setState 之後這一次的函式還是會跑完：不遮住的話會回傳「新 id 配舊案子」（`useProfileDetail` 同一個坑）。
  if (state.id !== id) return { phase: 'loading', project: preview, error: null, fetchedAt: null, retry }
  return {
    phase: state.phase,
    project: state.phase === 'ready' ? state.fetched : preview,
    error: state.error,
    fetchedAt: state.fetchedAt,
    retry,
  }
}
