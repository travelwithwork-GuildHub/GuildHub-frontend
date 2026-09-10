import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { FirstEntryFlow } from '@/first-entry/FirstEntryFlow'
import type { ClipboardPort } from '@/identity/clipboard'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a06-first-entry/specs/first-entry/spec.md
//   Requirement: 金鑰要真的被帶走，才進得了世界 —— S07 / S08 / S09 / S10
//
// ⚠️⚠️ **注入的剪貼簿是「會成功／會失敗」，不是一個 `toHaveBeenCalledWith` 的靶子。**
// 斷言「`write` 被呼叫了、參數是那把金鑰」是恆真的 —— 它只證明
// 「我按了按鈕、我寫的程式呼叫了我寫的替身」。真正要問的是
// **使用者得到的資訊符不符合實際發生的事**（本 change 的 design D4）。
//
// 真的剪貼簿由 `tests/e2e/first-entry.mjs` 驗（`S11`），那一條不用替身。

let server: ContractServer
// ⚠️ **這個 id 裡一定要有 16 進位的字母。**
// 原本是 `1111…`（全是數字），而那讓「大小寫不一致也該通過」那條判準
// **恆真** —— `.toUpperCase()` 對數字什麼都不做。
// 突變測試抓到的：把比對改成大小寫敏感，11 條全綠。
const ME = 'abc1def2-3a4b-5c6d-7e8f-9012ab34cdef'
const PROFILE = {
  id: ME,
  display_name: '阿福',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
}

/** 會成功的剪貼簿。**它不記錄任何東西** —— 記錄下來就會有人去斷言它。 */
const workingClipboard: ClipboardPort = { async write() {} }
/** 會失敗的剪貼簿。三種真實情況（非安全來源、拒絕授權、舊瀏覽器）的代表。 */
const brokenClipboard: ClipboardPort = {
  async write() {
    throw new Error('這個瀏覽器（或這個連線）不允許自動複製。')
  },
}

let entered = 0
const mount = (clipboard: ClipboardPort) =>
  render(<FirstEntryFlow onDone={() => (entered += 1)} clipboard={clipboard} />)

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

/** 走到顯示金鑰那一步。 */
async function reachKey(clipboard: ClipboardPort) {
  server.reply(200, PROFILE)
  mount(clipboard)
  type(screen.getByLabelText('在世界裡顯示的名字'), '阿福')
  click(screen.getByRole('button', { name: '建立我的身分' }))
  await waitFor(() => expect(screen.getByTestId('recovery-key')).toBeDefined())
}

const enterButton = () => screen.getByRole('button', { name: '進入世界' }) as HTMLButtonElement
const proofField = () => screen.getByLabelText(/最後 6 個字/) as HTMLInputElement

