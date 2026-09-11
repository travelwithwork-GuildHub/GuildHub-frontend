import { updateMyProfile } from '@/api/operations'
import type { ProfileOut } from '@/api/contract/rest'
import { toPayload, type ProfileFormOutput } from './profileRules'

// 存名片。規格 `FE-A04`〈編輯四欄，payload 白名單，悲觀更新〉。
//
// ⚠️ **元件裡不准出現 `fetch`**（`CLAUDE.md`）—— 走 `src/api/`。這一層只做「送什麼」：白名單四欄，**永遠沒有 `avatar_id`**
// （`S07`：面板開著時角色在別處被改過、後端已寫入 —— 名片送出不會把它蓋回去）。
//
// 回的是伺服器的 `ProfileOut`，呼叫端 `adopt` 它（design `D2b`：回應是唯一 canonical，不是把 input 拼進舊身分）。
// 失敗直接拋 —— `useForm` 接住、留值、alert。

export async function saveProfile(values: ProfileFormOutput): Promise<ProfileOut> {
  return updateMyProfile(toPayload(values))
}
