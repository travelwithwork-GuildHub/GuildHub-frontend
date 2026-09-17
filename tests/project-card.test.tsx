import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ProjectOut } from '@/api/contract/rest'
import { ProjectCard } from '@/projects/ProjectCard'

// 規格：openspec/changes/fe-b02-project-card/specs/project-directory/spec.md
//   Requirement: 案件卡讓人一眼判斷「要什麼」「還在招嗎」「剩幾天」「幾個座位」—— S01～S05
//
// 元件判準直接掛載，時鐘用 `now` prop 釘住（design D2）。不連任何外部服務。

const NOW = Date.parse('2026-09-18T12:00:00Z')
const HOUR = 3_600_000
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const OWNER = 'abababab-1111-4222-8333-444444444444'
const project = (extra: Partial<ProjectOut> = {}): ProjectOut => ({
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: OWNER,
  title: '找一個會 Three.js 的人',
  body: '內容',
  needed_skills: ['Three.js', 'TypeScript'],
  status: 'recruiting',
  room_template: null,
  seat_count: 3,
  expires_at: at((6 * 24 + 23) * HOUR),
  updated_at: '2026-09-09T00:00:00Z',
  ...extra,
})
const card = () => screen.getByTestId('project-card')

describe('案件卡讓人一眼判斷', () => {
  it('[FE-B02-S01] 標題、技能、狀態、剩幾天（ceil）、座位數都在；expires_at 是 <time dateTime>', () => {
    const p = project()
    render(<ProjectCard project={p} now={NOW} />)
    expect(card().dataset.projectId).toBe(p.id)
    expect(screen.getByTestId('project-card-title').textContent).toBe(p.title)
    expect(screen.getAllByTestId('project-skill').map((n) => n.textContent)).toEqual(['Three.js', 'TypeScript'])
    expect(screen.getByTestId('project-status').textContent).toBe('招募中')
    const expires = screen.getByTestId('project-expires')
    expect(expires.tagName, 'expires_at 要用 <time> 帶出絕對時間').toBe('TIME')
    expect(expires.getAttribute('datetime')).toBe(p.expires_at)
    expect(expires.textContent, '6 天 23 小時是 7 天（ceil），不是 6（floor）').toBe('剩 7 天')
    expect(screen.getByTestId('project-seats').textContent).toBe('3 個座位')
  })

  it('[FE-B02-S02] 三種狀態三種字，跟著 status 變', () => {
    const seen = new Set<string>()
    for (const status of ['recruiting', 'active', 'closed'] as const) {
      const view = render(<ProjectCard project={project({ status })} now={NOW} />)
      seen.add(screen.getByTestId('project-status').textContent ?? '')
      view.unmount()
    }
    expect(seen, '三種狀態的文字要互不相同').toEqual(new Set(['招募中', '已成軍', '已結案']))
  })

  it('[FE-B02-S03] 剩 2 小時是 1 天；過了是「已到期」、沒有負數', () => {
    const soon = render(<ProjectCard project={project({ expires_at: at(2 * HOUR) })} now={NOW} />)
    expect(screen.getByTestId('project-expires').textContent).toBe('剩 1 天')
    soon.unmount()
    // 恰等於 now：`≤ 0` 寫成 `< 0` 會印「剩 0 天」
    const exact = render(<ProjectCard project={project({ expires_at: at(0) })} now={NOW} />)
    expect(screen.getByTestId('project-expires').textContent, '到期那一刻不是「剩 0 天」').toBe('已到期')
    exact.unmount()
    render(<ProjectCard project={project({ expires_at: at(-3 * 24 * HOUR) })} now={NOW} />)
    expect(screen.getByTestId('project-expires').textContent).toContain('已到期')
    expect(card().textContent, '過期的案子印出了負數').not.toMatch(/[-−]\s*\d/)
  })

  it('[FE-B02-S04] 沒有指定技能不是空白', () => {
    render(<ProjectCard project={project({ needed_skills: [] })} now={NOW} />)
    expect(screen.queryAllByTestId('project-skill')).toEqual([])
    const missing = within(card()).getByText((_, el) => el?.getAttribute('data-missing') === 'needed_skills')
    expect(missing.textContent, '「未提供」是「這個人沒填」；案子不限技能是「未指定」').toBe('未指定')
  })

  it('[FE-B02-S05] body、updated_at、owner_id 不上卡片；唯一的 <time> 是 expires_at', () => {
    const SENTINEL = '這段內容是哨兵-3e9a'
    const p = project({ body: SENTINEL, updated_at: '2091-01-01T00:00:00Z', room_template: 42 })
    render(<ProjectCard project={p} now={NOW} />)
    const text = card().textContent ?? ''
    expect(text).not.toContain(SENTINEL)
    expect(text).not.toContain('2091')
    expect(text).not.toContain(OWNER)
    expect(text, 'room_template 是房間模板的內部編號，人看不懂').not.toContain('42')
    const times = card().querySelectorAll('time')
    expect(times.length, '卡片上多了別的時間元素 —— updated_at 會被讀成「最近活躍」').toBe(1)
    expect(times[0]?.getAttribute('datetime')).toBe(p.expires_at)
  })

  it('[FE-B02-S08] 卡片在這一份不是控制項：<article>、卡內沒有任何可聚焦元素', () => {
    render(<ProjectCard project={project()} now={NOW} />)
    const c = card()
    expect(c.tagName, '詳情還沒有，做成按鈕是一顆按下去沒反應的控制項').toBe('ARTICLE')
    // 含根節點自己：`matches` 加 `querySelectorAll`
    const FOCUSABLE = 'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]'
    const focusable = [c, ...c.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((el) => el.matches(FOCUSABLE))
      .filter((el) => !el.hasAttribute('tabindex') || Number(el.getAttribute('tabindex')) >= 0)
    expect(focusable, '卡片裡有可聚焦的東西 —— 做成 div role=button 也會在這裡紅').toEqual([])
  })
})
