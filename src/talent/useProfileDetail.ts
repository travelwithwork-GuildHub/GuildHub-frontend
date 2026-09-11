import { useCallback, useEffect, useState } from 'react'
import type { ProfileOut } from '@/api/contract/rest'
import { getProfile } from '@/api/operations'

// 詳情的載入。規格 `FE-B04`〈詳情在同一個面板裡，內容一律來自 `GET /api/profiles/{id}`〉。
//
// identity 是 `id`，紀律跟 `FE-B01` 的翻頁狀態機一樣：回應只在捕捉的 `id` 仍等於目前的 `id`
// 時提交（`S09`）；`id` 改變時中止前一個請求；被中止的 rejection 不進狀態。
// **不重用 `paging.ts`** —— 那是翻頁的狀態機，硬套會多出一堆用不到的欄位。
//
// ⚠️ **畫面上的載入中／失敗標記看 `phase`，不看 `profile` 有沒有值。**
// `loading` 與 `error` 時 `profile` 是列表那一筆（預覽），`ready` 時才是回應 ——
// 這就是「預覽不得冒充成功」的實作形狀（`S07`／`S08`）。

export interface ProfileDetail {
  phase: 'loading' | 'ready' | 'error'
  /** `loading`／`error`：預覽（列表那一筆，可能沒有）；`ready`：`GET /api/profiles/{id}` 的回應。 */
  profile: ProfileOut | undefined
  error: unknown
  /** 重試同一個 `id`。 */
  retry: () => void
}

interface State {
  id: string
  phase: ProfileDetail['phase']
  fetched: ProfileOut | undefined
  error: unknown
  /** 重試時 +1，讓效果在 `id` 不變時也重跑。 */
  attempt: number
}

export function useProfileDetail(id: string, preview: ProfileOut | undefined): ProfileDetail {
  const [state, setState] = useState<State>({ id, phase: 'loading', fetched: undefined, error: null, attempt: 0 })

  // `id` 換了：整個重來，**在繪製期間**就換（React 的「記住上一次繪製的資訊」模式），
  // 不等 effect —— 換 `id` 的那一格才不會把舊人的資料交給畫面（`useListPage` 換種類踩過的坑）。
  // 舊 `id` 的回應之後靠 identity 擋掉（`S09`）。
  if (state.id !== id) {
    setState({ id, phase: 'loading', fetched: undefined, error: null, attempt: 0 })
  }

  const { phase, attempt } = state
  const stateId = state.id
  useEffect(() => {
    if (phase !== 'loading' || stateId !== id) return
    const controller = new AbortController()
    const captured = id
    void getProfile(captured, { signal: controller.signal }).then(
      (profile) =>
        setState((s) => (s.id === captured ? { ...s, phase: 'ready', fetched: profile, error: null } : s)),
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

  if (state.id !== id) return { phase: 'loading', profile: preview, error: null, retry }
  return {
    phase: state.phase,
    profile: state.phase === 'ready' ? state.fetched : preview,
    error: state.error,
    retry,
  }
}
