import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import nextConfig from '../next.config'
import { WorldEntryGate } from '@/app/world/WorldEntryGate'
import { RootEntry } from '@/app/RootEntry'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/specs/first-entry/spec.md（fe-a06-first-entry 已合併的 delta）
//   Requirement: 網站的根路徑是一條走得完的路 —— S01 / S02 / S03
//   Requirement: 進世界前要先有名字：訪客被導到取名，不匿名旁觀 —— S04 / S05 / S06
//
// ⚠️ 2026-09-22 二次反轉：`/world` 對訪客的表面從「可關掉的角落提示」變成
// **取代世界的取名門檻**（`WorldEntryGate`：guest 時不 render 世界、改 render 取名）。
// 下面的 `S04`／`S05`／`S06` 驗的是門檻行為，不是舊的 dismiss 提示。

let server: ContractServer
const replaced: string[] = []

// ⚠️ **只換掉導航。** `useRouter` 在測試環境沒有 Next 的 app router context，
// 而這裡要驗的是「有沒有導過去」，不是 Next 自己的路由實作。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replaced.push(href) }),
}))

const PROFILE = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: '阿福',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
}

const wrap = (node: React.ReactNode) => render(<IdentityProvider>{node}</IdentityProvider>)
function type(field: HTMLElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

beforeEach(async () => {
  replaced.length = 0
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
})

afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  localStorage.clear()
})

describe('根路徑是網站的入口', () => {
  it('[FE-X01-S01] `/` 上沒有轉址規則了', async () => {
    // ⚠️ `redirects()` 的優先序在路由之前 —— 留著的話新的首頁永遠看不到，
    // **而畫面上看不出任何異狀**
    const redirects = (await nextConfig.redirects?.()) ?? []
    expect(redirects.find((r) => r.source === '/')).toBeUndefined()
  })

  it('[FE-A06-S01] 沒有身分的人打開 `/`，看到的是首次進入流程', async () => {
    server.reply(401, { detail: '未登入' })
    wrap(<RootEntry />)

    await waitFor(() => expect(screen.getByLabelText('在世界裡顯示的名字')).toBeDefined())
    expect(replaced, '沒有身分卻被送走了').toEqual([])
  })

  it('[FE-A06-S03] 已經有身分的人打開 `/`，直接到世界', async () => {
    server.reply(200, PROFILE)
    wrap(<RootEntry />)

    await waitFor(() => expect(replaced).toEqual(['/world']))
    // **對照方向。** 少了它，一個「所有人都停在 `/`」的實作會通過上一條
    expect(screen.queryByLabelText('在世界裡顯示的名字'), '已經有身分還被問名字').toBeNull()
  })

  it('[FE-A06-S03] 還沒問到答案時，不先顯示流程', () => {
    server.reply(200, PROFILE)
    wrap(<RootEntry />)

    // 第一幀。已登入的人在這一幀看到「取一個名字」的話，畫面會閃一下
    expect(screen.queryByLabelText('在世界裡顯示的名字')).toBeNull()
  })

  it('[FE-A06-S03] 問不到身分時放行進世界，不擋在門口', async () => {
    server.reply(500, { detail: '壞掉了' })
    wrap(<RootEntry />)

    // 誤擋讓人完全進不去；誤放最多是他以訪客的身分逛（世界本來就允許訪客）
    await waitFor(() => expect(replaced).toEqual(['/world']))
  })
})

