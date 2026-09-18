import ReactThreeTestRenderer from '@react-three/test-renderer'
import { render, screen } from '@testing-library/react'
import { Profiler, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'
import type { RemoteIdentity, RemoteMotion } from '@/realtime/remotePlayers'
import { RENDER_DELAY_MS, appendSample, createTrack } from '@/realtime/interpolation'
import { cameraOffset } from '@/world/camera'
import { NameTags, type NameTagNodes } from '@/world/NameTags'
import { NAME_TAG_SIZE, hasName } from '@/world/player/nameTag'
import { RemotePlayers } from '@/world/RemotePlayers'

// 名字牌。規格 `openspec/specs/name-tag/spec.md`（change `fe-w08-name-tag`）。
//
// 兩個殼：`NameTags`（Canvas 外的 DOM）用 RTL 掛，驗**名單半邊**（誰有牌子、字是什麼、離開就不在）；
// `RemotePlayers` 用 `@react-three/test-renderer` 跑真的 `useFrame`，驗**位置半邊**（每幀寫 DOM、不進 React、空窗停在原地、點判準）。
// 兩半靠同一個 `nodesRef`（Map）接起來 —— 跟正式碼一樣。
//
// ⚠️ 像素期望值是**手算的常數**（`AT`）：viewport 1280×720、相機 target 在原點時 1 世界單位 = 60 px、
// 錨點 y=1.6 在 (0,0) 投影到 y≈292.12。不呼叫 `screenPixelFor` 算期望值 —— 那跟被測的投影同源，投影寫偏會一起錯。

const VIEWPORT = { width: 1280, height: 720 }
const TRANSLATE = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\)/
/** 手算：x 每單位 60 px（640 + 60x）；y 在 z=0 時 292.12、z 每單位 +42.43 px。 */
const AT = {
  origin: { x: 640, y: 292.12 },
  two_one: { x: 760, y: 334.54 },
  /** x=10：錨點在畫面內（1240 < 1280），但 176 寬的牌子右半（1240+88=1328）越界 —— `S08` 的「仍然 visible」 */
  edgeInside: { x: 1240, y: 292.12 },
}

let clock = 1000
const now = () => clock

const identity = (id: string, name: unknown): RemoteIdentity => ({ id, name: name as string, av: 0, st: '' })
const rosterOf = (people: Array<[string, unknown]>): ReadonlyMap<string, RemoteIdentity> => new Map(people.map(([id, name]) => [id, identity(id, name)]))
const trackAt = (x: number, z: number): RemoteMotion => {
  const track = createTrack()
  appendSample(track, { x, z, f: 0 }, clock)
  return track
}
const nodesFor = (): RefObject<NameTagNodes> => ({ current: new Map() })
const xy = (node: HTMLElement) => {
  const m = TRANSLATE.exec(node.style.transform)
  return m === null ? null : { x: Number(m[1]), y: Number(m[2]) }
}

/** 相機在 target 的固定偏移上（跟 `WorldCamera` 一樣），target 在原點。 */
function cameraAtOrigin() {
  const o = cameraOffset()
  return { position: [o.x, o.y, o.z] as [number, number, number] }
}

async function frames(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>, n: number) {
  const caught: unknown[] = []
  const trap = (e: unknown) => caught.push(e)
  process.on('unhandledRejection', trap)
  try {
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(n, 1 / 60)
    })
    await new Promise((r) => setTimeout(r, 0))
  } finally {
    process.off('unhandledRejection', trap)
  }
  return caught
}

describe('名單半邊：誰有牌子', () => {
  it('[FE-W08-S01] 名單上有兩個人，畫面上就有他們兩個的名字，字跟協定一樣（不 trim）', () => {
    const nodesRef = nodesFor()
    render(<NameTags roster={rosterOf([['u1', '小玉'], ['u2', ' Ada Lovelace ']])} nodesRef={nodesRef} />)
    const tags = screen.getAllByTestId('name-tag')
    expect(tags.map((t) => t.textContent)).toEqual(['小玉', ' Ada Lovelace '])
    expect(tags.map((t) => t.dataset.player)).toEqual(['u1', 'u2'])
    expect([...nodesRef.current.keys()]).toEqual(['u1', 'u2'])
    // 固定尺寸（`S07` 的 jsdom 半邊：inline style 是尺寸的唯一來源）
    for (const t of tags) {
      expect(t.style.width).toBe(`${NAME_TAG_SIZE.width}px`)
      expect(t.style.height).toBe(`${NAME_TAG_SIZE.height}px`)
    }
  })

  it('[FE-W08-S02] 進場出場，牌子跟著增減；離開的人的節點不在 DOM 裡、也不在登記表裡', () => {
    const nodesRef = nodesFor()
    const view = render(<NameTags roster={rosterOf([['u1', '小玉']])} nodesRef={nodesRef} />)
    expect(screen.getByText('小玉')).toBeDefined()
    view.rerender(<NameTags roster={rosterOf([['u2', '阿明']])} nodesRef={nodesRef} />)
    expect(screen.queryByText('小玉')).toBeNull()
    expect(screen.getByText('阿明')).toBeDefined()
    expect([...nodesRef.current.keys()]).toEqual(['u2'])
  })

  it('[FE-W08-S03] 名字空白或不是字串就沒有牌子，也沒有任何替代字', () => {
    const nodesRef = nodesFor()
    render(<NameTags roster={rosterOf([['a', '   '], ['b', ''], ['c', null], ['d', 42], ['e', '有名字']])} nodesRef={nodesRef} />)
    const tags = screen.getAllByTestId('name-tag')
    expect(tags.map((t) => t.textContent)).toEqual(['有名字'])
    expect(screen.getByTestId('name-tags').textContent).toBe('有名字')
    expect([...nodesRef.current.keys()]).toEqual(['e'])
    // 合法性只有一份：`hasName` 就是 `NameTags` 用的那一份
    expect([hasName('   '), hasName(''), hasName(null), hasName(42), hasName('有名字'), hasName(' x ')]).toEqual([false, false, false, false, true, true])
  })
})

