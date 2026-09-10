// 「首次進入走完了沒有」。規格 `FE-A06-S06`。
//
// ⚠️⚠️ **這跟「引導層被關掉了沒有」是兩件事，而混在一起是這一項最容易犯的錯。**
//
// 封存前審查時 codex 特別指出這一點，逐字：
//
//   > 關閉 `/world` 引導層**不應被記成「已完成首次進入」**，下次仍可再提示。
//
// 混在一起的症狀是：一個**手滑點掉引導層**的人再也不會被提示 ——
// 而那正好摧毀這一整項存在的理由（讓每個人在世界裡有名字）。
//
// 所以這裡只記「真的走完了」。關掉引導層是那個元件自己的、
// **只活在這次繪製裡**的狀態，不落地。

const KEY = 'guildhub.first-entry-done'

/** 讀不到就是「沒走完」—— 對呼叫端來說跟「沒存過」一樣，而那正確。 */
export function firstEntryDone(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markFirstEntryDone(): void {
  try {
    globalThis.localStorage?.setItem(KEY, '1')
  } catch {
    // 存不進去不是致命的 —— 這次的身分已經建好了，
    // 失去的只是「下次不再被提示」。**不要因此讓流程失敗。**
  }
}
