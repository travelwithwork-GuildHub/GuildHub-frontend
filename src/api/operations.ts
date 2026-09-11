import { z } from 'zod'
import * as contract from './contract/rest'
import { send } from './transport'

// Domain operations。規格 `FE-O02`。
//
// ⚠️ **元件從這裡拿資料，不自己 `fetch`。** `eslint.config.mjs` 有一條規則擋著，
// 而理由寫在 `CLAUDE.md`：散在各處的 `fetch` 讓「之後接真後端」變成重寫不是切換。
//
// ⚠️ **每個操作在送出之前先用契約驗輸入。** 後端對不合協定的請求是
// 422 帶結構化 detail，或者更糟 —— `rest.ts` 記著 `POST /api/login` 超長暱稱
// 是資料庫錯誤、回 500。在這裡失敗，錯誤才指得到呼叫點。
//
// ⚠️⚠️ **這裡只有真後端今天有的端點。**
// Role／Application／Invitation／Offer 四個 domain 後端沒有（`BE-G10`），
// 契約層也刻意不涵蓋它們 —— **不要在這裡憑空定介面**。
// 等後端真的開出來，那個憑空的介面幾乎一定不合，而那時要先改介面才能接。
// `tests/api-domain-scope.test.ts` 有一條檢查擋著這件事。
//
// ⚠️ **每個操作都是 `async`，即使它只是 return 一個 promise。**
// 不加的話，契約驗證失敗會是**同步拋出**的 —— 而這些函式的型別是
// `Promise<T>`，呼叫端會寫 `op().catch(…)`，那條 catch 接不到同步的錯。
// 症狀是「明明包了 catch 卻整個炸掉」。實測踩到過。

// ---------------------------------------------------------------- 身分

export async function login(input: contract.LoginIn) {
  return send('login', {
    method: 'POST',
    path: '/api/login',
    body: contract.LoginIn.parse(input),
  }, contract.ProfileOut)
}

/**
 * ⚠️ **路徑是 `/api/me`，不是 `/api/profiles/me`。**
 * 後者只有 `PATCH`（見下面那個操作）—— 它的 `GET` 從來不存在，
 * 而這個函式打了它好幾週沒有人發現，因為
 * `tests/api-operations-coverage.test.ts` 把同一個錯字串抄進了斷言。
 * 現在 `RequestSpec.path` 綁住了型別，這一行改錯會 typecheck 紅（`FE-A01-S14`）。
 */
export async function getMyProfile() {
  return send('getMyProfile', { method: 'GET', path: '/api/me' }, contract.ProfileOut)
}

export async function updateMyProfile(input: contract.ProfileUpdate) {
  return send('updateMyProfile', {
    method: 'PATCH',
    path: '/api/profiles/me',
    body: contract.ProfileUpdate.parse(input),
  }, contract.ProfileOut)
}

/**
 * 人才清單。規格 `FE-B01-S04`／`S05`。
 *
 * ⚠️⚠️ **分頁參數是 `page`，0-based，沒有 `limit`。**
 * `docs/WBS.md` 的 `FE-B01` 那一列寫的是「offset 翻頁」，**跟契約對不上** ——
 * 後端收 `page`，換算成 SQL `offset` 是它內部的事：
 *
 *     async def list_profiles(page: int = 0, ...):
 *         "... limit $1 offset $2", PAGE_SIZE, max(page, 0) * PAGE_SIZE
 *
 * **沒有 `limit` 代表不能多抓一筆來探測有沒有下一頁** —— 那是兩個外部審查者
 * 第一輪都選為最乾淨的方案，而它在這個契約下做不到（見 `design.md` 的 `D1`）。
 *
 * ⚠️ **超過尾頁回空陣列，不是 404。** 翻到底是正常操作，不是錯誤。
 */
export async function listProfiles(options: { page?: number; signal?: AbortSignal } = {}) {
  return send(
    'listProfiles',
    { method: 'GET', path: '/api/profiles', query: { page: options.page }, signal: options.signal },
    z.array(contract.ProfileOut),
  )
}

/** 一張名片。`signal` 給詳情面板中止用（`FE-B04-S09`：換人時前一個請求要中止）。 */
export async function getProfile(profileId: string, options: { signal?: AbortSignal } = {}) {
  return send(
    'getProfile',
    {
      method: 'GET',
      path: '/api/profiles/{profile_id}',
      params: { profile_id: profileId },
      signal: options.signal,
    },
    contract.ProfileOut,
  )
}

