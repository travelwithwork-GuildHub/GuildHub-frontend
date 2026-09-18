import { z } from 'zod'
import { LIMITS } from './limits'

// REST 契約。規格 FE-O01「資料形狀只有一份定義」。
//
// **範圍是真後端今天存在的 21 個 `/api/*` 端點**：原本凍結的 16 個
// （`API-前端整合指南.md` §5，後端 `tests/test_contract.py` 鎖住）、
// 2026-09-08 L3 裁決加的 `POST /api/register`（原文寫 16 時漏了它），
// 以及 `BE-G12` 的專案資源四個。
// Role / Application / Invitation / Offer 後端沒有（`BE-G10`），
// 刻意不出現在這裡 —— 它們由各自的工作項目在自己那一週加進來。
//
// ⚠️ **限制值一律從 `limits.ts` 讀，不在這個檔案寫任何數字。**
//
// 長度限制只加在**送出去的**東西上。回來的資料不加 ——
// 它已經通過後端的資料庫 check 了，前端再擋一次只會在後端改上限時
// 讓畫面整個掛掉，而那不是前端該做的判斷。

const uuid = z.string()
const datetime = z.string()

// ---------------------------------------------------------------- 身分

/**
 * `POST /api/login`。**三種入場方式，剛好給一組。**
 *
 * | 給的東西 | 意思 |
 * |---|---|
 * | `nickname` | 建立一張新名片 |
 * | `resume_token` | 拿回既有的名片。它就是 `ProfileOut.id`，登入時已經回過了 |
 * | `login_id` ＋ `password` | 帳號密碼登入（L3）。**只有這一種在驗證身分** |
 *
 * ⚠️ **每一欄都是選填，但「都不給」跟「給兩組」一樣是 422。**
 * 後端刻意不做「都給就以某一邊為準」——那是在互相打架的意圖裡自己挑一邊信，
 * 而呼叫端不會知道被挑掉的是哪一個。
 *
 * ⚠️ **「剛好一組」今天沒有被前端擋住，而理由不是技術限制。**
 * 這裡原本寫著「不能用 `.refine()`，會打斷 `drift.ts` 的雙向型別相等」——
 * **那句話是錯的，實測過**：`z.infer` 對 refine 前後完全一樣
 *（`Equal<z.infer<typeof Plain>, z.infer<typeof Refined>>` 是 `true`），
 * 而且 refine 過的 schema 仍然指派得進 `z.ZodType`。
 *
 * 真正的理由是**已合併的規格裡沒有任何一條 Scenario 要求它**。
 * 送一組非法組合過去，後端回 422 —— 而前端要不要先擋、擋了要怎麼讓使用者知道，
 * 是一條要先談定的 Requirement，不是實作順手加的防禦
 *（`AGENTS.md`：規格沒談定之前不寫產品程式碼）。
 * 這一條列進 `tasks.md` 5.1 送審的清單。
 *
 * ⚠️ `nickname` 直接寫進 `profiles.display_name`（`auth.py` 的 insert），
 * 所以它吃的是 display_name 的 1–20 —— **超長會是資料庫錯誤，回 500**。
 *
 * ⚠️ **`resume_token` 不是密碼。** 拿到它的人就是那張名片的人。
 * 它解掉的是「清掉 cookie 或換一台電腦就再也回不去」（`BE-G01`），
 * 不是「證明這個身分屬於我」。這件事要讓使用者知道，判準在 `FE-A01-S09`。
 */
export const LoginIn = z.object({
  nickname: z
    .string()
    .min(LIMITS.displayName.min)
    .max(LIMITS.displayName.max)
    .nullable()
    .optional(),
  resume_token: z.string().nullable().optional(),
  login_id: z.string().min(LIMITS.loginId.min).max(LIMITS.loginId.max).nullable().optional(),
  password: z.string().min(LIMITS.password.min).nullable().optional(),
})

/**
 * `POST /api/register`。帳號密碼註冊（L3，後端 9/8 裁決）。
 *
 * 進契約層的時候（`FE-A01` 第一刀）`operations.ts` 刻意沒有對應的操作 —— 註冊 UI 是 `FE-A01` 的 Non-goal，
 * 憑空補一個沒有呼叫端的 `register()` 只會是殭屍程式碼；它出現在這裡是為了 `drift.ts` 的**涵蓋率斷言**
 *（後端多一個實體那條斷言會紅）。`FE-A08` 把呼叫端做出來了：`operations.register()` → `session.ts` 的 `registerAccount`。
 *
 * ⚠️ 真後端只有 `password` 有 Pydantic 長度；`login_id` 3–32 與 `nickname` 1–20 是資料庫的 check（超出是 500），
 * 所以這裡的長度是**前端送出前**的擋法（`LIMITS` 記著出處）。
 */
