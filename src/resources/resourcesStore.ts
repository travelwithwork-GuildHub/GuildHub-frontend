import type { ProjectResourceOut } from '@/api/contract/rest'
import type { UiError } from '@/errors/uiError'

// 一個專案的資源狀態。規格 `FE-J14`〈讀取的時機是封閉的〉、〈結案與權限失敗〉；design `D1`／`D2`。
// ⚠️ 骨架：型別與介面先到位，讓下一個 commit 的判準紅在**行為**上，不是 `Cannot find module`。

export type ResourcesState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly items: readonly ProjectResourceOut[] }
  | { readonly phase: 'failed'; readonly error: UiError }
  | { readonly phase: 'closed'; readonly items: readonly ProjectResourceOut[] }

const LOADING: ResourcesState = { phase: 'loading' }

export function createResourcesStore() {
  return {
    read: (_projectId: string) => {},
    openRead: (_projectId: string) => {},
    getState: (_projectId: string): ResourcesState => LOADING,
    subscribe: (_listener: () => void) => () => {},
  }
}
export type ResourcesStore = ReturnType<typeof createResourcesStore>