describe('走完流程之後，身分立刻反映在畫面上', () => {
  it('[FE-A06-S02] 在世界裡走完流程，標題列不必重整就變成新名字', async () => {
    // ⚠️⚠️ **這一條是端到端第一次跑就抓到的 bug，而單元判準原本抓不到。**
    // 症狀：在世界裡走完首次進入流程之後，標題列仍然顯示「訪客」，
    // 要重整才會變。原因是 `IdentityProvider` 只在掛載時問一次後端，
    // 而流程建立的新身分沒有交給它。
    //
    // 抓不到的理由也要寫下來：`IdentityBadge` 與取名門檻在原本的
    // 判準裡是**分開掛載**的，各自有一個 provider —— 所以「一邊變了另一邊
    // 沒變」這件事在那裡不存在。**這一條把它們放進同一個 provider。**
    server.reply(401, { detail: '未登入' })
    server.reply(200, PROFILE)
    render(
      <IdentityProvider>
        <ProfilePanelProvider>
          <IdentityBadge />
        </ProfilePanelProvider>
        <WorldEntryGate>
          <div data-testid="world">世界</div>
        </WorldEntryGate>
      </IdentityProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('identity').textContent).toContain('訪客'))

    // 取名進世界（無金鑰儀式）：送出名字 → 身分交給同一個 provider，標題列立刻變、門檻讓出世界。
    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    click(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByTestId('identity').textContent).toContain('阿福'))
    expect(screen.getByTestId('identity').textContent, '走完了還顯示訪客').not.toContain('訪客')
  })
})

// 進世界前要先有名字：`WorldEntryGate` guest 時不 render 世界、改 render 取名門檻。
const gated = () =>
  wrap(
    <WorldEntryGate>
      <div data-testid="world">世界</div>
    </WorldEntryGate>,
  )

describe('進世界前的取名門檻', () => {
  it('[FE-A06-S04] 訪客看到的是取名，不是可操作的世界', async () => {
    server.reply(401, { detail: '未登入' })
    gated()

    await waitFor(() => expect(screen.getByTestId('world-entry-gate')).toBeDefined())
    expect(screen.getByLabelText('在世界裡顯示的名字'), '門檻沒給取名輸入框').toBeDefined()
    // ⚠️ **取代世界，不是蓋住世界。** 世界根本沒 render —— 沒有世界可漏 WASD（`S04` method-agnostic）。
    expect(screen.queryByTestId('world'), '取名之前世界就 render 了').toBeNull()
  })

  it('[FE-A06-S05] 沒有繞過取名的旁觀出口', async () => {
    server.reply(401, { detail: '未登入' })
    gated()
    await screen.findByTestId('world-entry-gate')

    // 反轉了前一版：不再有「先四處看看」這種關閉／略過取名而直接操作世界的控制。
    expect(screen.queryByRole('button', { name: '先四處看看' }), '留著旁觀出口').toBeNull()
    expect(screen.queryByTestId('world'), '有一條繞過取名去看世界的路').toBeNull()
  })

  it('[FE-A06-S06] 取名之後才進世界', async () => {
    server.reply(401, { detail: '未登入' })
    server.reply(200, PROFILE)
    gated()
    await screen.findByTestId('world-entry-gate')

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    click(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByTestId('world')).toBeDefined())
    expect(screen.queryByTestId('world-entry-gate'), '進世界了門檻還在').toBeNull()
  })

  it('[FE-A06-S06] 已經有身分的人直接進世界，不被再問一次名字', async () => {
    // **對照方向。** 少了它，一個「對所有人都先顯示取名」的實作會擋到已具名的人。
    server.reply(200, PROFILE)
    gated()

    await waitFor(() => expect(screen.getByTestId('world')).toBeDefined())
    expect(screen.queryByTestId('world-entry-gate'), '已登入還被門檻擋').toBeNull()
    expect(screen.queryByLabelText('在世界裡顯示的名字'), '已登入還被問名字').toBeNull()
  })

  it('[FE-A06-S06] 問不到身分（unavailable）時放行進世界，不擋在門口', async () => {
    // 誤擋讓人完全進不去；誤放最多是他以未定身分逛，代價不對稱（沿用 `RootEntry` 的 passThrough）。
    server.reply(500, { detail: '壞掉了' })
    gated()

    await waitFor(() => expect(screen.getByTestId('world')).toBeDefined())
    expect(screen.queryByTestId('world-entry-gate')).toBeNull()
  })
})
