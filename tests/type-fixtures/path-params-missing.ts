// FIXTURE —— 故意違規（規格 FE-O20-S02）：有參數的路徑沒給 params。
// 約束在的話是 TS2345（`params` 必填）。
import { buildRequest } from '../../src/api/transport'

export const bad = buildRequest({ method: 'GET', path: '/api/projects/{project_id}' })
