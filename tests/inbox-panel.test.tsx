import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act, useEffect, type RefObject } from 'react'
import type { MessageOut } from '@/api/contract/rest'
import { VOCABULARY } from '@/errors/uiError'
import { IdentityProvider, useAdoptIdentity } from '@/identity/IdentityProvider'
import { InboxButton } from '@/inbox/InboxButton'
import { InboxPanel } from '@/inbox/InboxPanel'
import { InboxPanelProvider, useInbox } from '@/inbox/InboxPanelProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-k01-inbox/specs/inbox/spec.md
//   Requirement: 收件匣是阻斷式面板，兩個入口 —— S01、S02
//   Requirement: 清單是對話，不是信 —— S04、S05、S06、S16
//   Requirement: 對話詳情顯示已載入的信，底部可寄信 —— S07
//   Requirement: 寄信是悲觀更新，失敗留值；成功後分頁世代重來 —— S08、S09、S10、S11、S12
//
// 整棵樹跟真實頁面同一個形狀：`IdentityProvider（真的，contract-server 給 /api/me）> InboxPanelProvider > [ header(InboxButton), InteractionProvider > ListPanelProvider > BoardPanel + InboxPanel ]`。
// 所有請求走真的 `src/api/` 到本機自己起的 HTTP server。**不連任何外部服務。**

// 每條判準都是好幾個真的 HTTP 往返（登入、第 0 頁、名字、寄信、重取）＋ 面板開關的 effect；CI 機器忙的時候 5 秒不夠
//（兩次 CI：S01 在 5015ms／5187ms 被砍，重跑綠）。15 秒對真的紅燈沒差，對假的紅燈是關鍵（同 `vitest.setup.ts` 對 `asyncUtilTimeout` 的理由）。
// ⚠️ 用 describe 的 options，不用在模組層設定 testTimeout —— 那個呼叫對這個檔案沒生效（第二次 CI 就是證據）；
// 這個寫法實測過：塞一個 6 秒的 sleep 進 S01 會過。
const SLOW = { timeout: 15_000 }