export const RegisterIn = z.object({
  login_id: z.string().min(LIMITS.loginId.min).max(LIMITS.loginId.max),
  password: z.string().min(LIMITS.password.min),
  nickname: z.string().min(LIMITS.displayName.min).max(LIMITS.displayName.max),
})

export const ProfileOut = z.object({
  id: uuid,
  display_name: z.string(),
  /**
   * 後端存的是單一個 `smallint`。合約語意是「前端據此挑角色圖」，
   * 也就是**角色索引** —— **不是**六維設定的編碼欄位（`BE-G04`，待裁決）。
   */
  avatar_id: z.number(),
  skills: z.array(z.string()),
  hours_per_week: z.number().nullable(),
  bio: z.string().nullable(),
  updated_at: datetime,
})

/**
 * `PATCH /api/profiles/me`。**未給的欄位不動**，所以每一欄都是選填。
 *
 * 送 `null` 跟不送是兩件事：`null` 會把欄位清空。
 */
export const ProfileUpdate = z.object({
  display_name: z
    .string()
    .min(LIMITS.displayName.min)
    .max(LIMITS.displayName.max)
    .nullable()
    .optional(),
  avatar_id: z.number().nullable().optional(),
  skills: z.array(z.string()).nullable().optional(),
  hours_per_week: z.number().nullable().optional(),
  bio: z.string().max(LIMITS.bio.max).nullable().optional(),
})

// ---------------------------------------------------------------- 專案

export const ProjectStatus = z.enum(['recruiting', 'active', 'closed'])

/**
 * `POST /api/projects`。
 *
 * `needed_skills` 與 `seat_count` 在後端有預設值，可以不送 —— 用 `.default()`
 * 讓**輸入**可以省略、**輸出**是必填，正好對上產出的型別。
 *
 * ⚠️ `title` 與 `body` **後端什麼都不驗**（Pydantic 只有 `str`；`sql/001_schema.sql` 沒有 check，連空字串都收），
 * 所以這裡**只有型別**：沒有 `.max()`、也沒有 `.min()` —— 替身的 `POST /api/projects` 拿它解析 body（`FE-J01`），
 * 掛了 `.min(1)` 的話替身會對空字串回 422、真後端回 201，那是替身比真後端「好用」的假象（審查抓到的）。
 * 使用者面向的上限由 `FE-X05` 的 `FORM_LIMITS` 在表單層守。
 * `seat_count` 是 Pydantic 的 `int`：`2.5` 在真後端是 422，所以這裡是 `.int()`（`z.number()` 會放過它、再撞資料庫的 smallint → 500）。
 */
export const ProjectCreate = z.object({
  title: z.string(),
  body: z.string(),
  needed_skills: z.array(z.string()).default([]),
  seat_count: z.number().int().default(4),
})

export const ProjectOut = z.object({
  id: uuid,
  owner_id: uuid,
  title: z.string(),
  body: z.string(),
  needed_skills: z.array(z.string()),
  status: ProjectStatus,
  room_template: z.number().nullable(),
  seat_count: z.number(),
  expires_at: datetime,
  updated_at: datetime,
})

/** `POST /api/projects/{id}/form-team`。成軍時強制設定房間密碼。 */
export const FormTeamIn = z.object({ password: z.string() })

/** `POST /api/projects/{id}/enter`。房間密碼**綁專案，不綁人**。 */
export const EnterIn = z.object({ password: z.string() })

/** room token 的 TTL 是 8 小時，過期要重新 `/enter`（`FE-R12` 會用到）。 */
export const EnterOut = z.object({ room_token: z.string() })

// ---------------------------------------------------------------- 座位

/**
 * `POST /api/projects/{id}/seats`。
 *
 * ⚠️ **409 是正常流程，不是例外** —— 座位認領靠資料庫唯一鍵擋，不是先查再寫。
 * 兩個人同時點同一格，其中一個一定會收到 409。
 *
 * `seat_index` 除了這裡的 0–7，還必須小於該專案的 `seat_count`
 * （應用層擋，回 400）。那是每個專案不同的值，contract 擋不到。
 */
export const SeatClaim = z.object({
  seat_index: z.number().int().min(LIMITS.seatIndex.min).max(LIMITS.seatIndex.max),
  desk_template: z.number().default(0),
})

export const SeatOut = z.object({
  seat_index: z.number(),
  user_id: uuid,
  desk_template: z.number(),
  claimed_at: datetime,
})

// ---------------------------------------------------------------- 站內信

/** `POST /api/messages`。**不能寄給自己**（資料庫 `no_self_send`，回 400）。 */
export const MessageCreate = z.object({
  recipient_id: uuid,
  body: z.string().min(LIMITS.messageBody.min).max(LIMITS.messageBody.max),
})

/**
 * ⚠️ `read_at` **永遠是 `null`** —— 後端沒有標記已讀的端點（`BE-G06`）。
 * 未讀狀態目前只能做在前端。
 *
 * 收件與寄件**混在同一份清單**（後端如此），要靠 `sender_id` 分。
 */
