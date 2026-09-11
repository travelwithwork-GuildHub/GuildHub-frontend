import type { ReactNode } from 'react'
import { safeHref } from './safeHref'

// 使用者給的網址**唯一**的渲染方式。規格 `FE-T06`〈`SafeExternalLink` 是使用者網址唯一的渲染方式，沒過就是純文字〉；design `D3`。
//
// `safeHref` 過了 → `<a href rel="noopener noreferrer" target="_blank">`（外部連結的既定做法：`noopener` 讓新分頁拿不到 `window.opener`）；
// 沒過（`javascript:`、`data:`、相對路徑、解析不了⋯⋯）→ **不建 `<a>`**，把 children 畫成 `<span>` —— 使用者看得見它不是連結，不是一個按了沒反應的連結。
//
// ⚠️ 這個檔案是 lint「原生 `<a>` 的動態 href」那一條的**唯一**例外（`eslint.config.mjs`）；別處要畫使用者網址只能用它。
// 今天沒有任何呼叫端（`FE-T02` 的作品集連結會是第一個）—— 它在這裡是為了讓那一天沒有第二種寫法。

export interface SafeExternalLinkProps {
  /** 使用者給的原始字串。 */
  href: string
  children: ReactNode
  className?: string
}

export function SafeExternalLink({ href, children, className }: SafeExternalLinkProps) {
  const safe = safeHref(href)
  if (safe === null) {
    return (
      <span data-testid="unsafe-link" className={className}>
        {children}
      </span>
    )
  }
  return (
    <a href={safe} rel="noopener noreferrer" target="_blank" data-testid="safe-link" className={className}>
      {children}
    </a>
  )
}
