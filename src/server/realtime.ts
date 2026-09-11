import 'server-only'
import { internalRealtimePort } from '@/config/env'

// 問即時層替身「這個 scene 有幾個人」。規格 `FE-O03`〈人才與案件清單〉的 `online_count`（design `D5`）。
//
// 真後端是同一個 process 的函式呼叫；本地版是兩個程序，所以走 loopback 的 HTTP。
// 替身沒在跑、逾時（100 ms）→ 0，**回應仍是 200** —— 走廊的門不因為替身不在就開不出來（`S17`）。
// `fetch` 在 `src/app/api/**`／`src/server/**` 這種伺服器端才准出現；這裡打的是自己的 loopback。

export async function onlineCount(scene: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100)
  try {
    const r = await fetch(`http://127.0.0.1:${internalRealtimePort()}/online?scene=${encodeURIComponent(scene)}`, { signal: controller.signal })
    if (!r.ok) return 0
    const body = (await r.json()) as { count?: unknown }
    return typeof body.count === 'number' && Number.isInteger(body.count) ? body.count : 0
  } catch {
    return 0
  } finally {
    clearTimeout(timer)
  }
}
