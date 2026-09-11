// 契約測試的目標守門。規格 `FE-O05`〈唯一一份，兩個目標各跑一次，都走真 HTTP〉、〈目標必須是自己起的、可拋棄的〉。
//
// 這個檔案是 harness 與 wrapper 共用的純函式；**測試檔不 import 它**（`S02`：測試檔裡沒有目標分支）。

export const TARGETS = ['internal', 'guildhub'] as const
export type Target = (typeof TARGETS)[number]

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** `CONTRACT_TARGET` 缺席或亂填 → 拋（套件整個失敗，不是 skip）。 */
export function resolveTarget(raw: string | undefined): Target {
  if (raw === 'internal' || raw === 'guildhub') return raw
  throw new Error(
    `CONTRACT_TARGET 必須是 ${TARGETS.map((t) => `'${t}'`).join(' 或 ')}（現在是 ${raw === undefined ? '沒設' : `'${raw}'`}）。` +
      ' internal：npm run test:contract:internal；guildhub：npm run test:contract:guildhub。',
  )
}

/** 目標只能是 loopback：在送出任何請求之前檢查（`S04`）。 */
export function assertLoopbackBase(url: string | undefined, name: string): string {
  if (!url) throw new Error(`${name} 沒設。`)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${name} 不是合法的 URL：${url}`)
  }
  if (!LOOPBACK.has(parsed.hostname)) {
    throw new Error(`${name} 只接受 loopback（localhost／127.0.0.1／::1），拒絕 ${parsed.hostname} —— 契約測試會寫入資料，不打任何非本機的位址。`)
  }
  return url.replace(/\/$/, '')
}
