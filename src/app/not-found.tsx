import Link from 'next/link'
import { layer } from '@/design/layers'

// 規格 FE-X01-S02：未定義的路徑要得到 404，**不得**被 `/` 的轉址規則吃掉。
export default function NotFound() {
  return (
    <main style={{ zIndex: layer('panel') }} className="p-gutter">
      <h1 className="text-title">找不到這個頁面</h1>
      <p className="text-ink-muted">網址可能打錯了，或者那個地方還不存在。</p>
      <Link href="/world">回到世界</Link>
    </main>
  )
}
