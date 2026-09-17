'use client'

import type { ProjectOut } from '@/api/contract/rest'
import { Missing } from '@/talent/Missing'
import { PROJECT_STATUS_LABEL, daysLeft } from './projectStatus'

// 案件卡。規格 `FE-B02`〈案件卡讓人一眼判斷「要什麼」「還在招嗎」「剩幾天」「幾個座位」〉。
//
// ⚠️ **這是 `<article>`，不是控制項**（design D1）。詳情還沒有（`FE-B03`）；做成按下去沒反應的 `<button>`
// 對鍵盤使用者比不可聚焦更糟。`FE-B03` 會把它換成可聚焦的控制項（跟 `TalentCard` 同一種形狀）。
//
// ⚠️ **`body`、`updated_at`、`owner_id`、`room_template` 不上卡片**（`S05`）。`body` 長度不定會把卡片高度弄亂；
// `updated_at` 是案件更新時間、放上來會被讀成「最近活躍」；`owner_id` 是 UUID，人讀不懂 —— 發案者是誰歸詳情。
//
// ⚠️ **狀態是文字**（`S02`）。三種狀態三種字，不靠顏色區分。
//
// ⚠️ **不可聚焦、沒有 button／a**（`S08`）：`FE-B03` 之前這張卡不接任何事件。
//
// ⚠️ **`now` 是 prop，而且是必填**（design D2）：判準要釘住時鐘；而元件本身不讀時鐘（render 要純，`react-hooks/purity`）。
// 呼叫端在面板開起來時讀一次（`BoardPanel` 的 `useState(() => Date.now())`）；不裝計時器，粒度是「天」。

const CHIP = 'bg-surface text-caption whitespace-nowrap rounded px-1.5 py-0.5'

export function ProjectCard({ project, now }: { project: ProjectOut; now: number }) {
  const days = daysLeft(project.expires_at, now)
  return (
    <article
      data-testid="project-card"
      data-project-id={project.id}
      className="border-control-edge flex w-full flex-col gap-1 rounded border p-3 text-left"
    >
      <h3 data-testid="project-card-title" className="text-ink line-clamp-2 font-medium">
        {project.title}
      </h3>
      <p className="text-caption text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-testid="project-status">{PROJECT_STATUS_LABEL[project.status]}</span>
        {/* `≤ 0` 是已到期：列表本來就過濾掉過期的，但 `FE-J03` 我的案件會拿到自己過期的案子 —— 不印負數 */}
        <time data-testid="project-expires" dateTime={project.expires_at}>
          {days <= 0 ? '已到期' : `剩 ${days} 天`}
        </time>
        <span data-testid="project-seats">{project.seat_count} 個座位</span>
      </p>
      {project.needed_skills.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {project.needed_skills.map((skill) => (
            <span key={skill} data-testid="project-skill" className={CHIP}>
              {skill}
            </span>
          ))}
        </span>
      ) : (
        // 空陣列是常態（後端預設 `[]`），但一片空白讀不出是「不限」還是「沒載到」（design D4）
        <span className="text-caption">
          <Missing field="needed_skills" label="未指定" />
        </span>
      )}
    </article>
  )
}
