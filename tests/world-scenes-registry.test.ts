import { describe, expect, it } from 'vitest'
import { staticBoxesFor, WORLD_HALF_EXTENT } from '@/world/layout/geometry'
import { sceneOf, type SceneRef } from '@/world/scenes/registry'

// 場景註冊表。規格 `FE-V01-S01`。
//
// ⚠️ 正規式抄自後端 `scenes.py:11` —— 這裡驗的是「推導出來的 scene 參數落在後端接受的形狀裡」，
// 前端自己的合法域（小寫 uuid）比它窄。

const BACKEND_SCENE_ID = /^(lobby|room:[0-9a-zA-Z-]+)$/
const PROJECT = '3f2b0a1c-5d6e-4f70-8a9b-0c1d2e3f4a5b'

describe('場景註冊表', () => {
  it('[FE-V01-S01] 兩個場景推導出的 scene 參數、要不要帶票、出生點', () => {
    const hall = sceneOf({ id: 'hall' })
    const room = sceneOf({ id: 'room', projectId: PROJECT })

    expect(hall.wsScene).toBe('lobby')
    expect(room.wsScene).toBe(`room:${PROJECT}`)
    expect(hall.wsScene).toMatch(BACKEND_SCENE_ID)
    expect(room.wsScene).toMatch(BACKEND_SCENE_ID)
    expect(hall.needsToken).toBe(false)
    expect(room.needsToken).toBe(true)

    for (const def of [hall, room]) {
      expect(Math.abs(def.spawn.x), '出生點 x 超出遊玩區域').toBeLessThan(WORLD_HALF_EXTENT)
      expect(Math.abs(def.spawn.z), '出生點 z 超出遊玩區域').toBeLessThan(WORLD_HALF_EXTENT)
      const boxes = staticBoxesFor(def.layout)
      expect(boxes.length, '配置一個碰撞盒都沒有 —— 下面那條恆真').toBeGreaterThan(0)
      for (const box of boxes) {
        const inside =
          Math.abs(def.spawn.x - box.x) < box.halfWidth && Math.abs(def.spawn.z - box.z) < box.halfDepth
        expect(inside, `${def.wsScene} 的出生點落在一個靜態障礙物裡`).toBe(false)
      }
    }
  })

  it.each([
    ['空字串', ''],
    ['不是 uuid', 'abc'],
    ['大寫', PROJECT.toUpperCase()],
    ['含斜線', 'a/b'],
    ['帶 room: 前綴', `room:${PROJECT}`],
    ['含底線', PROJECT.replace('-', '_')],
  ])('[FE-V01-S01] projectId 不合法（%s）時拋錯，不產出 wsScene', (_label, projectId) => {
    const ref = { id: 'room', projectId } as SceneRef
    expect(() => sceneOf(ref)).toThrow()
  })
})
