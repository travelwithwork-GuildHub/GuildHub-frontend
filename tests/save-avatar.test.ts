import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveAvatar } from '@/identity/saveAvatar'
import { updateMyProfile } from '@/api/operations'

// 規格 `FE-A05-S08`／`S09`／`S10`：送出去的 `avatar_id` 一定是一個有效的整數。
//
// ⚠️ **這一份攔的是 `updateMyProfile`，不是 `fetch`。**
// 攔 `fetch` 的話，測試會跟傳輸層的實作綁在一起（標頭、序列化、base URL）——
// 而這一份要問的問題只有一個：**送出去的 body 裡有沒有那個欄位、它是什麼值。**

vi.mock('@/api/operations', () => ({ updateMyProfile: vi.fn() }))
const mocked = vi.mocked(updateMyProfile)

const profile = {
  id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  display_name: '存檔測試員',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
}

afterEach(() => {
  mocked.mockReset()
})

describe('存角色選擇', () => {
  it('[FE-A05-S08] ⚠️ 選第一款角色時，送出的是 `avatar_id: 0`', async () => {
    // ⚠️⚠️ **這一條是這個檔案存在的理由。**
    //
    // `ProfileUpdate` 每一欄都選填，所以「有值才帶上這個欄位」是很自然的寫法
    // —— 而**索引 `0` 是 falsy**，那樣寫的話使用者挑第一款時什麼都不送。
    //
    // 症狀最惡劣的地方：**預覽是對的**，畫面上完全正常，
    // 只有重新整理才會發現沒存到。
    mocked.mockResolvedValue({ ...profile, avatar_id: 0 })
    await saveAvatar(0)

    expect(mocked, '選第一款角色時完全沒有送出請求').toHaveBeenCalledTimes(1)
    const body = mocked.mock.calls[0]?.[0]
    expect(body, '送出的 body 裡沒有 `avatar_id` —— 是不是用了「有值才帶欄位」？0 是 falsy').toHaveProperty(
      'avatar_id',
    )
    expect(body?.avatar_id).toBe(0)
  })

  it('[FE-A05-S08] 選第二款時送出的是 `avatar_id: 1`（對照）', async () => {
    // **沒有這一條，上一條說明不了什麼** —— 一個「永遠送 0」的實作也會通過。
    mocked.mockResolvedValue({ ...profile, avatar_id: 1 })
    await saveAvatar(1)
    expect(mocked.mock.calls[0]?.[0]?.avatar_id).toBe(1)
  })

  it('[FE-A05-S09] 任何路徑都不會送出 `avatar_id: null`', async () => {
    mocked.mockResolvedValue(profile)
    for (const av of [0, 1]) {
      mocked.mockClear()
      await saveAvatar(av)
      expect(mocked.mock.calls[0]?.[0]?.avatar_id, '送出了 null —— 那會把欄位清空').not.toBeNull()
    }
  })

  it.each([
    ['負數', -1],
    ['超出範圍', 999],
    ['不是整數', 1.5],
  ])('[FE-A05-S10] %s 的索引 SHALL NOT 被送出', async (_label, av) => {
    // **後端不驗證 `avatar_id`。** 存進一個畫不出來的值之後，
    // `avatarLook()` 的 fallback 會讓它顯示成第一款 —— 使用者會看到
    // 「存好了，但外觀不是我選的那個」，而那比存不進去更難查。
    const result = await saveAvatar(av)
    expect(mocked, `值域外的 ${av} 竟然被送出去了`).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('out-of-range')
  })

  it('[FE-A05-S06] 後端失敗時回報失敗，而不是丟例外', async () => {
    // ⚠️ **呼叫端要靠這個結果決定「重不重連」**（`S06`：儲存失敗 SHALL NOT 重連）。
    // 丟例外的話，那個決定會散到每一個 try/catch 裡。
    mocked.mockRejectedValue(new Error('後端掛了'))
    const result = await saveAvatar(1)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('failed')
  })

  it('[FE-A05-S10] 「值域外」與「後端失敗」要分得出來', async () => {
    // ⚠️ **兩者的正確處置不同**：值域外根本沒送出去（是前端的 bug），
    // 後端失敗則是可以重試的。回同一個 `false` 的話，畫面說不出該講什麼。
    mocked.mockRejectedValue(new Error('後端掛了'))
    const failed = await saveAvatar(1)
    const outOfRange = await saveAvatar(999)
    expect(failed.ok === false && failed.reason).not.toBe(
      outOfRange.ok === false && outOfRange.reason,
    )
  })
})
