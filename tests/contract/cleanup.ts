import type { ContractClient } from './client'

// 測試建的 active 專案要收拾乾淨。**這不是潔癖，是判準之間會互相踩到。**
//
// 走廊只有 12 個門位（`rooms.py` 的 `DOOR_SLOTS`；本地 `activeRooms()` 是 `order by updated_at desc limit 12`），
// 而 `FE-O03-S17`／`S22` 驗的是「seed 的兩間 active 專案出現在 `GET /api/rooms` 裡」。
// seed 那兩列的 `updated_at` 是最舊的 —— 每多一個沒收掉的 active 專案，它們就往後擠一格，
// 到第 11 個就把 seed 擠出門位，S17／S22 變成**跟自己無關的紅**。
//
// `vitest.contract.mts` 是 `fileParallelism: false`，檔案一個接一個跑，所以「每個檔跑完歸零」就夠：
// 建 active 專案的檔案在 `afterAll` 呼叫 `closeTrackedProjects()`，殘留就是 0。
//
// 用 `close` 不是 SQL delete：那是**端點自己的語意**（冪等、任何 status 都收），
// 兩個目標都走同一條路，收拾這件事不需要知道自己在打誰（`FE-O05-S02`）。

const created: Array<{ client: ContractClient; projectId: string }> = []

/** 建完 active 專案就登記；回傳原 id，方便串在建案那一行後面。 */
export function trackProject(client: ContractClient, projectId: string): string {
  created.push({ client, projectId })
  return projectId
}

/** 把這個檔案登記過的專案全部結案。收拾失敗不讓測試紅 —— 那不是判準。 */
export async function closeTrackedProjects(): Promise<void> {
  while (created.length > 0) {
    const one = created.pop()
    if (one === undefined) return
    try {
      await one.client.raw('POST', `/api/projects/${one.projectId}/close`)
    } catch {
      // 收拾是盡力而為：後端已經關掉、或 client 的 session 沒了，都不該蓋掉真正的失敗。
    }
  }
}
