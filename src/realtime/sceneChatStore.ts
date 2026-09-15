import type { ChatIn, ChatOut } from '@/api/contract/ws'
import { EMPTY_CHAT, appendChat, type ChatLog } from './sceneChat'

// 場景聊天的傳輸口與記憶體的持有者。規格 `FE-R11`〈chat 只收驗證過的伺服器訊息…；送出只走注入的窄介面〉、
// 〈自己的話只在伺服器回聲後出現一次〉、〈committed 的場景換了才清空；同場景重連不清；不是目前連線的訊息不收〉（design D1、D2、D4）。
//
// ⚠️ **這裡不知道 `RealtimeClient` 的存在**（import 邊界，ADR 0009）：連線由 `RemoteWorld` 持有，它每建一條連線就 `attach()` 一次，
// 拿到**這條連線專屬的** `receive`（連線身分綁在閉包裡：舊連線晚到的訊息不是目前那條的，不收）；送出是 `RemoteWorld` 注入的、**只收 `ChatIn`** 的 sender
// （序列化與 `client.send()` 都在 `RemoteWorld` 那邊：沒 `ready` 就拋 `RealtimeError`，這裡不吞、不排隊、不補送）。chat 模組不碰 raw frame 的任何一端。
// 送出**不** append：後端廣播含自己，回聲是唯一的顯示來源；`receive` 也不因 `id === 自己` 略過。
//
// **訊息按連線的場景歸檔，看得見的是 committed 場景那一份**：`commit(wsScene)` 由 `SceneChatProvider` 在 committed 改變時呼叫。
// 為什麼不是「committed 變了就 clear」：新場景的第一則 chat 可能跟 `hello` 在同一個 task 裡到（React 還沒 render 成 committed），
// 那時 clear 會把它一起清掉（審查抓到的排程縫；換 layout effect 也補不上 —— 訊息在 render 之前就到了）。
// 按場景歸檔之後：不是 committed 場景的訊息先放在 `pending`，commit 那一刻接手；那條連線關了（detach）它的 pending 就丟（失敗退回的房間，之後再進不能看到舊的）。

export interface ChatLink {
  /** 這條連線收到的、通過驗證的 `ChatOut`。**只收驗證器產出的物件**，不是字串。 */
  readonly receive: (message: ChatOut) => void
  /** 連線關了（`RemoteWorld` 的 cleanup）。之後 `receive` 什麼都不做。 */
  readonly detach: () => void
}

export interface SceneChatPort {
  /**
   * `RemoteWorld` 每建一條連線呼叫一次；`send` 是那條連線的、只收 `ChatIn` 的 sender（`RemoteWorld` 包好 `client.send(JSON.stringify(input))`）；
   * `wsScene` 是那條連線連的場景（訊息按它歸檔）。
   */
  readonly attach: (send: (input: ChatIn) => void, wsScene: string) => ChatLink
}

export interface SceneChatStore {
  readonly port: SceneChatPort
  /** committed 場景的訊息（同一個 reference 直到內容變）。 */
  readonly getLog: () => ChatLog
  readonly subscribe: (listener: () => void) => () => void
  /** 組成 `ChatIn` 交給目前連線；沒有連線或連線沒 `ready` 就拋（不靜默）。**不 append。** */
  readonly send: (input: ChatIn) => void
  /** committed 的場景換成 `wsScene`：舊場景的訊息丟掉、那個場景已經收到的接手。同一個場景再 commit 是 no-op。 */
  readonly commit: (wsScene: string) => void
}

export function createSceneChatStore(initialScene = 'lobby'): SceneChatStore {
  let committed = initialScene
  let log: ChatLog = EMPTY_CHAT
  // 跨場景單調遞增：換場景後新列表的 key 不會跟舊列表撞（撞了 React 會把舊節點改字、live region 重念）。
  let seq = 0
  const pending = new Map<string, ChatLog>()
  let current: { link: ChatLink; send: (input: ChatIn) => void; scene: string } | null = null
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const l of listeners) l()
  }
  const attach: SceneChatPort['attach'] = (send, wsScene) => {
    const link: ChatLink = {
      receive: (message) => {
        // 不是目前這條連線的訊息不收（`FE-R11-S08`）：比的是 link 的身分，不是 socket 有沒有關。
        if (current?.link !== link) return
        const next = seq
        seq += 1
        if (wsScene === committed) {
          log = appendChat(log, message, next)
          notify()
        } else {
          pending.set(wsScene, appendChat(pending.get(wsScene) ?? EMPTY_CHAT, message, next))
        }
      },
      detach: () => {
        if (current?.link !== link) return
        current = null
        // 這條連線的場景還沒 committed 就關了（過場失敗退回）：它收到的不算數。
        if (wsScene !== committed) pending.delete(wsScene)
      },
    }
    current = { link, send, scene: wsScene }
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
      current.send(input)
    },
    commit: (wsScene) => {
      if (wsScene === committed) return
      committed = wsScene
      log = pending.get(wsScene) ?? EMPTY_CHAT
      pending.clear()
      notify()
    },
  }
}
