import { LoginForm } from './LoginForm'
import { DISPLAY } from '@/design/controls'

// `/login`。規格 `FE-A01`（identity-session）。
//
// ⚠️ **這一頁不擋任何人，也不導向任何地方。**
// 「進入世界之前要不要先有名字」是 `FE-A06 首次進入` 的義務，
// 而本 change 的規格逐字寫著 `FE-A06` 加上導流時 SHALL NOT 讓這裡的判準變紅。
export default function LoginPage() {
  return (
    <main className="p-gutter flex flex-col gap-gutter">
      <h1 {...DISPLAY}>GuildHub</h1>
      {/* 一句話說這裡是什麼（`FE-X16-S03`：這一頁要有內文，不能只有標題跟表單）。 */}
      <p className="max-w-prose">走進 3D 的公會大廳：發案、找人、組隊，都在同一個世界裡。</p>
      <LoginForm />
    </main>
  )
}
