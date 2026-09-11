import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PAGE_SIZE } from '@/api/contract/limits'
import type { ProfileOut } from '@/api/contract/rest'
import { avatarLook } from '@/design/avatar'
import { VOCABULARY } from '@/errors/uiError'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { TalentCard } from '@/talent/TalentCard'
import { TalentDetail } from '@/talent/TalentDetail'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b04-talent-directory/specs/talent-directory/spec.md
//   Requirement: 人才卡讓人一眼判斷 —— S01／S02／S03
//   Requirement: 卡片是控制項 —— S04／S05
//   Requirement: 詳情在同一個面板裡，內容一律來自 GET /api/profiles/{id} —— S06–S10、S15、S16
//   Requirement: 返回列表時，頁碼與捲動位置都還在 —— S11／S12
//   （S13／S14 在 `talent-detail-input.test.tsx`：要 three 的 renderer）
//
// 元件判準直接掛載；接線判準走真的 `BoardPanel` ＋真的 operation ＋ `contract-server`。
// **不連任何團隊共用的位址。**

const UUID = (n: number) => `22222222-2222-2222-2222-${String(n).padStart(12, '0')}`
const profile = (n: number, extra: Partial<ProfileOut> = {}): ProfileOut => ({
  id: UUID(n),
  display_name: `人才${n}`,
  avatar_id: n % 2,
  skills: [`技能A${n}`, `技能B${n}`],
  hours_per_week: 10 + n,
  bio: `自介${n}`,
  updated_at: '2026-09-09T00:00:00Z',
  ...extra,
})
const many = (count: number, from = 0) => Array.from({ length: count }, (_, i) => profile(from + i))

describe('人才卡讓人一眼判斷', () => {
  it('[FE-B04-S01] 名字、技能、時數都在；外觀色跟世界裡同一個 avatar_id 一致、不同 avatar_id 不同色', () => {
    const a = render(<TalentCard profile={profile(1, { avatar_id: 0 })} onOpen={() => {}} />)
    expect(screen.getByText('人才1')).toBeInTheDocument()
    expect(screen.getAllByTestId('talent-skill').map((n) => n.textContent)).toEqual(['技能A1', '技能B1'])
    expect(screen.getByTestId('talent-hours').textContent).toContain('11')
    const lookA = screen.getByTestId('talent-look').style.background
    a.unmount()
    render(<TalentCard profile={profile(1, { avatar_id: 1 })} onOpen={() => {}} />)
    const lookB = screen.getByTestId('talent-look').style.background
    expect(lookA, '外觀色沒有跟著 avatar_id 變').not.toBe(lookB)
    // 世界裡同一個 avatar_id 用的就是這一份對應 —— 卡片不自己寫一份色表。
    // jsdom 會把 `#rrggbb` 正規化成 `rgb(…)`，所以拿同一個管道轉一次再比。
    const css = (color: string) => {
      const el = document.createElement('i')
      el.style.background = color
      return el.style.background
    }
    expect(lookA).toBe(css(avatarLook(0).body))
    expect(lookB).toBe(css(avatarLook(1).body))
  })

  it('[FE-B04-S02] 沒有時數不是 0 小時', () => {
    render(<TalentCard profile={profile(1, { hours_per_week: null })} onOpen={() => {}} />)
    const hours = screen.getByTestId('talent-hours')
    expect(hours.textContent, '`null` 被畫成 0 了 ——「沒填」跟「零小時」是兩件事').not.toMatch(/0/)
    expect(within(hours).getByText((_, el) => el?.getAttribute('data-missing') === 'hours_per_week')).toBeInTheDocument()
  })

  it('[FE-B04-S03] bio 與 updated_at 不上卡片', () => {
    const SENTINEL = '這段自介是哨兵-7f2c'
    render(
      <TalentCard profile={profile(1, { bio: SENTINEL, updated_at: '2091-01-01T00:00:00Z' })} onOpen={() => {}} />,
    )
    const card = screen.getByTestId('talent-card')
    expect(card.textContent).not.toContain(SENTINEL)
    expect(card.textContent).not.toContain('2091')
    expect(card.querySelector('time'), '卡片上出現了時間元素 —— updated_at 會被讀成「最近活躍」').toBeNull()
  })
})

// ── 接線：真的 BoardPanel ────────────────────────────────────────────

let server: ContractServer
const LIST = '/api/profiles'
const detailPath = (id: string) => `/api/profiles/${id}`

function Grab({ sinkRef }: { sinkRef: RefObject<InteractableRegistry | null> }) {
  const { registry } = useInteraction()
  useEffect(() => {
    sinkRef.current = registry
  }, [sinkRef, registry])
  return null
}

