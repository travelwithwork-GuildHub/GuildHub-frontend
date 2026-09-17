import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProfileOut } from '@/api/contract/rest'
import { avatarLook } from '@/design/avatar'
import { OwnerCard } from '@/projects/OwnerCard'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b03-project-detail/specs/project-directory/spec.md
//   Requirement: 發案者名片是獨立的載入單元 —— S08（名片那一半）、S09（自己的失敗與重試）、S15（自己的載入中）、S16（換 owner 舊回應不覆蓋）
//   跟案子本體的成對判準（案子 ready 才掛它、它的失敗不碰本體的 phase）在 `project-detail.test.tsx`。
//
// 直接掛載 `OwnerCard`（它經 `useProfileDetail` 打真的 operation → 本機自起的 `contract-server`）。**不連任何團隊共用的位址。**

const UUID = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`
const X = UUID(1)
const Y = UUID(2)
const profile = (id: string, extra: Partial<ProfileOut> = {}): ProfileOut => ({
  id,
  display_name: `發案者-${id.slice(-1)}`,
  avatar_id: 1,
  skills: ['Three.js'],
  hours_per_week: 12,
  bio: '這段自介是哨兵-9c1e',
  updated_at: '2091-01-01T00:00:00Z',
  ...extra,
})
const path = (id: string) => `/api/profiles/${id}`

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
const card = () => screen.getByTestId('owner-card')
const calls = () => server.calls.map((c) => c.pathname)

describe('發案者名片是獨立的載入單元', () => {
  it('[FE-B03-S08] 名字、技能、外觀色跟世界裡同一個 avatar_id 一致；沒有 bio、時數、更新時間', async () => {
    server.replyFor(path(X), 200, profile(X))
    render(<OwnerCard ownerId={X} />)
    await waitFor(() => expect(card().dataset.phase).toBe('ready'))
    expect(within(card()).getByTestId('owner-name').textContent).toBe('發案者-1')
    expect(within(card()).getAllByTestId('talent-skill').map((n) => n.textContent)).toEqual(['Three.js'])
    const css = (color: string) => {
      const el = document.createElement('i')
      el.style.background = color
      return el.style.background
    }
    expect(within(card()).getByTestId('talent-look').style.background).toBe(css(avatarLook(1).body))
    expect(card().textContent).not.toContain('哨兵-9c1e')
    expect(card().textContent).not.toContain('2091')
    expect(card().textContent).not.toContain('12')
    expect(card().querySelector('time'), '名片更新時間會被讀成「最近活躍」').toBeNull()
    expect(calls()).toEqual([path(X)])
  })

  it('[FE-B03-S15] 自己的載入中：data-phase=loading、aria-busy，沒有名字', async () => {
    const held = { release: () => {} }
    server.replyFor(path(X), 200, profile(X), { after: new Promise<void>((r) => (held.release = r)) })
    render(<OwnerCard ownerId={X} />)
    expect(card().dataset.phase).toBe('loading')
    expect(card().getAttribute('aria-busy')).toBe('true')
    expect(within(card()).queryByTestId('owner-name')).toBeNull()
    held.release()
    await waitFor(() => expect(card().dataset.phase).toBe('ready'))
  })

  it('[FE-B03-S09] 500：自己的載入失敗（FE-X04）、可重試，恰好再問一次', async () => {
    server.replyFor(path(X), 500, { detail: '壞了' })
    server.replyFor(path(X), 200, profile(X))
    render(<OwnerCard ownerId={X} />)
    await waitFor(() => expect(card().dataset.phase).toBe('error'))
    expect(within(card()).getByTestId('empty-state').dataset.emptyState).toBe('load-failed')
    fireEvent.click(within(card()).getByRole('button', { name: '再試一次' }))
    await waitFor(() => expect(card().dataset.phase).toBe('ready'))
    expect(calls()).toEqual([path(X), path(X)])
  })

  it('[FE-B03-S16] owner 從 X 換成 Y，X 最後才回：畫面是 Y，X 的名字、技能不出現', async () => {
    const gateX = { release: () => {} }
    server.replyFor(path(X), 200, profile(X, { display_name: 'X 的名字', skills: ['X 的技能'] }), { after: new Promise<void>((r) => (gateX.release = r)) })
    server.replyFor(path(Y), 200, profile(Y, { display_name: 'Y 的名字', skills: ['Y 的技能'] }))
    const view = render(<OwnerCard ownerId={X} />)
    await waitFor(() => expect(calls()).toContain(path(X)))
    view.rerender(<OwnerCard ownerId={Y} />)
    await waitFor(() => expect(within(card()).queryByTestId('owner-name')?.textContent).toBe('Y 的名字'))
    gateX.release()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(card()).getByTestId('owner-name').textContent, 'X 的回應蓋掉了 Y').toBe('Y 的名字')
    expect(card().textContent).not.toContain('X 的技能')
    expect(card().dataset.profileId).toBe(Y)
  })
})
