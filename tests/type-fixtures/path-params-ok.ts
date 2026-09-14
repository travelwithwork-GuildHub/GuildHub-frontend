// FIXTURE —— **正向**（規格 FE-O20-S06）：新操作寫對就過。
// 這個檔案在同一次 tsc 裡必須零診斷 —— 防的是型別被收窄到「只有既有呼叫形狀能過」。
import { buildRequest } from '../../src/api/transport'

export const ok = buildRequest({
  method: 'POST',
  path: '/api/projects/{project_id}/close',
  params: { project_id: 'a' },
})
