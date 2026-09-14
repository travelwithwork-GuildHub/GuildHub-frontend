// 房間票的持有。規格 `FE-V01-S14`（design D5）。
//
// 後端把票存進 session cookie 的 `room_tokens`，但**沒有端點讀得回來**；`/ws?token=` 又必須由前端帶上。
// 所以前端要自己留一份 —— `sessionStorage`：重新整理不掉、每個分頁一份。
//
// ⚠️ **鍵含身分。** 同一個分頁登出、換帳號登入，鍵只含 `projectId` 的話會讀到前一個帳號的票，握手必敗一次。
// ⚠️ **不是安全邊界。** 同源 XSS 讀得到；「複製分頁」會帶走初始副本。安全靠 CSP／輸出安全與後端 8 小時 TTL，
//    「一個身分一條連線」靠分頁資格（`multi-tab`），不靠票不共享。
// ⚠️ **不解析票的內容**：那是後端的格式，只在它的 process 裡有意義。過期與否由握手告訴我們。
//
// 誰寫進去：`FE-N08` 的 `enter` 成功時。今天只有測試會寫。

const PREFIX = 'guildhub.roomToken.'

const keyOf = (profileId: string, projectId: string) => `${PREFIX}${profileId}.${projectId}`

/**
 * `sessionStorage` 可能不可用（隱私模式、被停用、配額滿）—— 取得它**與**每一個操作都可能拋。
 * 那時當成沒有票、寫不進去也不拋：票只是可用性，沒有它就是走到門前再拿一次。
 */
function withStorage<T>(fallback: T, run: (storage: Storage) => T): T {
  try {
    return run(window.sessionStorage)
  } catch {
    return fallback
  }
}

export function holdRoomToken(profileId: string, projectId: string, token: string): void {
  withStorage(undefined, (storage) => storage.setItem(keyOf(profileId, projectId), token))
}

export function heldRoomToken(profileId: string, projectId: string): string | null {
  return withStorage(null, (storage) => storage.getItem(keyOf(profileId, projectId)))
}

export function dropRoomToken(profileId: string, projectId: string): void {
  withStorage(undefined, (storage) => storage.removeItem(keyOf(profileId, projectId)))
}
