import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { OtherTabNotice } from '@/app/world/OtherTabNotice'
import { WorldGate } from '@/app/world/WorldGate'
import { claimTabLease, type TabLease } from '@/realtime/tabLease'
import { useWorldLease } from '@/realtime/WorldLeaseProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-r06-multi-tab/specs/multi-tab/spec.md
//   Requirement: 匿名的多分頁是合法的，登入之後不是 —— FE-R06-S01 / S02 / S03
//
// ⚠️ **這裡走的是真的身分查詢（真 HTTP server）與真的 `BroadcastChannel`。**
// 「另一個分頁」是在同一個 jsdom 裡另外開一條 lease —— 那正是它在真瀏覽器裡
// 的樣子（同源、行程間訊息）。

let server: ContractServer
const ME = '11111111-1111-1111-1111-111111111111'
const PROFILE = {
  id: ME,
  display_name: '阿福',
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
}
const others: TabLease[] = []

/** 假裝「另一個分頁」已經佔著同一個身分的 lobby。 */
function otherTabHolds(key = `${ME}/lobby`) {
  const lease = claimTabLease(key, { graceMs: 1 })
  others.push(lease)
  return lease
}

/** 把資格印出來，讓判準看得到 —— 世界元件在 Canvas 裡，測不到。 */
function LeaseProbe() {
  const { allowed } = useWorldLease()
  return <p data-testid="allowed">{String(allowed)}</p>
}

const mount = () =>
  render(
    <IdentityProvider>
      <WorldGate>
        <OtherTabNotice />
        <LeaseProbe />
      </WorldGate>
    </IdentityProvider>,
  )

const allowed = () => screen.getByTestId('allowed').textContent

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})

afterEach(async () => {
  for (const lease of others.splice(0)) lease.release()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  localStorage.clear()
})

describe('登入之後的分頁守衛', () => {
  it('[FE-R06-S01] 匿名一律放行 —— 兩個匿名分頁在世界裡是兩個人', async () => {
    server.reply(401, { detail: '未登入' })
    // 就算有別人佔著同一把鎖，匿名分頁也不受影響（它的鍵是 null）
    otherTabHolds()
    mount()

    await waitFor(() => expect(allowed()).toBe('true'))
    expect(screen.queryByRole('status'), '匿名分頁被擋了').toBeNull()
  })

  it('[FE-R06-S01] 問不到身分時放行 —— 誤擋與誤放的代價不對稱', async () => {
    server.reply(500, { detail: '壞掉了' })
    otherTabHolds()
    mount()

    // 誤擋讓人完全進不去世界；誤放最多是後端那個已知的覆蓋問題
    await waitFor(() => expect(allowed()).toBe('true'))
  })

  it('[FE-R06-S02] 已登入而別的分頁佔著時，這個分頁不得連線', async () => {
    otherTabHolds()
    await new Promise((r) => setTimeout(r, 20))
    server.reply(200, PROFILE)
    mount()

    await waitFor(() => expect(screen.getByRole('status')).toBeDefined())
    expect(allowed(), '第二個分頁拿到了連線資格').toBe('false')
    expect(screen.getByRole('status').textContent).toContain('另一個分頁')
  })

  it('[FE-R06-S02] 沒有別的分頁時，已登入的分頁連得上', async () => {
    server.reply(200, PROFILE)
    mount()

    // **對照方向。** 少了它，一個「登入之後一律不連」的實作也會讓上一條全綠
    await waitFor(() => expect(allowed()).toBe('true'), { timeout: 3000 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('[FE-R06-S02] 提示上有「改用這個分頁」，按下去就拿到資格', async () => {
    otherTabHolds()
    await new Promise((r) => setTimeout(r, 20))
    server.reply(200, PROFILE)
    mount()
    await waitFor(() => expect(allowed()).toBe('false'))

    const button = screen.getByRole('button', { name: '改用這個分頁' })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // 只顯示訊息、沒有動作的話，使用者唯一的出路是去找出那個分頁在哪
    await waitFor(() => expect(allowed()).toBe('true'))
    expect(others[0]?.held(), '原持有者還握著資格 —— 兩條連線會同時存在').toBe(false)
  })

  it('[FE-R06-S03] 佔著的分頁關掉之後，這個分頁接手', async () => {
    const other = otherTabHolds()
    await new Promise((r) => setTimeout(r, 20))
    server.reply(200, PROFILE)
    mount()
    await waitFor(() => expect(allowed()).toBe('false'))

    other.release()

    await waitFor(() => expect(allowed()).toBe('true'))
    expect(screen.queryByRole('status'), '接手之後提示還在').toBeNull()
  })
})
