// FIXTURE —— 故意違規（規格 FE-O20-S04）：正確的鍵之外再多一個。
// 約束在的話是 TS2353。跟 extra 那個不能互相取代：這裡路徑**收** params，只是集合要相等不是超集。
import { buildRequest } from '../../src/api/transport'

export const bad = buildRequest({
  method: 'GET',
  path: '/api/projects/{project_id}',
  params: { project_id: 'a', extra: 'b' },
})
