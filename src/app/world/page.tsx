import { IdentityBadge } from '@/identity/IdentityBadge'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { OtherTabNotice } from './OtherTabNotice'
import { WorldGate } from './WorldGate'
import { WorldBoundary } from './WorldBoundary'

// 規格 FE-X01-S03。**這個元件刻意保持同步**（不是 async Server Component）——
// Vitest 目前不支援 async Server Component，非同步的話這條 Scenario
// 就只剩人工驗得到（見 design.md 的 R2）。
export default function WorldPage() {
  // World 區域要有真的高度，否則 `h-full` 撐不開 —— 實測過：
  // 父層沒有高度時 canvas 只有 150px 高，而一個 150px 高的 3D 世界
  // 不算「進得了 3D 世界」，FE-W03 也沒辦法在裡面走路。
  return (
    <IdentityProvider>
      <WorldGate>
        <main className="flex h-dvh flex-col">
          {/* ⚠️ **`IdentityBadge` 是 client component，這一頁仍然是同步的
              Server Component** —— 上面那段註解說的限制沒有改變。
              身分的查詢在瀏覽器端發生，因為它要帶 cookie。 */}
          <div className="p-gutter flex shrink-0 items-baseline gap-gutter">
            <h1 className="text-title">GuildHub</h1>
            <IdentityBadge />
          </div>
          <OtherTabNotice />
          <div className="min-h-0 flex-1">
            <WorldBoundary />
          </div>
        </main>
      </WorldGate>
    </IdentityProvider>
  )
}
