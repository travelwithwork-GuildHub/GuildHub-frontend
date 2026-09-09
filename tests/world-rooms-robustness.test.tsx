import ReactThreeTestRenderer from '@react-three/test-renderer'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { labelAnchorsFor } from '@/world/rooms/anchors'
import { DoorLabelProjector } from '@/world/rooms/DoorLabelProjector'
import type { LabelNodes } from '@/world/rooms/DoorLabels'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { doorTargetId } from '@/world/rooms/labels'
import { doorsFor } from '@/world/rooms/ordering'
import { ProjectDoors } from '@/world/rooms/ProjectDoors'
import { RoomsNotice } from '@/world/rooms/RoomsNotice'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'
import type { RoomsView } from '@/world/rooms/useRooms'

// 封存前補的四條。兩個外部審查者在最後一輪各自指出的。

const room = (id: string, title: string, online = 0): RoomDoorOut => ({
  project_id: id,
  title,
  online_count: online,
})

const uuid = (letter: string) => `${letter}0000000-0000-4000-8000-00000000000${letter}`
const A = room(uuid('a'), '星際導航', 3)
const B = room(uuid('b'), '深海測繪', 1)

describe('A：後端回了重複的 project_id', () => {
  let errors: unknown[]

  beforeEach(() => {
    errors = []
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args[0])
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('去重、保留第一筆，而且不靜默', () => {
    const duplicate = { ...A, title: '不一樣的名字' }
    const { doors, hidden } = doorsFor([A, duplicate, B], 6)

    expect(doors).toHaveLength(2)
    expect(doors.map((d) => d.title)).toContain('星際導航')
    expect(doors.map((d) => d.title)).not.toContain('不一樣的名字')
    expect(hidden).toBe(0)
    // **不靜默** —— 訊息要帶著那個 id，讓它定位得到。
    expect(errors).toHaveLength(1)
    expect(String(errors[0])).toContain(A.project_id)
  })

  it('掛載重複的房間時，整個世界不得拋錯', async () => {
    // ⚠️ **這才是這一條真正要防的。** 互動系統對重複 id 拋錯
    // （`FE-W06-S16` 刻意的），而門的 id 帶著 `project_id` ——
    // 少了去重，兩個 `<Interactable>` 會撞在一起、error boundary 接手，
    // **整個 3D 世界白畫面**。
    const { doors } = doorsFor([A, { ...A }, B], 6)
    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <ProjectDoors rooms={doors} slots={CORRIDOR_SLOTS} />
      </InteractionProvider>,
    )
    expect(renderer.scene).toBeTruthy()
  })

  it('反向控制：沒有去重的話真的會拋錯', async () => {
    // 少了這一條，上面那條可能只是「註冊表根本沒在檢查重複」。
    await expect(
      ReactThreeTestRenderer.create(
        <InteractionProvider>
          <ProjectDoors rooms={[A, { ...A }]} slots={CORRIDOR_SLOTS} />
        </InteractionProvider>,
      ),
    ).rejects.toThrow(/id 重複/)
  })
})

describe('B：背景輪詢不得反覆打擾螢幕閱讀器', () => {
  const view = (over: Partial<RoomsView>): RoomsView => ({
    status: 'ready',
    doors: [A],
    hidden: 0,
    ...over,
  })

  it('成功的輪詢不改變 status 節點', () => {
    // `RoomsNotice` 是 `role="status"`（隱含 `aria-live="polite"`）。
    // ⚠️ 如果輪詢時先切成「載入中」再切回來，螢幕閱讀器**每 30 秒念一次**。
    const { rerender } = render(<RoomsNotice view={view({ hidden: 3 })} />)
    const before = screen.getByTestId('rooms-notice').textContent

    // 一次成功的背景輪詢：資料換了，狀態仍然是 ready。
    rerender(<RoomsNotice view={view({ hidden: 3, doors: [A, B] })} />)

    expect(screen.getByTestId('rooms-notice').textContent).toBe(before)
  })

  it('一切正常時根本沒有 status 節點', () => {
    render(<RoomsNotice view={view({})} />)
    expect(screen.queryByTestId('rooms-notice')).toBe(null)
  })
})

describe('C：每幀投影不得讀 DOM 的幾何', () => {
  it('投影元件只寫 style，不呼叫任何 layout API', async () => {
    // ⚠️ 讀 `getBoundingClientRect` 之後又寫 `transform`，在六個標籤之間
    // 交替 read-write，會每幀強制同步 layout（layout thrashing）。
    // **用 spy 觀察那個 API 有沒有被呼叫，不是用字串搜尋原始碼。**
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    const anchors = labelAnchorsFor([A, B], CORRIDOR_SLOTS)
    const nodes: LabelNodes = new Map()
    for (const anchor of anchors) nodes.set(anchor.id, document.createElement('div'))

    const renderer = await ReactThreeTestRenderer.create(
      <DoorLabelProjector anchors={anchors} nodesRef={{ current: nodes }} />,
    )
    rect.mockClear()
    await renderer.advanceFrames(10, 1 / 60)

    expect(rect, '投影每幀讀了 DOM 的幾何 —— 那會強制同步 layout').not.toHaveBeenCalled()
    rect.mockRestore()
  })
})

describe('D：清單插入時，既有的門不得被卸載重建', () => {
  // ⚠️⚠️ **這條判準抓不到 `key={index}`，那是實測出來的。**
  //
  // React 對索引 key **不會卸載重建** —— 它把同一個實例的 props 換掉。
  // 所以「實例還在不在」問不出「這個實例現在綁的是不是同一個專案」。
  //
  // 那件事今天**沒有可觀察的後果**（門沒有自己的狀態），
  // 所以這裡不假裝有判準守著它。原始碼的註解寫著同一件事。
  //
  // **它真的抓得到的是「key 不穩定」** —— 例如把標題或索引拌進 key
  //（`key={`${index}-${room.title}`}`）。那時候插入一筆會讓**每一扇門**
  // 卸載重建，而每一次卸載都會把互動登記拔掉再裝回去。實測：那樣改會紅。
  it('在最前面插一個新專案，既有的門仍然是同一個實例', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <ProjectDoors rooms={[A, B]} slots={CORRIDOR_SLOTS} />
      </InteractionProvider>,
    )
    const before = renderer.scene.findAll((node) => node.type === 'Group')
    expect(before.length).toBeGreaterThan(1)

    // 新專案的 UUID 排在最前面 —— 這正是 `project_id` 字典序會發生的事。
    const inserted = room(uuid('0'), '極地補給', 5)
    await renderer.update(
      <InteractionProvider>
        <ProjectDoors rooms={[inserted, A, B]} slots={CORRIDOR_SLOTS} />
      </InteractionProvider>,
    )

    const after = renderer.scene.findAll((node) => node.type === 'Group')
    const survived = after.filter((node) => before.includes(node))
    expect(survived.length, '既有的門被卸載重建了 —— key 大概被改成陣列索引').toBe(before.length)
  })
})

describe('身分', () => {
  it('門的識別字帶著 project_id', () => {
    expect(doorTargetId(A.project_id)).toContain(A.project_id)
  })
})
