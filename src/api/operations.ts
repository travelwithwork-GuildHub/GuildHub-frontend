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

export async function getMyProfile() {
  return send('getMyProfile', { method: 'GET', path: '/api/profiles/me' }, contract.ProfileOut)
}

export async function updateMyProfile(input: contract.ProfileUpdate) {
  return send('updateMyProfile', {
    method: 'PATCH',
    path: '/api/profiles/me',
    body: contract.ProfileUpdate.parse(input),
  }, contract.ProfileOut)
}

export async function listProfiles() {
  return send('listProfiles', { method: 'GET', path: '/api/profiles' }, z.array(contract.ProfileOut))
}

export async function getProfile(profileId: string) {
  return send(
    'getProfile',
    { method: 'GET', path: '/api/profiles/{profile_id}', params: { profile_id: profileId } },
    contract.ProfileOut,
  )
}

// ---------------------------------------------------------------- 專案

export async function listProjects() {
  return send('listProjects', { method: 'GET', path: '/api/projects' }, z.array(contract.ProjectOut))
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
export async function listRooms() {
  return send('listRooms', { method: 'GET', path: '/api/rooms' }, z.array(contract.RoomDoorOut))
}
