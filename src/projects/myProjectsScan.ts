import type { ProjectOut, ProjectStatus } from '@/api/contract/rest'
import { PAGE_SIZE } from '@/api/contract/limits'

// 「我的案件」的掃描規則（純函式）。規格 `FE-J03`〈我的案件由三種狀態逐頁掃描、以 `owner_id` 過濾；掃描有上限，畫面誠實標明〉。
//
// 後端沒有 owner 篩選、沒有總數、一次只回一種 `status`（`FE-O08` 量過），所以「我的」只能三種狀態各自翻頁再過濾。
// 上限 5 頁（100 筆）是 demo 的量：到了上限不是「沒有了」，是「沒看完」—— 兩個字要分開，畫面各自標明（`capped`）。

export const MY_PROJECT_STATUSES: readonly ProjectStatus[] = ['recruiting', 'active', 'closed']
/** 每種狀態最多看幾頁。 */
export const MY_PROJECTS_MAX_PAGES = 5

/** 這一頁回了 `count` 筆之後，下一步是什麼：不滿一頁 → 到底（`done`）；滿一頁 → 下一頁；已經是最後一頁還滿 → 到上限（`capped`）。 */
export function nextPage(count: number, page: number): number | 'done' | 'capped' {
  if (count < PAGE_SIZE) return 'done'
  return page + 1 >= MY_PROJECTS_MAX_PAGES ? 'capped' : page + 1
}

export interface MineScan {
  /** 只有 `owner_id === me` 的，依 `updated_at` 由新到舊。 */
  readonly items: readonly ProjectOut[]
  /** 三種狀態載到的總數（不是我的數）—— 畫面上「看過幾個案子」。 */
  readonly seen: number
  /** 到了上限的狀態（各自「只看了前 100 個」）。 */
  readonly capped: readonly ProjectStatus[]
}

/** 三種狀態的頁 → 我的清單。`updated_at` 是 ISO 字串，直接比字典序會被時區格式騙，所以先轉毫秒。 */
export function mergeMine(pages: Record<ProjectStatus, readonly (readonly ProjectOut[])[]>, me: string, capped: readonly ProjectStatus[]): MineScan {
  const all = MY_PROJECT_STATUSES.flatMap((status) => pages[status].flat())
  const items = all.filter((p) => p.owner_id === me).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  return { items, seen: all.length, capped: MY_PROJECT_STATUSES.filter((s) => capped.includes(s)) }
}
