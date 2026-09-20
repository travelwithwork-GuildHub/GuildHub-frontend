import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { ACCOUNT_LABELS, LoginForm } from '@/app/login/LoginForm'
import { AppHeader } from '@/app/world/AppHeader'
import { FirstEntryNotice } from '@/app/world/FirstEntryNotice'
import { CHAT_COMPOSER_LABELS, SceneChatComposer } from '@/chat/SceneChatComposer'
import { AvatarDraftProvider } from '@/identity/AvatarDraftProvider'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { COMPOSE_LABELS } from '@/inbox/ComposeForm'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { ProfilePanel } from '@/profile/ProfilePanel'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { startContractServer, type ContractServer } from './support/contract-server'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { ME, OTHER, btn, click, detail, gate, mountDetail, project, refreshRooms } from './support/project-lifecycle'

// 規格：openspec/changes/fe-x16-dom-visual-and-flow/specs/dom-visual-system/spec.md
//   Requirement: 控制項分三級，每個操作區至多一個主要動作 —— S09（jsdom：逐操作區數 `data-tier="primary"`；三級的顏色與焦點環在 e2e `dom-visual.mjs` 的 S10）
//   Requirement: 標題列是固定的導覽 —— S19 的結構半邊（品牌第一、其餘互動控制在它右側、`≤ 5`；rect 相同與不相交在 e2e `dom-surfaces.mjs`）
//
// 「主要動作」數的是**常數帶出來的屬性**（design D4／D7），不比 class；「可見且啟用」＝不是 `disabled`、不是 `aria-disabled`、沒有 `inert`／`hidden` 的祖先。
// 零個是合法的（送出中、載入中、沒改的名片），所以每個狀態都要真的走到再數 —— 不是「有 primary 就對」。
// 每個表面用它自己既有判準的樹（登入頁、首次進入、案件詳情、名片、聊天框）；REST 走本機自己起的 contract-server。**不連任何團隊共用的位址。**

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }))
vi.mock('@/realtime/RealtimeGenerationProvider', () => ({ useRealtimeGeneration: () => ({ generation: 0, rejoin: vi.fn() }) }))

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
  refreshRooms.mockReset()
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/world')
})

