// FIXTURE —— 故意違規（規格 FE-O20-S03）：沒有參數的路徑給了 params。
// 約束在的話是 TS2353（`params` 在這條路徑上只收 `undefined`）。
import { buildRequest } from '../../src/api/transport'

export const bad = buildRequest({ method: 'GET', path: '/api/me', params: { id: 'x' } })