describe('位置半邊：角色自己每幀寫牌子', () => {
  it('[FE-W08-S05] 角色移動時牌子每幀跟著走（手算位置 ±1 px），名字牌那一層 React 一次都不重繪', async () => {
    const nodesRef = nodesFor()
    let commits = 0
    render(
      <Profiler id="tags" onRender={() => { commits += 1 }}>
        <NameTags roster={rosterOf([['u1', '小玉']])} nodesRef={nodesRef} />
      </Profiler>,
    )
    const node = nodesRef.current.get('u1')
    if (node === undefined) throw new Error('牌子沒登記')
    expect(node.style.visibility, '還沒被投影過之前先藏起來（不在左上角閃一幀）').toBe('hidden')
    const commitsAfterMount = commits

    const motion = new Map<string, RemoteMotion>([['u1', trackAt(0, 0)]])
    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers roster={rosterOf([['u1', '小玉']])} motion={motion} now={now} tagNodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: cameraAtOrigin() },
    )
    await frames(renderer, 1)
    expect(node.style.visibility).toBe('visible')
    const p0 = xy(node)
    expect(p0?.x).toBeCloseTo(AT.origin.x, 0)
    expect(p0?.y).toBeCloseTo(AT.origin.y, 0)

    // 就地追加一筆 100 ms 後的樣本（`pos` 做的事）。先把時鐘推到游標正好在第一筆上，
    // 之後每幀 +10 ms：游標在兩筆之間走，10 幀 transform 各不相同；最後推過 render delay，到 (2,1) 的手算位置
    appendSample(motion.get('u1')!, { x: 2, z: 1, f: 0 }, clock + 100)
    clock += RENDER_DELAY_MS
    const seen = new Set<string>()
    for (let i = 0; i < 10; i += 1) {
      clock += 10
      await frames(renderer, 1)
      seen.add(node.style.transform)
    }
    expect(seen.size, '10 幀裡 transform 應該每幀不同').toBe(10)
    clock += RENDER_DELAY_MS
    await frames(renderer, 1)
    const p1 = xy(node)
    expect(p1?.x).toBeCloseTo(AT.two_one.x, 0)
    expect(p1?.y).toBeCloseTo(AT.two_one.y, 0)
    expect(commits, '牌子的位置走了 React（名字牌那一層在 frame 之間 commit 了）').toBe(commitsAfterMount)
    await renderer.unmount()
  })

  it('[FE-W08-S06] 樣本被清掉的空窗：牌子停在原地、仍然呈現、不拋錯；還沒有樣本的人不呈現', async () => {
    const nodesRef = nodesFor()
    render(<NameTags roster={rosterOf([['u1', '小玉'], ['u2', '剛來的']])} nodesRef={nodesRef} />)
    const motion = new Map<string, RemoteMotion>([['u1', trackAt(2, 1)]]) // u2 在名單上、還沒有樣本
    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers roster={rosterOf([['u1', '小玉'], ['u2', '剛來的']])} motion={motion} now={now} tagNodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: cameraAtOrigin() },
    )
    await frames(renderer, 2)
    const u1 = nodesRef.current.get('u1')!
    const u2 = nodesRef.current.get('u2')!
    expect(u1.style.visibility).toBe('visible')
    expect(u2.style.visibility, '沒有位置的人不呈現').toBe('hidden')
    expect(u2.style.transform, '沒有位置就不寫 transform').toBe('')
    const before = u1.style.transform
    // `leave` 同步清掉樣本，元件還沒卸載（`FE-R08-S20` 那一幀）
    motion.delete('u1')
    const errors = await frames(renderer, 2)
    expect(errors).toEqual([])
    expect(u1.style.transform).toBe(before)
    expect(u1.style.visibility).toBe('visible')
    await renderer.unmount()
  })

  it('[FE-W08-S08] 判的是錨點的點：錨點在畫面內、牌子矩形越界 → 仍 visible；錨點出畫面 → hidden；回來 → visible', async () => {
    const nodesRef = nodesFor()
    render(<NameTags roster={rosterOf([['u1', '小玉']])} nodesRef={nodesRef} />)
    const motion = new Map<string, RemoteMotion>([['u1', trackAt(10, 0)]])
    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers roster={rosterOf([['u1', '小玉']])} motion={motion} now={now} tagNodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: cameraAtOrigin() },
    )
    const node = nodesRef.current.get('u1')!
    await frames(renderer, 1)
    expect(xy(node)?.x).toBeCloseTo(AT.edgeInside.x, 0)
    expect(AT.edgeInside.x + NAME_TAG_SIZE.width / 2, '前提：這個位置的牌子矩形確實越出右緣').toBeGreaterThan(VIEWPORT.width)
    expect(node.style.visibility, '錨點在畫面內、矩形越界 → 仍然呈現（由容器裁）').toBe('visible')

    appendSample(motion.get('u1')!, { x: 11, z: 0, f: 0 }, clock) // 1300 px：錨點出畫面
    clock += RENDER_DELAY_MS
    await frames(renderer, 2)
    expect(node.style.visibility, '錨點出畫面 → hidden').toBe('hidden')

    appendSample(motion.get('u1')!, { x: 0, z: 0, f: 0 }, clock)
    clock += RENDER_DELAY_MS
    await frames(renderer, 2)
    expect(node.style.visibility, '走回來 → visible').toBe('visible')
    await renderer.unmount()
  })
})
