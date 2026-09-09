import ReactThreeTestRenderer from '@react-three/test-renderer'
import { render, screen } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { labelAnchorsFor, type LabelAnchor } from '@/world/rooms/anchors'
import { DoorLabelProjector } from '@/world/rooms/DoorLabelProjector'
import { DoorLabels, type LabelNodes } from '@/world/rooms/DoorLabels'
import { LABEL_SIZE } from '@/world/rooms/labelProjection'
import { doorTargetId } from '@/world/rooms/labels'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'

// 標籤真的出現在 DOM 上、真的被投影元件寫進位置。
// 規格 `FE-W12-S09`／`S10`／`S12`／`S13`。
//
// ⚠️ 上一個檔案驗的是**純函式**。這裡驗的是**接線** ——
// 投影算對了但沒有人把它寫進 DOM 的話，那邊全綠、畫面上標籤全部疊在左上角。

const ROOM: RoomDoorOut = {
  project_id: 'a0000000-0000-4000-8000-000000000001',
  title: '星際導航',
  online_count: 3,
}

function Harness({ anchors }: { anchors: readonly LabelAnchor[] }) {
  const nodesRef = useRef<LabelNodes>(new Map())
  return <DoorLabels anchors={anchors} nodesRef={nodesRef} />
}

describe('標籤的 DOM', () => {
  it('[FE-W12-S09] 每一扇門一個標籤，上面同時有名稱與在線數', () => {
    render(<Harness anchors={labelAnchorsFor([ROOM], CORRIDOR_SLOTS)} />)

    const labels = screen.getAllByTestId('door-label')
    expect(labels).toHaveLength(1)
    expect(labels[0]?.textContent).toContain('星際導航')
    expect(labels[0]?.textContent).toContain('3')
    // 標籤與互動登記**指的是同一扇門**。
    expect(labels[0]?.dataset.target).toBe(doorTargetId(ROOM.project_id))
  })

  it('[FE-W12-S12] 標籤是固定尺寸', () => {
    const long = { ...ROOM, title: '極長的專案名稱'.repeat(20) }
    render(<Harness anchors={labelAnchorsFor([ROOM, long], CORRIDOR_SLOTS)} />)

    const labels = screen.getAllByTestId('door-label')
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      expect(label.style.width).toBe(`${LABEL_SIZE.width}px`)
      expect(label.style.height).toBe(`${LABEL_SIZE.height}px`)
    }
  })

  it('[FE-W12-S13] 還沒被投影過之前是隱藏的', () => {
    render(<Harness anchors={labelAnchorsFor([ROOM], CORRIDOR_SLOTS)} />)
    // 少了這個初值，第一幀標籤會閃在畫面左上角。
    expect(screen.getAllByTestId('door-label')[0]?.style.visibility).toBe('hidden')
  })
})

describe('投影元件真的寫進 DOM', () => {
  /** 一組真的 DOM 節點，交給投影元件去寫。 */
  function nodesFor(anchors: readonly LabelAnchor[]): RefObject<LabelNodes> {
    const nodes: LabelNodes = new Map()
    for (const anchor of anchors) {
      const node = document.createElement('div')
      node.style.visibility = 'hidden'
      nodes.set(anchor.id, node)
    }
    return { current: nodes }
  }

  it('[FE-W12-S10] 一幀之後標籤有了位置', async () => {
    // ⚠️ **錨點放在相機看得到的地方。** `@react-three/test-renderer` 的預設相機
    // 不是這個世界的相機（`WorldCamera` 沒掛），所以它的 target 是
    // `位置 − offset`。把錨點放到那裡，投影一定落在畫面內 ——
    // 第一版用了走廊的真實座標，結果標籤在畫面外、`transform` 是空字串。
    const target = { x: 0, z: -7 }
    const near: LabelAnchor = { id: 'door:near', text: '近的', x: target.x, y: 2, z: target.z }
    const nodesRef = nodesFor([near])
    const node = nodesRef.current.get(near.id)
    if (node === undefined) throw new Error('沒有節點')

    const renderer = await ReactThreeTestRenderer.create(
      <DoorLabelProjector anchors={[near]} nodesRef={nodesRef} />,
    )
    await renderer.advanceFrames(2, 16)

    // **有被寫過**：位置不再是初始的空字串，而且不是隱藏的。
    expect(node.style.transform).toMatch(/translate3d/)
    expect(node.style.visibility).toBe('visible')
  })

  it('[FE-W12-S13] 門在畫面外時，投影元件把它藏起來', async () => {
    // 走廊在 x = -11.7；把錨點放到極遠處，一定在畫面外。
    const far: LabelAnchor = { id: 'door:far', text: '遠方', x: 5000, y: 2, z: 0 }
    const nodesRef = nodesFor([far])
    const node = nodesRef.current.get(far.id)
    if (node === undefined) throw new Error('沒有節點')
    node.style.visibility = 'visible'

    const renderer = await ReactThreeTestRenderer.create(
      <DoorLabelProjector anchors={[far]} nodesRef={nodesRef} />,
    )
    await renderer.advanceFrames(2, 16)

    expect(node.style.visibility).toBe('hidden')
  })
})
