// FIXTURE —— 故意違規（規格 FE-O20-S01）：鍵拼錯。
// 路徑要的是 `profile_id`，這裡給 `id`。約束在的話是 TS2353（多餘屬性）；
// 沒有約束的話 `path.replace('{id}', …)` 找不到樣板，送出去的是字面值 `/api/profiles/{profile_id}`。
import { buildRequest } from '../../src/api/transport'

export const bad = buildRequest({ method: 'GET', path: '/api/profiles/{profile_id}', params: { id: 'x' } })