let server: ContractServer
const ME = '11111111-1111-1111-1111-111111111111'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const profile = (id: string, name: string) => ({ id, display_name: name, avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' })
let seq = 0
const msg = (from: string, to: string, hhmm: string, body = `${from === ME ? 'me' : 'them'} ${hhmm}`): MessageOut => ({
  id: `${(seq += 1).toString().padStart(8, '0')}-0000-4000-8000-000000000000`,
  sender_id: from,
  recipient_id: to,
  body,
  created_at: `2026-09-12T${hhmm}:00.000000Z`,
  read_at: null,
})
/** 20 封（剛好一頁）：全部 A→M，時間遞減。 */
const fullPage = (from = A) => Array.from({ length: 20 }, (_, i) => msg(from, ME, `${String(23 - Math.floor(i / 60)).padStart(2, '0')}:${String(59 - i).padStart(2, '0')}`))

const grabbed: { lock: RefObject<boolean> | null; list: ReturnType<typeof useListPanel> | null; inbox: ReturnType<typeof useInbox> | null; adopt: ReturnType<typeof useAdoptIdentity> | null } = {
  lock: null,
  list: null,
  inbox: null,
  adopt: null,
}
function Grab() {
  const { inputLockRef } = useInteraction()
  const list = useListPanel()
  const inbox = useInbox()
  const adopt = useAdoptIdentity()
  useEffect(() => {
    grabbed.lock = inputLockRef
    grabbed.list = list
    grabbed.inbox = inbox
    grabbed.adopt = adopt
  }, [inputLockRef, list, inbox, adopt])
  return null
}
const locked = () => grabbed.lock!.current

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  seq = 0
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
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const submit = (form: HTMLElement) =>
  act(async () => {
    ;(form as HTMLFormElement).requestSubmit()
  })
const tick = () => act(async () => {})

/** 掛好、登入（/api/me → 我）。 */
async function mount() {
  server.reply(200, profile(ME, '我'))
  render(
    <IdentityProvider>
      <InboxPanelProvider>
        <header>
          <InboxButton />
        </header>
        <InteractionProvider>
          <ListPanelProvider>
            <Grab />
            <div data-testid="world" data-focus-anchor="world" tabIndex={-1}>
              <BoardPanel />
              <InboxPanel />
            </div>
          </ListPanelProvider>
        </InteractionProvider>
      </InboxPanelProvider>
    </IdentityProvider>,
  )
  return (await screen.findByTestId('inbox-button')) as HTMLButtonElement
}
const panel = () => screen.getByTestId('inbox-panel')
const items = () => screen.queryAllByTestId('inbox-thread-item') as HTMLButtonElement[]
const gets = (path: string) => server.calls.filter((c) => c.method === 'GET' && c.pathname === path)
const messagesGets = () => server.calls.filter((c) => c.method === 'GET' && c.pathname === '/api/messages')
const posts = () => server.calls.filter((c) => c.method === 'POST' && c.pathname === '/api/messages')

/** 開面板：先排好第 0 頁與名字的回應。 */
async function open(button: HTMLElement, page0: MessageOut[], names: Record<string, string | number> = {}) {
  server.replyFor('/api/messages', 200, page0)
  for (const [id, name] of Object.entries(names)) {
    if (typeof name === 'number') server.replyFor(`/api/profiles/${id}`, name, { detail: '壞了' })
    else server.replyFor(`/api/profiles/${id}`, 200, profile(id, name))
  }
  click(button)
  await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
}

/** 開人才看板、選一張卡（走 provider，跟按 E 一樣）。 */
async function openTalent(id: string, name: string) {
  server.replyFor('/api/profiles', 200, [profile(id, name)])
  await act(async () => grabbed.list!.openPanel('profiles'))
  server.replyFor(`/api/profiles/${id}`, 200, profile(id, name))
  await act(async () => grabbed.list!.selectProfile(id))
  await waitFor(() => expect(screen.getByTestId('talent-detail').getAttribute('data-phase')).toBe('ready'))
}

describe('收件匣是阻斷式面板', SLOW, () => {
  it('[FE-K01-S01] 按收件匣開面板：鎖、焦點、第 0 頁；Escape 關、焦點回按鈕；重開再取第 0 頁', async () => {
    const button = await mount()
    expect(locked()).toBe(false)
    await open(button, [])
    expect(locked(), '面板開著，世界沒鎖').toBe(true)
    expect(panel().contains(document.activeElement)).toBe(true)
    expect(messagesGets()).toHaveLength(1)
    expect(messagesGets()[0]?.search).toBe('?page=0')
    escape()
    expect(screen.queryByTestId('inbox-panel')).toBeNull()
    expect(locked()).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(button))
    await open(button, [])
    expect(messagesGets()).toHaveLength(2)
  })

  it('[FE-K01-S02] 從別人的名片寄信：看板關、直接進對話、焦點在收件匣、鎖持有；Escape 兩次關、焦點回世界；自己的沒有寄信鈕', async () => {
    await mount()
    await openTalent(A, '阿福')
    const sendButton = await screen.findByTestId('send-message')
    server.replyFor('/api/messages', 200, [])
    click(sendButton)
    await waitFor(() => expect(screen.queryByTestId('list-panel')).toBeNull())
    const thread = screen.getByTestId('inbox-thread')
    expect(thread.dataset.with).toBe(A)
    expect(panel().contains(document.activeElement), '焦點不在收件匣').toBe(true)
    expect(locked()).toBe(true)
    escape()
    expect(screen.queryByTestId('inbox-thread'), '第一次 Escape 該回清單').toBeNull()
    expect(screen.queryByTestId('inbox-panel')).not.toBeNull()
    escape()
    expect(screen.queryByTestId('inbox-panel')).toBeNull()
    expect(locked()).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('world')))
    // 自己的名片：沒有寄信鈕。
    await openTalent(ME, '我')
    expect(screen.queryByTestId('send-message'), '自己的名片長出寄信鈕').toBeNull()
  })
})

