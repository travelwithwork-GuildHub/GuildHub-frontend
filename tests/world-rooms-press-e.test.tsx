import ReactThreeTestRenderer from '@react-three/test-renderer'
import { type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { FACING } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { doorTargetId } from '@/world/rooms/labels'
import { ProjectDoors } from '@/world/rooms/ProjectDoors'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'

// 對著門按 E。規格 `FE-W12-S16`。
//
// ⚠️⚠️ **「什麼都沒發生」本身是恆真的** —— 世界上根本沒有門的時候它也成立。
// 讓它不恆真的是 `GIVEN`：**提示正指著那扇門**。
// 那個狀態要成立，門必須真的生成、真的註冊、真的被選中。
//
// ⚠️ **這裡刻意不斷言「登記的動作是 `undefined` 而不是空函式」。**
// 對玩家來說兩者一模一樣，那是實作結構不是可觀察行為
//（兩個外部審查者獨立指出這件事）。

const ROOM: RoomDoorOut = {
  project_id: 'a0000000-0000-4000-8000-000000000001',
  title: '星際導航',
  online_count: 3,
}

function Spy({ seen }: { seen: (id: string | null) => void }) {
  const { target } = useInteraction()
  seen(target.id)
  return null
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('對著門按 E', () => {
  it('[FE-W12-S16] 提示正指著那扇門，按下去什麼都不發生', async () => {
    const slot = CORRIDOR_SLOTS[0]
    if (slot === undefined) throw new Error('沒有槽位')

    const seen: Array<string | null> = []
    const poseRef: RefObject<LocalPose> = {
      current: { x: slot.x + 0.6, z: slot.z, f: FACING.left },
    }
    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <Spy seen={(id) => seen.push(id)} />
        <SpatialInteraction poseRef={poseRef} />
        <ProjectDoors rooms={[ROOM]} slots={CORRIDOR_SLOTS} />
      </InteractionProvider>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 1 / 60)
    })

    // **GIVEN 是這條 Scenario 唯一的支點。**
    const wanted = doorTargetId(ROOM.project_id)
    expect(seen.at(-1), '提示沒有指著那扇門 —— 後面的斷言會變成恆真').toBe(wanted)
    const before = window.location.href

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
      await renderer.advanceFrames(2, 1 / 60)
    })

    expect(seen.at(-1), '按 E 之後目標變了').toBe(wanted)
    // 「不送出任何請求」—— `src/api/transport.ts` 是整個 `src/` 底下唯一
    // 呼叫 `fetch` 的地方，所以這一條擋得住任何 domain operation。
    expect(fetchSpy, '按 E 送出了請求 —— 有人接了一個開面板／進房間的動作').not.toHaveBeenCalled()
    // 「沒有任何導覽」。
    expect(window.location.href).toBe(before)
  })

  it('[FE-W12-S16] 反向控制：有動作的物件按 E 會被觸發', async () => {
    // ⚠️ 少了這一條，上面那條在「按鍵處理整個壞掉」時也是綠的 ——
    // 而那時候**每一個**可互動物件都不會有反應，不只是門。
    const fired = vi.fn()
    const { Interactable } = await import('@/world/interaction/Interactable')
    const poseRef: RefObject<LocalPose> = { current: { x: 0, z: 0, f: FACING.down } }
    const seen: Array<string | null> = []

    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <Spy seen={(id) => seen.push(id)} />
        <SpatialInteraction poseRef={poseRef} />
        <Interactable id="probe" x={0} z={1} label="測試物件" onInteract={fired} />
      </InteractionProvider>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 1 / 60)
    })
    expect(seen.at(-1)).toBe('probe')

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
      await renderer.advanceFrames(1, 1 / 60)
    })
    expect(fired).toHaveBeenCalledTimes(1)
  })
})
