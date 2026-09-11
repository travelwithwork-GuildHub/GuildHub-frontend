import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import type { MessageOut } from '@/api/contract/rest'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { InboxButton } from '@/inbox/InboxButton'
import { InboxPanel } from '@/inbox/InboxPanel'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { TalentFacts } from '@/talent/TalentFacts'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-t06-output-safety/specs/output-safety/spec.md
//   Requirement: 使用者提供的字串以文字呈現（具名元件）—— S06
//
// 測的是真的元件（`TalentFacts`、`InboxPanel` 的對話畫面），不是一個 escape 函式：React 就是那個函式，判準守的是「沒有人繞過它」。
// 逐欄定位、每欄不同的 payload（含不同標籤與事件屬性）。收件匣走真的 HTTP server（本機自己起的）。**不連任何外部服務。**

const NAME = '<b onclick=alert(1)>x</b>'
const SKILL = '<img src=x onerror=alert(2)>'
const BIO = '<script>alert(3)</script><i>y</i>'
const BODY_1 = '<img src=x onerror=alert(4)><u>z</u>'
const BODY_2 = '<svg onload=alert(5)></svg><a href="javascript:alert(6)">w</a>'

describe('TalentFacts', () => {
  it('[FE-T06-S06] 名字、技能、自介含 HTML：文字節點、沒有子元素、容器裡沒有那些標籤', () => {
    render(
      <TalentFacts
        profile={{ id: '11111111-1111-1111-1111-111111111111', display_name: NAME, avatar_id: 0, skills: [SKILL], hours_per_week: null, bio: BIO, updated_at: '2026-09-10T00:00:00Z' }}
      />,
    )
    const facts = screen.getByTestId('talent-facts')
    const h3 = facts.querySelector('h3')!
    expect(h3.textContent).toBe(NAME)
    expect(h3.children).toHaveLength(0)
    const skill = screen.getByTestId('talent-skill')
    expect(skill.textContent).toBe(SKILL)
    expect(skill.children).toHaveLength(0)
    const bio = screen.getByTestId('talent-bio')
    expect(bio.textContent).toBe(BIO)
    expect(bio.children).toHaveLength(0)
    for (const tag of ['b', 'img', 'script', 'i']) expect(facts.querySelector(tag), `容器裡冒出了 <${tag}>`).toBeNull()
  })
})

describe('收件匣的對話', () => {
  let server: ContractServer
  const ME = '11111111-1111-1111-1111-111111111111'
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const msg = (id: string, body: string, hhmm: string): MessageOut => ({ id, sender_id: A, recipient_id: ME, body, created_at: `2026-09-12T${hhmm}:00.000000Z`, read_at: null })
  beforeEach(async () => {
    server = await startContractServer()
    process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  })
  afterEach(async () => {
    cleanup()
    await server.close()
    delete process.env.NEXT_PUBLIC_GUILDHUB_REST
    delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  })

  it('[FE-T06-S06] 兩封含 HTML 的信：各自的 body 節點是文字、沒有子元素；對話裡沒有 img／u／svg／javascript: 的 a', async () => {
    server.reply(200, { id: ME, display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' })
    render(
      <IdentityProvider>
        <InboxPanelProvider>
          <InboxButton />
          <InteractionProvider>
            <div data-focus-anchor="world" tabIndex={-1}>
              <InboxPanel />
            </div>
          </InteractionProvider>
        </InboxPanelProvider>
      </IdentityProvider>,
    )
    const button = await screen.findByTestId('inbox-button')
    server.replyFor('/api/messages', 200, [msg('00000002-0000-4000-8000-000000000000', BODY_2, '11:00'), msg('00000001-0000-4000-8000-000000000000', BODY_1, '10:00')])
    server.replyFor(`/api/profiles/${A}`, 200, { id: A, display_name: '阿福', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' })
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => expect(screen.getByTestId('inbox-list').getAttribute('aria-busy')).toBe('false'))
    act(() => {
      screen.getAllByTestId('inbox-thread-item')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const thread = screen.getByTestId('inbox-thread')
    const bodies = within(thread).getAllByTestId('inbox-message-body')
    expect(bodies).toHaveLength(2)
    expect(bodies[0]!.textContent).toBe(BODY_1)
    expect(bodies[1]!.textContent).toBe(BODY_2)
    for (const b of bodies) expect(b.children).toHaveLength(0)
    for (const sel of ['img', 'u', 'svg', 'a[href^="javascript"]']) expect(thread.querySelector(sel), `對話裡冒出了 ${sel}`).toBeNull()
  })
})