export const MessageOut = z.object({
  id: uuid,
  sender_id: uuid,
  recipient_id: uuid,
  body: z.string(),
  created_at: datetime,
  read_at: datetime.nullable(),
})

// ---------------------------------------------------------------- 專案資源

/**
 * `project_resources.type`。**封閉集合，V1 沒有 `other`** ——
 * 未分類的連結會讓前端的圖示推導失去意義（後端 `models.py::ResourceType` 的理由）。
 *
 * 跟 `ProjectStatus` 一樣鏡像資料庫的 check：留給資料庫的話，打錯一個字是 500 不是 422。
 */
export const ResourceType = z.enum(['github', 'figma', 'notion', 'drive', 'meeting'])

/**
 * `POST /api/projects/{project_id}/resources`。
 *
 * ⚠️ 長度是**資料庫的 check**，應用層刻意不重複驗（後端 `[P15]`）——
 * 也就是說超長在後端是 **500 不是 422**，所以前端非擋不可。數字從 `LIMITS` 來。
 *
 * ⚠️ 另外兩條 check（`btrim(label) <> ''`、`url ~* '^https?://…'`）**不寫在這裡**：
 * 它們不是長度，而網址要送**原字串**（不正規化、不 trim），前端擋的是
 * 「`safeHref` 不過」或「含空白」—— 那是表單層的事（`project-resources` 的 `S11`／`S13`）。
 * 契約多擋一層的話，後端收得下的網址會在前端被拒，而使用者只看到「打不進去」。
 */
export const ProjectResourceCreate = z.object({
  label: z.string().min(LIMITS.resourceLabel.min).max(LIMITS.resourceLabel.max),
  type: ResourceType,
  url: z.string().min(LIMITS.resourceUrl.min).max(LIMITS.resourceUrl.max),
})

/**
 * `PATCH /api/projects/{project_id}/resources/{resource_id}`。
 *
 * ⚠️⚠️ **三個欄位都用 `.optional()`，不准用 `.nullable()`。**
 * 後端三欄在資料庫都是 NOT NULL、Pydantic 的型別是 `str`（預設值 `None` 只代表
 * 「這次沒給」，由 `model_fields_set` 分辨），所以明確送 `{"label": null}` 是 422。
 * 寫成 `.nullable()` 的話 `drift.ts` 的雙向相等會紅 —— 而**放寬那條斷言來遷就它是禁止的**。
 */
export const ProjectResourceUpdate = z.object({
  label: z.string().min(LIMITS.resourceLabel.min).max(LIMITS.resourceLabel.max).optional(),
  type: ResourceType.optional(),
  url: z.string().min(LIMITS.resourceUrl.min).max(LIMITS.resourceUrl.max).optional(),
})

/**
 * 資源的輸出。**沒有 `updated_at`** —— 後端那張表只有 `created_at`
 * （`sql/001_schema.sql:94`～`103`），清單固定以 `(created_at, id)` 排序。
 *
 * 回來的資料**不加長度限制**（檔頭那條規則）：它已經過了後端的 check，
 * 前端再擋一次只會在後端改上限的那天讓整個面板掛掉。
 */
export const ProjectResourceOut = z.object({
  id: uuid,
  project_id: uuid,
  label: z.string(),
  type: ResourceType,
  url: z.string(),
  created_at: datetime,
})

// ---------------------------------------------------------------- 走廊門位

/** ⚠️ `online_count` 只在 REST 回應裡，**不會自己更新** —— 要自行輪詢。 */
export const RoomDoorOut = z.object({
  project_id: uuid,
  title: z.string(),
  online_count: z.number(),
})

// ---------------------------------------------------------------- 型別

export type LoginIn = z.infer<typeof LoginIn>
export type RegisterIn = z.infer<typeof RegisterIn>
export type ProfileOut = z.infer<typeof ProfileOut>
export type ProfileUpdate = z.infer<typeof ProfileUpdate>
export type ProjectStatus = z.infer<typeof ProjectStatus>
export type ProjectCreate = z.infer<typeof ProjectCreate>
export type ProjectOut = z.infer<typeof ProjectOut>
export type FormTeamIn = z.infer<typeof FormTeamIn>
export type EnterIn = z.infer<typeof EnterIn>
export type EnterOut = z.infer<typeof EnterOut>
export type SeatClaim = z.infer<typeof SeatClaim>
export type SeatOut = z.infer<typeof SeatOut>
export type MessageCreate = z.infer<typeof MessageCreate>
export type MessageOut = z.infer<typeof MessageOut>
export type RoomDoorOut = z.infer<typeof RoomDoorOut>
export type ResourceType = z.infer<typeof ResourceType>
export type ProjectResourceCreate = z.infer<typeof ProjectResourceCreate>
export type ProjectResourceUpdate = z.infer<typeof ProjectResourceUpdate>
export type ProjectResourceOut = z.infer<typeof ProjectResourceOut>
