import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { saveAvatar } from '@/identity/saveAvatar'
import { ProfilePanel } from '@/profile/ProfilePanel'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { TalentFacts } from '@/talent/TalentFacts'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a04-profile-editor/specs/profile-editor/spec.md
//   Requirement: 顯示我的名片，用同一個呈現元件 —— S03（編輯鈕那一半）
//   Requirement: 編輯四欄，payload 白名單，悲觀更新 —— S04、S05、S06、S07、S08
//   Requirement: 未儲存就關要確認；送出中不可關；重開從身分初始化 —— S09、S10、S11
//
// 整棵樹跟真實頁面同一個形狀：`IdentityProvider > ProfilePanelProvider > [ header(IdentityBadge), InteractionProvider > ProfilePanel ]`。
// 身分、PATCH 都走真的 `src/api/` 到本機自己起的 HTTP server。**不連任何外部服務。**

let server: ContractServer
const ME = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: '阿福',
  avatar_id: 0,
  skills: ['React', 'TypeScript'],
  hours_per_week: null as number | null,
  bio: '寫前端的。' as string | null,
  updated_at: '2026-09-10T00:00:00Z',
}

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

const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
async function type(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const blur = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new FocusEvent('blur'))
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })

const panel = () => screen.getByTestId('profile-panel')
const field = (label: string) => within(panel()).getByLabelText(label) as HTMLInputElement
const button = (name: string | RegExp) => within(panel()).getByRole('button', { name }) as HTMLButtonElement
const patches = () => server.calls.filter((c) => c.method === 'PATCH' && c.pathname === '/api/profiles/me')

/** 開面板、按編輯。 */
async function openEditor(profile = ME) {
  server.reply(200, profile)
  render(
    <IdentityProvider>
      <ProfilePanelProvider>
        <header>
          <IdentityBadge />
        </header>
        <InteractionProvider>
          <ProfilePanel />
        </InteractionProvider>
      </ProfilePanelProvider>
    </IdentityProvider>,
  )
  click(await screen.findByRole('button', { name: /^我的名片/ }))
  click(button('編輯'))
  expect(screen.getByTestId('profile-form')).toBeDefined()
}
const submit = async () => {
  await act(async () => {
    button('儲存').form?.requestSubmit()
  })
}

