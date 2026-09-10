import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AvatarPicker } from '@/app/world/AvatarPicker'
import { AvatarDraftProvider, useAvatarDraft } from '@/identity/AvatarDraftProvider'
import { saveAvatar } from '@/identity/saveAvatar'
import type { SaveAvatarResult } from '@/identity/saveAvatar'

// 規格 `FE-A05`：`S03`（放棄要復原）、`S04`（儲存成功要重連）、
// `S06`（**儲存失敗 SHALL NOT 重連**）、`S11`（入口一直都在）。
//
// ⚠️ **這一份守的是「什麼時候該重連、什麼時候不該」。**
// 那個決定散掉的話，會變成每個 try/catch 各自判斷 —— 而漏掉一個的症狀是
// 「存失敗了卻斷線重連」，別人看到你離開又進來，然後你的外觀根本沒變。

vi.mock('@/identity/saveAvatar', () => ({ saveAvatar: vi.fn() }))
const mockedSave = vi.mocked(saveAvatar)

const rejoin = vi.fn()
vi.mock('@/realtime/RealtimeGenerationProvider', () => ({
  useRealtimeGeneration: () => ({ generation: 0, rejoin }),
}))

const adopt = vi.fn()
vi.mock('@/identity/IdentityProvider', () => ({
  useIdentity: () => ({
    state: 'signed-in',
    profile: {
      id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      display_name: '選角測試員',
      avatar_id: 0,
      skills: [],
      hours_per_week: null,
      bio: null,
      updated_at: '2026-09-10T00:00:00Z',
    },
  }),
  useAdoptIdentity: () => adopt,
}))

const okResult: SaveAvatarResult = {
  ok: true,
  profile: {
    id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    display_name: '選角測試員',
    avatar_id: 1,
    skills: [],
    hours_per_week: null,
    bio: null,
    updated_at: '2026-09-10T00:00:01Z',
  },
}

/**
 * 點一下。
 *
 * ⚠️ **用 `fireEvent` 不是 `user-event`** —— 後者沒有裝在這個專案裡，
 * 而為了一個點擊多拉一個依賴不划算。差別在 `user-event` 會模擬完整的
 * 指標事件序列；這幾條判準問的都是「按下去之後狀態對不對」，
 * 用不到那個精度。
 */
const click = (el: HTMLElement) => act(() => void fireEvent.click(el))

/**
 * 把草稿**渲染出來**看 —— `S03` 要驗的是「放棄之後草稿沒了」。
 *
 * ⚠️ **不要在 render 裡賦值給外部變數。** 第一版是
 * `seenDraft = useAvatarDraft().draft`，而 `react-hooks/globals` 直接擋下來：
 * 那是 render 期間的 side effect，重繪時機一變行為就不一樣。
 * 渲染成文字之後讀 DOM，順便讓這幾條判準問的是**畫面上的事實**。
 */
function DraftProbe() {
  const { draft } = useAvatarDraft()
  return <span data-testid="draft">{draft === undefined ? 'none' : String(draft)}</span>
}

/** 現在的草稿，`undefined` 用字串 `'none'` 表示。 */
const draftNow = () => screen.getByTestId('draft').textContent

const wrap = (ui: ReactNode) => (
  <AvatarDraftProvider>
    {ui}
    <DraftProbe />
  </AvatarDraftProvider>
)

beforeEach(() => {
  rejoin.mockClear()
  adopt.mockClear()
  mockedSave.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('換角色', () => {
  it('[FE-A05-S11] 入口不需要任何操作就在畫面上', () => {
    render(wrap(<AvatarPicker />))
    // ⚠️ **這一條看起來瑣碎，但它守的是這個專案踩過兩次的坑**：
    // 功能做好了、資料是對的、判準全綠，而使用者找不到入口。
    expect(screen.getByRole('button', { name: '更換角色' })).toBeTruthy()
  })

  it('[FE-A05-S01] 選了一個角色，草稿跟著改（還沒儲存）', async () => {
    render(wrap(<AvatarPicker />))
    click(screen.getByRole('button', { name: '更換角色' }))
    click(screen.getByRole('button', { name: /角色 2/ }))

    expect(draftNow(), '選了角色但草稿沒變 —— 世界裡的自己不會有任何反應').toBe('1')
    expect(mockedSave, '選一下就送出去了 —— 預覽跟儲存要分開（S02）').not.toHaveBeenCalled()
    expect(rejoin, '還沒儲存就重連了').not.toHaveBeenCalled()
  })

  it('[FE-A05-S03] 取消之後草稿要丟掉', async () => {
    render(wrap(<AvatarPicker />))
    click(screen.getByRole('button', { name: '更換角色' }))
    click(screen.getByRole('button', { name: /角色 2/ }))
    expect(draftNow()).toBe('1')

    click(screen.getByRole('button', { name: '取消' }))

    expect(
      draftNow(),
      '取消之後草稿還在 —— 畫面會停在使用者沒有選的那一個角色',
    ).toBe('none')
  })

  it('[FE-A05-S04] 儲存成功之後才重連', async () => {
    mockedSave.mockResolvedValue(okResult)
    render(wrap(<AvatarPicker />))
    click(screen.getByRole('button', { name: '更換角色' }))
    click(screen.getByRole('button', { name: /角色 2/ }))
    click(screen.getByRole('button', { name: '就用這個' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(1))
    await waitFor(() =>
      expect(
        rejoin,
        '存成功了卻沒有重連 —— **已經在場的其他人會永遠看到舊外觀**，' +
          '因為即時層的 av 來自那條連線背後的 session（規格 S04）',
      ).toHaveBeenCalledTimes(1),
    )
    expect(adopt, '名片換了但畫面上的身分沒跟著換').toHaveBeenCalledTimes(1)
  })

  it('[FE-A05-S06] ⚠️ 儲存失敗時 SHALL NOT 重連', async () => {
    // ⚠️⚠️ **這一條是這個檔案存在的理由。**
    //
    // 重連是有代價的（`S05`：別人會看到你離開又進來）。為一次失敗的儲存
    // 付那個代價毫無所得 —— 而且重連之後別人看到的還是舊外觀，
    // 畫面會像是「改了但沒改成」。
    mockedSave.mockResolvedValue({ ok: false, reason: 'failed', error: new Error('後端掛了') })
    render(wrap(<AvatarPicker />))
    click(screen.getByRole('button', { name: '更換角色' }))
    click(screen.getByRole('button', { name: /角色 2/ }))
    click(screen.getByRole('button', { name: '就用這個' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(
      rejoin,
      '存失敗了卻還是重連 —— 別人會看到你離開又進來，而你的外觀根本沒變',
    ).not.toHaveBeenCalled()
    expect(adopt, '存失敗了卻換掉了畫面上的身分').not.toHaveBeenCalled()
    expect(draftNow(), '存失敗了但預覽留著 —— 使用者下次進來會發現自己「變回去了」').toBe('none')
  })

  it('[FE-A05-S01] 沒選過就不能儲存', async () => {
    // 擋掉「送出一個沒有變化的更新」，順便讓 `S06` 的失敗路徑不會被
    // 「按了沒反應」蓋過去。
    render(wrap(<AvatarPicker />))
    click(screen.getByRole('button', { name: '更換角色' }))

    const save = screen.getByRole('button', { name: '就用這個' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })
})