/** 掛載真的 provider 樹並按 E 開人才看板。 */
function openTalentBoard() {
  const sinkRef: RefObject<InteractableRegistry | null> = { current: null }
  render(
    <InteractionProvider>
      <ListPanelProvider>
        <Grab sinkRef={sinkRef} />
        <BoardTargets />
        <BoardPanel />
      </ListPanelProvider>
    </InteractionProvider>,
  )
  const id = boardItems().find((b) => b.kind === 'talentBoard')?.item.id
  if (id === undefined) throw new Error('配置裡沒有 talentBoard')
  act(() => {
    sinkRef.current?.entries.get(id)?.onInteract?.()
  })
}
const cards = () => screen.queryAllByTestId('talent-card')
const detail = () => screen.getByTestId('talent-detail')
const calls = () => server.calls.map((c) => c.pathname + c.search)

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})
afterEach(async () => {
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  await server.close()
})

describe('卡片是控制項，滑鼠與鍵盤都開得了詳情', () => {
  it('[FE-B04-S04] 點第 N 筆開的是第 N 筆，詳情請求帶第 N 筆的 id', async () => {
    server.replyFor(LIST, 200, many(3))
    server.replyFor(detailPath(UUID(2)), 200, profile(2))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(3))
    fireEvent.click(cards()[2] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(detail().dataset.profileId).toBe(UUID(2))
    expect(within(detail()).getByText('人才2')).toBeInTheDocument()
    expect(calls().at(-1)).toBe(detailPath(UUID(2)))
  })

  it('[FE-B04-S05] 卡片是可聚焦的 <button> —— Enter／Space 是瀏覽器原生的啟動', async () => {
    // ⚠️ **誠實地說，jsdom 不會把 Enter／Space 的 keydown 變成 click**（那是瀏覽器的啟動行為），
    // 而 repo 沒有 user-event。這裡守的是讓那件事成立的前提：它是一個真的 `<button>`、
    // 可以聚焦、沒有被 `tabIndex=-1` 拿掉。真的按 Enter 在 `tests/e2e/board-panel.mjs`。
    // 做成 `div onClick` 的話這三條都紅 —— 而滑鼠使用者完全看不出差別。
    server.replyFor(LIST, 200, many(2))
    server.replyFor(detailPath(UUID(0)), 200, profile(0))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(2))
    const first = cards()[0] as HTMLElement
    expect(first.tagName, '卡片不是 <button> —— Space 一定會漏掉').toBe('BUTTON')
    expect(first.tabIndex, '卡片被拿出了 Tab 順序').toBeGreaterThanOrEqual(0)
    first.focus()
    expect(document.activeElement, '卡片不可聚焦 —— 鍵盤使用者 Tab 不到').toBe(first)
    // 啟動之後開的是這一筆。
    fireEvent.click(first)
    await waitFor(() => expect(detail().dataset.profileId).toBe(UUID(0)))
  })
})

describe('詳情在同一個面板裡，內容一律來自 GET /api/profiles/{id}', () => {
  it('[FE-B04-S06] 詳情呈現的是回應，不是列表那一筆', async () => {
    server.replyFor(LIST, 200, [profile(0, { bio: '列表上的舊自介' })])
    server.replyFor(detailPath(UUID(0)), 200, profile(0, { bio: '詳情端點回的新自介' }))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(screen.getByTestId('talent-bio').textContent, '詳情用的是列表那一筆 —— FE-A04 編輯之後會是舊的').toBe(
      '詳情端點回的新自介',
    )
  })

  it('[FE-B04-S07] 載入中是可辨識的載入中，預覽的名字已經看得到', async () => {
    server.replyFor(LIST, 200, [profile(0)])
    // 詳情端點刻意不給回應：contract-server 會回 500，但那是**之後**的事 —— 這裡看的是回應到達之前那一格。
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(cards()[0] as HTMLElement)
    const d = detail()
    expect(d.dataset.phase).toBe('loading')
    expect(d.getAttribute('aria-busy')).toBe('true')
    expect(within(d).getByText('人才0'), '載入中沒有預覽 —— 使用者看到的是一片空白').toBeInTheDocument()
  })

  it('[FE-B04-S08] 500 → FE-X04 的載入失敗，不是載入完成', async () => {
    server.replyFor(LIST, 200, [profile(0)])
    server.replyFor(detailPath(UUID(0)), 500, { detail: '壞了' })
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    const empty = within(detail()).getByTestId('empty-state')
    expect(empty.dataset.emptyState).toBe('load-failed')
    expect(empty.textContent).toContain(VOCABULARY['server-error'])
    expect(detail().getAttribute('aria-busy')).toBe('false')
  })

  it('[FE-B04-S15] 401 → 權限阻擋，不是載入失敗', async () => {
    server.replyFor(LIST, 200, [profile(0)])
    server.replyFor(detailPath(UUID(0)), 401, { detail: '未登入' })
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    expect(within(detail()).getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked')
  })

  it('[FE-B04-S09] 先開 A 再開 B，A 晚到：畫面是 B', async () => {
    // A 的詳情端點不給回應（server 會回 500，但那個 500 帶的是 A 的 identity —— 也不得提交）；
    // B 立刻回。順序：點 A → 返回 → 點 B → B 到 → 之後 A 的 rejection 才到。
    server.replyFor(LIST, 200, many(2))
    server.replyFor(detailPath(UUID(1)), 200, profile(1, { bio: 'B 的自介' }))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0] as HTMLElement)
    expect(detail().dataset.profileId).toBe(UUID(0))
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    fireEvent.click(cards()[1] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(detail().dataset.profileId).toBe(UUID(1))
    expect(screen.getByTestId('talent-bio').textContent).toBe('B 的自介')
    // 等 A 那一條有機會回來，再確認畫面沒被改掉。
    await new Promise((r) => setTimeout(r, 50))
    expect(detail().dataset.profileId, 'A 晚到的回應蓋掉了 B').toBe(UUID(1))
    expect(detail().dataset.phase).toBe('ready')
  })

  it('[FE-B04-S10] 詳情的欄位與缺值：技能、time[dateTime]、null 是「未提供」不是 0', async () => {
    const p = profile(0, { hours_per_week: null, bio: null, updated_at: '2026-09-10T12:34:56Z' })
    server.replyFor(detailPath(UUID(0)), 200, p)
    render(<TalentDetail id={UUID(0)} preview={undefined} onBack={() => {}} labels={{ back: '返回' }} />)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(within(detail()).getByText('人才0')).toBeInTheDocument()
    expect(screen.getAllByTestId('talent-skill').map((n) => n.textContent)).toEqual(['技能A0', '技能B0'])
    expect(detail().querySelector('time')?.getAttribute('datetime')).toBe('2026-09-10T12:34:56Z')
    expect(screen.getByTestId('talent-hours').querySelector('[data-missing="hours_per_week"]')).not.toBeNull()
    expect(screen.getByTestId('talent-bio').querySelector('[data-missing="bio"]')).not.toBeNull()
    expect(screen.getByTestId('talent-hours').textContent).not.toMatch(/0/)
  })

  it('[FE-B04-S16] 詳情顯示時列表區是 inert，返回後不是', async () => {
    server.replyFor(LIST, 200, [profile(0)])
    server.replyFor(detailPath(UUID(0)), 200, profile(0))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(1))
    const list = screen.getByTestId('list-panel-list')
    expect(list).not.toHaveAttribute('inert')
    fireEvent.click(cards()[0] as HTMLElement)
    expect(list, '詳情開著，列表還可以被點').toHaveAttribute('inert')
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    expect(list).not.toHaveAttribute('inert')
  })
})