// ---------------------------------------------------------------- 專案

/**
 * 案件清單。規格 `FE-B01-S04`／`S05`。分頁同 `listProfiles`。
 *
 * ⚠️ **`status` 刻意沒有開出來。** 契約有這個參數（預設 `recruiting`），
 * 但 `FE-B01` 的畫面上沒有任何東西可以切換它 —— 那是 `FE-B05`（W6，
 * 被 `BE-G05` 擋）。現在開出來是替一個觸發不了的情境預先建模。
 *
 * ⚠️ 而這件事**已經寫進了 request identity 的設計**：`FE-B05` 來的時候
 * 把 `status` 加進 identity 即可，提交規則與 `S14`／`S15` 不用重寫（`design.md` 的 `D3`）。
 */
export async function listProjects(options: { page?: number; signal?: AbortSignal } = {}) {
  return send(
    'listProjects',
    { method: 'GET', path: '/api/projects', query: { page: options.page }, signal: options.signal },
    z.array(contract.ProjectOut),
  )
}

export async function createProject(input: contract.ProjectCreate) {
  return send('createProject', {
    method: 'POST',
    path: '/api/projects',
    body: contract.ProjectCreate.parse(input),
  }, contract.ProjectOut)
}

export async function getProject(projectId: string) {
  return send(
    'getProject',
    { method: 'GET', path: '/api/projects/{project_id}', params: { project_id: projectId } },
    contract.ProjectOut,
  )
}

export async function formTeam(projectId: string, input: contract.FormTeamIn) {
  return send(
    'formTeam',
    {
      method: 'POST',
      path: '/api/projects/{project_id}/form-team',
      params: { project_id: projectId },
      body: contract.FormTeamIn.parse(input),
    },
    contract.ProjectOut,
  )
}

export async function closeProject(projectId: string) {
  return send(
    'closeProject',
    {
      method: 'POST',
      path: '/api/projects/{project_id}/close',
      params: { project_id: projectId },
    },
    contract.ProjectOut,
  )
}

/** room token 的 TTL 是 8 小時，過期要重新呼叫（`FE-R12`）。 */
export async function enterProject(projectId: string, input: contract.EnterIn) {
  return send(
    'enterProject',
    {
      method: 'POST',
      path: '/api/projects/{project_id}/enter',
      params: { project_id: projectId },
      body: contract.EnterIn.parse(input),
    },
    contract.EnterOut,
  )
}

// ---------------------------------------------------------------- 座位

export async function listSeats(projectId: string) {
  return send(
    'listSeats',
    {
      method: 'GET',
      path: '/api/projects/{project_id}/seats',
      params: { project_id: projectId },
    },
    z.array(contract.SeatOut),
  )
}

/** ⚠️ **409 是正常流程** —— 兩個人同時點同一格，其中一個一定會收到它。 */
export async function claimSeat(projectId: string, input: contract.SeatClaim) {
  return send(
    'claimSeat',
    {
      method: 'POST',
      path: '/api/projects/{project_id}/seats',
      params: { project_id: projectId },
      body: contract.SeatClaim.parse(input),
    },
    contract.SeatOut,
  )
}

// ---------------------------------------------------------------- 站內信

/** ⚠️ 收件與寄件**混在同一份清單**（後端如此），要靠 `sender_id` 分。 */
export async function listMessages() {
  return send('listMessages', { method: 'GET', path: '/api/messages' }, z.array(contract.MessageOut))
}

export async function sendMessage(input: contract.MessageCreate) {
  return send('sendMessage', {
    method: 'POST',
    path: '/api/messages',
    body: contract.MessageCreate.parse(input),
  }, contract.MessageOut)
}

// ---------------------------------------------------------------- 走廊門位

/** ⚠️ `online_count` **不會自己更新** —— 要自行輪詢。 */
/**
 * ⚠️ **這是整份 operations 裡唯一收 `signal` 的**，因為它是唯一被**輪詢**的。
 * `FE-W12` 的契約要求「頁籤不可見時**中止**進行中的請求」——
 * 只把結果標成「不採用」的話那個請求仍然在飛，
 * 而「同時最多一個進行中」會被違反。
 */
export async function listRooms(options: { signal?: AbortSignal } = {}) {
  return send(
    'listRooms',
    { method: 'GET', path: '/api/rooms', signal: options.signal },
    z.array(contract.RoomDoorOut),
  )
}
