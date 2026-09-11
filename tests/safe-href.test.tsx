import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SafeExternalLink } from '@/security/SafeExternalLink'
import { safeHref } from '@/security/safeHref'

// 規格：openspec/changes/fe-t06-output-safety/specs/output-safety/spec.md
//   Requirement: `safeHref` 只放行白名單的 scheme，只管 scheme —— S04
//   Requirement: `SafeExternalLink` 是使用者網址唯一的渲染方式，沒過就是純文字 —— S05
// **不連任何外部服務。**

describe('safeHref', () => {
  it('[FE-T06-S04] 白名單放行並正規化；只管 scheme', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeHref('HTTP://EXAMPLE.com')).toBe('http://example.com/')
    expect(safeHref('http://user:pw@example.com/')).toBe('http://user:pw@example.com/')
  })

  it('[FE-T06-S04] 危險與不在白名單的 scheme（含變體）→ null', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
      'file:///etc/passwd',
      'blob:https://x/y',
      'mailto:a@b.c',
    ]) {
      expect(safeHref(bad), bad).toBeNull()
    }
  })

  it('[FE-T06-S04] 解析不了 → null，而且不拋錯', () => {
    for (const bad of ['/world', 'example.com', '', '   ', 'http://']) {
      expect(() => safeHref(bad), bad).not.toThrow()
      expect(safeHref(bad), bad).toBeNull()
    }
  })
})

describe('SafeExternalLink', () => {
  it('[FE-T06-S05] 過了是 a（noopener noreferrer、_blank）；沒過沒有 a、只有純文字', () => {
    render(<SafeExternalLink href="https://example.com">作品集</SafeExternalLink>)
    const a = screen.getByTestId('safe-link') as HTMLAnchorElement
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('https://example.com/')
    expect(a.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(a.target).toBe('_blank')
    cleanup()
    render(<SafeExternalLink href="javascript:alert(1)">作品集</SafeExternalLink>)
    expect(document.querySelector('a'), '沒過還建了 <a>').toBeNull()
    expect(screen.getByTestId('unsafe-link').textContent).toBe('作品集')
  })
})
