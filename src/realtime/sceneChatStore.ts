import type { ChatIn, ChatOut } from '@/api/contract/ws'
import { EMPTY_CHAT, appendChat, type ChatLog } from './sceneChat'

// 場景聊天的傳輸口與記憶體的持有者。規格 `FE-R11`〈chat 只收驗證過的伺服器訊息…；送出只走注入的窄介面〉、
// 〈自己的話只在伺服器回聲後出現一次〉（design D1、D2）。
//
// ⚠️ **這裡不知道 `RealtimeClient` 的存在**（import 邊界，ADR 0009）：連線由 `RemoteWorld` 持有，它每建一條連線就 `attach()` 一次，
// 拿到**這條連線專屬的** `receive`（連線身分綁在閉包裡：舊連線晚到的訊息不是目前那條的，不收）；送出是 `RemoteWorld` 注入的 `sendRaw`
// （底下是 `client.send()`：沒 `ready` 就拋 `RealtimeError`，這裡不吞、不排隊、不補送）。
// 送出**不** append：後端廣播含自己，回聲是唯一的顯示來源；`receive` 也不因 `id === 自己` 略過。
// 清空（`clear()`）的時機由 `SceneChatProvider` 看 committed 的場景決定（`--scene-generation` 那一片），這裡只提供動作。

export interface ChatLink {
  /** 這條連線收到的、通過驗證的 `ChatOut`。**只收驗證器產出的物件**，不是字串。 */
  readonly receive: (message: ChatOut) => void
  /** 連線關了（`RemoteWorld` 的 cleanup）。之後 `receive` 什麼都不做。 */
  readonly detach: () => void
}

export interface SceneChatPort {
  /** `RemoteWorld` 每建一條連線呼叫一次；`sendRaw` 是那條連線的 `client.send`。 */
  readonly attach: (sendRaw: (data: string) => void) => ChatLink
}

export interface SceneChatStore {
  readonly port: SceneChatPort
  readonly getLog: () => ChatLog
  readonly subscribe: (listener: () => void) => () => void
  /** 組成 `ChatIn` 交給目前連線；沒有連線或連線沒 `ready` 就拋（不靜默）。**不 append。** */
  readonly send: (input: ChatIn) => void
  readonly clear: () => void
}

export function createSceneChatStore(): SceneChatStore {
  let log: ChatLog = EMPTY_CHAT
  let current: { link: ChatLink; sendRaw: (data: string) => void } | null = null
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const l of listeners) l()
  }
  const attach: SceneChatPort['attach'] = (sendRaw) => {
    const link: ChatLink = {
      receive: (message) => {
        // 不是目前這條連線的訊息不收（`FE-R11-S08`）：比的是 link 的身分，不是 socket 有沒有關。
        if (current?.link !== link) return
        log = appendChat(log, message)
        notify()
      },
      detach: () => {
        if (current?.link === link) current = null
      },
    }
    current = { link, sendRaw }
    return link
  }
  return {
    port: { attach },
    getLog: () => log,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: (input) => {
      if (current === null) throw new Error('沒有即時連線，聊天訊息送不出去。')
      // 拋就拋出去：`client.send()` 沒 ready 會拋 `RealtimeError`；socket 自己拋也原樣往上。這裡不 catch。
      current.sendRaw(JSON.stringify(input))
    },
    clear: () => {
      if (log === EMPTY_CHAT) return
      log = EMPTY_CHAT
      notify()
    },
  }
}