describe('顯示我的名片：編輯鈕在面板層', () => {
  it('[FE-A04-S03] 我的名片有「編輯」鈕；TalentFacts 自己沒有（別人的名片走它，沒有編輯鈕）', async () => {
    await openEditor()
    // 到得了表單 = 編輯鈕在。反過來：純呈現元件單獨渲染沒有任何按鈕。
    cleanup()
    render(<TalentFacts profile={ME} />)
    expect(screen.queryByRole('button', { name: '編輯' }), '別人的名片也長出編輯鈕了').toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('編輯四欄，payload 白名單，悲觀更新', () => {
  it('[FE-A04-S04] 送出的 body 正好是四個鍵，skills 去重不分大小寫', async () => {
    await openEditor()
    expect(field('技能（用逗號分開）').value, '預填以「, 」接').toBe('React, TypeScript')
    expect(field('每週可投入的小時數').value, '空值預填空字串').toBe('')
    await type(field('在世界裡顯示的名字'), '阿福')
    await type(field('技能（用逗號分開）'), 'React, ，TypeScript ,react')
    await type(field('每週可投入的小時數'), '12')
    await type(field('自我介紹'), '')
    server.reply(200, { ...ME, display_name: '阿福', skills: ['React', 'TypeScript'], hours_per_week: 12, bio: null })
    await submit()
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]?.body).toEqual({ display_name: '阿福', skills: ['React', 'TypeScript'], hours_per_week: 12, bio: null })
  })

  it('[FE-A04-S05] 成功：回到顯示、顯示的是伺服器的值、標題列也變', async () => {
    await openEditor()
    await type(field('在世界裡顯示的名字'), '阿福二號')
    server.reply(200, { ...ME, display_name: '阿福（後端改過）' })
    await submit()
    await waitFor(() => expect(screen.queryByTestId('profile-form')).toBeNull())
    expect(within(panel()).getByTestId('talent-facts').textContent).toContain('阿福（後端改過）')
    expect(within(panel()).getByTestId('talent-facts').textContent, '用了 input 而不是回應').not.toContain('阿福二號')
    expect(screen.getByTestId('identity').textContent).toContain('阿福（後端改過）')
  })

  it('[FE-A04-S06] 失敗：留在表單、值不變、alert 在送出鈕上方；修正後再送再打一次', async () => {
    await openEditor()
    await type(field('自我介紹'), '新的自介')
    server.reply(500, { detail: '壞了' })
    await submit()
    const alert = await within(panel()).findByRole('alert')
    expect(screen.getByTestId('profile-form')).toBeDefined()
    expect(field('自我介紹').value).toBe('新的自介')
    expect(field('在世界裡顯示的名字').value).toBe('阿福')
    expect(alert.compareDocumentPosition(button('儲存')) & Node.DOCUMENT_POSITION_FOLLOWING, 'alert 要在送出鈕之前').toBeTruthy()
    server.reply(200, { ...ME, bio: '新的自介' })
    await submit()
    await waitFor(() => expect(patches()).toHaveLength(2))
  })

  it('[FE-A04-S07] 不送 avatar_id：別處把 avatar 改成 1、後端已寫入，名片送出後身分是伺服器那份（avatar 1）', async () => {
    // 規格寫「0 → 3」，但 `AVATAR_COUNT` 是 2、`saveAvatar(3)` 會以 out-of-range 拒絕（`FE-A05-S10`）—— 用 1（規格的數字在封存時修）。
    const OTHER = 1
    await openEditor()
    await type(field('自我介紹'), '填好了還沒送')
    // 別處更新（測試直接走 saveAvatar，後端寫入）—— 面板開著、表單填好。
    server.reply(200, { ...ME, avatar_id: OTHER })
    await act(async () => {
      const r = await saveAvatar(OTHER)
      expect(r, 'saveAvatar 失敗').toMatchObject({ ok: true })
    })
    expect(server.calls.at(-1)?.body).toEqual({ avatar_id: OTHER })
    // 名片送出：後端回的是最新那份（avatar 1 ＋ 新 bio）。
    server.reply(200, { ...ME, avatar_id: OTHER, bio: '填好了還沒送' })
    await submit()
    await waitFor(() => expect(patches()).toHaveLength(2))
    const body = patches()[1]?.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['bio', 'display_name', 'hours_per_week', 'skills'])
    expect('avatar_id' in body, 'body 帶了 avatar_id —— 會把別處的更新蓋回去').toBe(false)
    await waitFor(() => expect(screen.queryByTestId('profile-form')).toBeNull())
    // 身分是伺服器回應那份：頭像色是 1 號的，不是送出前身分裡的 0 號。
    const { avatarLook } = await import('@/design/avatar')
    expect(avatarLook(OTHER).body).not.toBe(avatarLook(0).body)
    // jsdom 把 hex 轉成 rgb()：比的方式是「設一個同色的元素再讀回來」。
    const probe = document.createElement('span')
    probe.style.background = avatarLook(OTHER).body
    expect((within(panel()).getByTestId('talent-look') as HTMLElement).style.background).toBe(probe.style.background)
  })

  it('[FE-A04-S08] skills 11 項：欄位下方說是本站的上限、送出鈕禁用、沒有請求', async () => {
    await openEditor()
    await type(field('技能（用逗號分開）'), Array.from({ length: 11 }, (_, i) => `s${i}`).join(', '))
    await waitFor(() => expect(screen.getByTestId('profile-error-skills').textContent).toContain('本站'))
    expect(screen.getByTestId('profile-error-skills').textContent).toContain('10')
    expect(button('儲存').disabled).toBe(true)
    await submit()
    await new Promise((r) => setTimeout(r, 30))
    expect(patches()).toHaveLength(0)
  })

  it('hours 清空 → null（type=number 清空是空字串，schema 先轉再驗）；負數與小數即時說', async () => {
    await openEditor({ ...ME, hours_per_week: 20 })
    expect(field('每週可投入的小時數').value).toBe('20')
    await type(field('每週可投入的小時數'), '-1')
    await waitFor(() => expect(screen.getByTestId('profile-error-hours_per_week').textContent).toContain('80'))
    expect(button('儲存').disabled).toBe(true)
    await type(field('每週可投入的小時數'), '1.5')
    await waitFor(() => expect(screen.getByTestId('profile-error-hours_per_week').textContent).toContain('整數'))
    expect(button('儲存').disabled).toBe(true)
    await type(field('每週可投入的小時數'), '')
    await waitFor(() => expect(screen.queryByTestId('profile-error-hours_per_week')).toBeNull())
    server.reply(200, { ...ME, hours_per_week: null })
    await submit()
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect((patches()[0]?.body as Record<string, unknown>).hours_per_week).toBeNull()
  })

  it('skills 的 input 字串只在 blur 時被正規化', async () => {
    await openEditor()
    const skills = field('技能（用逗號分開）')
    await type(skills, 'React，  typescript ,react')
    expect(skills.value, '打字中就被改了 —— 游標會跳').toBe('React，  typescript ,react')
    blur(skills)
    await waitFor(() => expect(skills.value).toBe('React, typescript'))
  })
})

describe('驗證時機是 FE-X05 的（名片表單自己的欄位）', () => {
  it('必填的名字：清空不說、送出才說、焦點到它；超過 20 即時說', async () => {
    await openEditor()
    await type(field('在世界裡顯示的名字'), '')
    await act(async () => {})
    expect(screen.queryByTestId('profile-error-display_name'), '還沒送就說必填').toBeNull()
    expect(button('儲存').disabled, '太短不該禁用').toBe(false)
    await submit()
    await waitFor(() => expect(screen.getByTestId('profile-error-display_name').textContent).toContain('1 到 20'))
    expect(document.activeElement).toBe(field('在世界裡顯示的名字'))
    expect(patches()).toHaveLength(0)
    await type(field('在世界裡顯示的名字'), '字'.repeat(21))
    await waitFor(() => expect(screen.getByTestId('profile-error-display_name').textContent).toContain('20'))
    expect(button('儲存').disabled).toBe(true)
  })

  it('bio 超過 300、單一 skill 超過 40、hours 超過 80：即時說、禁用', async () => {
    await openEditor()
    await type(field('自我介紹'), '字'.repeat(301))
    await waitFor(() => expect(screen.getByTestId('profile-error-bio').textContent).toContain('300'))
    expect(button('儲存').disabled).toBe(true)
    await type(field('自我介紹'), '')
    await type(field('技能（用逗號分開）'), 'x'.repeat(41))
    await waitFor(() => expect(screen.getByTestId('profile-error-skills').textContent).toContain('40'))
    expect(screen.getByTestId('profile-error-skills').textContent).toContain('本站')
    await type(field('技能（用逗號分開）'), 'React')
    await type(field('每週可投入的小時數'), '81')
    await waitFor(() => expect(screen.getByTestId('profile-error-hours_per_week').textContent).toContain('80'))
    expect(button('儲存').disabled).toBe(true)
  })

  it('沒 blur 直接送出、後端 500：skills 的 input 字串已經是正規化形式，其他欄位留著', async () => {
    await openEditor()
    await type(field('技能（用逗號分開）'), 'React，  typescript ,react')
    await type(field('自我介紹'), '留著')
    server.reply(500, { detail: '壞了' })
    await submit()
    await within(panel()).findByRole('alert')
    expect(field('技能（用逗號分開）').value).toBe('React, typescript')
    expect(field('自我介紹').value).toBe('留著')
  })
})

describe('未儲存就關要確認；送出中不可關；重開從身分初始化', () => {
  it('dirty 時按「取消」也要問（三種關法的第三種）', async () => {
    await openEditor()
    await type(field('自我介紹'), '改了')
    click(button('取消'))
    expect(screen.getByTestId('profile-discard-confirm')).toBeDefined()
    expect(screen.getByTestId('profile-form')).toBeDefined()
  })

  it('回到顯示之後焦點在「編輯」鈕；進編輯焦點在第一欄', async () => {
    await openEditor()
    expect(document.activeElement).toBe(field('在世界裡顯示的名字'))
    click(button('取消'))
    expect(document.activeElement).toBe(button('編輯'))
  })

  it('[FE-A04-S09] 有修改要關：先問；三種關法都一樣；正規化後相同不問', async () => {
    await openEditor()
    await type(field('自我介紹'), '改了')
    escape()
    let confirm = screen.getByTestId('profile-discard-confirm')
    expect(screen.getByTestId('profile-form'), '確認層出現時表單要還在').toBeDefined()
    click(within(confirm).getByRole('button', { name: '繼續編輯' }))
    expect(screen.queryByTestId('profile-discard-confirm')).toBeNull()
    expect(field('自我介紹').value).toBe('改了')

    click(button('關閉'))
    confirm = screen.getByTestId('profile-discard-confirm')
    click(within(confirm).getByRole('button', { name: '丟棄' }))
    expect(screen.queryByTestId('profile-form')).toBeNull()
    expect(within(panel()).getByTestId('talent-bio').textContent, '丟棄後顯示的是身分目前的值').toBe('寫前端的。')

    click(button('編輯'))
    await type(field('技能（用逗號分開）'), 'React，  typescript')
    click(button('取消'))
    expect(screen.queryByTestId('profile-discard-confirm'), '正規化後相同還問了').toBeNull()
    expect(screen.queryByTestId('profile-form')).toBeNull()
  })

  it('Escape 關確認層 = 繼續編輯（面板與表單都還在）', async () => {
    await openEditor()
    await type(field('自我介紹'), '改了')
    escape()
    expect(screen.getByTestId('profile-discard-confirm')).toBeDefined()
    escape()
    expect(screen.queryByTestId('profile-discard-confirm')).toBeNull()
    expect(screen.getByTestId('profile-form')).toBeDefined()
    expect(panel()).toBeDefined()
    expect(field('自我介紹').value).toBe('改了')
  })

  it('[FE-A04-S10] 送出中關不掉：Escape、關閉鈕、取消都無效；回來之後回到顯示', async () => {
    await openEditor()
    await type(field('自我介紹'), '送出中')
    // 後端慢：先不回。
    let release: (() => void) | null = null
    const slow = new Promise<void>((r) => {
      release = r
    })
    server.reply(200, { ...ME, bio: '送出中' }, { after: slow })
    await submit()
    expect(button('儲存').disabled).toBe(true)
    escape()
    click(button('關閉'))
    click(button('取消'))
    expect(screen.getByTestId('profile-form'), '送出中被關掉了').toBeDefined()
    expect(panel()).toBeDefined()
    expect(screen.queryByTestId('profile-discard-confirm')).toBeNull()
    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(screen.queryByTestId('profile-form')).toBeNull())
    expect(within(panel()).getByTestId('talent-bio').textContent).toBe('送出中')
  })

  it('[FE-A04-S11] 重開從身分初始化，不沿用上次的草稿', async () => {
    await openEditor()
    await type(field('自我介紹'), '沒送的草稿')
    escape()
    click(within(screen.getByTestId('profile-discard-confirm')).getByRole('button', { name: '丟棄' }))
    click(button('關閉'))
    expect(screen.queryByTestId('profile-panel')).toBeNull()
    click(screen.getByRole('button', { name: /^我的名片/ }))
    click(button('編輯'))
    expect(field('自我介紹').value).toBe('寫前端的。')
  })
})
