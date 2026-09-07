import { WorldBoundary } from './WorldBoundary'

// 規格 FE-X01-S03。**這個元件刻意保持同步**（不是 async Server Component）——
// Vitest 目前不支援 async Server Component，非同步的話這條 Scenario
// 就只剩人工驗得到（見 design.md 的 R2）。
export default function WorldPage() {
  // World 區域要有真的高度，否則 `h-full` 撐不開 —— 實測過：
  // 父層沒有高度時 canvas 只有 150px 高，而一個 150px 高的 3D 世界
  // 不算「進得了 3D 世界」，FE-W03 也沒辦法在裡面走路。
  return (
    <main className="flex h-dvh flex-col">
      <h1 className="text-title p-gutter shrink-0">GuildHub</h1>
      <div className="min-h-0 flex-1">
        <WorldBoundary />
      </div>
    </main>
  )
}
