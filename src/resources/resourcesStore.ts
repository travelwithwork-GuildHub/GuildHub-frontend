import type { ProjectResourceOut } from '@/api/contract/rest'
import { getProject, listResources } from '@/api/operations'
import { toUiError, type UiError } from '@/errors/uiError'

// 一個專案的資源狀態。規格 `FE-J14`〈讀取的時機是封閉的〉、〈結案與權限失敗〉；design `D1`／`D2`。
//
// **每個 `project_id` 一份，看板與面板訂閱同一份**（D1）—— 不是每個元件自己一份：兩份會漂，
// 而且開面板就多一次請求（`S24`）。所以狀態住在 store 裡，不住在面板元件裡。
//
// **讀取的時機是封閉的**：看板掛載一次、面板每一次開啟一次（同一次掛載的**第一次**開啟跟看板共用那一次）、
// 使用者按的重試、規格指名的重讀。**這裡沒有任何計時器** —— 「關掉再開」是不輪詢時唯一能發現結案的時機（`S05`）。
//
// **403／409 之後確認一次專案狀態**（D2）：403 不只有「結案」一個意思（票過期、換身分），
// 409 也不是（另一處已新增到上限）—— 直接照字面說「已結案」會把票過期講成專案結束了。
// 確認**每一次失敗各一次**，不把 `active` 快取起來（快取的話結案永遠發現不了，那正是 Q2 要解的問題）。
//
// **晚到的回應**：每一次讀取拿一個序號，**它派生的那一次確認沿用同一個序號**（確認屬於那一次讀取）。
// 只有「序號仍是最後送出的那一個」才套用 —— 不是「比上一次套用的更新就套用」：較新的請求**還在飛**的
// 時候，舊的先回來在那種寫法下仍然會上畫面（過期清單閃一次，或確認還沒回來就先說沒有權限）。
// 尤其一個晚到的 `active` MUST NOT 把已經呈現的「已結案」改回可寫入的樣子（`S36`）。

export type ResourcesState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly items: readonly ProjectResourceOut[] }
  | { readonly phase: 'failed'; readonly error: UiError }
  /** 確認過是 `closed`。`items` 是最後一次成功讀到的 —— **要不要顯示是呼叫端的事**（owner 留著、非 owner 不顯示）。 */
  | { readonly phase: 'closed'; readonly items: readonly ProjectResourceOut[] }

const LOADING: ResourcesState = { phase: 'loading' }

interface Entry {
  state: ResourcesState
  /** 最後一次成功讀到的清單（結案之後 owner 還要看得到）。 */
  items: readonly ProjectResourceOut[]
  /** 最後一次送出的讀取的序號（它派生的確認沿用它）。 */
  seq: number
  /** 這個 store 活著的期間讀過幾次、面板開過幾次（「第一次開啟共用」要靠它）。 */
  reads: number
  opens: number
}

export function createResourcesStore() {
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }
  const entryOf = (projectId: string): Entry => {
    const found = entries.get(projectId)
    if (found !== undefined) return found
    const created: Entry = { state: LOADING, items: [], seq: 0, reads: 0, opens: 0 }
    entries.set(projectId, created)
    return created
  }
  const set = (entry: Entry, state: ResourcesState) => {
    entry.state = state
    emit()
  }

  /** D2 的那一次確認。`original` 是原本那個 403／409 —— 確認不是 `closed` 時畫面照它呈現。`mine` 是派生它的那一次讀取的序號。 */
  const confirmStatus = (projectId: string, entry: Entry, original: UiError, mine: number) => {
    void getProject(projectId).then(
      (project) => {
        if (mine !== entry.seq) return
        set(entry, project.status === 'closed' ? { phase: 'closed', items: entry.items } : { phase: 'failed', error: original })
      },
      (cause: unknown) => {
        if (mine !== entry.seq) return
        // 確認自己失敗：401「登入失效」與 404「專案不見了」比原本那個碼更接近事實；
        // 其餘（5xx、網路、契約漂移）退回原本那個 403／409 的呈現，**不猜是結案**。
        const ui = toUiError(cause)
        set(entry, { phase: 'failed', error: ui.kind === 'authentication-required' || ui.kind === 'not-found' ? ui : original })
      },
    )
  }

  const read = (projectId: string) => {
    const entry = entryOf(projectId)
    entry.reads += 1
    const mine = (entry.seq += 1)
    set(entry, LOADING)
    void listResources(projectId).then(
      (items) => {
        if (mine !== entry.seq) return
        entry.items = items
        set(entry, { phase: 'ready', items })
      },
      (cause: unknown) => {
        if (mine !== entry.seq) return
        const ui = toUiError(cause)
        if (ui.kind === 'permission-denied' || ui.kind === 'conflict') confirmStatus(projectId, entry, ui, mine)
        else set(entry, { phase: 'failed', error: ui })
      },
    )
  }

  return {
    /** 使用者按的重試、規格指名的重讀。 */
    read,
    /**
     * 新增成功：伺服器回的那一筆接在**最後**（清單固定 `created_at ASC, id ASC`），不樂觀更新（D1）。
     *
     * ⚠️ **同時把序號推進一格**：規格〈晚到的回應〉的第二句 —— 一個更早發出、還在路上的讀取
     * MUST NOT 覆蓋「在它之後成功的寫入所造成的清單變化」。推進序號就是讓那一次讀取回來時認不得自己。
     */
    created: (projectId: string, resource: ProjectResourceOut) => {
      const entry = entryOf(projectId)
      entry.seq += 1
      entry.items = [...entry.items, resource]
      set(entry, { phase: 'ready', items: entry.items })
    },
    // ⚠️ **寫入失敗的那一次確認（D2）在後半 `--edit-delete`**：403／409 不只有「結案」一個意思，
    // 要打一次 `GET /api/projects/{id}`。它跟修改、刪除共用同一條路徑，判準（`S07`／`S08`）也在那一支。
    /** 面板開啟：**第一次**開啟跟看板掛載那一次共用（不多送一次，`S24`）；之後每一次開啟都重讀（`S05`）。 */
    openRead: (projectId: string) => {
      const entry = entryOf(projectId)
      const share = entry.opens === 0 && entry.reads > 0
      entry.opens += 1
      if (!share) read(projectId)
    },
    // 沒有 entry 時回同一個常數：`useSyncExternalStore` 每次拿到新物件會無限重繪，而讀取不該建立 entry。
    getState: (projectId: string): ResourcesState => entries.get(projectId)?.state ?? LOADING,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
export type ResourcesStore = ReturnType<typeof createResourcesStore>
