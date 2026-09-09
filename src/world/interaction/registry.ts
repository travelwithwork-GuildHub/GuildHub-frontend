import type { InteractableEntry } from './target'

// 可互動物件的註冊表。規格 `FE-W06`。
//
// ⚠️ **這個 Map 建立一次就不再換掉，而且不進 React state。**
// 跟 `RemoteWorld` 的 `state.motion` 同一個做法：它會被 render loop 每幀讀，
// 而它的身分穩定，所以當 prop 傳下去不造成重繪。

/** 註冊進來的物件。比 `InteractableEntry` 多一個觸發用的 callback。 */
export interface RegisteredInteractable extends InteractableEntry {
  /** 按下 `E` 時呼叫。沒有的話那個物件只顯示提示，按下去什麼都不做。 */
  onInteract?: () => void
}

export interface InteractableRegistry {
  /** 目前註冊著的物件。**就地改寫，身分穩定。** */
  readonly entries: Map<string, RegisteredInteractable>
  register(entry: RegisteredInteractable): void
  unregister(id: string): void
}

export function createInteractableRegistry(): InteractableRegistry {
  const entries = new Map<string, RegisteredInteractable>()

  return {
    entries,
    register(entry) {
      // ⚠️ **id 重複要明顯失敗，不能靜默覆蓋**（規格 `FE-W06-S16`）。
      //
      // 覆蓋掉的症狀是「有時候按 E 沒反應」：兩個物件共用一個 id 時，
      // 提示指著其中一個、`onInteract` 卻是另一個的，而畫面上看不出原因。
      // 更糟的是卸載 —— 先卸載的那一個會把後者的登記一起帶走。
      const existing = entries.get(entry.id)
      if (existing !== undefined) {
        throw new Error(
          `可互動物件的 id 重複：「${entry.id}」（既有的是「${existing.label}」，` +
            `新的是「${entry.label}」）。id 是穩定鍵 —— 兩個物件用同一個的話，` +
            `提示指著誰、按 E 觸發誰會變成不確定。`,
        )
      }
      entries.set(entry.id, entry)
    },
    unregister(id) {
      entries.delete(id)
    },
  }
}
