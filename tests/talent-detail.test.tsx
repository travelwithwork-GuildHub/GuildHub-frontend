import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ProfileOut } from '@/api/contract/rest'
import { VOCABULARY } from '@/errors/uiError'
import { ListPanel } from '@/list-panel/ListPanel'
import { TalentDetail } from '@/talent/TalentDetail'
import { useProfileDetail } from '@/talent/useProfileDetail'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b04-talent-directory/specs/talent-directory/spec.md
//   Requirement: 詳情在同一個面板裡，內容一律來自 GET /api/profiles/{id} —— S06–S10、S15、S16
//
// 這一片是詳情本身：直接掛載 `TalentDetail`（它自己打真的 operation → `contract-server`），
// 以及 `ListPanel` 的 `overlay` 插槽。接上看板（卡片 → 詳情 → 返回）在下一片。
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
const detailPath = (id: string) => `/api/profiles/${id}`
const LABELS = { back: '返回' }

let server: ContractServer
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

const detail = () => screen.getByTestId('talent-detail')
const mount = (id: string, preview: ProfileOut | undefined) =>
  render(<TalentDetail id={id} preview={preview} onBack={() => {}} labels={LABELS} />)

describe('詳情的內容一律來自 GET /api/profiles/{id}', () => {
  it('[FE-B04-S06] 詳情呈現的是回應，不是預覽那一筆', async () => {
    server.replyFor(detailPath(UUID(0)), 200, profile(0, { bio: '詳情端點回的新自介' }))
    mount(UUID(0), profile(0, { bio: '列表上的舊自介' }))
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(screen.getByTestId('talent-bio').textContent, '詳情用的是列表那一筆 —— FE-A04 編輯之後會是舊的').toBe(
      '詳情端點回的新自介',
    )
    expect(server.calls.map((c) => c.pathname)).toEqual([detailPath(UUID(0))])
  })

  it('[FE-B04-S07] 載入中是可辨識的載入中，預覽的名字已經看得到', () => {
    // 詳情端點刻意不給回應：server 之後會回 500，但這裡看的是回應到達之前那一格。
    mount(UUID(0), profile(0))
    const d = detail()
    expect(d.dataset.phase).toBe('loading')
    expect(d.getAttribute('aria-busy')).toBe('true')
    expect(within(d).getByText('人才0'), '載入中沒有預覽 —— 使用者看到的是一片空白').toBeInTheDocument()
  })

  it('[FE-B04-S08] 500 → FE-X04 的載入失敗，不是載入完成', async () => {
    server.replyFor(detailPath(UUID(0)), 500, { detail: '壞了' })
    mount(UUID(0), profile(0))
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    const empty = within(detail()).getByTestId('empty-state')
    expect(empty.dataset.emptyState).toBe('load-failed')
    expect(empty.textContent).toContain(VOCABULARY['server-error'])
    expect(detail().getAttribute('aria-busy')).toBe('false')
    // 預覽還在失敗旁邊 —— 使用者看得出「是誰」載入失敗。
    expect(within(detail()).getByText('人才0')).toBeInTheDocument()
  })

  it('[FE-B04-S08] 失敗之後按重試，再問一次同一個 id', async () => {
    server.replyFor(detailPath(UUID(0)), 500, { detail: '壞了' })
    server.replyFor(detailPath(UUID(0)), 200, profile(0, { bio: '第二次成功' }))
    mount(UUID(0), profile(0))
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    fireEvent.click(within(detail()).getByRole('button', { name: '再試一次' }))
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(screen.getByTestId('talent-bio').textContent).toBe('第二次成功')
    expect(server.calls.map((c) => c.pathname)).toEqual([detailPath(UUID(0)), detailPath(UUID(0))])
  })

  it('[FE-B04-S15] 401 → 權限阻擋，不是載入失敗', async () => {
    server.replyFor(detailPath(UUID(0)), 401, { detail: '未登入' })
    mount(UUID(0), profile(0))
    await waitFor(() => expect(detail().dataset.phase).toBe('error'))
    expect(within(detail()).getByTestId('empty-state').dataset.emptyState).toBe('permission-blocked')
  })

  it('[FE-B04-S09] 同一個詳情從 A 換成 B（A 還沒回來）：畫面是 B，沒有閃過 A 的資料或錯誤', async () => {
    // ⚠️ **兩道防線**：換 id 時 effect 清理中止前一個；沒中止到的靠 `s.id === captured` 擋。
    // 拿掉任一道另一道接得住，兩道都拿掉這一條才紅（實測）。
    server.replyFor(detailPath(UUID(1)), 200, profile(1, { bio: 'B 的自介' }))
    const frames: Array<{ id: string; phase: string; name: string | undefined }> = []
    const { result, rerender } = renderHook(
      (id: string) => {
        const d = useProfileDetail(id, id === UUID(0) ? profile(0) : profile(1))
        frames.push({ id, phase: d.phase, name: d.profile?.display_name })
        return d
      },
      { initialProps: UUID(0) },
    )
    expect(result.current.phase).toBe('loading')
    rerender(UUID(1))
    // 換 id 的那一格：回的就要是 B 的（預覽），不是 A 的。
    expect(result.current.profile?.display_name).toBe('人才1')
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.profile?.bio).toBe('B 的自介')
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.profile?.id, 'A 的東西蓋掉了 B').toBe(UUID(1))
    expect(result.current.phase).toBe('ready')
    const leaked = frames.filter((f) => f.id === UUID(1) && (f.name === '人才0' || f.phase === 'error'))
    expect(leaked, 'prop 已經是 B、回的卻是 A 的資料或 A 的錯誤').toEqual([])
  })

  it('[FE-B04-S10] 詳情的欄位與缺值：技能、time[dateTime]、null 是「未提供」不是 0', async () => {
    const p = profile(0, { hours_per_week: null, bio: null, updated_at: '2026-09-10T12:34:56Z' })
    server.replyFor(detailPath(UUID(0)), 200, p)
    mount(UUID(0), undefined)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(within(detail()).getByText('人才0')).toBeInTheDocument()
    expect(screen.getAllByTestId('talent-skill').map((n) => n.textContent)).toEqual(['技能A0', '技能B0'])
    expect(detail().querySelector('time')?.getAttribute('datetime')).toBe('2026-09-10T12:34:56Z')
    expect(screen.getByTestId('talent-hours').querySelector('[data-missing="hours_per_week"]')).not.toBeNull()
    expect(screen.getByTestId('talent-bio').querySelector('[data-missing="bio"]')).not.toBeNull()
    expect(screen.getByTestId('talent-hours').textContent).not.toMatch(/0/)
  })

  it('[FE-B04-S10] 沒有預覽（深連結的形狀）時載入中沒有名字，但仍是可辨識的載入中', () => {
    mount(UUID(0), undefined)
    expect(detail().dataset.phase).toBe('loading')
    expect(screen.queryByText('人才0')).toBeNull()
  })
})

