import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import * as contract from '@/api/contract/rest'

// FE-O02 的測試載具：一個微型 HTTP server，**它用同一份契約去驗收到的請求**。
//
// ⚠️⚠️ **刻意不用假的 `fetch`。** 這個 repo 有一條明確的教訓：
// 在測試檔裡重刻一份再斷言它，等於沒測。手刻的 `fetch` mock 就是那件事的
// 另一個形式 —— 斷言「送出的 body 長這樣」時，那個「這樣」是我自己寫的第二份形狀。
//
// 這裡的 handler **不自己寫死任何形狀**：它拿 `src/api/contract/rest.ts`
// 的 schema 去 `safeParse` 收到的 body，不合就回 400。adapter 送錯就會紅。
//
// ⚠️ **這把尺量不到「契約本身對不對」。** 契約寫錯的話，client 與 server
// 會一起通過 —— 那是 `FE-O01` 的型別漂移哨兵與 `FE-O05` 的契約測試（W2）的範圍。
// 這裡驗的是**「adapter 有沒有遵守契約」**，不是「契約等於凍結的真後端」。

/** 端點 → 它接受的請求 body。**只列有 body 的**；沒列到的端點不收 body。 */
const REQUEST_SCHEMAS: Record<string, z.ZodType> = {
  'POST /api/login': contract.LoginIn,
  'POST /api/register': contract.RegisterIn,
  'PATCH /api/profiles/me': contract.ProfileUpdate,
  'POST /api/projects': contract.ProjectCreate,
  'POST /api/projects/{project_id}/form-team': contract.FormTeamIn,
  'POST /api/projects/{project_id}/enter': contract.EnterIn,
  'POST /api/projects/{project_id}/seats': contract.SeatClaim,
  'POST /api/messages': contract.MessageCreate,
}

/** 把實際路徑還原成樣板：`/api/projects/abc/seats` → `/api/projects/{project_id}/seats`。 */
function templateFor(pathname: string): string {
  for (const key of Object.keys(REQUEST_SCHEMAS)) {
    const template = key.split(' ')[1] as string
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`)
    if (pattern.test(pathname)) return template
  }
  return pathname
}

export interface RecordedCall {
  method: string
  pathname: string
  /** 路徑樣板。路徑參數已經還原成 `{name}`。 */
  template: string
  /**
   * Query string，**含前導的 `?`**；沒有的話是空字串。
   *
   * ⚠️ **分頁的判準要靠它。** `pathname` 把 `?` 之後切掉了 ——
   * 只看 `pathname` 的話，「送 `page=0`」與「完全不送 `page`」
   * 在這把尺上是同一件事（規格 `FE-B01-S04`）。
   */
  search: string
  headers: Record<string, string | undefined>
  body: unknown
  /** 請求 body 有沒有通過契約。**沒有列在 `REQUEST_SCHEMAS` 的端點是 `null`。** */
  contractOk: boolean | null
}

export interface ContractServer {
  base: string
  calls: RecordedCall[]
  /** 下一個回應。**沒有設定的話回 500** —— 忘記設定不該看起來像成功。`after` 有給的話，等它 resolve 才回（模擬慢的後端）。 */
  reply(status: number, body: unknown, options?: { after?: Promise<void> }): void
  /**
   * 只給某個路徑的下一個回應；比 `reply()` 的佇列優先。
   *
   * ⚠️ **兩個不同端點的請求交錯時要用這個。** `reply()` 是先到先拿 ——
   * 而「哪一個先到」在被中止的請求上是不確定的：中止得夠早的話它根本不會到，
   * 排給它的那個回應就會被下一個請求拿走（規格 `FE-B01-S15` 的判準踩過）。
   */
  replyFor(pathname: string, status: number, body: unknown, options?: { after?: Promise<void> }): void
  close(): Promise<void>
}

export async function startContractServer(): Promise<ContractServer> {
  const calls: RecordedCall[] = []
  type Reply = { status: number; body: unknown; after?: Promise<void> }
  const queue: Reply[] = []
  const byPath = new Map<string, Reply[]>()

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      const url = req.url ?? '/'
      const pathname = url.split('?')[0] as string
      const queryIndex = url.indexOf('?')
      const search = queryIndex === -1 ? '' : url.slice(queryIndex)
      const template = templateFor(pathname)
      const schema = REQUEST_SCHEMAS[`${req.method} ${template}`]

      let body: unknown = undefined
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw)
        } catch {
          body = raw
        }
      }

      // **契約在這裡驗，不在測試檔裡。**
      const contractOk = schema === undefined ? null : schema.safeParse(body).success
      calls.push({
        method: req.method ?? '',
        pathname,
        template,
        search,
        headers: req.headers as Record<string, string | undefined>,
        body,
        contractOk,
      })

      if (contractOk === false) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ detail: '送出去的東西不符合契約' }))
        return
      }

      const next = byPath.get(pathname)?.shift() ?? queue.shift()
      if (next === undefined) {
        // 忘記 `reply()` 的話回 500 —— 回 200 空物件的話，
        // 一條忘了設定回應的測試會靠「契約允許」意外地通過
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ detail: '測試沒有替這個請求準備回應' }))
        return
      }
      void (next.after ?? Promise.resolve()).then(() => {
        res.writeHead(next.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(next.body))
      })
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  // **port 取 0 讓作業系統給。** 固定 port 在 CI 上會撞，
  // 而撞到的症狀是「連線被拒」—— 跟「adapter 沒送出請求」長得一模一樣。
  const port = (server.address() as AddressInfo).port

  return {
    base: `http://127.0.0.1:${port}`,
    calls,
    reply(status, body, options) {
      queue.push({ status, body, after: options?.after })
    },
    replyFor(pathname, status, body, options) {
      byPath.set(pathname, [...(byPath.get(pathname) ?? []), { status, body, after: options?.after }])
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
