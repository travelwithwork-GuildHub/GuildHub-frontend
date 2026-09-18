import { boundaryValues } from '@/api/contract/boundaries'
import { LIMITS, UNBOUNDED, codePointLength } from '@/api/contract/limits'
import { ProfileOut, ProjectOut, ProjectResourceOut } from '@/api/contract/rest'
import { trackProject } from './cleanup'
import type { ContractClient } from './client'

// 成對邊界表：**欄位 → 端點**。值由 `FE-O06` 的 `boundaryValues()` 從 `LIMITS` 算（這裡沒有任何長度數字）。
// 規格 `FE-O05`〈成對邊界從 `limits.ts` 產生〉。
//
// **每一個 `LIMITS` 的鍵都要出現在這張表**（`satisfies Record<keyof typeof LIMITS, …>`）：新增欄位漏了這裡，型別就紅。
// 打得到的給 `vias`；打不到的給 `pending`（測試以 `it.todo` 列出，報表看得到、也數得到）。
// `expectReject`：資料庫 check 擋的是 500 text/plain（真後端長度只寫在 DB）；應用層擋的是 422／400。

/**
 * 怎麼把一個值送到後端、怎麼讀回來驗。
 * `PATCH`（更新既有資源）：先放 `baseValue`，拒絕之後 `read` 讀回來要還是 `baseValue`（不部分寫入）。
 * `POST`（新增資源）：拒絕本身就不該產生資源 —— 拒絕之後 `read` 讀到的筆數不變。
 * runner 只看這個介面，不寫死任何端點（審查抓到原本綁死在 profiles PATCH）。
 */
export interface Via {
  method: 'POST' | 'PATCH'
  /** 靜態路徑；要先建東西才知道路徑的（專案資源）由 `prepare` 覆蓋。 */
  path: string
  /** body 的鍵。 */
  key: string
  /** PATCH 才用：先放進去的合法值。 */
  baseValue?: string
  /** 跟著一起送的其他必填欄位（專案資源的 `POST` 要 `type` 與 `url`）。 */
  extra?: Record<string, unknown>
  /** 從成功回應裡取出這個欄位的值（順便驗形狀）—— 接受的案例要逐字等於送出去的。 */
  echo: (json: unknown) => unknown
  /** 拒絕之後去哪裡讀、讀什麼：PATCH 讀那一筆的 `key`；POST 讀清單長度。 */
  read: Readback
  login: boolean
  /**
   * 這一條案例開跑前的前置（登入之後）：建 active 專案、`PATCH` 再建一筆資源。
   * 回傳這一輪真正要用的路徑與讀回來的方式 —— 專案 id 到執行時才知道，不能寫進上面的靜態欄位。
   */
  prepare?: (client: ContractClient) => Promise<{ path: string; read: Readback }>
  /** 值另受格式 check 約束的欄位（網址）：見 `Shaping`。 */
  shaping?: Shaping
}

export interface Readback {
  path: string
  pick: (json: unknown) => unknown
}

/**
 * `boundaryValues` 產的是純 CJK 與 emoji 字串，對 `url ~* '^https?://[^[:space:]]+$'` **不論長短都不合法**，
 * 所以網址的值不能直接送。塑形保長度（code point 數不變），但只套得上「長度可比較」的那兩個案例：
 *
 *   `max`、`max+1` → 塑形後送（長度就是要驗的東西）
 *   `min`（1 個字）的 accept → **排除**，理由寫在 `minSideAcceptExcluded`：1 個 code point 塑不出合法網址
 *   `min-1`（空字串）的 reject → **用原值**，空字串本來就過不了 check，預期 500
 *
 * 規格明文禁止「把塑形套到所有值」與「乾脆不驗 min 側」兩種蓋法。
 */
export interface Shaping {
  keepLength: (value: string) => string
  minSideAcceptExcluded: string
}

export type BoundaryCase = { scenario: string; vias: Via[]; expectReject: 500 | 422 | 400 } | { pending: string }

const profileRead = (key: string): Readback => ({ path: '/api/me', pick: (j) => (ProfileOut.parse(j) as Record<string, unknown>)[key] })

const displayNameVias: Via[] = [
  { method: 'PATCH', path: '/api/profiles/me', key: 'display_name', baseValue: '原本的名字', echo: (j) => ProfileOut.parse(j).display_name, read: profileRead('display_name'), login: true },
]
const bioVias: Via[] = [
  { method: 'PATCH', path: '/api/profiles/me', key: 'bio', baseValue: '原本', echo: (j) => ProfileOut.parse(j).bio, read: profileRead('bio'), login: true },
]

