import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import nextConfig from '../next.config'
import { FirstEntryNotice } from '@/app/world/FirstEntryNotice'
import { RootEntry } from '@/app/RootEntry'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { markFirstEntryDone } from '@/first-entry/seen'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a06-first-entry/specs/first-entry/spec.md
//   Requirement: 網站的根路徑是一條走得完的路 —— S01 / S02 / S03
//   Requirement: 直接進世界的訪客會被提示，但不會被擋 —— S04 / S05 / S06

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
    // 抓不到的理由也要寫下來：`IdentityBadge` 與 `FirstEntryNotice` 在原本的
    // 判準裡是**分開掛載**的，各自有一個 provider —— 所以「一邊變了另一邊
    // 沒變」這件事在那裡不存在。**這一條把它們放進同一個 provider。**
    server.reply(401, { detail: '未登入' })
    server.reply(200, PROFILE)
    render(
      <IdentityProvider>
        <ProfilePanelProvider>
          <IdentityBadge />
        </ProfilePanelProvider>
        <FirstEntryNotice />
      </IdentityProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('identity').textContent).toContain('訪客'))

    type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
    click(screen.getByRole('button', { name: '建立我的身分' }))
    await waitFor(() => expect(screen.getByTestId('recovery-key')).toBeDefined())
    type(screen.getByLabelText(/最後 6 個字/), PROFILE.id.slice(-6))
    // ⚠️ **等按鈕真的被啟用再按。** 少了這一步這條判準會**不穩定** ——
    // 本機夠快所以綠，CI 慢一點就會在 React 還沒把 `disabled` 拿掉的時候
    // 按下去，而按一個 disabled 的按鈕什麼都不會發生。
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '進入世界' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    )
    click(screen.getByRole('button', { name: '進入世界' }))

    await waitFor(() => expect(screen.getByTestId('identity').textContent).toContain('阿福'))
    expect(screen.getByTestId('identity').textContent, '走完了還顯示訪客').not.toContain('訪客')
  })
})

describe('世界裡的引導層', () => {
  it('[FE-A06-S04] 訪客看得到，而且關得掉', async () => {
    server.reply(401, { detail: '未登入' })
    wrap(<FirstEntryNotice />)
    await waitFor(() => expect(screen.getByTestId('first-entry-notice')).toBeDefined())

    click(screen.getByRole('button', { name: '先四處看看' }))

    expect(screen.queryByTestId('first-entry-notice')).toBeNull()
  })

  it('[FE-A06-S04] 已登入的人看不到它', async () => {
    server.reply(200, PROFILE)
    wrap(<FirstEntryNotice />)

    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryByTestId('first-entry-notice')).toBeNull()
  })

  it('[FE-A06-S05] 它不吃掉世界的操作', async () => {
    server.reply(401, { detail: '未登入' })
    wrap(<FirstEntryNotice />)
    const overlay = await screen.findByTestId('first-entry-notice')

    // ⚠️ **這一條跟「關得掉」不能互相取代。** 上一條驗的是「關掉之後還能動」，
    // 這一條驗的是**還沒關掉的時候就能動** —— 一個蓋住整個畫面、吃掉所有
    // 指標事件的容器會通過上一條、在這裡紅
    expect(overlay.className, '滿版的容器沒有放掉指標事件').toContain('pointer-events-none')
    const card = overlay.querySelector('section')
    expect(card?.className, '卡片自己收不到點擊').toContain('pointer-events-auto')
  })

  it('[FE-A06-S06] 關掉不等於完成 —— 重新進來還會看到', async () => {
    server.reply(401, { detail: '未登入' })
    const first = wrap(<FirstEntryNotice />)
    await waitFor(() => expect(screen.getByTestId('first-entry-notice')).toBeDefined())
    click(screen.getByRole('button', { name: '先四處看看' }))
    first.unmount()

    server.reply(401, { detail: '未登入' })
    wrap(<FirstEntryNotice />)

    // 把「關掉」記成「完成」的話，一個手滑點掉的人再也不會被提示
    await waitFor(() => expect(screen.getByTestId('first-entry-notice')).toBeDefined())
  })

  it('[FE-A06-S06] 真的走完了就不再出現', async () => {
    // **對照方向。** 少了它，一個「永遠顯示提示」的實作會通過上一條
    markFirstEntryDone()
    server.reply(401, { detail: '未登入' })
    wrap(<FirstEntryNotice />)

    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryByTestId('first-entry-notice')).toBeNull()
  })
})