describe('詳情層的 Escape 照今天的全域契約', () => {
  it('[FE-B04-S14] 詳情開著按 Escape：詳情不再顯示、面板關閉', async () => {
    // 世界的移動輸入那一半在 `talent-detail-input.test.tsx`（要 three 的 renderer）。
    server.replyFor(LIST, 200, [profile(0)])
    server.replyFor(detailPath(UUID(0)), 200, profile(0))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(screen.queryByTestId('talent-detail')).toBeNull()
    expect(screen.queryByTestId('list-panel'), '詳情層的 Escape 沒有照 FE-B01-S16 關面板').toBeNull()
  })
})

describe('返回列表時，頁碼與捲動位置都還在', () => {
  it('[FE-B04-S11] 第二頁進去、第二頁回來，沒有重打列表', async () => {
    server.replyFor(LIST, 200, many(PAGE_SIZE))
    server.replyFor(LIST, 200, many(3, PAGE_SIZE))
    server.replyFor(detailPath(UUID(PAGE_SIZE)), 200, profile(PAGE_SIZE))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
    await waitFor(() => expect(cards()).toHaveLength(3))
    const listCallsBefore = calls().filter((c) => c.startsWith(`${LIST}?`)).length
    fireEvent.click(cards()[0] as HTMLElement)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('talent-detail')).toBeNull()
    expect(cards(), '返回之後回到第一頁了').toHaveLength(3)
    expect(cards()[0]?.dataset.profileId).toBe(UUID(PAGE_SIZE))
    expect(calls().filter((c) => c.startsWith(`${LIST}?`)).length, '返回時重打了列表').toBe(listCallsBefore)
  })

  it('[FE-B04-S12] 捲動位置還在，列表在 DOM 裡而且不是 display:none', async () => {
    server.replyFor(LIST, 200, many(PAGE_SIZE))
    server.replyFor(detailPath(UUID(0)), 200, profile(0))
    openTalentBoard()
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    const list = screen.getByRole('list')
    list.scrollTop = 137
    fireEvent.click(cards()[0] as HTMLElement)
    // jsdom 沒有排版引擎：display:none 的元素在它那裡 scrollTop 照樣留著、真瀏覽器不留 —— 所以要直接驗樣式。
    expect(list.isConnected, '詳情開著時列表被卸載了').toBe(true)
    expect(list).not.toHaveStyle({ display: 'none' })
    expect(screen.getByTestId('list-panel-list')).not.toHaveStyle({ display: 'none' })
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    expect(screen.getByRole('list')).toBe(list)
    expect(list.scrollTop).toBe(137)
  })
})