/** 建一個 active 專案：資源端點只對 active 開放寫入。 */
async function activeProject(c: ContractClient): Promise<string> {
  const created = await c.raw('POST', '/api/projects', { body: { title: '邊界用的專案', body: '成對邊界', needed_skills: [], seat_count: 4 } })
  if (created.status !== 201) throw new Error(`建案失敗：${created.status} ${created.text.slice(0, 200)}`)
  const id = ProjectOut.parse(created.json).id
  const formed = await c.raw('POST', `/api/projects/${id}/form-team`, { body: { password: 'guild1234' } })
  if (formed.status !== 200) throw new Error(`成軍失敗：${formed.status} ${formed.text.slice(0, 200)}`)
  // 跑完要結案 —— 每個 active 專案都在跟 seed 的兩間房搶 12 個門位（`cleanup.ts` 檔頭）。
  return trackProject(c, id)
}

const RESOURCE_BASE = { label: '原本的資源', type: 'github', url: 'https://example.com/base' }

/** 資源清單的讀回來：POST 數筆數。 */
const resourceCount = (path: string): Readback => ({ path, pick: (j) => (j as unknown[]).length })

async function resourcesPath(c: ContractClient): Promise<{ path: string; read: Readback }> {
  const path = `/api/projects/${await activeProject(c)}/resources`
  return { path, read: resourceCount(path) }
}

/** PATCH 用：建一筆，之後讀清單裡的那一筆（真後端沒有「讀單筆」的端點）。 */
async function oneResource(c: ContractClient, key: string): Promise<{ path: string; read: Readback }> {
  const listPath = `/api/projects/${await activeProject(c)}/resources`
  const created = await c.raw('POST', listPath, { body: RESOURCE_BASE })
  if (created.status !== 201) throw new Error(`建資源失敗：${created.status} ${created.text.slice(0, 200)}`)
  const { id } = ProjectResourceOut.parse(created.json)
  return {
    path: `${listPath}/${id}`,
    read: { path: listPath, pick: (j) => (j as unknown[]).map((x) => ProjectResourceOut.parse(x)).find((x) => x.id === id)?.[key as 'label' | 'url'] },
  }
}

const URL_HEAD = 'https://example.com/'
const urlShaping: Shaping = {
  keepLength: (value) => URL_HEAD + 'a'.repeat(Math.max(codePointLength(value) - codePointLength(URL_HEAD), 0)),
  minSideAcceptExcluded: 'min 是 1 個 code point —— 塑不出合法網址（`https://` 就 8 個字），accept 側沒有東西可送；reject 側的空字串用原值送',
}

const resourceLabelVias: Via[] = [
  {
    method: 'POST',
    path: '',
    key: 'label',
    extra: { type: RESOURCE_BASE.type, url: RESOURCE_BASE.url },
    echo: (j) => ProjectResourceOut.parse(j).label,
    read: resourceCount(''),
    login: true,
    prepare: resourcesPath,
  },
  {
    method: 'PATCH',
    path: '',
    key: 'label',
    baseValue: RESOURCE_BASE.label,
    echo: (j) => ProjectResourceOut.parse(j).label,
    read: resourceCount(''),
    login: true,
    prepare: (c) => oneResource(c, 'label'),
  },
]

const resourceUrlVias: Via[] = [
  {
    method: 'POST',
    path: '',
    key: 'url',
    extra: { label: RESOURCE_BASE.label, type: RESOURCE_BASE.type },
    echo: (j) => ProjectResourceOut.parse(j).url,
    read: resourceCount(''),
    login: true,
    prepare: resourcesPath,
    shaping: urlShaping,
  },
  {
    method: 'PATCH',
    path: '',
    key: 'url',
    baseValue: RESOURCE_BASE.url,
    echo: (j) => ProjectResourceOut.parse(j).url,
    read: resourceCount(''),
    login: true,
    prepare: (c) => oneResource(c, 'url'),
    shaping: urlShaping,
  },
]