/** 一個操作區裡可見且啟用的主要動作，回它們的文字（判準比的是「是哪一個」，不只是個數）。 */
const primaries = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-tier="primary"]')]
    .filter((el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true' && el.closest('[inert], [hidden]') === null)
    .map((el) => el.textContent?.trim() ?? '')
const tier = (el: HTMLElement) => el.getAttribute('data-tier')
/** 打字：input 與 textarea 各走自己的 setter（名片的自介、收件匣的信是 textarea）。 */
async function type(el: HTMLElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const button = (root: HTMLElement, name: string | RegExp) => within(root).getByRole('button', { name, hidden: true }) as HTMLButtonElement
const form = (heading: string) => document.querySelector(`form[aria-labelledby="${heading}"]`) as HTMLElement
const keySection = () => document.querySelector('section[aria-labelledby="key-heading"]') as HTMLElement
const KEY = 'abc1def2-3a4b-5c6d-7e8f-9012ab34cdef'
const PROFILE = { ...ME, id: KEY, display_name: '阿福' }

describe('每個操作區至多一個主要動作，列出的狀態裡它是那一個', () => {
  it('[FE-X16-S09] /login 三個表單各自一個主要動作：進入世界／用金鑰回來／登入或註冊（依分頁）；暱稱那條在最前、標題層次領先', async () => {
    render(<LoginForm />)
    await type(form('nickname-heading').querySelector('input')!, '阿福')
    expect(primaries(form('nickname-heading'))).toEqual(['進入世界'])
    await type(form('resume-heading').querySelector('input')!, KEY)
    expect(primaries(form('resume-heading'))).toEqual(['用金鑰回來'])
    const account = screen.getByTestId('account-section')
    expect(primaries(account)).toEqual([ACCOUNT_LABELS.submitLogin])
    click(button(account, ACCOUNT_LABELS.tabRegister))
    expect(primaries(account)).toEqual([ACCOUNT_LABELS.submitRegister])
    // 領先靠版面順序與標題層次，不靠降級別人的按鈕（design D4）
    const forms = [...document.querySelectorAll('form, section[data-testid="account-section"]')]
    expect(forms[0]).toBe(form('nickname-heading'))
    expect(document.getElementById('nickname-heading')?.getAttribute('data-text')).toBe('title')
    for (const id of ['resume-heading', 'account-heading']) expect(document.getElementById(id)?.getAttribute('data-text'), id).toBe('heading')
  })

  it('[FE-X16-S09] 金鑰交接：複製前「複製鑰匙」主要、「進入世界」鎖著；複製後「進入世界」主要、「複製鑰匙」退成次要；填回尾碼也一樣', async () => {
    const reach = async () => {
      server.reply(200, PROFILE)
      render(<LoginForm clipboard={{ async write() {} }} />)
      await type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
      click(screen.getByRole('button', { name: '進入世界' }))
      await waitFor(() => expect(screen.getByTestId('recovery-key').textContent).toBe(KEY))
    }
    await reach()
    expect(primaries(keySection())).toEqual(['複製鑰匙'])
    expect(button(keySection(), '進入世界').disabled).toBe(true)
    click(button(keySection(), '複製鑰匙'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已經複製'))
    expect(primaries(keySection())).toEqual(['進入世界'])
    expect(tier(button(keySection(), '複製鑰匙'))).toBe('secondary')

    cleanup()
    await reach()
    await type(screen.getByLabelText(/最後 6 個字/), KEY.slice(-6))
    expect(primaries(keySection())).toEqual(['進入世界'])
    expect(tier(button(keySection(), '複製鑰匙'))).toBe('secondary')
  })

  it('[FE-X16-S09] 訪客提示：「建立我的身分」主要、「先四處看看」文字級', async () => {
    server.reply(401, { detail: 'no' })
    render(
      <IdentityProvider>
        <FirstEntryNotice />
      </IdentityProvider>,
    )
    const notice = await screen.findByTestId('first-entry-notice')
    expect(primaries(notice)).toEqual(['建立我的身分'])
    expect(tier(button(notice, '先四處看看'))).toBe('tertiary')
  })

  it('[FE-X16-S09] owner 案件詳情：招募中「成軍」、表單「確定成軍」、送出中零個；密碼呈現中「複製密碼」主要、「寄給隊員」與「結案」次要', async () => {
    const p = project(1)
    await mountDetail(server, p)
    const body = () => screen.getByTestId('owner-actions-body')
    expect(primaries(body())).toEqual(['成軍'])
    click(btn('成軍'))
    expect(primaries(body())).toEqual(['確定成軍'])
    expect(tier(btn('取消'))).toBe('secondary')
    await type(within(detail()).getByLabelText('房間密碼'), 'demo-1234')
    const held = gate()
    server.replyFor(`/api/projects/${p.id}/form-team`, 200, { ...p, status: 'active', room_template: 0 }, { after: held.promise })
    server.replyFor('/api/projects', 200, [])
    await act(async () => (screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit())
    await waitFor(() => expect(server.calls.filter((c) => c.pathname === `/api/projects/${p.id}/form-team`)).toHaveLength(1))
    expect(primaries(body()), '送出中要零個').toEqual([])
    await act(async () => held.release())
    await waitFor(() => expect(screen.getByTestId('room-password-reveal')).toBeDefined())
    expect(primaries(body())).toEqual(['複製密碼'])
    expect(tier(btn('寄給隊員'))).toBe('secondary')
    expect(tier(btn('結案'))).toBe('secondary')
  })

  it('[FE-X16-S09] owner 已成軍：「結案」主要；結案確認「取消」主要、詳情零個；送出中零個', async () => {
    const p = project(2, { status: 'active', room_template: 0 })
    await mountDetail(server, p)
    const body = () => screen.getByTestId('owner-actions-body')
    expect(primaries(body())).toEqual(['結案'])
    click(btn('結案'))
    const confirm = screen.getByTestId('close-project-confirm')
    expect(primaries(confirm)).toEqual(['取消'])
    expect(tier(button(confirm, '確定結案'))).toBe('secondary')
    expect(primaries(body()), '確認視窗開著時詳情是 inert').toEqual([])
    const held = gate()
    server.replyFor(`/api/projects/${p.id}/close`, 200, { ...p, status: 'closed' }, { after: held.promise })
    server.replyFor('/api/projects', 200, [])
    click(button(confirm, '確定結案'))
    await waitFor(() => expect(server.calls.filter((c) => c.pathname === `/api/projects/${p.id}/close`)).toHaveLength(1))
    expect(primaries(confirm), '送出中要零個').toEqual([])
    await act(async () => held.release())
  })

  it('[FE-X16-S09] 非 owner 案件詳情：「私訊發案者」主要；進到收件匣對話：「寄出」主要', async () => {
    const p = project(3)
    await mountDetail(server, p, { me: OTHER })
    expect(primaries(detail())).toEqual(['私訊發案者'])
    server.replyFor('/api/messages', 200, [])
    click(btn('私訊發案者'))
    const thread = await screen.findByTestId('inbox-thread')
    const field = await within(thread).findByLabelText(COMPOSE_LABELS.body)
    await type(field, '你好')
    expect(primaries(screen.getByTestId('inbox-panel'))).toEqual([COMPOSE_LABELS.send])
  })

  it('[FE-X16-S09] 我的名片：看的時候零個；改之前「儲存」是 disabled（零個）；改了「儲存」主要', async () => {
    server.reply(200, ME)
    render(
      <IdentityProvider>
        <ProfilePanelProvider>
          <InteractionProvider>
            <IdentityBadge />
            <ProfilePanel />
          </InteractionProvider>
        </ProfilePanelProvider>
      </IdentityProvider>,
    )
    click(await screen.findByRole('button', { name: /^我的名片/ }))
    await screen.findByTestId('profile-panel') // 名片內容 lazy（FE-X15 --panel-profile）
    const panel = () => screen.getByTestId('profile-panel')
    expect(primaries(panel())).toEqual([])
    click(button(panel(), '編輯'))
    expect(button(panel(), '儲存').disabled, '沒改的儲存要是 disabled').toBe(true)
    expect(primaries(panel())).toEqual([])
    await type(within(panel()).getByLabelText('自我介紹'), '改了')
    expect(primaries(panel())).toEqual(['儲存'])
  })

  it('[FE-X16-S09] 場景聊天框：零個主要動作，送出是次要', () => {
    render(<SceneChatComposer send={vi.fn()} />)
    expect(primaries(document.body)).toEqual([])
    expect(tier(screen.getByRole('button', { name: CHAT_COMPOSER_LABELS.submit }))).toBe('secondary')
  })
})

describe('標題列是固定的導覽', () => {
  const mountHeader = async (guest: boolean) => {
    if (guest) server.reply(401, { detail: 'no' })
    else server.reply(200, ME)
    render(
      <IdentityProvider>
        <AvatarDraftProvider>
          <ProfilePanelProvider>
            <InboxPanelProvider>
              <AppHeader />
            </InboxPanelProvider>
          </ProfilePanelProvider>
        </AvatarDraftProvider>
      </IdentityProvider>,
    )
    // 身分問完之後再抓節點：`InboxPanelProvider` 以 me 為 key，問完會把整列重掛一次（先抓到的是卸掉的那個）
    await waitFor(() => expect(screen.queryByText('確認身分中⋯')).toBeNull())
    return screen.getByTestId('app-header')
  }
  it.each([
    ['訪客', true],
    ['已登入在大廳', false],
  ])('[FE-X16-S19] %s：第一個元素是品牌，互動控制全部在品牌右側且 ≤ 5', async (_who, guest) => {
    const header = await mountHeader(guest)
    const brand = header.firstElementChild as HTMLElement
    expect(brand.tagName, '第一個元素要是品牌的標題').toBe('H1')
    expect(brand.textContent).toBe('GuildHub')
    const controls = [...header.querySelectorAll<HTMLElement>('button, a, input')]
    expect(controls.length, '要有入口').toBeGreaterThan(0)
    expect(controls.length).toBeLessThanOrEqual(5)
    for (const c of controls) expect(brand.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING, `${c.textContent} 要在品牌之後`).toBeTruthy()
    // 靠右那一組是一個容器（版面靠它推到右邊），品牌不在裡面
    const entries = header.querySelector('[data-testid="app-header-entries"]') as HTMLElement
    expect(entries).not.toBeNull()
    expect(entries.contains(brand)).toBe(false)
    for (const c of controls) expect(entries.contains(c), `${c.textContent} 要在靠右那一組裡`).toBe(true)
  })
})
