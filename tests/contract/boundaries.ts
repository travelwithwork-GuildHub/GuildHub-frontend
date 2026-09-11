import { boundaryValues } from '@/api/contract/boundaries'
import { LIMITS } from '@/api/contract/limits'

// 成對邊界表：**欄位 → 端點**。值由 `FE-O06` 的 `boundaryValues()` 從 `LIMITS` 算（這裡沒有任何長度數字）。
// 規格 `FE-O05`〈成對邊界從 `limits.ts` 產生〉。
//
// `expectReject`：資料庫 check 擋的是 500 text/plain（真後端長度只寫在 DB）；應用層擋的是 422。
// W2 端點到不了的欄位標 `pending: '<能力>'`，測試印出來、不跑、不算失敗 —— 那些能力來的時候把 `via` 補上就行。

export interface BoundaryCase {
  field: keyof typeof LIMITS
  /** 怎麼把值送到後端：需要登入；`method`／`path`／`key` 是 body 的鍵。 */
  via?: { method: 'POST' | 'PATCH'; path: string; key: string; login: boolean }
  expectReject: 500 | 422
  pending?: string
}

export const BOUNDARY_CASES: readonly BoundaryCase[] = [
  { field: 'displayName', via: { method: 'PATCH', path: '/api/profiles/me', key: 'display_name', login: true }, expectReject: 500 },
  { field: 'bio', via: { method: 'PATCH', path: '/api/profiles/me', key: 'bio', login: true }, expectReject: 500 },
  { field: 'messageBody', expectReject: 500, pending: 'FE-J01 站內信（W8）：POST /api/messages' },
  { field: 'seatIndex', expectReject: 400, pending: 'FE-W16 座位（W4）：POST /api/projects/{id}/seats' } as unknown as BoundaryCase,
  { field: 'password', expectReject: 422, pending: 'FE-A02 帳號註冊（BE-G28）：POST /api/register' },
  { field: 'loginId', expectReject: 500, pending: 'FE-A02 帳號註冊（BE-G28）：POST /api/register' },
]

/** 有 `via` 的案例，每一條展開成（值、該接受／該拒絕）。 */
export function expandedCases() {
  return BOUNDARY_CASES.filter((c) => c.via !== undefined).flatMap((c) => {
    const { accept, reject } = boundaryValues(LIMITS[c.field])
    return [
      ...accept.map((value) => ({ ...c, value, expect: 'accept' as const })),
      ...reject.map((value) => ({ ...c, value, expect: 'reject' as const })),
    ]
  })
}