export const BOUNDARY_CASES = {
  displayName: { scenario: 'FE-O05-S07', vias: displayNameVias, expectReject: 500 },
  bio: { scenario: 'FE-O05-S08', vias: bioVias, expectReject: 500 },
  messageBody: { pending: 'FE-K01 做了 POST /api/messages（DB check → 500），但 body 還要 recipient_id（另一張名片）—— 這張表的前置還沒支援「先建一張別人的名片」；長度由 tests/contract/rest/messages.contract.ts S15 直接驗 2001 → 500' },
  seatIndex: { pending: 'FE-W16 座位（W4）：POST /api/projects/{id}/seats；DB check → 500、超過 seat_count → 400（seats.py）' },
  password: { pending: 'FE-A08 做了 POST /api/register（Pydantic min_length → 422），但那個端點不能重複打同一個 login_id —— 由 register.contract.ts 的 golden 驗' },
  loginId: { pending: 'FE-A08 做了 POST /api/register（DB check → 500），同上：同一個 login_id 只能建一次' },
  statusText: { pending: 'WS 的 12 字上限在 tests/contract/ws/lobby.contract.ts（S20：12 個 emoji 收、13 個丟），不走 REST 這張表' },
  facing: { pending: 'WS 的 move.f 0～3：不合法的 f 靜默丟棄，屬 WS 契約（S20 的形狀），不走 REST 這張表' },
  // 後端沒有上限的欄位：`min: 1` 是**前端**的規則（`FE-X05`），後端 `text not null` 收空字串 —— 對後端跑「min-1 拒絕」會是假的紅。
  // `FE-J01` 之後 `POST /api/projects` 兩邊都有了，但這四個欄位仍然**沒有邊界可驗**：後端一個 check 都沒有（`FE-O08` 演練帳的 anomaly），
  // 端點存在不等於有東西可以成對。
  projectTitle: { pending: 'FE-J01 有 POST /api/projects 了，但後端沒有 check；min 是前端的規則（FE-X05），不對後端驗' },
  projectBody: { pending: 'FE-J01 有 POST /api/projects 了，但後端沒有 check；min 是前端的規則（FE-X05），不對後端驗' },
  skillCount: { pending: 'FE-J01 有 POST /api/projects 了，但後端 text[] 沒有 check，沒有邊界可成對' },
  skillLength: { pending: 'FE-J01 有 POST /api/projects 了，但後端 text[] 沒有 check，沒有邊界可成對' },
  chatBody: { pending: 'WS 的 chat.body 只驗是字串、沒有上限（FE-R11 design D5；BE-G16 未解），不走 REST 這張表' },
  resourceLabel: { scenario: 'FE-J14-S33', vias: resourceLabelVias, expectReject: 500 },
  resourceUrl: { scenario: 'FE-J14-S33', vias: resourceUrlVias, expectReject: 500 },
  // 這一條**永遠是 pending**：它是數量不是長度，`boundaryValues()` 產不出「第 51 筆」這種值。
  resourcesPerProject: { pending: 'FE-J14：是數量不是長度（滿 50 回 409），成對邊界由 S32 的並行測試直接驗，不走這張表' },
} satisfies Record<keyof typeof LIMITS, BoundaryCase>

export type Field = keyof typeof BOUNDARY_CASES

export interface ExpandedCase {
  field: Field
  scenario: string
  via: Via
  expectReject: 500 | 422 | 400
  value: string
  expect: 'accept' | 'reject'
}

/** 有 `vias` 的案例，每一條展開成（端點、值、該接受／該拒絕）。 */
export function expandedCases(): ExpandedCase[] {
  const out: ExpandedCase[] = []
  const seen = new Set<string>()
  for (const field of Object.keys(BOUNDARY_CASES) as Field[]) {
    const c = BOUNDARY_CASES[field]
    if (!('vias' in c)) continue
    const limit = LIMITS[field]
    const { accept, reject } = boundaryValues(limit)
    const values = [
      ...accept.map((value) => ({ value, expect: 'accept' as const })),
      ...reject.map((value) => ({ value, expect: 'reject' as const })),
    ]
    for (const via of c.vias) {
      for (const { value, expect } of values) {
        const n = codePointLength(value)
        const lengthComparable = limit.max !== UNBOUNDED && (n === limit.max || n === limit.max + 1)
        let sent = value
        if (via.shaping !== undefined) {
          // 塑形只套在長度可比較的兩個案例；min 側的 accept 排除、reject 用原值（`Shaping` 檔頭）。
          if (lengthComparable) sent = via.shaping.keepLength(value)
          else if (expect === 'accept') continue
        }
        // 塑形會把「max 個 CJK」與「max 個 emoji」變成同一串 —— 同一個端點不重複跑同一個值。
        const fingerprint = `${field}|${via.method}|${via.key}|${expect}|${sent}`
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)
        out.push({ field, scenario: c.scenario, via, expectReject: c.expectReject, value: sent, expect })
      }
    }
  }
  return out
}

/** 到不了的欄位（給 `it.todo`）。 */
export function pendingCases(): Array<{ field: Field; pending: string }> {
  return (Object.keys(BOUNDARY_CASES) as Field[])
    .filter((field) => 'pending' in BOUNDARY_CASES[field])
    .map((field) => ({ field, pending: (BOUNDARY_CASES[field] as { pending: string }).pending }))
}

/** 被塑形排除的案例（給 `it.todo`：排除要看得見，不是默默不跑）。 */
export function excludedCases(): Array<{ field: Field; why: string }> {
  return (Object.keys(BOUNDARY_CASES) as Field[])
    .flatMap((field) => {
      const c = BOUNDARY_CASES[field]
      if (!('vias' in c)) return []
      const why = c.vias.find((v) => v.shaping !== undefined)?.shaping?.minSideAcceptExcluded
      return why === undefined ? [] : [{ field, why }]
    })
}

/** S33 的「只含空白」「前後空白」那一段要用同一套前置（`it` 裡不自己組端點）。 */
export { activeProject, oneResource, resourcesPath, RESOURCE_BASE }
