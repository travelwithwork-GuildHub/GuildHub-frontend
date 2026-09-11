// 即時層替身。規格 `FE-O03`〈即時層替身照 `protocol.py`，怪癖一併複製〉。
//
//   npx tsx scripts/realtime-stub.ts        （`npm run realtime:stub`；INTERNAL_REALTIME_PORT 預設 3102，只綁 loopback）
//
// 跟真後端一樣的地方（`app/main.py`、`app/realtime/*`）：
//   握手：`/ws?scene=lobby` 不驗；`scene=room:<uuid>` 要 `token`；格式不合／token 不對 → **拒絕握手**（HTTP 403，不 accept、不送 err）
//   身分：讀同一個簽章 cookie（`session`），名片在 → name／av；沒有或無效 → 新的 uuid、「訪客」、0（**不拒絕**）
//   連上：`hello`（hz 10）→ `snapshot`；其他人收到 `presence.join`
//   `move` 10 Hz 合併成 `pos` 廣播給**所有人（含自己）**；沒有人動就**不送**（不是空陣列）
//   `status` 廣播 `{t,id,text}`；超過 12 個 code point → 靜默丟；`chat` 廣播 `{t,id,name,body}`
//   不合協定（非 JSON、未知 t、x/y 不是整數）→ 靜默丟棄，不回 err、不斷線
// 另外多一個 `GET /online?scene=<scene>` → `{"count": n}` 給 `GET /api/rooms` 用（design `D5`；真後端是同 process 的函式呼叫）。
//
// ⚠️ **訊息形狀全部用 `src/api/contract/ws.ts` 的 schema**：收的用 `ClientMessage.safeParse`，送的用 `ServerMessage.parse` 驗過才送。
// 這裡不得出現 `z.object` —— 第二份 schema 就是漂移的起點。
// 用 `tsx` 跑：`ws.ts` 的相對 import 沒有副檔名，Node 原生的 type stripping 不解析（design `D6`）。

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import pg from 'pg'
import { WebSocketServer, type WebSocket } from 'ws'
import { ClientMessage, HZ, ServerMessage, type Player } from '../src/api/contract/ws'

const PORT = Number(process.env.INTERNAL_REALTIME_PORT ?? 3102)
const SECRET = process.env.INTERNAL_SESSION_SECRET ?? 'dev-only-internal-session-secret'
const DATABASE_URL = process.env.INTERNAL_DATABASE_URL
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null
pool?.on('error', () => {})

function hmac(input: string): string {
  return createHmac('sha256', SECRET).update(input).digest('base64url')
}
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** 房間的 token：`HMAC(secret, "room:<uuid>")`。今天只有測試會算；`FE-W16` 把 `enter` 接上之後由它簽發（同一把）。 */
export function roomToken(scene: string): string {
  return hmac(scene)
}

/** 從 cookie 取身分；沒有或無效 → 訪客。**不拒絕**（真後端亦然）。 */
async function identify(cookieHeader: string | undefined): Promise<{ id: string; name: string; av: number }> {
  const guest = { id: randomUUID(), name: '訪客', av: 0 }
  const raw = cookieHeader
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('session='))
    ?.slice('session='.length)
  if (!raw || pool === null) return guest
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return guest
  const id = raw.slice(0, dot)
  if (!UUID.test(id) || !safeEqual(raw.slice(dot + 1), hmac(id))) return guest
  try {
    const r = await pool.query<{ display_name: string; avatar_id: number }>('select display_name, avatar_id from profiles where id = $1', [id])
    const row = r.rows[0]
    return row ? { id, name: row.display_name, av: row.avatar_id } : guest
  } catch (e) {
    // 資料庫暫時連不上：當訪客，不讓一條連線把整個替身炸掉（unhandled rejection，審查抓到的）。
    console.warn('[realtime-stub] 查名片失敗，當訪客：', (e as Error).message)
    return guest
  }
}

interface Conn {
  ws: WebSocket
  player: Player
  scene: string
  moved: boolean
}

const conns = new Set<Conn>()
const inScene = (scene: string) => [...conns].filter((c) => c.scene === scene)

function send(ws: WebSocket, message: unknown) {
  // 送出前驗形狀：替身送出不合契約的東西就是替身在漂。
  const parsed = ServerMessage.parse(message)
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(parsed))
}
function broadcast(scene: string, message: unknown, except?: Conn) {
  for (const c of inScene(scene)) if (c !== except) send(c.ws, message)
}

/** 10 Hz：每個 scene 有人動才送一則 `pos`。 */
setInterval(() => {
  const scenes = new Set([...conns].map((c) => c.scene))
  for (const scene of scenes) {
    const moved = inScene(scene).filter((c) => c.moved)
    if (moved.length === 0) continue
    const p = moved.map((c) => [c.player.id, c.player.x, c.player.y, c.player.f] as [string, number, number, number])
    for (const c of moved) c.moved = false
    broadcast(scene, { t: 'pos', p })
  }
}, 1000 / HZ).unref()

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method === 'GET' && url.pathname === '/online') {
    const scene = url.searchParams.get('scene') ?? ''
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ count: inScene(scene).length }))
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ noServer: true })

function sceneAllowed(scene: string, token: string | null): boolean {
  if (scene === 'lobby') return true
  // `room:<uuid>`：真的 uuid，不是「36 個 hex 或連字號」（審查抓到 `room:----…` 也會過）。
  if (!scene.startsWith('room:') || !UUID.test(scene.slice('room:'.length))) return false
  return token !== null && safeEqual(token, roomToken(scene))
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const scene = url.searchParams.get('scene') ?? 'lobby'
  if (url.pathname !== '/ws' || !sceneAllowed(scene, url.searchParams.get('token'))) {
    // 真後端：還沒 accept 就 close(1008) → 握手以 HTTP 403 收場，client 只看得到「連不上」，沒有 err。
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }
  void identify(req.headers.cookie).then((who) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn: Conn = { ws, scene, moved: false, player: { ...who, x: 0, y: 0, f: 0, st: '' } }
      send(ws, { t: 'hello', you: who.id, hz: HZ })
      // 先廣播 join 給已經在的人，再把自己加進去、送自己一份含自己的 snapshot（`manager.connect` 的順序）。
      broadcast(scene, { t: 'presence', join: [conn.player], leave: [] })
      conns.add(conn)
      send(ws, { t: 'snapshot', players: inScene(scene).map((c) => c.player) })

      ws.on('message', (data) => {
        let json: unknown
        try {
          json = JSON.parse(data.toString())
        } catch {
          return // 附錄 A.2：不合法的訊息直接丟棄，不回錯
        }
        const parsed = ClientMessage.safeParse(json)
        if (!parsed.success) return
        const msg = parsed.data
        if (msg.t === 'move') {
          conn.player = { ...conn.player, x: msg.x, y: msg.y, f: msg.f }
          conn.moved = true
        } else if (msg.t === 'status') {
          conn.player = { ...conn.player, st: msg.text }
          broadcast(scene, { t: 'status', id: conn.player.id, text: msg.text })
        } else {
          broadcast(scene, { t: 'chat', id: conn.player.id, name: conn.player.name, body: msg.body })
        }
      })
      ws.on('close', () => {
        conns.delete(conn)
        broadcast(scene, { t: 'presence', join: [], leave: [conn.player.id] })
      })
    })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[realtime-stub] ws://127.0.0.1:${PORT}/ws  /online  （${DATABASE_URL ? '會查名片' : '沒有 INTERNAL_DATABASE_URL，全部是訪客'}）`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close()
    for (const c of conns) c.ws.close(1001)
    void pool?.end()
    process.exit(0)
  })
}
