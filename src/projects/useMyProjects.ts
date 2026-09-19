'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ProjectOut, ProjectStatus } from '@/api/contract/rest'
import { listProjects } from '@/api/operations'
import { MY_PROJECT_STATUSES, mergeMine, nextPage, type MineScan } from './myProjectsScan'

// 「我的案件」的掃描（design D3）：三種狀態各一條序列、並行、上限在 `myProjectsScan`；作廢靠 generation ＋ abort。
//
// 任一請求失敗整個 `failed`（不把兩種狀態的結果當成完整的「我的」—— `S03`）；401 也走 `failed`，畫面由 `EmptyState` 的 `failureKind` 分成權限阻擋。
// `active=false`（切回招募中）就中止、什麼都不套用；再變 `true` 是一次全新的掃描（`S05`）。
// `patch(next)`：詳情裡成軍／結案回來就地更新那一筆，不重掃（`S04`；design D4）。

export type MyProjectsState =
  | { readonly phase: 'loading' }
  | ({ readonly phase: 'ready'; readonly fetchedAt: number } & MineScan)
  | { readonly phase: 'failed'; readonly cause: unknown }

export interface MyProjectsApi {
  readonly state: MyProjectsState
  readonly retry: () => void
  readonly patch: (next: ProjectOut) => void
}

const LOADING: MyProjectsState = { phase: 'loading' }
/** 一次掃描的識別：誰、開不開、第幾次重掃。結果帶著它，對不上的就是舊掃描（跟 abort 是兩道防線）；也讓「新掃描開始＝載入中」是推導的，不用在 effect 裡 setState。 */
const keyOf = (me: string, active: boolean, generation: number) => `${me}:${active ? 1 : 0}:${generation}`

/** 一種狀態從第 0 頁翻到底或上限；回每一頁與有沒有到上限。 */
async function scanStatus(status: ProjectStatus, signal: AbortSignal): Promise<{ pages: ProjectOut[][]; capped: boolean }> {
  const pages: ProjectOut[][] = []
  let page: number | 'done' | 'capped' = 0
  while (typeof page === 'number') {
    const items = await listProjects({ status, page, signal })
    pages.push(items)
    page = nextPage(items.length, page)
  }
  return { pages, capped: page === 'capped' }
}

export function useMyProjects({ me, active }: { me: string; active: boolean }): MyProjectsApi {
  const [result, setResult] = useState<{ key: string; state: MyProjectsState } | null>(null)
  const [generation, setGeneration] = useState(0)
  const key = keyOf(me, active, generation)
  const state = result !== null && result.key === key ? result.state : LOADING

  useEffect(() => {
    if (!active) return
    const key = keyOf(me, active, generation)
    const controller = new AbortController()
    void Promise.all(MY_PROJECT_STATUSES.map((status) => scanStatus(status, controller.signal))).then(
      (results) => {
        // 被中止的掃描（切走、重掃）不套用 —— 這裡是同一個 effect 的 closure，看自己的 controller 就夠
        if (controller.signal.aborted) return
        const pages = Object.fromEntries(MY_PROJECT_STATUSES.map((s, i) => [s, results[i]!.pages])) as Record<ProjectStatus, ProjectOut[][]>
        const capped = MY_PROJECT_STATUSES.filter((_, i) => results[i]!.capped)
        setResult({ key, state: { phase: 'ready', fetchedAt: Date.now(), ...mergeMine(pages, me, capped) } })
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key, state: { phase: 'failed', cause } })
        // 一種失敗整個失敗：另外兩條還在飛的也停掉（重試會整個重掃）
        controller.abort()
      },
    )
    return () => controller.abort()
  }, [me, active, generation])

  const retry = useCallback(() => setGeneration((g) => g + 1), [])
  const patch = useCallback((next: ProjectOut) => {
    setResult((r) => (r !== null && r.state.phase === 'ready' ? { key: r.key, state: { ...r.state, items: r.state.items.map((p) => (p.id === next.id ? next : p)) } } : r))
  }, [])
  return { state, retry, patch }
}
