import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import type { MessageOut } from '@/api/contract/rest'
import { startContractServer, type ContractServer } from './support/contract-server'
import { ME, OTHER, btn, click, detail, escape, grabbed, mountDetail as mount, project, queryBtn, refreshRooms, status, type } from './support/project-lifecycle'

// 規格：openspec/changes/fe-j04-form-team/specs/project-lifecycle/spec.md ——〈密碼只在這一次詳情裡呈現，可複製、可寄給隊員，而且不落地〉S05／S06／S08
// 樹與手勢在 `tests/support/project-lifecycle.tsx`。剪貼簿用 `vi.mock('@/identity/clipboard')` 控制**會成功／會失敗**：
// 判準問的是「寫入失敗時畫面有沒有假裝成功、有沒有照樣交接」，不是 `toHaveBeenCalledWith` 的靶子（`FE-A06` design D4 同一條）。

const clipboardWrite = vi.hoisted(() => vi.fn<(text: string) => Promise<void>>())
vi.mock('@/identity/clipboard', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/identity/clipboard')>()
  return { ...mod, browserClipboard: () => ({ write: clipboardWrite }) }
})

const P = project(1)
const PASSWORD = 'demo-1234'

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  refreshRooms.mockReset()
  clipboardWrite.mockReset().mockResolvedValue(undefined)
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/world')
})
const mountDetail = () => mount(server, P)

