import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// 本機開發的 port 要釘死，而且要在別的專案的位子之外。
//
// **這條規則來自一次真實事故**（2026-09-08，隔壁專案回報）：
// 他們的 e2e 測試打到 `3001`，量到的卻是我們的網站 —— `/features` 全 404，
// 查了半天才發現量錯對象。
//
// ⚠️ **根因是 Next.js 的一個預設行為**，不是誰忘了關 server：
//
//     node_modules/next/dist/cli/next-dev.js:213
//     const allowRetry = portSource === 'default'
//
//   有下 `-p` 或 `PORT=`  → 撞港直接報錯退出，**當場就知道**
//   沒有指定（走預設）    → 撞港自己 +1 往上跳，最多 10 次，
//                          只印一行小小的 warning
//
// 也就是說，**沒釘 port 的專案會安靜地爬上去佔走別人的位子**，
// 而那行 warning 沒有人會注意到。釘死之後這件事不可能再發生 ——
// 不需要額外檢查、不需要記得看 log，撞到就起不來。
//
// 我們自己也踩過同一個坑的另一面：dev server 的 log 裡出現過
// `GET /blog/aquamarine-benefits-guide 404` —— 那是別的專案的路由打到
// 我們的 server 上，而我們花了好幾輪才發現「頁面打不開」是這個原因。

const ROOT = path.resolve(import.meta.dirname, '..')
const scripts = (
  JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
).scripts

/** 隔壁專案佔用的 port（他們 2026-09-08 給的清單）。 */
const TAKEN_BY_OTHERS = [3000, 3001, 3002, 3003, 8080, 5432, 55433, 55436, 55439]

/** 我們分到的區段。離 Next 預設值的熱區遠一點。 */
const OUR_RANGE = { min: 3100, max: 3199 }

const SERVER_SCRIPTS = ['dev', 'start'] as const

function portOf(script: string): number | null {
  const match = /-p\s+(\d+)|--port[= ](\d+)|PORT=(\d+)/.exec(script)
  if (match === null) return null
  const digits = match[1] ?? match[2] ?? match[3]
  return digits === undefined ? null : Number(digits)
}

describe('本機開發的 port', () => {
  it('每一個會開 server 的 script 都明確指定了 port', () => {
    for (const name of SERVER_SCRIPTS) {
      const script = scripts[name]
      expect(script, `package.json 少了 ${name} script`).toBeDefined()
      expect(
        portOf(script!),
        `\`${name}\` 沒有指定 port。Next 在走預設值時撞港會**自己 +1 往上跳**` +
          '（`allowRetry = portSource === "default"`），只印一行 warning —— ' +
          '於是它會安靜地佔走別人的位子。指定了才會直接報錯退出。',
      ).not.toBeNull()
    }
  })

  it('指定的 port 不在別的專案的位子上', () => {
    for (const name of SERVER_SCRIPTS) {
      const port = portOf(scripts[name]!)
      expect(
        TAKEN_BY_OTHERS,
        `\`${name}\` 用了 ${port}，那是隔壁專案的位子 —— ` +
          '他們的自動化測試會量到我們的網站然後以為是自己的。',
      ).not.toContain(port)
    }
  })

  it('指定的 port 在我們分到的區段裡', () => {
    for (const name of SERVER_SCRIPTS) {
      const port = portOf(scripts[name]!)!
      expect(port, `\`${name}\` 的 ${port} 不在 ${OUR_RANGE.min}–${OUR_RANGE.max}`).toBeGreaterThanOrEqual(
        OUR_RANGE.min,
      )
      expect(port).toBeLessThanOrEqual(OUR_RANGE.max)
    }
  })

  it('兩個 server script 不會互相撞號', () => {
    // `next dev` 與 `next start` 同時跑得起來 —— 驗生產建置的時候會這樣用。
    const ports = SERVER_SCRIPTS.map((n) => portOf(scripts[n]!))
    expect(new Set(ports).size, `${ports.join(' 與 ')} 撞號了`).toBe(ports.length)
  })
})

// ── 本機開發打得開嗎，第二件事：host ──────────────────────────────
//
// **`127.0.0.1` 與 `localhost` 在 Next 16 的 dev server 不是同一件事。**
//
// 實測（2026-09-09）：同一個 server，兩個網址，一個能用一個不能。
//
//   `localhost:3100/world`  → 正常
//   `127.0.0.1:3100/world`  → HTTP 200、HTML 完整、**畫面永遠空白**
//
// 被擋掉的是 HMR 的 WebSocket（dev server 的 log：`Blocked cross-origin
// request to Next.js dev resource /_next/hmr from "127.0.0.1"`），
// 而 Turbopack 的瀏覽器端 runtime 沒有它就**不會 hydrate**。
//
// ⚠️ **失敗的方向最糟**：沒有錯誤畫面、沒有 4xx、伺服器渲染的內容還留在
// 畫面上，錯誤邊界也不會被觸發 —— 看起來就只是「一直在 loading」。

describe('本機開發的 host', () => {
  it('127.0.0.1 也要能開，不是只有 localhost', async () => {
    const nextConfig = (await import('../next.config')).default
    expect(
      nextConfig.allowedDevOrigins,
      'next.config 沒有 allowedDevOrigins —— Next 16 會擋掉 127.0.0.1 的 ' +
        'HMR WebSocket，而那會讓整頁不 hydrate（畫面空白、沒有任何錯誤）。',
    ).toBeDefined()
    expect(nextConfig.allowedDevOrigins).toContain('127.0.0.1')
  })
})
