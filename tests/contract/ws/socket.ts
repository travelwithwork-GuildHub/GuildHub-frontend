import WebSocket from 'ws'
import { ServerMessage, type ServerMessage as ServerMessageT } from '@/api/contract/ws'

// WS 契約測試的小工具：連上、收訊息（每一則都用契約的 schema 解析）、等一段時間、關掉。

export interface Socket {
  ws: WebSocket
  /** 到目前為止收到的、已解析的訊息（順序）。 */
  received: ServerMessageT[]
  /** 收到的原始字串（形狀對不上契約時要看它）。 */
  raw: string[]
  send: (message: unknown) => void
  sendRaw: (text: string) => void
  waitFor: (predicate: (m: ServerMessageT) => boolean, ms: number) => Promise<ServerMessageT>
  settle: (ms: number) => Promise<void>
  close: () => Promise<void>
}

/** 連上；`open` 才回，握手被拒就 reject（帶 error）。 */
export function connect(url: string, headers: Record<string, string> = {}): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers })
    const received: ServerMessageT[] = []
    const raw: string[] = []
    const waiters: Array<{ predicate: (m: ServerMessageT) => boolean; resolve: (m: ServerMessageT) => void }> = []
    ws.on('message', (data) => {
      const text = data.toString()
      raw.push(text)
      const parsed = ServerMessage.parse(JSON.parse(text))
      received.push(parsed)
      for (const w of [...waiters]) {
        if (w.predicate(parsed)) {
          waiters.splice(waiters.indexOf(w), 1)
          w.resolve(parsed)
        }
      }
    })
    ws.once('error', (e) => reject(e))
    ws.once('open', () => {
      ws.removeAllListeners('error')
      ws.on('error', () => {})
      resolve({
        ws,
        received,
        raw,
        send: (m) => ws.send(JSON.stringify(m)),
        sendRaw: (t) => ws.send(t),
        waitFor: (predicate, ms) =>
          new Promise((res, rej) => {
            const hit = received.find(predicate)
            if (hit) return res(hit)
            const timer = setTimeout(() => rej(new Error(`${ms} ms 內沒等到；收到的是 ${JSON.stringify(raw)}`)), ms)
            waiters.push({
              predicate,
              resolve: (m) => {
                clearTimeout(timer)
                res(m)
              },
            })
          }),
        settle: (ms) => new Promise((r) => setTimeout(r, ms)),
        close: () =>
          new Promise((r) => {
            if (ws.readyState === WebSocket.CLOSED) return r()
            ws.once('close', () => r())
            ws.close()
          }),
      })
    })
  })
}

/** 握手被拒的觀察：`open` 沒發生、有 `error`（真後端與替身都是 HTTP 403 收場）。 */
export async function expectRefused(url: string): Promise<{ opened: boolean; error: string | null; messages: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    let opened = false
    let messages = 0
    let error: string | null = null
    ws.on('open', () => {
      opened = true
    })
    ws.on('message', () => {
      messages += 1
    })
    ws.on('error', (e) => {
      error = e.message
    })
    ws.on('close', () => resolve({ opened, error, messages }))
    setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) ws.terminate()
      resolve({ opened, error, messages })
    }, 3_000).unref()
  })
}
