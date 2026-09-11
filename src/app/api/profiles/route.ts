import { handle } from '@/server/http/handle'
import { queryInt } from '@/server/http/validation'
import { listProfiles } from '@/server/profiles'

// `GET /api/profiles?page=N`。規格 `FE-O03`〈人才與案件清單：分頁形狀複製真後端〉—— 20 筆、0-based、尾頁後 `[]`、沒有 total。
export const GET = handle({ auth: 'required' }, async ({ url }) => listProfiles(queryInt(url.searchParams, 'page', 0)))
