import { LoginForm } from './LoginForm'

// `/login`。規格 `FE-A01`（identity-session）。
//
// ⚠️ **這一頁不擋任何人，也不導向任何地方。**
// 「進入世界之前要不要先有名字」是 `FE-A06 首次進入` 的義務，
// 而本 change 的規格逐字寫著 `FE-A06` 加上導流時 SHALL NOT 讓這裡的判準變紅。
export default function LoginPage() {
  return (
    <main className="p-gutter flex flex-col gap-gutter">
      <h1 className="text-title">GuildHub</h1>
      <LoginForm />
    </main>
  )
}
