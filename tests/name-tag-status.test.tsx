import ReactThreeTestRenderer from '@react-three/test-renderer'
import { render, screen } from '@testing-library/react'
import { Profiler, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'
import type { RemoteIdentity, RemoteMotion } from '@/realtime/remotePlayers'
import { RENDER_DELAY_MS, appendSample, createTrack } from '@/realtime/interpolation'
import { applyMessage, createRemotePlayersState } from '@/realtime/remotePlayers'
import { cameraOffset } from '@/world/camera'
import { NameTags, type NameTagNodes } from '@/world/NameTags'
import { NAME_TAG_SIZE } from '@/world/player/nameTag'
import { RemotePlayers } from '@/world/RemotePlayers'

// 規格：openspec/changes/fe-k05-status/specs/player-status/spec.md
//   Requirement: 別人的狀態畫在他的名字牌上；沒有就沒有；不改牌子的尺 —— S05（一有一無、名字盒 176×28）、S06（換掉／清空／不認識的 id）、S07（單行截字、位置不經 React）
//
// 跟 `name-tags.test.tsx` 同兩個殼：`NameTags`（RTL）驗內容、`RemotePlayers`（R3F test renderer）驗位置不經 React。
// 名單的變化走真的 `applyMessage`（`status` 訊息 → `st`），不自己拼 roster —— 拼的話 reducer 忘了處理 `status` 這裡照樣綠。

const VIEWPORT = { width: 1280, height: 720 }
let clock = 1000
const now = () => clock
const who = (id: string, name: string, st = ''): RemoteIdentity => ({ id, name, av: 0, st })
const rosterOf = (people: RemoteIdentity[]): ReadonlyMap<string, RemoteIdentity> => new Map(people.map((p) => [p.id, p]))
const nodesFor = (): RefObject<NameTagNodes> => ({ current: new Map() })
/** 牌子＝槽（登記進 nodesRef、每幀被寫 transform；狀態與名字盒都是它的 child）。 */
const slot = (id: string) => document.querySelector<HTMLElement>(`[data-testid="name-tag"][data-player="${id}"]`)
const tag = (id: string) => slot(id)?.querySelector<HTMLElement>('[data-testid="name-tag-name"]') ?? null
const statusOf = (id: string) => slot(id)?.querySelector<HTMLElement>('[data-testid="name-tag-status"]') ?? null
const TWELVE = '一二三四五六七八九十壹貳'

describe('名字牌上的狀態', () => {
  it('[FE-K05-S05] 甲有狀態、乙沒有：甲的牌子含那段、乙沒有狀態節點；兩塊牌子的名字盒仍是 176×28、底邊對錨點（translate 不變）', () => {
    const nodesRef = nodesFor()
    render(<NameTags roster={rosterOf([who('a', '甲', '趕工中'), who('b', '乙')])} nodesRef={nodesRef} />)
    expect(statusOf('a')?.textContent).toBe('趕工中')
    expect(statusOf('b'), '空字串不掛狀態節點').toBeNull()
    expect(tag('b')?.textContent).toBe('乙')
    expect(tag('a')?.textContent, '名字盒的 textContent 只有名字').toBe('甲')
    for (const id of ['a', 'b']) {
      const node = slot(id)!
      expect(nodesRef.current.get(id)).toBe(node)
      expect(node.style.width).toBe(`${NAME_TAG_SIZE.width}px`)
      expect(node.style.height).toBe(`${NAME_TAG_SIZE.height}px`)
      // 牌子節點自己的 translate（CSS `translate` 屬性由 class 給）：底邊中點對錨點，跟 W08 一樣；狀態往上長（bottom-full），不在名字盒裡
      expect(node.className).toMatch(/-translate-y-full/)
      expect(node.className, '槽不能裁，不然往上長的狀態會被切掉').not.toMatch(/overflow-hidden/)
      expect(tag(id)!.className, '名字盒自己截字').toMatch(/overflow-hidden/)
    }
    const status = statusOf('a')!
    expect(status.className).toMatch(/bottom-full/)
    expect(status.getAttribute('aria-hidden')).not.toBe('true')
  })

  it('[FE-K05-S06] 走真的 reducer：status 換掉 → 牌子跟著換；清空 → 節點消失；不認識的 id → 沒有新牌子、名單不變', () => {
    const state = createRemotePlayersState()
    applyMessage(state, { t: 'snapshot', players: [{ id: 'me', name: '我', av: 0, x: 0, y: 0, f: 0, st: '' }, { id: 'b', name: '乙', av: 0, x: 0, y: 0, f: 0, st: '' }] }, 'me', now())
    const nodesRef = nodesFor()
    const view = render(<NameTags roster={state.roster} nodesRef={nodesRef} />)
    expect(statusOf('b')).toBeNull()
    expect(applyMessage(state, { t: 'status', id: 'b', text: '找人聊聊' }, 'me', now())).toBe(true)
    view.rerender(<NameTags roster={state.roster} nodesRef={nodesRef} />)
    expect(statusOf('b')?.textContent).toBe('找人聊聊')
    expect(applyMessage(state, { t: 'status', id: 'b', text: '' }, 'me', now())).toBe(true)
    view.rerender(<NameTags roster={state.roster} nodesRef={nodesRef} />)
    expect(statusOf('b')).toBeNull()
    expect(applyMessage(state, { t: 'status', id: 'ghost', text: '鬼' }, 'me', now())).toBe(false)
    view.rerender(<NameTags roster={state.roster} nodesRef={nodesRef} />)
    expect(screen.queryAllByTestId('name-tag')).toHaveLength(1)
    expect(screen.queryAllByTestId('name-tag-status')).toHaveLength(0)
  })

  it('[FE-K05-S07] 12 個全形字：單行、截字、不比牌子寬；角色移動時牌子（含狀態）每幀跟著走，名字牌那一層 React 一次都不重繪', async () => {
    const nodesRef = nodesFor()
    let commits = 0
    const roster = rosterOf([who('u1', '小玉', TWELVE)])
    render(
      <Profiler id="tags" onRender={() => { commits += 1 }}>
        <NameTags roster={roster} nodesRef={nodesRef} />
      </Profiler>,
    )
    const status = statusOf('u1')!
    expect(status.textContent).toBe(TWELVE)
    expect(status.className).toMatch(/whitespace-nowrap/)
    expect(status.className).toMatch(/overflow-hidden/)
    expect(status.className).toMatch(/text-ellipsis/)
    // 狀態節點的寬度不比牌子寬：`w-full`（跟著 176）
    expect(status.className).toMatch(/\bw-full\b/)
    const commitsAfterMount = commits

    const node = nodesRef.current.get('u1')!
    const motion = new Map<string, RemoteMotion>([['u1', (() => { const t = createTrack(); appendSample(t, { x: 0, z: 0, f: 0 }, clock); return t })()]])
    const o = cameraOffset()
    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers roster={roster} motion={motion} now={now} tagNodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: { position: [o.x, o.y, o.z] } },
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })
    const before = node.style.transform
    appendSample(motion.get('u1')!, { x: 2, z: 1, f: 0 }, clock + 100)
    clock += RENDER_DELAY_MS + 200
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    expect(node.style.transform).not.toBe(before)
    // 狀態節點是牌子的 child：跟著同一個 transform 走，沒有自己的 transform
    expect(status.style.transform).toBe('')
    expect(node.contains(status)).toBe(true)
    expect(commits, '牌子的位置走了 React').toBe(commitsAfterMount)
    await renderer.unmount()
  })
})
