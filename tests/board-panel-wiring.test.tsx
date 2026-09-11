import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { BOARD_LIST_KIND, BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b01-list-container/specs/list-panel/spec.md
//   Requirement: 走到看板前按 E，開得起對應的面板 —— S01／S02
//   Requirement: Escape 關閉面板，並把世界的輸入還回去 —— S16／S17 的接線那一半
//
// ⚠️⚠️ **這一份驗的是接線，不是容器。** 容器自己的行為在 `list-panel-container.test.tsx`。
// 這裡的每一個元件都是正式碼：`BoardTargets` 把 `onInteract` 註冊進真的 registry、
// `BoardPanel` 從真的 provider 讀「開著哪一塊」、`ListPanel` 打真的 operation。
// 觸發的方式跟 `SpatialInteraction` 按 E 時一模一樣：從 registry 拿 entry 呼叫 `onInteract`。
//
// ⚠️ **S01 與 S02 要成對。** 只驗一種的話，「兩塊都開案件」全綠，而畫面上兩邊都是合法的卡片。
//
// 「鎖 → 角色不動」那一半在 `list-panel-input-lock.test.tsx`（要 three 的 renderer，
// 而面板是 DOM，兩個 renderer 合不起來）。兩份在 `inputLockRef` 上接起來；
// 整條鏈在真瀏覽器裡由 `tests/e2e/board-panel.mjs` 走一次。

let server: ContractServer

const UUID = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
const PROJECT = {
  id: UUID(1),
  owner_id: UUID(0),
  title: '案件甲',
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-09T00:00:00Z',
}
const PROFILE = {
  id: UUID(2),
  display_name: '人才乙',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
}

/** 把 registry 與鎖從 provider 裡拿出來。**不渲染任何東西。** */
function Grab({ sinkRef }: { sinkRef: RefObject<{ registry: InteractableRegistry; lock: RefObject<boolean> } | null> }) {
  const { registry, inputLockRef } = useInteraction()
  useEffect(() => {
    sinkRef.current = { registry, lock: inputLockRef }
  }, [sinkRef, registry, inputLockRef])
  return null
}

function mount() {
  const sinkRef: RefObject<{ registry: InteractableRegistry; lock: RefObject<boolean> } | null> = { current: null }
  render(
    <InteractionProvider>
      <ListPanelProvider>
        <Grab sinkRef={sinkRef} />
        <BoardTargets />
        <BoardPanel />
      </ListPanelProvider>
    </InteractionProvider>,
  )
  const grabbed = () => {
    if (sinkRef.current === null) throw new Error('provider 還沒掛好')
    return sinkRef.current
  }
  /** 跟 `SpatialInteraction` 按 E 時做的事一樣：從 registry 拿 entry，呼叫 `onInteract`。 */
  const pressE = (id: string) =>
    act(() => {
      const entry = grabbed().registry.entries.get(id)
      if (entry === undefined) throw new Error(`registry 裡沒有 ${id}`)
      entry.onInteract?.()
    })
  return { grabbed, pressE }
}

const boardId = (kind: 'projectBoard' | 'talentBoard') => {
  const found = boardItems().find((b) => b.kind === kind)
  if (found === undefined) throw new Error(`配置裡沒有 ${kind}`)
  return found.item.id
}

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  server.replyFor('/api/projects', 200, [PROJECT])
  server.replyFor('/api/profiles', 200, [PROFILE])
})
afterEach(async () => {
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  await server.close()
})

describe('走到看板前按 E，開得起對應的面板', () => {
  it('按 E 之前沒有面板', () => {
    mount()
    expect(screen.queryByTestId('list-panel')).toBeNull()
  })

  it.each([
    ['[FE-B01-S01] 專案看板開的是案件清單', 'projectBoard', '/api/projects', '案件甲'],
    ['[FE-B01-S02] 人才看板開的是人才清單', 'talentBoard', '/api/profiles', '人才乙'],
  ] as const)('%s', async (_title, kind, path, seen) => {
    const { pressE } = mount()
    pressE(boardId(kind))
    const panel = await screen.findByTestId('list-panel')
    expect(panel.dataset.kind).toBe(BOARD_LIST_KIND[kind])
    await waitFor(() => expect(screen.getByText(seen)).toBeInTheDocument())
    // 面板讀的是**那一種**資料：只打了對應的端點。
    expect(server.calls.map((c) => c.pathname + c.search)).toEqual([`${path}?page=0`])
  })

  it('[FE-B01-S02] 對照：兩塊看板開的不是同一種', async () => {
    // 上面兩條各自成立還不夠 —— 這裡在同一棵樹上先開一塊再開另一塊，
    // 面板要跟著換，而且**不會**把前一種的資料留在畫面上（`S15` 的接線版）。
    const { pressE } = mount()
    pressE(boardId('projectBoard'))
    await waitFor(() => expect(screen.getByText('案件甲')).toBeInTheDocument())
    pressE(boardId('talentBoard'))
    await waitFor(() => expect(screen.getByText('人才乙')).toBeInTheDocument())
    expect(screen.queryByText('案件甲')).toBeNull()
    expect(screen.getByTestId('list-panel').dataset.kind).toBe('profiles')
  })
})

describe('Escape → 面板關閉 → 鎖還回去', () => {
  it('[FE-B01-S16][FE-B01-S17] 按 E 開面板時鎖上；按 Escape 面板消失、鎖放開', async () => {
    const { grabbed, pressE } = mount()
    expect(grabbed().lock.current, '還沒開面板就鎖住了').toBe(false)
    pressE(boardId('projectBoard'))
    await screen.findByTestId('list-panel')
    expect(grabbed().lock.current, '面板開了但世界的輸入沒有鎖 —— 人會在面板後面走動').toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(screen.queryByTestId('list-panel'), 'Escape 沒有關掉面板').toBeNull()
    expect(grabbed().lock.current, '面板關了但鎖沒還 —— 使用者要用滑鼠點一下畫面才走得動').toBe(false)
  })

  it('[FE-B01-S16] 面板關著時按 Escape 不會有任何面板的副作用', () => {
    const { grabbed } = mount()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(screen.queryByTestId('list-panel')).toBeNull()
    expect(grabbed().lock.current).toBe(false)
  })
})