beforeEach(async () => {
  entered = 0
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

describe('金鑰要真的被帶走，才進得了世界', () => {
  it('[FE-A06-S07] 剛拿到金鑰時，進不了世界', async () => {
    await reachKey(workingClipboard)

    expect(enterButton().disabled, '什麼都還沒做就放行了').toBe(true)
    click(enterButton())
    expect(entered, '按下一個不可用的按鈕竟然進去了').toBe(0)
  })

  it('[FE-A06-S08] 複製成功之後放行，而且畫面說得出來', async () => {
    await reachKey(workingClipboard)

    click(screen.getByRole('button', { name: '複製鑰匙' }))

    await waitFor(() => expect(enterButton().disabled).toBe(false))
    expect(screen.getByRole('status').textContent).toContain('已經複製')
    click(enterButton())
    expect(entered).toBe(1)
  })

  it('[FE-A06-S09] 複製失敗時不假裝成功，維持鎖住，而且給得出另一條路', async () => {
    await reachKey(brokenClipboard)

    click(screen.getByRole('button', { name: '複製鑰匙' }))

    // ⚠️ **這一條是這組判準裡唯一承重的那個。** 一個「在點擊處理函式裡
    // 直接把狀態設成已複製」的假實作會通過上一條、在這裡紅
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.queryByRole('status'), '複製失敗了卻說已複製').toBeNull()
    expect(enterButton().disabled, '複製失敗了卻放行').toBe(true)
    // 「說得出下一步」—— 只說「失敗」的話使用者不知道自己還能怎麼辦
    expect(screen.getByRole('alert').textContent).toContain('選起來')
  })

  it('[FE-A06-S10] 填回金鑰的尾碼就放行 —— 而且不必先複製失敗', async () => {
    await reachKey(workingClipboard)

    type(proofField(), ME.slice(-6))

    expect(enterButton().disabled).toBe(false)
    click(enterButton())
    expect(entered).toBe(1)
  })

  it('[FE-A06-S12] 填錯不放行，而且說得出來', async () => {
    // ⚠️⚠️ **這一條才是「持有證明」跟「勾一個框」的差別所在。**
    // 少了它，一個「有填東西就放行」的實作跟原本的勾選框**完全等價** ——
    // 而那正是兩個審查者說會退化成裝飾的東西。
    await reachKey(workingClipboard)

    type(proofField(), 'abcdef')

    expect(enterButton().disabled, '填錯了竟然放行').toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('對不上')
  })

  it('[FE-A06-S12] 還沒填完不算填錯', async () => {
    // 每打一個字就罵人是另一種騷擾
    await reachKey(workingClipboard)

    type(proofField(), ME.slice(-6).slice(0, 3))

    expect(screen.queryByRole('alert'), '才打三個字就說填錯').toBeNull()
    expect(enterButton().disabled).toBe(true)
  })

  it('[FE-A06-S10] 手抄的人大小寫不一定一致，那不該被擋', async () => {
    // 「抄對了卻被說填錯」比沒有這條路更糟
    await reachKey(workingClipboard)

    type(proofField(), ME.slice(-6).toUpperCase())

    expect(enterButton().disabled).toBe(false)
  })

  it('[FE-A06-S12] 填對之後又改壞，放行要收回去', async () => {
    await reachKey(workingClipboard)
    type(proofField(), ME.slice(-6))
    expect(enterButton().disabled).toBe(false)

    type(proofField(), 'zzzzzz')

    expect(enterButton().disabled, '改壞了還放行').toBe(true)
  })

  it('[FE-A06-S10] 剪貼簿完全不能用的人，走得完整條路', async () => {
    // **這一條是 `S09` 與 `S10` 合起來才有的意思**：只有複製那條路的話，
    // 非安全來源／拒絕授權／舊瀏覽器的人**永遠進不去世界**
    await reachKey(brokenClipboard)
    click(screen.getByRole('button', { name: '複製鑰匙' }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))

    type(proofField(), ME.slice(-6))

    expect(enterButton().disabled).toBe(false)
  })

  it('[FE-A06-S08] 按下複製的當下還不算數 —— 要等寫入真的回報成功', async () => {
    // ⚠️ **這一條是突變測試逼出來的。** 一個「先樂觀顯示已複製、失敗再改回來」
    // 的實作，**最終狀態跟正確的版本一模一樣**，所以其他六條全綠 ——
    // 而中間那一瞬間按鈕是可按的，使用者可以在金鑰**沒有被複製**的情況下進去。
    //
    // 用一個永遠不 settle 的剪貼簿把那一瞬間停住。
    const hanging: ClipboardPort = { write: () => new Promise<void>(() => {}) }
    await reachKey(hanging)

    click(screen.getByRole('button', { name: '複製鑰匙' }))

    expect(enterButton().disabled, '寫入還沒回報就放行了').toBe(true)
    expect(screen.queryByRole('status'), '寫入還沒回報就說已複製').toBeNull()
  })

  it('[FE-A06-S09] 金鑰本身看得到，兩句警語也在', async () => {
    await reachKey(workingClipboard)

    expect(screen.getByTestId('recovery-key').textContent).toBe(ME)
    expect(screen.getByText(/就能成為你/)).toBeDefined()
    expect(screen.getByText(/回不來/)).toBeDefined()
  })
})