describe('清單是對話', SLOW, () => {
  it('[FE-K01-S04] 名字、摘要、時間；解析失敗顯示縮短 id 不擋、各打一次；重開再試失敗的、成功的不再打', async () => {
    const button = await mount()
    const long = 'A 說了一句很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長的話'
    await open(button, [msg(A, ME, '10:00', long), msg(ME, B, '09:00', '我說')], { [A]: '阿福', [B]: 500 })
    await waitFor(() => expect(within(items()[0]!).getByTestId('inbox-thread-name').textContent).toBe('阿福'))
    expect(items()).toHaveLength(2)
    expect(within(items()[0]!).getByTestId('inbox-thread-preview').textContent).toBe(`${[...long].slice(0, 40).join('')}…`)
    await waitFor(() => expect(within(items()[1]!).getByTestId('inbox-thread-name').textContent).toBe('bbbb…bbbb'))
    expect(within(items()[1]!).getByTestId('inbox-thread-preview').textContent).toBe('你：我說')
    expect(gets(`/api/profiles/${A}`)).toHaveLength(1)
    expect(gets(`/api/profiles/${B}`)).toHaveLength(1)
    escape()
    await open(button, [msg(A, ME, '10:00'), msg(ME, B, '09:00')], { [B]: '小美' })
    await waitFor(() => expect(within(items()[1]!).getByTestId('inbox-thread-name').textContent).toBe('小美'))
    expect(gets(`/api/profiles/${A}`), '成功的名字有快取，不該再打').toHaveLength(1)
    expect(gets(`/api/profiles/${B}`)).toHaveLength(2)
  })

  it('[FE-K01-S05] 載入更多：第二頁併進同一個對話；剛好 20 可再載、不足 20 是翻到底', async () => {
    const button = await mount()
    await open(button, fullPage(A), { [A]: '阿福' })
    expect(items()).toHaveLength(1)
    const more = screen.getByRole('button', { name: '載入更多' })
    server.replyFor('/api/messages', 200, [msg(ME, A, '01:00', '更早的')])
    click(more)
    await waitFor(() => expect(messagesGets()).toHaveLength(2))
    expect(messagesGets()[1]?.search).toBe('?page=1')
    await waitFor(() => expect(screen.queryByRole('button', { name: '載入更多' })).toBeNull())
    expect(screen.getByTestId('inbox-edge').querySelector('[data-empty-state="exhausted"]')).not.toBeNull()
    expect(items(), 'A 的對話該還是一列').toHaveLength(1)
    click(items()[0]!)
    const inThread = screen.getAllByTestId('inbox-message')
    expect(inThread).toHaveLength(21)
    expect(inThread[0]?.textContent).toContain('更早的')
  })

  it('[FE-K01-S06] 第一頁空 → first-empty；500 → load-failed（舊清單留著）＋重試；401 → 只有 permission-blocked、在飛的 201 不寫回', async () => {
    const button = await mount()
    await open(button, [])
    expect(screen.getByTestId('inbox-list').querySelector('[data-empty-state="first-empty"]')).not.toBeNull()
    expect(items()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '載入更多' })).toBeNull()
    escape()
    // 先載到兩個對話，關掉再開、第 0 頁 500：舊對話留著、上方 load-failed。
    await open(button, [msg(A, ME, '10:00'), msg(B, ME, '09:00')], { [A]: '阿福', [B]: '小美' })
    expect(items()).toHaveLength(2)
    escape()
    server.replyFor('/api/messages', 500, { detail: '壞了' })
    click(button)
    await waitFor(() => expect(screen.getByTestId('inbox-list').querySelector('[data-empty-state="load-failed"]')).not.toBeNull())
    expect(items(), '第 0 頁失敗不該清掉舊對話').toHaveLength(2)
    // 進對話、送一封（後端先不回），再重試第 0 頁 → 401。
    click(items()[0]!)
    await type(screen.getByLabelText('寫一封信'), '在飛的')
    let release: (() => void) | null = null
    server.replyFor('/api/messages', 201, msg(ME, A, '11:00', '在飛的'), { after: new Promise<void>((r) => (release = r)) })
    await submit(screen.getByTestId('compose-form'))
    escape() // 回清單
    server.replyFor('/api/messages', 401, { detail: '未登入' })
    click(within(screen.getByTestId('inbox-list')).getByRole('button', { name: /重試|再試/ }))
    await waitFor(() => expect(screen.getByTestId('inbox-list').querySelector('[data-empty-state="permission-blocked"]')).not.toBeNull())
    expect(items()).toHaveLength(0)
    await act(async () => release?.())
    await tick()
    expect(items(), '401 之後舊世代的 201 寫回來了').toHaveLength(0)
    // 重新登入後再開（第 0 頁是空的）：舊世代那封不該從快取裡冒出來。
    escape()
    server.replyFor('/api/messages', 200, [])
    click(button)
    await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
    expect(screen.getByTestId('inbox-list').querySelector('[data-empty-state="first-empty"]')).not.toBeNull()
    expect(items(), '401 之後舊世代的 201 寫進了信裡，重開就冒出來').toHaveLength(0)
  })

  it('[FE-K01-S16] 載入更多失敗：清單留著、頁碼不前進、重試同一頁；送出中不重複', async () => {
    const button = await mount()
    await open(button, fullPage(A), { [A]: '阿福' })
    let release: (() => void) | null = null
    server.replyFor('/api/messages', 500, { detail: '壞了' }, { after: new Promise<void>((r) => (release = r)) })
    click(screen.getByRole('button', { name: '載入更多' }))
    click(screen.getByRole('button', { name: '載入更多' }))
    await act(async () => release?.())
    await waitFor(() => expect(screen.getByTestId('inbox-edge').querySelector('[data-empty-state="load-failed"]')).not.toBeNull())
    expect(messagesGets(), '送出中再按一次多打了').toHaveLength(2)
    expect(items()).toHaveLength(1)
    server.replyFor('/api/messages', 200, [msg(ME, A, '01:00')])
    click(within(screen.getByTestId('inbox-edge')).getByRole('button', { name: /重試|再試/ }))
    await waitFor(() => expect(messagesGets()).toHaveLength(3))
    expect(messagesGets()[2]?.search, '重試該打同一頁').toBe('?page=1')
  })

  it('[FE-K01-S16] 舊世代的回應只合併訊息、不動 pagesLoaded', async () => {
    // 載入更多還沒回，關掉再開（新世代、第 0 頁重取），舊的 page=1 才回來（含 C→M）。
    const button = await mount()
    await open(button, fullPage(A), { [A]: '阿福' })
    let releaseOld: (() => void) | null = null
    server.replyFor('/api/messages', 200, [msg(C, ME, '01:00', '舊世代的')], { after: new Promise<void>((r) => (releaseOld = r)) })
    click(screen.getByRole('button', { name: '載入更多' }))
    escape()
    // 新世代的第 0 頁也先壓著：舊的 page=1 回來、新的第 0 頁還沒回的那個窗，pagesLoaded 要還是 1（不是 2）。
    let releaseNew: (() => void) | null = null
    server.replyFor('/api/messages', 200, fullPage(A), { after: new Promise<void>((r) => (releaseNew = r)) })
    click(button)
    await act(async () => releaseOld?.())
    await waitFor(() => expect(items().some((el) => el.dataset.with === C), '舊世代的訊息也該合併進來').toBe(true))
    expect(grabbed.inbox!.pagesLoaded, '舊世代的 page=1 改了 pagesLoaded').toBe(1)
    await act(async () => releaseNew?.())
    await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
    expect(grabbed.inbox!.pagesLoaded).toBe(1)
    server.replyFor('/api/messages', 200, [])
    click(screen.getByRole('button', { name: '載入更多' }))
    await waitFor(() => expect(messagesGets().at(-1)?.search).toBe('?page=1'))
  })
})

