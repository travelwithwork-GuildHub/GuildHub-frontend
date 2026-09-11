import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act, useEffect, type RefObject } from 'react'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { IdentityProvider, useAdoptIdentity } from '@/identity/IdentityProvider'
import type { Identity } from '@/identity/types'
import { ProfilePanel } from '@/profile/ProfilePanel'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a04-profile-editor/specs/profile-editor/spec.md
//   Requirement: 名字是入口，面板是阻斷式的 —— S01、S02
//   Requirement: 顯示我的名片，用同一個呈現元件 —— S03 的「我的」那一半（編輯鈕在下一片，跟表單一起）
//
// 整棵樹跟真實頁面同一個形狀（design 修正後）：`IdentityProvider > ProfilePanelProvider > [ header(IdentityBadge), InteractionProvider > ProfilePanel ]`。
// 身分來自真的 `IdentityProvider` ＋ 本機自己起的 HTTP server（`GET /api/me`）。**不連任何外部服務。**

let server: ContractServer
const ME = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: '阿福',
  avatar_id: 2,
  skills: ['React', 'TypeScript'],
  hours_per_week: 12,
  bio: '寫前端的。',
  updated_at: '2026-09-10T00:00:00Z',
}

/** 把鎖的 ref 拿出來給測試看。**不渲染任何東西。** */
const grabbed: { lock: RefObject<boolean> | null } = { lock: null }
function GrabLock() {
  const { inputLockRef } = useInteraction()
  useEffect(() => {
    grabbed.lock = inputLockRef
  }, [inputLockRef])
  return null
}
const grabbedAdopt: { adopt: ((identity: Identity) => void) | null } = { adopt: null }
function GrabAdopt() {
  const value = useAdoptIdentity()
  useEffect(() => {
    grabbedAdopt.adopt = value
  }, [value])
  return null
}
const adopt = () => {
  if (grabbedAdopt.adopt === null) throw new Error('IdentityProvider 還沒掛好')
  return grabbedAdopt.adopt
}
const locked = () => {
  if (grabbed.lock === null) throw new Error('InteractionProvider 還沒掛好')
  return grabbed.lock.current
}

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  grabbed.lock = null
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
})

async function mountSignedIn() {
  server.reply(200, ME)
  render(
    <IdentityProvider>
      <ProfilePanelProvider>
        <GrabAdopt />
        <header>
          <IdentityBadge />
        </header>
        <InteractionProvider>
          <GrabLock />
          <ProfilePanel />
        </InteractionProvider>
      </ProfilePanelProvider>
    </IdentityProvider>,
  )
  const button = await screen.findByRole('button', { name: '我的名片' })
  return button
}
const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })

describe('名字是入口，面板是阻斷式的', () => {
  it('[FE-A04-S01] 按名字開面板：面板出現、世界輸入鎖持有、焦點在面板內', async () => {
    const button = await mountSignedIn()
    expect(button.textContent, '按鈕上顯示的是名字').toBe('阿福')
    expect(screen.queryByTestId('profile-panel')).toBeNull()
    expect(locked()).toBe(false)

    click(button)

    const panel = screen.getByTestId('profile-panel')
    expect(locked(), '面板開著，世界的輸入沒有被鎖住').toBe(true)
    expect(panel.contains(document.activeElement), '焦點不在面板內').toBe(true)
  })

  it('[FE-A04-S02] Escape 關面板：面板不再顯示、鎖放開、焦點回按鈕', async () => {
    const button = await mountSignedIn()
    click(button)
    expect(screen.getByTestId('profile-panel')).toBeDefined()

    escape()

    expect(screen.queryByTestId('profile-panel')).toBeNull()
    expect(locked(), '關了面板鎖還在 —— 人走不動').toBe(false)
    expect(document.activeElement, '焦點沒有回到開面板的按鈕').toBe(button)
  })

  it('面板殼的關閉鈕也一樣：關、放鎖、焦點回按鈕', async () => {
    const button = await mountSignedIn()
    click(button)
    click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByTestId('profile-panel')).toBeNull()
    expect(locked()).toBe(false)
    expect(document.activeElement).toBe(button)
  })
})

describe('顯示我的名片', () => {
  it('[FE-A04-S03] 面板用 TalentFacts 呈現自己的四欄，而且沒有多打 GET /api/profiles/{id}（編輯鈕在下一片）', async () => {
    const button = await mountSignedIn()
    const before = server.calls.length
    click(button)
    const facts = screen.getByTestId('talent-facts')
    expect(facts.dataset.profileId).toBe(ME.id)
    expect(facts.textContent).toContain('阿福')
    expect(screen.getAllByTestId('talent-skill').map((el) => el.textContent)).toEqual(['React', 'TypeScript'])
    expect(screen.getByTestId('talent-hours').textContent).toContain('12')
    expect(screen.getByTestId('talent-bio').textContent).toBe('寫前端的。')
    await new Promise((r) => setTimeout(r, 30))
    expect(server.calls.length, '開面板多打了請求 —— 內容應該來自 IdentityProvider 手上那份').toBe(before)
  })

  it('面板開著時身分不再是 signed-in：面板消失、鎖放開', async () => {
    const button = await mountSignedIn()
    click(button)
    expect(locked()).toBe(true)
    act(() => adopt()({ state: 'guest', reason: 'no-session' }))
    await waitFor(() => expect(screen.queryByTestId('profile-panel')).toBeNull())
    expect(locked()).toBe(false)
    // 再登入：面板**不會**自己彈回來（開關狀態真的關了，不只是不渲染）。
    act(() => adopt()({ state: 'signed-in', profile: ME }))
    await screen.findByRole('button', { name: '我的名片' })
    expect(screen.queryByTestId('profile-panel'), '身分回來面板自己彈開了 —— 開關狀態沒關').toBeNull()
  })
})
