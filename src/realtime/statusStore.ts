import { LIMITS } from '@/api/contract/limits'
import type { StatusIn } from '@/api/contract/ws'

// 自己的狀態文字：送出的口與「目前狀態」的持有者。規格 `FE-K05`〈設定狀態〉〈換場景、重連之後自己的狀態要再送一次〉（design D1、D2、D4）。
//
// ⚠️ **這裡不知道 `RealtimeClient` 的存在**（import 邊界，跟 `sceneChatStore` 同一條）：`RemoteWorld` 在每條連線 **ready 之後** `attach()` 一次、
// 卸載時 `detach()`；送出是它注入的、只收 `StatusIn` 的 sender。attach 發生在 ready 之後是重送能成立的前提（沒 ready 就送會拋）。
//
// **目前狀態以伺服器回聲為準**（D2）：`set()` 只把文字記成 `pending`，`RemoteWorld` 把 `id === 自己` 的 `status` 交給 `link.confirm()` 才變成 `text`。
// 後端對超長是**靜默丟棄**（`app/main.py`：`ValueError` → `continue`），所以這裡先擋在 `LIMITS.statusText.max`（`String.length`，跟 zod 同一把尺、比後端嚴）。
//
// **重送**（S04）：伺服器每次 `join` 把 `st` 清成空 —— 新連線 attach 時把最新的意圖（`pending ?? text`）非空就再送一次；空的不送。
// 重送已確認的 text 不算 pending（text 沒變）；重送 pending 的那句仍是 pending，回聲到了才算。

export type SetStatusResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'too-long' | 'offline' }

export interface StatusSnapshot {
  /** 伺服器已確認的目前狀態；`''` ＝ 沒有狀態。 */
  readonly text: string
  /** 送出了、還沒等到回聲的那一句；null ＝ 沒有在送。 */
  readonly pending: string | null
  /** 有一條 ready 的連線可以送。 */
  readonly online: boolean
}

export interface StatusLink {
  /** 這條連線上收到自己的 `status` 回聲。不是目前連線的忽略。 */
  readonly confirm: (text: string) => void
  /** 連線關了。之後 `confirm` 什麼都不做；`set()` 變成 offline。 */
  readonly detach: () => void
}

export interface StatusPort {
  /** `RemoteWorld` 每條連線 **ready 之後**呼叫一次；`send` 只收 `StatusIn`。已確認的狀態非空就立刻重送一次。 */
  readonly attach: (send: (input: StatusIn) => void) => StatusLink
}

export interface StatusStore {
  readonly port: StatusPort
  readonly getSnapshot: () => StatusSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /** 設定狀態：超過上限回 `too-long`、沒連線回 `offline`（都不拋、不送）；成功就送一則、記成 pending。 */
  readonly set: (text: string) => SetStatusResult
  /** 清除＝送空字串。 */
  readonly clear: () => SetStatusResult
}

const MAX = LIMITS.statusText.max

export function createStatusStore(): StatusStore {
  let snapshot: StatusSnapshot = { text: '', pending: null, online: false }
  let current: { link: StatusLink; send: (input: StatusIn) => void } | null = null
  const listeners = new Set<() => void>()
  const update = (patch: Partial<StatusSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const l of listeners) l()
  }
  const set = (text: string): SetStatusResult => {
    if (text.length > MAX) return { ok: false, reason: 'too-long' }
    if (current === null) return { ok: false, reason: 'offline' }
    // 拋就拋出去（`client.send()` 沒 ready 會拋 `RealtimeError`）：attach 在 ready 之後，這裡不該發生
    current.send({ t: 'status', text })
    update({ pending: text })
    return { ok: true }
  }
  const attach: StatusPort['attach'] = (send) => {
    const link: StatusLink = {
      confirm: (text) => {
        if (current?.link !== link) return
        update({ text, pending: snapshot.pending === text ? null : snapshot.pending })
      },
      detach: () => {
        if (current?.link !== link) return
        current = null
        update({ online: false })
      },
    }
    current = { link, send }
    // 帶到新連線的是**最新的意圖**：還沒回聲的 pending 優先於已確認的 text（狀態跟著人走，不是跟著那條連線）。
    // 只送 text 的話，A 已確認、B 還在送出中就換場景 → 新連線重送 A、B 永遠「送出中」（archive-review 抓到的）。
    const intent = snapshot.pending ?? snapshot.text
    if (intent !== '') {
      try {
        send({ t: 'status', text: intent })
      } catch {
        // 連線其實還沒 ready（不該發生，attach 在 ready 之後）：狀態留著，下一條連線再試
      }
    } else if (snapshot.pending !== null) {
      // 意圖是「清除」而回聲沒到就換了連線：伺服器 join 已把狀態清空，清除等於生效 —— 留著 pending 會永遠「送出中」
      update({ text: '', pending: null })
    }
    update({ online: true })
    return link
  }
  return {
    port: { attach },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set,
    clear: () => set(''),
  }
}
