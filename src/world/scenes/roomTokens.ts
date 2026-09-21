// 房間票的持有。規格 `FE-V01-S14`（design D5）＋ `FE-N08`（`fe-n08-room-ticket-in-memory` 反轉：記憶體為主）。
//
// 後端把票存進 session cookie 的 `room_tokens`，但**沒有端點讀得回來**；`/ws?token=` 又必須由前端帶上。
// 所以前端要自己留一份。
//
// ⚠️⚠️ **這一場的權威是記憶體，`sessionStorage` 只是「重整後還記得」的持久層。**
// 為什麼：`sessionStorage` 在真實瀏覽器上**會被擋**（隱私擴充套件、站台儲存設定、部分無痕）——
// 而 cookie 沒被擋，所以 `POST /enter` 照樣成功、票也拿到了，卻因為「寫進 storage→讀回一致」失敗
// 被硬擋在門口（demo 實測：一整隊在正常視窗都進不了房間，只有無痕能進）。把權威放記憶體之後，
// **storage 存不進也照樣進得了這一場的房間**；只有「重整頁面」後才靠 storage 撿回票，撿不回就走到門前再拿一次。
//
// ⚠️ **鍵含身分。** 同一個分頁登出、換帳號登入，鍵只含 `projectId` 的話會讀到前一個帳號的票，握手必敗一次。
// ⚠️ **不是安全邊界。** 同源 XSS 讀得到；「複製分頁」會帶走初始副本。安全靠 CSP／輸出安全與後端 8 小時 TTL，
//    「一個身分一條連線」靠分頁資格（`multi-tab`），不靠票不共享。
// ⚠️ **不解析票的內容**：那是後端的格式，只在它的 process 裡有意義。過期與否由握手告訴我們。
//
// 誰寫進去：`FE-N08` 的 `enter` 成功時（`RoomPasswordDialog`）。誰丟：使用者按「重新輸入密碼」（`SceneNotices`）—— 系統自己不丟。

const PREFIX = 'guildhub.roomToken.'

const keyOf = (profileId: string, projectId: string) => `${PREFIX}${profileId}.${projectId}`

/**
 * 這一場的票的權威來源。`null` 值是**墓碑**（丟過票）：`heldRoomToken` 讀到它就回 `null`、
 * **不再回頭問 storage** —— 這樣即使 `sessionStorage.removeItem` 失敗、舊票殘留在 storage，
 * 也不會被拿去撞握手（`FE-N08-S11` 要防的就是這個，現在由記憶體墓碑保證，不靠 storage 刪得掉）。
 */
const memory = new Map<string, string | null>()

/**
 * `sessionStorage` 可能不可用（隱私模式、被停用、配額滿、擴充套件擋）—— 取得它**與**每一個操作都可能拋。
 * 那時回 `fallback`、**不拋** —— storage 只是持久層，這一場靠記憶體，沒有 storage 不影響進房。
 */
function withStorage<T>(fallback: T, run: (storage: Storage) => T): T {
  try {
    return run(window.sessionStorage)
  } catch {
    return fallback
  }
}

export function holdRoomToken(profileId: string, projectId: string, token: string): void {
  const key = keyOf(profileId, projectId)
  memory.set(key, token) // 權威、一定成功
  withStorage(undefined, (storage) => storage.setItem(key, token)) // best-effort 持久化（重整後撿得回）
}

export function heldRoomToken(profileId: string, projectId: string): string | null {
  const key = keyOf(profileId, projectId)
  // 記憶體知道這個鍵（存過或丟過）就以它為準：存過 → 回票；丟過（墓碑 `null`）→ 回 `null`，不問 storage。
  if (memory.has(key)) return memory.get(key) ?? null
  // 記憶體沒見過（多半是重整後的新一場）→ 從持久層撿回，撿到就放進記憶體當這一場的權威。
  const persisted = withStorage<string | null>(null, (storage) => storage.getItem(key))
  if (persisted !== null) memory.set(key, persisted)
  return persisted
}

/**
 * 丟票（`FE-N08-S11`）。記憶體放墓碑（一定成功）＋ best-effort 清 storage。
 * **一律回 `dropped`** —— 記憶體墓碑保證這一場之後 `heldRoomToken` 回 `null`（storage 刪不掉也不會復活舊票），
 * 所以「無法確認刪除」不再是要擋「重新輸入密碼」的理由。
 */
export type DropResult = 'dropped'

export function dropRoomToken(profileId: string, projectId: string): DropResult {
  const key = keyOf(profileId, projectId)
  memory.set(key, null) // 墓碑：這一場之後 heldRoomToken 回 null，不回頭問 storage
  withStorage(undefined, (storage) => storage.removeItem(key)) // best-effort；刪不掉也沒關係（墓碑已擋）
  return 'dropped'
}

/**
 * **測試專用**：清掉這一場的記憶體權威。正式碼裡沒有「一次清掉所有票」的需求
 * （票隨分頁生滅），但模組級的 `memory` 跨測試不會自己重置，隔離要靠它。
 */
export function __resetRoomTokenMemory(): void {
  memory.clear()
}
