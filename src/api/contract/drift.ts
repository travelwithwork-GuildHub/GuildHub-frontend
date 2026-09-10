import type { z } from 'zod'
import type { components } from './schema'
import * as rest from './rest'
import { ValidationError } from './errors'

// 後端漂移哨兵。規格 FE-O01「後端形狀改變時 typecheck 要變紅」。
//
// 這個檔案不匯出任何執行期的東西給別人用，它存在的唯一理由是**讓 tsc 變紅**。
//
// ⚠️ **`schema.d.ts` 不是型別來源** —— 型別的來源是 `rest.ts` 的 Zod。
// 產出的那份只被這裡 import，用途是對照。細節見 `GENERATED.md`。
//
// ⚠️ **這個哨兵會過期。** 它比對的是**上次產出時**的後端形狀，
// 沒有人跑 `npm run contract:generate` 的話它永遠是綠的。
// 把它當成即時的後端漂移偵測器是高估它。

/**
 * 雙向的型別相等。
 *
 * **不能用 `extends`** —— 單向相容會讓「後端多一個欄位」靜靜通過，
 * 而那正是要被看到的那種變更。
 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false

type Expect<T extends true> = T

/**
 * 實體登錄表：名稱 → 契約 schema。
 *
 * **少了這張表，下面每一條相等斷言都是空的** —— 把它們整個刪掉，
 * typecheck 照樣綠（沒有斷言的檔案當然不會有型別錯誤），
 * 而且後端**新增**一個實體時也不會紅，因為沒有人替它寫斷言。
 *
 * 這張表把「有沒有涵蓋」變成型別系統答得出來的問題。
 */
const ENTITIES = {
  EnterIn: rest.EnterIn,
  EnterOut: rest.EnterOut,
  FormTeamIn: rest.FormTeamIn,
  LoginIn: rest.LoginIn,
  MessageCreate: rest.MessageCreate,
  MessageOut: rest.MessageOut,
  ProfileOut: rest.ProfileOut,
  ProfileUpdate: rest.ProfileUpdate,
  ProjectCreate: rest.ProjectCreate,
  ProjectOut: rest.ProjectOut,
  ProjectStatus: rest.ProjectStatus,
  RegisterIn: rest.RegisterIn,
  RoomDoorOut: rest.RoomDoorOut,
  SeatClaim: rest.SeatClaim,
  SeatOut: rest.SeatOut,
  ValidationError,
} as const

/**
 * `HTTPValidationError` 是框架的**包裝層**，不是一個領域實體 ——
 * 它就是 `{detail?: ValidationError[]}`，而我們的 envelope 把 `detail`
 * 的兩種形狀合在一起表達（見 `errors.ts`），形狀本來就不會相等。
 *
 * **這是唯一一個排除項，而且要寫出理由。** 這裡多排除一個，
 * 涵蓋率那條斷言就少看一個實體。
 */
type NotAnEntity = 'HTTPValidationError'

type BackendEntities = Exclude<keyof components['schemas'], NotAnEntity>

// ── 涵蓋率：登錄表的鍵必須「剛好」等於後端的實體集合 ────────────────
//
// 後端新增一個實體  → 少涵蓋 → 紅
// 後端刪掉一個實體  → 多涵蓋 → 紅
// 有人刪掉登錄表項目 → 少涵蓋 → 紅
type _coverage = Expect<Equal<keyof typeof ENTITIES, BackendEntities>>

// ── 形狀：每一個實體各自相等 ──────────────────────────────────────
//
// `z.infer` 取的是**輸出**型別。`ProjectCreate` 的 `needed_skills` 用了
// `.default()`，所以輸入可以省略、輸出是必填 —— 正好對上產出的型別。

type Schema<K extends BackendEntities> = components['schemas'][K]
type Inferred<K extends keyof typeof ENTITIES> = z.infer<(typeof ENTITIES)[K]>

type _EnterIn = Expect<Equal<Inferred<'EnterIn'>, Schema<'EnterIn'>>>
type _EnterOut = Expect<Equal<Inferred<'EnterOut'>, Schema<'EnterOut'>>>
type _FormTeamIn = Expect<Equal<Inferred<'FormTeamIn'>, Schema<'FormTeamIn'>>>
type _LoginIn = Expect<Equal<Inferred<'LoginIn'>, Schema<'LoginIn'>>>
type _MessageCreate = Expect<Equal<Inferred<'MessageCreate'>, Schema<'MessageCreate'>>>
type _MessageOut = Expect<Equal<Inferred<'MessageOut'>, Schema<'MessageOut'>>>
type _ProfileOut = Expect<Equal<Inferred<'ProfileOut'>, Schema<'ProfileOut'>>>
type _ProfileUpdate = Expect<Equal<Inferred<'ProfileUpdate'>, Schema<'ProfileUpdate'>>>
type _ProjectCreate = Expect<Equal<Inferred<'ProjectCreate'>, Schema<'ProjectCreate'>>>
type _ProjectOut = Expect<Equal<Inferred<'ProjectOut'>, Schema<'ProjectOut'>>>
type _ProjectStatus = Expect<Equal<Inferred<'ProjectStatus'>, Schema<'ProjectStatus'>>>
type _RegisterIn = Expect<Equal<Inferred<'RegisterIn'>, Schema<'RegisterIn'>>>
type _RoomDoorOut = Expect<Equal<Inferred<'RoomDoorOut'>, Schema<'RoomDoorOut'>>>
type _SeatClaim = Expect<Equal<Inferred<'SeatClaim'>, Schema<'SeatClaim'>>>
type _SeatOut = Expect<Equal<Inferred<'SeatOut'>, Schema<'SeatOut'>>>
type _ValidationError = Expect<Equal<Inferred<'ValidationError'>, Schema<'ValidationError'>>>

/**
 * 給測試用的：登錄表涵蓋了哪些實體。
 *
 * 涵蓋率本身是型別層的斷言（`_coverage`），這裡只是讓測試能印出清單，
 * **不是**第二套判定 —— 測試斷言它非空、與 `ENTITIES` 同步即可。
 */
export const COVERED_ENTITIES = Object.keys(ENTITIES).sort()