describe('對話詳情與寄信', SLOW, () => {
  it('[FE-K01-S07] 進對話、返回焦點回那一列；從人才詳情進來沒寄就返回：清單沒有那一列、焦點回標題；沒有載入更多', async () => {
    const button = await mount()
    // 剛好一頁（還沒翻到底）：清單有「載入更多」、對話裡沒有。
    const page0 = [...fullPage(A).slice(0, 18), msg(A, ME, '00:10', '嗨'), msg(ME, A, '00:09', '哈囉')]
    await open(button, page0, { [A]: '阿福' })
    expect(screen.queryByRole('button', { name: '載入更多' })).not.toBeNull()
    click(items()[0]!)
    const thread = screen.getByTestId('inbox-thread')
    expect(thread.dataset.with).toBe(A)
    const list = screen.getAllByTestId('inbox-message')
    expect(list.slice(0, 2).map((m) => m.dataset.mine)).toEqual(['true', 'false'])
    expect(list[0]?.textContent).toContain('哈囉')
    expect(within(thread).queryByRole('button', { name: '載入更多' }), '對話裡不該有載入更多').toBeNull()
    click(within(thread).getByRole('button', { name: '返回' }))
    expect(document.activeElement).toBe(items()[0])
    // Escape 回清單也一樣回那一列（審查抓到 Escape 那條路漏了記焦點）。
    click(items()[0]!)
    escape()
    expect(screen.queryByTestId('inbox-thread')).toBeNull()
    expect(document.activeElement, 'Escape 回清單焦點沒回那一列').toBe(items()[0])
    escape()
    // 從人才詳情進來（小美，沒通過信）、不寄就返回。
    await openTalent(B, '小美')
    server.replyFor('/api/messages', 200, [msg(A, ME, '10:00', '嗨')])
    click(screen.getByTestId('send-message'))
    await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
    click(within(screen.getByTestId('inbox-thread')).getByRole('button', { name: '返回' }))
    expect(items().some((el) => el.dataset.with === B), '沒寄的空對話出現在清單').toBe(false)
    expect(document.activeElement?.tagName).toBe('H3')
  })

  it('[FE-K01-S08] 寄出：201 才接上、送出鈕 disabled、body 形狀、清空、第 0 頁重取、清單摘要變', async () => {
    const button = await mount()
    const a1 = msg(A, ME, '10:00', '嗨')
    const b1 = msg(B, ME, '11:00', '小美的')
    await open(button, [a1, b1], { [A]: '阿福', [B]: '小美' })
    click(items()[1]!) // 阿福（第二列，小美的比較新）
    expect(screen.getByTestId('inbox-thread').dataset.with).toBe(A)
    await type(screen.getByLabelText('寫一封信'), '哈囉')
    let release: (() => void) | null = null
    const sent = msg(ME, A, '12:00', '哈囉')
    server.replyFor('/api/messages', 201, sent, { after: new Promise<void>((r) => (release = r)) })
    await submit(screen.getByTestId('compose-form'))
    expect(screen.getAllByTestId('inbox-message').some((m) => m.textContent?.includes('哈囉')), '樂觀接上了').toBe(false)
    expect((screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement).disabled).toBe(true)
    // 重取的第 0 頁：跟真後端一樣是同一批信（同 id）＋ 剛寄的那封。
    server.replyFor('/api/messages', 200, [sent, b1, a1])
    await act(async () => release?.())
    await waitFor(() => expect(screen.getAllByTestId('inbox-message')).toHaveLength(2))
    await waitFor(() => expect(messagesGets()).toHaveLength(2))
    expect(screen.getAllByTestId('inbox-message')).toHaveLength(2)
    expect(screen.getAllByTestId('inbox-message')[1]?.dataset.mine).toBe('true')
    expect(posts()).toHaveLength(1)
    expect(posts()[0]?.body).toEqual({ recipient_id: A, body: '哈囉' })
    expect((screen.getByLabelText('寫一封信') as HTMLTextAreaElement).value).toBe('')
    expect(messagesGets()[1]?.search).toBe('?page=0')
    click(screen.getByRole('button', { name: '返回' }))
    expect(items()[0]?.dataset.with).toBe(A)
    expect(within(items()[0]!).getByTestId('inbox-thread-preview').textContent).toBe('你：哈囉')
  })

  it('[FE-K01-S09] 失敗留值：404 是前端的一句、422／500 是 toUiError 的一句、可重送', async () => {
    const button = await mount()
    await open(button, [msg(A, ME, '10:00', '嗨')], { [A]: '阿福' })
    click(items()[0]!)
    const form = screen.getByTestId('compose-form')
    await type(screen.getByLabelText('寫一封信'), '哈囉')
    server.replyFor('/api/messages', 404, { detail: '收件人不存在' })
    await submit(form)
    const alert = await within(form).findByRole('alert')
    expect(alert.textContent?.trim()).toBe('這個人已經不在了。')
    expect((screen.getByLabelText('寫一封信') as HTMLTextAreaElement).value).toBe('哈囉')
    expect(screen.getAllByTestId('inbox-message')).toHaveLength(1)
    expect((screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement).disabled).toBe(false)
    server.replyFor('/api/messages', 422, { detail: [] })
    await submit(form)
    await waitFor(() => expect(within(form).getByRole('alert').textContent?.trim()).toBe(VOCABULARY.validation))
    server.replyFor('/api/messages', 500, { detail: '壞了' })
    await submit(form)
    await waitFor(() => expect(within(form).getByRole('alert').textContent?.trim()).toBe(VOCABULARY['server-error']))
    expect((screen.getByLabelText('寫一封信') as HTMLTextAreaElement).value).toBe('哈囉')
    server.replyFor('/api/messages', 201, msg(ME, A, '12:00', '哈囉'))
    server.replyFor('/api/messages', 200, [])
    await submit(form)
    await waitFor(() => expect(screen.getAllByTestId('inbox-message')).toHaveLength(2))
  })

  it('[FE-K01-S10] 太長即時擋（emoji 算一個）、空的送出才說、不 trim', async () => {
    const button = await mount()
    await open(button, [msg(A, ME, '10:00', '嗨')], { [A]: '阿福' })
    click(items()[0]!)
    const area = screen.getByLabelText('寫一封信') as HTMLTextAreaElement
    const send = () => screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement
    await type(area, '😀'.repeat(2000))
    await tick()
    expect(screen.queryByTestId('compose-error'), '2000 個 emoji 該合法（code point）').toBeNull()
    await type(area, '字'.repeat(2001))
    await waitFor(() => expect(screen.getByTestId('compose-error').textContent).toContain('2000'))
    expect(send().disabled).toBe(true)
    await submit(screen.getByTestId('compose-form'))
    expect(posts()).toHaveLength(0)
    await type(area, '')
    await submit(screen.getByTestId('compose-form'))
    await waitFor(() => expect(screen.getByTestId('compose-error').textContent).toContain('寫點什麼'))
    expect(posts()).toHaveLength(0)
    expect(document.activeElement).toBe(area)
    await type(area, '  哈囉  ')
    server.replyFor('/api/messages', 201, msg(ME, A, '12:00', '  哈囉  '))
    server.replyFor('/api/messages', 200, [])
    await submit(screen.getByTestId('compose-form'))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]?.body).toEqual({ recipient_id: A, body: '  哈囉  ' })
  })

  it('[FE-K01-S11] 從人才詳情進來的新對話：載入中不是空、載完沒有這個人才是空；寄了就有、清單有那一列', async () => {
    await mount()
    await openTalent(A, '阿福')
    let release: (() => void) | null = null
    server.replyFor('/api/messages', 200, [msg(B, ME, '10:00')], { after: new Promise<void>((r) => (release = r)) })
    server.replyFor(`/api/profiles/${A}`, 200, profile(A, '阿福')) // 收件匣自己解析名字（跟 TalentDetail 的那次是兩件事）
    click(screen.getByTestId('send-message'))
    const thread = screen.getByTestId('inbox-thread')
    expect(thread.getAttribute('aria-busy')).toBe('true')
    expect(thread.querySelector('[data-empty-state="first-empty"]'), '載入中不該說是空的').toBeNull()
    await waitFor(() => expect(within(thread).getByTestId('inbox-thread-name').textContent).toBe('阿福'))
    await act(async () => release?.())
    await waitFor(() => expect(thread.getAttribute('aria-busy')).toBe('false'))
    expect(thread.querySelector('[data-empty-state="first-empty"]')).not.toBeNull()
    await type(screen.getByLabelText('寫一封信'), '哈囉')
    const sent = msg(ME, A, '11:00', '哈囉')
    server.replyFor('/api/messages', 201, sent)
    server.replyFor('/api/messages', 200, [sent])
    await submit(screen.getByTestId('compose-form'))
    await waitFor(() => expect(screen.getAllByTestId('inbox-message')).toHaveLength(1))
    expect(thread.querySelector('[data-empty-state="first-empty"]')).toBeNull()
    click(within(thread).getByRole('button', { name: '返回' }))
    expect(items().some((el) => el.dataset.with === A)).toBe(true)
  })

  it('[FE-K01-S12] 送出中可以離開：返回、關閉；201 回來合併、重開看得到', async () => {
    const button = await mount()
    const a1 = msg(A, ME, '10:00', '嗨')
    await open(button, [a1], { [A]: '阿福' })
    click(items()[0]!)
    await type(screen.getByLabelText('寫一封信'), '慢的')
    let release: (() => void) | null = null
    const sent = msg(ME, A, '12:00', '慢的')
    server.replyFor('/api/messages', 201, sent, { after: new Promise<void>((r) => (release = r)) })
    await submit(screen.getByTestId('compose-form'))
    click(screen.getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('inbox-thread'), '送出中返回被擋了').toBeNull()
    click(items()[0]!)
    expect((screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement).disabled, '同一個對話送出中，送出鈕該仍 disabled').toBe(true)
    click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByTestId('inbox-panel')).toBeNull()
    server.replyFor('/api/messages', 200, [sent, a1])
    await act(async () => release?.())
    await tick()
    server.replyFor('/api/messages', 200, [sent, a1])
    click(button)
    await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
    click(items()[0]!)
    expect(screen.getAllByTestId('inbox-message').some((m) => m.textContent?.includes('慢的') && m.dataset.mine === 'true')).toBe(true)
  })

  it('寄信回 401：跟 GET 一樣清掉信與名字、permission-blocked（審查抓到只處理了分頁）', async () => {
    const button = await mount()
    await open(button, [msg(A, ME, '10:00', '嗨')], { [A]: '阿福' })
    click(items()[0]!)
    await type(screen.getByLabelText('寫一封信'), '哈囉')
    server.replyFor('/api/messages', 401, { detail: '未登入' })
    await submit(screen.getByTestId('compose-form'))
    await waitFor(() => expect(within(screen.getByTestId('compose-form')).queryByRole('alert')).not.toBeNull())
    click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByTestId('inbox-list').querySelector('[data-empty-state="permission-blocked"]')).not.toBeNull()
    expect(items()).toHaveLength(0)
  })

  it('身分換了（登出）：面板關、資料清；再開是空的世代', async () => {
    const button = await mount()
    await open(button, [msg(A, ME, '10:00', '嗨')], { [A]: '阿福' })
    expect(items()).toHaveLength(1)
    act(() => grabbed.adopt!({ state: 'guest', reason: 'no-session' }))
    await waitFor(() => expect(screen.queryByTestId('inbox-panel')).toBeNull())
    expect(screen.queryByTestId('inbox-button'), '訪客不該有收件匣按鈕').toBeNull()
    // 換另一個人登入：舊帳號的信不能被新 me 重新分組後冒出來。
    const OTHER = '22222222-2222-2222-2222-222222222222'
    act(() => grabbed.adopt!({ state: 'signed-in', profile: profile(OTHER, '另一個人') }))
    const button2 = await screen.findByTestId('inbox-button')
    server.replyFor('/api/messages', 200, [])
    click(button2)
    await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
    expect(items(), '舊帳號的信留到新帳號').toHaveLength(0)
    void button
  })

  it('身分換了時舊帳號的寄信還在飛：新帳號不被它鎖住，舊請求回來也不動新世代', async () => {
    const button = await mount()
    await open(button, [msg(A, ME, '10:00', '嗨')], { [A]: '阿福' })
    click(items()[0]!)
    await type(screen.getByLabelText('寫一封信'), '舊帳號的')
    let release: (() => void) | null = null
    const stale = msg(ME, A, '12:00', '舊帳號的')
    server.replyFor('/api/messages', 201, stale, { after: new Promise<void>((r) => (release = r)) })
    await submit(screen.getByTestId('compose-form'))
    const OTHER = '22222222-2222-2222-2222-222222222222'
    act(() => grabbed.adopt!({ state: 'signed-in', profile: profile(OTHER, '另一個人') }))
    const button2 = await screen.findByTestId('inbox-button')
    server.replyFor('/api/messages', 200, [msg(B, OTHER, '09:00', '新帳號的')])
    server.replyFor(`/api/profiles/${B}`, 200, profile(B, '小美'))
    click(button2)
    await waitFor(() => expect(panel().querySelector('[aria-busy="true"]')).toBeNull())
    click(items()[0]!)
    expect((screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement).disabled, '被舊帳號的寄信鎖住').toBe(false)
    await type(screen.getByLabelText('寫一封信'), '新的')
    let releaseNew: (() => void) | null = null
    server.replyFor('/api/messages', 201, msg(OTHER, B, '13:00', '新的'), { after: new Promise<void>((r) => (releaseNew = r)) })
    await submit(screen.getByTestId('compose-form'))
    expect((screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement).disabled).toBe(true)
    // 舊請求這時才回來：不能把新世代的送出中清掉、也不能把那封寫進來。
    await act(async () => release?.())
    await tick()
    expect((screen.getByRole('button', { name: '寄出' }) as HTMLButtonElement).disabled, '舊請求的 finally 清掉了新世代的鎖').toBe(true)
    expect(screen.getAllByTestId('inbox-message').some((m) => m.textContent?.includes('舊帳號的'))).toBe(false)
    // 放掉新的那封，server 才關得掉。
    server.replyFor('/api/messages', 200, [])
    await act(async () => releaseNew?.())
    await tick()
    void button
  })
})