/** 開表單、填密碼、送出，等到「已成軍」。 */
async function formed(password = PASSWORD) {
  server.replyFor(`/api/projects/${P.id}/form-team`, 200, { ...P, status: 'active', room_template: 0 })
  server.replyFor('/api/projects', 200, [])
  click(btn('成軍'))
  await type(within(detail()).getByLabelText('房間密碼'), password)
  await act(async () => {
    ;(screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit()
  })
  await waitFor(() => expect(status()).toBe('已成軍'))
}
const reveal = () => screen.queryByTestId('room-password-reveal')
const draft = (password = PASSWORD) => `「${P.title}」的房間密碼：${password}`
const message = (from: string, to: string, body: string): MessageOut => ({
  id: '00000001-0000-4000-8000-000000000000',
  sender_id: from,
  recipient_id: to,
  body,
  created_at: '2026-09-12T10:00:00.000000Z',
  read_at: null,
})

describe('密碼只在這一次詳情裡呈現，可複製、可寄給隊員，而且不落地', () => {
  it('[FE-J04-S05] 呈現密碼與一次性提示；複製成功說已複製；失敗不說已複製、alert、文字可選取；返回再重開沒有密碼', async () => {
    await mountDetail()
    await formed()
    expect(reveal()?.textContent).toBe(PASSWORD)
    expect(detail().textContent).toContain('只會顯示這一次')
    expect(within(detail()).queryByRole('status'), '還沒按就說已複製').toBeNull()

    click(btn('複製密碼'))
    await waitFor(() => expect(within(detail()).getByRole('status').textContent).toContain('已複製'))
    expect(clipboardWrite).toHaveBeenLastCalledWith(PASSWORD)

    // 寫入要等到回報之後才算：先說已複製、失敗再改回來的實作**最終狀態跟正確的一樣**，只有 pending 那一瞬間分得出來（`FE-A06-S15` 同一招）
    let fail: (err: Error) => void = () => {}
    clipboardWrite.mockImplementationOnce(() => new Promise<void>((_, reject) => (fail = reject)))
    click(btn('複製密碼'))
    expect(within(detail()).queryByRole('status'), '第二次寫入還沒回報就仍說已複製').toBeNull()
    // 寫入中再按「複製」與「寄給隊員」都不算：剪貼簿一次只寫一件（慢的那次晚回來會覆蓋快的那次、舊的成功會把看板關掉 —— 審查抓到）
    click(btn('複製密碼'))
    click(btn('寄給隊員'))
    expect(clipboardWrite, '寫入中又寫了').toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('inbox-panel'), '寫入中按寄給隊員把收件匣開了').toBeNull()
    await act(async () => fail(new Error('不准')))
    await waitFor(() => expect(within(detail()).getByRole('alert').textContent).toContain('自己選起來'))
    expect(within(detail()).queryByRole('status'), '寫入失敗卻說已複製').toBeNull()
    expect(reveal()?.textContent, '失敗後密碼文字要留著可選取').toBe(PASSWORD)

    // 返回列表再重開同一筆：後端不回密碼、前端不留
    server.replyFor(`/api/projects/${P.id}`, 200, { ...P, status: 'active', room_template: 0 })
    server.replyFor(`/api/profiles/${ME.id}`, 200, ME)
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('project-detail')).toBeNull()
    act(() => grabbed.list!.selectProject(P.id))
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(status()).toBe('已成軍')
    expect(reveal(), '重開的詳情還呈現密碼').toBeNull()
    expect(queryBtn('複製密碼')).toBeNull()
    expect(queryBtn('寄給隊員')).toBeNull()
    expect(detail().textContent).not.toContain(PASSWORD)
  })

  it('[FE-J04-S06] 寄給隊員：草稿進剪貼簿、看板關、收件匣清單開著、輸入框是空的；剪貼簿失敗就不開', async () => {
    await mountDetail()
    await formed()
    // 先驗失敗的那一條（看板還開著）：不開收件匣、alert、草稿可選取
    clipboardWrite.mockRejectedValueOnce(new Error('不准'))
    click(btn('寄給隊員'))
    // 等到「有結果」：不是草稿出現就是收件匣開了 —— 開了就是錯（等錯的那一邊會 timeout，訊息看不出原因）
    await waitFor(() => expect(screen.queryByTestId('room-password-draft') ?? screen.queryByTestId('inbox-panel')).not.toBeNull())
    expect(screen.queryByTestId('inbox-panel'), '剪貼簿失敗還開了收件匣').toBeNull()
    expect(screen.queryByTestId('list-panel'), '剪貼簿失敗還關了看板').not.toBeNull()
    expect(within(detail()).getByTestId('room-password-draft').textContent).toBe(draft())
    expect(within(detail()).getAllByRole('alert').length).toBeGreaterThanOrEqual(1)

    // 成功（壓著不回）：寫入中連按不再寫、看板還開著；放行後草稿進剪貼簿、看板關、收件匣停在清單、焦點在收件匣
    server.replyFor('/api/messages', 200, [message(OTHER.id, ME.id, '嗨')])
    server.replyFor(`/api/profiles/${OTHER.id}`, 200, OTHER)
    let release: () => void = () => {}
    clipboardWrite.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
    const writesBefore = clipboardWrite.mock.calls.length
    click(btn('寄給隊員'))
    click(btn('寄給隊員'))
    click(btn('複製密碼'))
    expect(clipboardWrite.mock.calls.length - writesBefore, '寫入中又寫了').toBe(1)
    expect(screen.queryByTestId('list-panel'), '還沒寫進去就關了看板').not.toBeNull()
    await act(async () => release())
    await waitFor(() => expect(screen.queryByTestId('list-panel')).toBeNull())
    expect(clipboardWrite).toHaveBeenLastCalledWith(draft())
    const inbox = await screen.findByTestId('inbox-panel') // 收件匣內容 lazy（FE-X15 --panel-inbox）
    expect(screen.queryByTestId('inbox-thread'), '開的是對話不是清單').toBeNull()
    expect(screen.getByTestId('inbox-list')).not.toBeNull()
    expect(inbox.contains(document.activeElement), '焦點不在收件匣').toBe(true)

    // 進任一對話：寄信的輸入框是空的（草稿不在收件匣的狀態裡，貼上是 owner 的動作）
    server.replyFor('/api/messages', 200, [message(OTHER.id, ME.id, '嗨')])
    const row = await screen.findByTestId('inbox-thread-item')
    click(row)
    await waitFor(() => expect(screen.getByTestId('inbox-thread').dataset.with).toBe(OTHER.id))
    expect((screen.getByLabelText('寫一封信') as HTMLTextAreaElement).value, '草稿跑進輸入框了').toBe('')
    expect(screen.getByTestId('inbox-panel').textContent).not.toContain(PASSWORD)
  })

  it('[FE-J04-S08] 密碼不落地：攔截整段流程的每一次寫入（原文與 encoded）', async () => {
    // 含空白與 `#`：encoded 後長得不一樣，「只擋原文」的尺才分得出來
    const PW = 'sek ret#9x7'
    const writes: string[] = []
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      writes.push(`${k}=${v}`)
    })
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((_s, _t, url) => writes.push(`push:${String(url)}`))
    const replace = vi.spyOn(window.history, 'replaceState')
    const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: (v: string) => writes.push(`cookie:${v}`) })
    try {
      await mountDetail()
      await formed(PW)
      click(btn('複製密碼'))
      await waitFor(() => expect(within(detail()).getByRole('status')).not.toBeNull())
      // 「寄給隊員」（看板關、收件匣開）→ 關收件匣 → 重開看板與那筆詳情 —— 每一段都在攔截之下
      server.replyFor('/api/messages', 200, [])
      click(btn('寄給隊員'))
      await waitFor(() => expect(screen.queryByTestId('list-panel')).toBeNull())
      escape()
      await waitFor(() => expect(screen.queryByTestId('inbox-panel')).toBeNull())
      server.replyFor('/api/projects', 200, [])
      server.replyFor(`/api/projects/${P.id}`, 200, { ...P, status: 'active', room_template: 0 })
      server.replyFor(`/api/profiles/${ME.id}`, 200, ME)
      act(() => {
        grabbed.list!.openPanel('projects')
        grabbed.list!.selectProject(P.id)
      })
      await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
      expect(reveal(), '重開的詳情還呈現密碼').toBeNull()
      const all = [...writes, ...replace.mock.calls.map((c) => `replace:${String(c[2])}`)]
      expect(all.length, '攔截沒有攔到任何寫入（尺壞了）').toBeGreaterThan(0)
      for (const w of all) {
        expect(w, '密碼落地了').not.toContain(PW)
        expect(w, '密碼 encoded 後落地了').not.toContain(encodeURIComponent(PW))
        expect(w, '密碼 form-encoded（空白成 +）後落地了').not.toContain(new URLSearchParams({ pw: PW }).toString().slice(3))
      }
      expect(window.location.href).not.toContain(PW)
      expect(document.cookie).not.toContain(PW)
      for (const store of [localStorage, sessionStorage]) {
        for (let i = 0; i < store.length; i += 1) expect(store.getItem(store.key(i)!) ?? '').not.toContain(PW)
      }
    } finally {
      setItem.mockRestore()
      push.mockRestore()
      replace.mockRestore()
      Reflect.deleteProperty(document, 'cookie')
      if (cookieDesc) Object.defineProperty(Document.prototype, 'cookie', cookieDesc)
    }
  })
})
