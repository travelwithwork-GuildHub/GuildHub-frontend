import { boundaryValues } from '@/api/contract/boundaries'
import { LIMITS } from '@/api/contract/limits'
import { ProfileOut } from '@/api/contract/rest'

// 成對邊界表：**欄位 → 端點**。值由 `FE-O06` 的 `boundaryValues()` 從 `LIMITS` 算（這裡沒有任何長度數字）。
// 規格 `FE-O05`〈成對邊界從 `limits.ts` 產生〉。
//
// **每一個 `LIMITS` 的鍵都要出現在這張表**（`satisfies Record<keyof typeof LIMITS, …>`）：新增欄位漏了這裡，型別就紅。
// 打得到的給 `via`；打不到的給 `pending`（測試以 `it.todo` 列出，報表看得到、也數得到）。
// `expectReject`：資料庫 check 擋的是 500 text/plain（真後端長度只寫在 DB）；應用層擋的是 422／400。

/**
 * 怎麼把一個值送到後端、怎麼讀回來驗。
 * `PATCH`（更新既有資源）：先放 `baseValue`，拒絕之後 `GET read.path` 的 `read.key` 要還是 `baseValue`（不部分寫入）。
 * `POST`（新增資源）：拒絕本身就不該產生資源 —— 拒絕之後 `GET read.path` 回的陣列長度不變。
 * runner 只看這個介面，不寫死任何端點（審查抓到原本綁死在 profiles PATCH）。
 */
export interface Via {
  method: 'POST' | 'PATCH'
  path: string
  /** body 的鍵。 */
  key: string
  /** PATCH 才用：先放進去的合法值。 */
  baseValue?: string
  /** 成功回應的形狀（契約的 Zod schema）。 */
  parse: (json: unknown) => Record<string, unknown> | unknown[]
  /** 拒絕之後去哪裡讀回來驗：PATCH 讀單筆的 `key`；POST 讀清單數長度。 */
  read: { path: string; key?: string }
  login: boolean
}
export type BoundaryCase = { via: Via; expectReject: 500 | 422 | 400 } | { pending: string }

export const BOUNDARY_CASES = {
  displayName: {
    via: { method: 'PATCH', path: '/api/profiles/me', key: 'display_name', baseValue: '原本的名字', parse: (j) => ProfileOut.parse(j), read: { path: '/api/me', key: 'display_name' }, login: true },
    expectReject: 500,
  },
  bio: {
    via: { method: 'PATCH', path: '/api/profiles/me', key: 'bio', baseValue: '原本', parse: (j) => ProfileOut.parse(j), read: { path: '/api/me', key: 'bio' }, login: true },
    expectReject: 500,
  },
  messageBody: { pending: 'FE-K01 做了 POST /api/messages（DB check → 500），但 body 還要 recipient_id（另一張名片）—— 這張表的 POST 還不支援額外欄位；長度由 tests/contract/rest/messages.contract.ts S15 直接驗 2001 → 500' },
  seatIndex: { pending: 'FE-W16 座位（W4）：POST /api/projects/{id}/seats；DB check → 500、超過 seat_count → 400（seats.py）' },
  password: { pending: 'FE-A08 做了 POST /api/register（Pydantic min_length → 422），但 body 還要 login_id 與 nickname —— 這張表的 POST 還不支援額外欄位；由 register.contract.ts 的 golden 驗' },
  loginId: { pending: 'FE-A08 做了 POST /api/register（DB check → 500），但 body 還要 password 與 nickname —— 這張表的 POST 還不支援額外欄位' },
  statusText: { pending: 'WS 的 12 字上限在 tests/contract/ws/lobby.contract.ts（S20：12 個 emoji 收、13 個丟），不走 REST 這張表' },
  facing: { pending: 'WS 的 move.f 0～3：不合法的 f 靜默丟棄，屬 WS 契約（S20 的形狀），不走 REST 這張表' },
  // 後端沒有上限的欄位：`min: 1` 是**前端**的規則（`FE-X05`），後端 `text not null` 收空字串 —— 對後端跑「min-1 拒絕」會是假的紅。
  projectTitle: { pending: 'FE-X05 前端自訂上限（後端沒有 check；min 是前端的規則，不對後端驗）' },
  projectBody: { pending: 'FE-X05 前端自訂上限（後端沒有 check；min 是前端的規則，不對後端驗）' },
  skillCount: { pending: 'FE-X05（後端 text[] 沒有 check）' },
  skillLength: { pending: 'FE-X05（後端 text[] 沒有 check）' },
} satisfies Record<keyof typeof LIMITS, BoundaryCase>

export type Field = keyof typeof BOUNDARY_CASES

/** 有 `via` 的案例，每一條展開成（值、該接受／該拒絕）。 */
export function expandedCases() {
  return (Object.keys(BOUNDARY_CASES) as Field[])
    .filter((field) => 'via' in BOUNDARY_CASES[field])
    .flatMap((field) => {
      const c = BOUNDARY_CASES[field] as { via: Via; expectReject: 500 | 422 | 400 }
      const { accept, reject } = boundaryValues(LIMITS[field])
      return [
        ...accept.map((value) => ({ field, via: c.via, expectReject: c.expectReject, value, expect: 'accept' as const })),
        ...reject.map((value) => ({ field, via: c.via, expectReject: c.expectReject, value, expect: 'reject' as const })),
      ]
    })
}

/** 到不了的欄位（給 `it.todo`）。 */
export function pendingCases(): Array<{ field: Field; pending: string }> {
  return (Object.keys(BOUNDARY_CASES) as Field[])
    .filter((field) => 'pending' in BOUNDARY_CASES[field])
    .map((field) => ({ field, pending: (BOUNDARY_CASES[field] as { pending: string }).pending }))
}
