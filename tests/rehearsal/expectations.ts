// 切換演練的期望表 —— 規格 `FE-O08`〈閉環的每一步都對照期望表〉與〈已知行為釘成觀測基線〉那兩張表的資料版。
//
// 這一份是唯一來源（design D2）：演練測試（`tests/rehearsal/*.rehearsal.ts`）從 `expect` 讀期望值、把 `key`／`report`
// 抄進 `task.meta` 給報告用；`docs/evidence/fe-o08/README.md` 三節的 `(key, owner)` 由 `tests/rehearsal-expectations.test.ts`
// 比對成跟這裡相等。改期望值只改這裡；改 owner 要連 README 一起改（不然 S09 紅 —— 那是刻意的）。
//
// `kind`：`step` 是閉環十三步（循序、共用狀態接力）；`contract` 是前端要相容的後端行為；`anomaly` 是疑似後端缺陷、
// 送回後端裁定（`report` 必為 true）。三條 anomaly **不進 internal 替身**（design D4）。
// 基線是 2026-09-17 對後端 `c6f3928` 量到的：演練變紅＝觀測值變了、要重新分類，不是後端 regression。

export type Kind = 'step' | 'contract' | 'anomaly'

export type Expectation = {
  /** 穩定的鍵：報告的列、README 的列、vitest 葉節點的 `meta.key`。 */
  key: string
  kind: Kind
  /** 人讀的一句：請求 → 期望。報告不複製它（規格：MUST NOT 複製期望表的說明全文）。 */
  title: string
  /** 演練測試從這裡讀的期望值；欄位名各條自己定。測試 MUST NOT 在斷言裡另寫數字。 */
  expect: Readonly<Record<string, number | string>>
  /** 要不要進報告的〈送回後端〉。 */
  report: boolean
  /** 前端哪一個工作項目接手（`docs/WBS.md` 的 ID）。 */
  owner: `FE-${string}`
}

const step = (key: string, title: string, expect: Expectation['expect'], owner: Expectation['owner']): Expectation => ({ key, kind: 'step', title, expect, report: false, owner })
const contract = (key: string, title: string, expect: Expectation['expect'], owner: Expectation['owner'], report = false): Expectation => ({ key, kind: 'contract', title, expect, report, owner })
const anomaly = (key: string, title: string, expect: Expectation['expect'], owner: Expectation['owner']): Expectation => ({ key, kind: 'anomaly', title, expect, report: true, owner })

export const EXPECTATIONS: readonly Expectation[] = [
  // ── 閉環十三步（兩張名片：A 發案者、B 隊員）──
  step('login-owner', 'A `POST /api/login` 暱稱 → 200 ProfileOut', { status: 200 }, 'FE-A08'),
  step('login-member', 'B `POST /api/login` 暱稱 → 200 ProfileOut', { status: 200 }, 'FE-A08'),
  step('create', 'A `POST /api/projects`（seat_count 2）→ 201 ProjectOut、recruiting、expires_at 在建立後 7 天（±5 分）', { status: 201, projectStatus: 'recruiting', seatCount: 2, expiresDays: 7, toleranceMinutes: 5 }, 'FE-J01'),
  step('list-contains', 'B `GET /api/projects` → 200 ProjectOut[]，含剛建的 id', { status: 200 }, 'FE-B02'),
  step('get', 'B `GET /api/projects/{id}` → 200 ProjectOut，同一個 id', { status: 200 }, 'FE-B03'),
  step('form-team', 'A `POST …/form-team` 密碼 → 200 ProjectOut、active、room_template 是整數', { status: 200, projectStatus: 'active' }, 'FE-J04'),
  step('rooms-contains', 'B `GET /api/rooms` → 200 RoomDoorOut[]，含它', { status: 200 }, 'FE-J04'),
  step('enter', 'B `POST …/enter` 正確密碼 → 200 EnterOut', { status: 200 }, 'FE-N08'),
  step('seats-empty', 'B `GET …/seats` → 200 []', { status: 200 }, 'FE-J13'),
  step('seat-claim', 'B `POST …/seats` seat_index 0 → 201 SeatOut，user_id 是 B', { status: 201, seatIndex: 0 }, 'FE-J13'),
  step('message', 'B `POST /api/messages` 給 A → 201 MessageOut', { status: 201 }, 'FE-K01'),
  step('close', 'A `POST …/close` → 200 ProjectOut、closed', { status: 200, projectStatus: 'closed' }, 'FE-J04'),
  step('rooms-excludes', 'B `GET /api/rooms` → 200，不含它', { status: 200 }, 'FE-J04'),

  // ── 十條基線（各自建自己的專案，互不依賴）──
  anomaly('create-unvalidated', '`POST /api/projects` 空 title、seat_count 0 與 9 都 201', { status: 201, title: '', seatCountLow: 0, seatCountHigh: 9 }, 'FE-J01'),
  contract('list-default-recruiting', '`GET /api/projects` 不帶 status 只回 recruiting；`?status=active` 才回成軍的', { status: 200, defaultStatus: 'recruiting', filter: 'active' }, 'FE-J01'),
  contract('form-team-repeat', '成軍後再成軍 200 換密碼：舊密碼 enter 403、新密碼 200', { status: 200, oldPasswordEnter: 403, newPasswordEnter: 200 }, 'FE-J04'),
  anomaly('form-team-after-close', 'closed 之後成軍 200、狀態回到 active、`/api/rooms` 再含它', { status: 200, projectStatus: 'active' }, 'FE-J04'),
  contract('seat-409-detail', '同一人再坐 409「你已經在這個房間有座位了」；坐別人的位 409「這個座位已經有人了」', { status: 409, ownSeat: '你已經在這個房間有座位了', taken: '這個座位已經有人了' }, 'FE-J13'),
  contract('seat-out-of-range', 'seat_index ≥ seat_count 是 400，訊息含座位數', { status: 400 }, 'FE-J13'),
  contract('owner-needs-enter', '發案者沒 enter 也看不到座位（403）', { status: 403 }, 'FE-J13'),
  contract('close-idempotent', '重複結案 200', { status: 200 }, 'FE-J04'),
  contract('close-clears-seats', '結案後 `GET …/seats`（持有效 token）是 []', { status: 200 }, 'FE-J04'),
  anomaly('close-keeps-token', '結案後隊員用舊 token 仍能 `POST …/seats` 201', { status: 201 }, 'FE-J13'),
]

/** 演練測試用：拿一條，沒有就拋（打錯 key 在測試載入時就紅，不會在斷言裡變成 undefined 對 undefined）。 */
export function expectation(key: string): Expectation {
  const e = EXPECTATIONS.find((x) => x.key === key)
  if (!e) throw new Error(`期望表沒有 \`${key}\``)
  return e
}
