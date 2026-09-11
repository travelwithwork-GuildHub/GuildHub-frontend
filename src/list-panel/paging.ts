import { PAGE_SIZE } from '@/api/contract/limits'

// 清單面板的翻頁狀態機。規格 `FE-B01`〈「還有沒有下一頁」只能靠實際取到的資料判定〉、
// 〈請求失敗 SHALL NOT 被當成翻到底〉、〈晚到的回應不得覆蓋畫面〉。
//
// ⚠️ **這裡沒有 `total`、沒有 `has_more`、沒有 `limit`。**
// 後端只收 0-based 的 `page`，每頁 `PAGE_SIZE` 筆，超過尾頁回**空陣列**。
// 所以「還有沒有下一頁」在請求它之前**資訊上無從判斷** —— 這是契約缺資訊，
// 不是前端能繞過的。下面每一條規則都是從這個缺口推出來的（`design.md` 的 `D2`）。
//
// 三態要分得開：**確定有／確定沒有／不確定**。
// 把「正好 20 筆」畫成「確定還有」，總數剛好是 20 的倍數時會給出一張空的幽靈頁；
// 把「網路失敗」畫成「已無更多」，使用者會以為自己看完了。
//
// ⚠️ **這裡只做狀態，不做文案。** 首次無資料／翻到底／錯誤三種狀態的字句
// 歸 `FE-X04` 與 `FE-X03`（兩列都標著「唯一一份」），這個檔案裡一個字都不能有。

/** 兩塊看板各自對應的資料種類。它是 request identity 的一部分（`S15`）。 */
export type ListKind = 'projects' | 'profiles'

/**
 * request identity：**非同步回應只有在其捕捉的 identity 仍等於目前有效 identity 時才能提交。**
 *
 * ⚠️ **兩個欄位都要比。** 只比 `page` 的話，人才流程會完全正常 ——
 * 只有「案件還在載入時改開人才」那一刻，案件的回應會混進人才清單（`S15`）。
 * `FE-B05`（搜尋與篩選）來的時候把 `status` 與搜尋條件加進來即可，提交規則不用動。
 */
export interface RequestIdentity {
  kind: ListKind
  page: number
}

export function sameIdentity(a: RequestIdentity, b: RequestIdentity): boolean {
  return a.kind === b.kind && a.page === b.page
}

export interface PagingState<T> {
  /** 目前有效的 identity：正在請求、或畫面上正呈現的那一頁。 */
  identity: RequestIdentity
  phase: 'loading' | 'ready' | 'error'
  /**
   * 畫面上呈現的那一頁。**前進探測期間它不變** —— 撲空要留在原頁（`S09`），
   * 所以探測中的頁次在 `identity`，已呈現的頁次在這裡，兩者刻意分開。
   * 首次載入還沒回來之前是 `null`。
   */
  shown: { page: number; items: readonly T[] } | null
  /**
   * 下一頁：`'maybe'`（不確定）或 `'none'`（確定沒有）。
   * ⚠️ **沒有 `'yes'`** —— 在這個契約下前端永遠拿不到那個確定（`S08`）。
   */
  next: 'maybe' | 'none'
  error: unknown
}

export type PagingEvent<T> =
  | { type: 'open'; kind: ListKind; page?: number }
  | { type: 'next' }
  | { type: 'retry' }
  | { type: 'resolved'; identity: RequestIdentity; items: readonly T[] }
  | { type: 'failed'; identity: RequestIdentity; error: unknown }

/** `page` 是起始頁（深連結帶進來的，`FE-B09-S03`）；沒給就從第 0 頁開始。 */
export function opened<T>(kind: ListKind, page = 0): PagingState<T> {
  return { identity: { kind, page }, phase: 'loading', shown: null, next: 'maybe', error: null }
}

export function reduce<T>(state: PagingState<T>, event: PagingEvent<T>): PagingState<T> {
  switch (event.type) {
    case 'open':
      return opened(event.kind, event.page)

    case 'next':
      // 沒有已呈現的頁就沒有東西可以「前進」；確定沒有下一頁就不再請求（`S07`）；
      // 錯誤狀態要先重試同一頁（`S11`），不能拿失敗的那一頁當跳板。
      //
      // ⚠️ **探測期間再按一次是 no-op，一次只探測一頁。**
      // 允許的話，手滑連點會從第 0 頁跳到第 2 頁 —— 而這一列**沒有「上一頁」**
      //（`design.md` 待答問題 3），跳過的那一頁只能關掉面板重開才回得去。
      // 它也會讓「第 2 頁撲空」變成一個第 1 頁沒人答過的狀態，要多一條「退一步再問」。
      // 兩個外部審查者第三輪在這個事實上收斂到同一邊。
      if (state.shown === null || state.next === 'none' || state.phase !== 'ready') return state
      return {
        ...state,
        identity: { ...state.identity, page: state.identity.page + 1 },
        phase: 'loading',
        error: null,
      }

    case 'retry':
      if (state.phase !== 'error') return state
      return { ...state, phase: 'loading', error: null }

    case 'resolved': {
      if (!sameIdentity(event.identity, state.identity)) return state
      const { items } = event
      // 起始頁就撲空（深連結帶的頁碼已經不存在，`FE-B09-S04`）：退回第 0 頁再問一次。
      // 沒有「原頁」可以留 —— 下面 `S09` 的規則是給「從滿頁前進」用的（前提是 `shown !== null`）。
      // 畫成「首次無資料」的話，使用者會以為整個系統沒資料或連結壞了。
      if (items.length === 0 && state.shown === null && state.identity.page > 0) {
        return { ...state, identity: { ...state.identity, page: 0 }, phase: 'loading', error: null }
      }
      if (items.length > 0 || state.shown === null) {
        // 不滿一頁就是到底（`S07`）；正好一頁只代表**可能**還有（`S08`）。
        // 首次就是空陣列也走這裡：`shown` 成為一張空頁，那是「首次無資料」。
        return {
          ...state,
          phase: 'ready',
          shown: { page: event.identity.page, items },
          next: items.length < PAGE_SIZE ? 'none' : 'maybe',
          error: null,
        }
      }
      // 前進之後撲空（`S09`）：留在原頁，並記下「確定沒有下一頁」。
      // identity 也退回畫面上那一頁 —— 一次只探測一頁，所以退回的一定是 `shown.page`。
      return { ...state, phase: 'ready', identity: { ...state.identity, page: state.shown.page }, next: 'none' }
    }

    case 'failed':
      if (!sameIdentity(event.identity, state.identity)) return state
      // 失敗不是到底（`S10`）：`next` 與 `shown` 都不動，identity 留在失敗的那一頁，
      // 重試才會請求同一頁（`S11`）。
      return { ...state, phase: 'error', error: event.error }
  }
}

/**
 * 三種要交給呼叫端節點呈現的狀態（`S12`）。
 * 這裡回的是**哪一種**，不是要顯示什麼 —— 文案在 `FE-X04`／`FE-X03`。
 */
export function edgeState<T>(state: PagingState<T>): 'first-empty' | 'exhausted' | 'error' | null {
  if (state.phase === 'error') return 'error'
  if (state.phase !== 'ready' || state.shown === null) return null
  if (state.shown.items.length === 0) return 'first-empty'
  return state.next === 'none' ? 'exhausted' : null
}
