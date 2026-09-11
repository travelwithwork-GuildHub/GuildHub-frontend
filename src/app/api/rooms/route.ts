import { handle } from '@/server/http/handle'
import { activeRooms } from '@/server/projects'
import { onlineCount } from '@/server/realtime'

// `GET /api/rooms`。走廊的門：active 的專案 ＋ 即時層替身裡那個 room 的人數（替身不在 → 0，仍 200）。
export const GET = handle({ auth: 'required' }, async () => {
  const rooms = await activeRooms()
  return Promise.all(rooms.map(async (r) => ({ project_id: r.project_id, title: r.title, online_count: await onlineCount(`room:${r.project_id}`) })))
})
