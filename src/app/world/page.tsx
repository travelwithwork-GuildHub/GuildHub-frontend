import { WorldBoundary } from './WorldBoundary'

// 規格 FE-X01-S03。**這個元件刻意保持同步**（不是 async Server Component）——
// Vitest 目前不支援 async Server Component，非同步的話這條 Scenario
// 就只剩人工驗得到（見 design.md 的 R2）。
export default function WorldPage() {
  return (
    <main>
      <h1 className="text-title p-gutter">GuildHub</h1>
      <WorldBoundary />
    </main>
  )
}
