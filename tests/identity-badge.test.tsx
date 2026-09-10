import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import LoginPage from '@/app/login/page'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { RECOVERY_KEY_STORAGE_KEY } from '@/identity/recoveryKey'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a01-login/specs/identity-session/spec.md
//   Requirement: 世界裡看得出來你是誰，而且沒有身分時世界照常運作 —— S11 / S12
//   Requirement: 訪客找得到建立身分的入口 —— S16

let server: ContractServer

const ME = '11111111-1111-1111-1111-111111111111'
const profileNamed = (name: string) => ({
  id: ME,
  display_name: name,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
})

beforeEach(async () => {
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

const badge = () => screen.getByTestId('identity').textContent ?? ''

// ⚠️ **`IdentityBadge` 不自己問後端了** —— 它讀 `IdentityProvider`。
// 這裡包的是**真的 provider**（不是假的 context 值），所以這些判準走的
// 仍然是真的 `resolveIdentity()` ＋ 真的 HTTP server。
const mount = () => render(
  <IdentityProvider>
    <IdentityBadge />
  </IdentityProvider>,
)

describe('世界裡看得出來你是誰', () => {
  it('[FE-A01-S11] 已登入時顯示名片上的名字，而且名字改了會跟著變', async () => {
    server.reply(200, profileNamed('阿福'))
    const first = mount()
    await waitFor(() => expect(badge()).toContain('阿福'))
    first.unmount()

    // 後端上那張名片的名字改了之後再次進入
    server.reply(200, profileNamed('阿福二世'))
    mount()

    // **這一行是這條的重點。** 把名字存在前端、重新掛載時讀回來的實作
    // 會通過上面那一行，但會在這裡紅
    await waitFor(() => expect(badge()).toContain('阿福二世'))
  })

  it('[FE-A01-S12] 未登入時顯示訪客，而且跟已登入時長得不一樣', async () => {
    server.reply(401, { detail: '未登入' })
    const guest = mount()
    await waitFor(() => expect(badge()).toContain('訪客'))
    const guestText = badge()
    guest.unmount()

    // **對照的方向。** 少了它，這條在「登入功能完全沒做」的版本上照樣全綠 ——
    // 今天的世界本來就是每個人都叫「訪客」
    server.reply(200, profileNamed('阿福'))
    mount()
    await waitFor(() => expect(badge()).toContain('阿福'))

    expect(badge(), '有身分與沒有身分時畫面一樣').not.toBe(guestText)
    expect(badge(), '已登入還在顯示訪客').not.toContain('訪客')
  })

  it('[FE-A01-S12] 問不到身分時，說的是問不到，不是訪客', async () => {
    server.reply(500, { detail: '壞掉了' })
    mount()

    await waitFor(() => expect(badge()).toContain('問不到'))
    expect(badge(), '後端故障被顯示成訪客').not.toContain('訪客')
  })

  it('[FE-A01-S12] 還沒問完時不先顯示訪客', () => {
    server.reply(200, profileNamed('阿福'))
    mount()

    // 第一幀。已登入的人在這一幀看到「訪客」的話，畫面會閃一下
    expect(badge(), '第一幀就顯示訪客').not.toContain('訪客')
  })
})

describe('訪客找得到入口', () => {
  it('[FE-A01-S16] 訪客看得到一個入口，它指向 /login', async () => {
    server.reply(401, { detail: '未登入' })
    mount()

    await waitFor(() => expect(badge()).toContain('訪客'))
    const entry = screen.getByRole('link', { name: '建立你的身分' })
    expect(entry.getAttribute('href')).toBe('/login')
  })

  it('[FE-A01-S16] 那個入口的另一端，真的有可以輸入並送出暱稱的地方', () => {
    // ⚠️ **這一條把 `/login` 那一端釘住。** 只斷言 href 的話，
    // 一個指向死路由的連結也會通過 —— 而使用者會按下去看到 404。
    //
    // ⚠️ **檔案路徑與網址的對應是 Next.js 的慣例，這條測不到它**
    //（`src/app/login/page.tsx` ↔ `/login`）。那一半由 tasks 4.4b 的人工驗證守，
    // 而那是 `FE-W12`「門看不出來是門」的同型缺口 —— 那次只有人眼抓得到。
    render(<LoginPage />)

    expect(screen.getByLabelText('在世界裡顯示的名字')).toBeDefined()
    expect(screen.getByRole('button', { name: '進入世界' })).toBeDefined()
  })

  it('[FE-A01-S16] 問不到身分的時候，入口也還在', async () => {
    // 後端掛掉時把入口藏起來的話，使用者連「再試一次」的路都沒有
    server.reply(500, { detail: '壞掉了' })
    mount()

    await waitFor(() => expect(badge()).toContain('問不到'))
    expect(screen.getByRole('link', { name: '建立你的身分' })).toBeDefined()
  })

  it('[FE-A01-S16] 已登入的人不會看到「建立你的身分」', async () => {
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, ME)
    server.reply(200, profileNamed('阿福'))
    mount()

    await waitFor(() => expect(badge()).toContain('阿福'))
    expect(screen.queryByRole('link', { name: '建立你的身分' })).toBeNull()
  })
})