describe('ListPanel 的 overlay：列表不卸載、不 display:none、標 inert', () => {
  const noop = () => {}
  const panel = (overlay: React.ReactNode) => (
    <ListPanel
      kind="profiles"
      title="清單"
      labels={{ next: '下一頁', close: '關閉' }}
      renderItem={(item) => <span>{item.display_name}</span>}
      onClose={noop}
      overlay={overlay}
    />
  )

  it('[FE-B04-S16] 有 overlay 時列表區 inert、在 DOM 裡、不是 display:none；拿掉之後 inert 消失', async () => {
    server.reply(200, [profile(0), profile(1)])
    const { rerender } = render(panel(undefined))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    const list = screen.getByRole('list')
    const region = screen.getByTestId('list-panel-list')
    expect(region).not.toHaveAttribute('inert')
    list.scrollTop = 137

    rerender(panel(<div data-testid="overlay-content">詳情</div>))
    expect(screen.getByTestId('overlay-content')).toBeInTheDocument()
    expect(region, '詳情開著，列表還可以被點').toHaveAttribute('inert')
    // jsdom 沒有排版引擎：display:none 的元素在它那裡 scrollTop 照樣留著、真瀏覽器不留 —— 直接驗樣式。
    expect(list.isConnected, 'overlay 開著時列表被卸載了').toBe(true)
    expect(region).not.toHaveStyle({ display: 'none' })
    expect(list).not.toHaveStyle({ display: 'none' })

    rerender(panel(undefined))
    expect(screen.queryByTestId('overlay-content')).toBeNull()
    expect(region).not.toHaveAttribute('inert')
    expect(screen.getByRole('list')).toBe(list)
    expect(list.scrollTop).toBe(137)
    // 沒有重打列表。
    expect(server.calls).toHaveLength(1)
  })
})
