'use client'

import type { ProjectOut } from '@/api/contract/rest'
import { Missing } from '@/talent/Missing'
import { PROJECT_STATUS_LABEL, daysLeft } from './projectStatus'

// 案件卡。規格 `FE-B02`〈案件卡讓人一眼判斷「要什麼」「還在招嗎」「剩幾天」「幾個座位」〉、
// `FE-B03`〈卡片是控制項，滑鼠與鍵盤都開得了詳情〉。
//
// ⚠️ **是 `<button>`，不是 `div role="button"`**（跟 `TalentCard` 同一個理由）：可聚焦、Enter／Space 原生就會觸發 `click`、螢幕閱讀器認得。
// `FE-B02` 時它是 `<article>`（詳情還不存在，按下去沒反應的按鈕是騙人的）；`FE-B03` 詳情有了才換成控制項。
// **整張卡是唯一的控制項**：裡面不能再有第二個（`FE-B02-S08` 的新內容），而且 `<button>` 裡只能放 phrasing content —— 所以全部是 `<span>`，沒有 h3／p。
//
// ⚠️ **`body`、`updated_at`、`owner_id`、`room_template` 不上卡片**（`S05`）。`body` 長度不定會把卡片高度弄亂；
// `updated_at` 是案件更新時間、放上來會被讀成「最近活躍」；`owner_id` 是 UUID，人讀不懂 —— 發案者是誰歸詳情。
//
// ⚠️ **狀態是文字**（`S02`）。三種狀態三種字，不靠顏色區分。
//
// ⚠️ **時鐘是必填的 prop，跟資料同一次取回**（design D2）：`ListPanel` 把這一頁回來的時刻（`shown.at`）交給 `renderItem`。
// 元件自己不讀 `Date.now()`（render 要純，`react-hooks/purity`），也**不綁在掛載時刻**：重取不一定重新掛載 `li`（同 key 只會 re-render），
// 綁掛載的話舊卡會一直用第一次的時鐘。時鐘釘在**面板開起來**那一刻的實作，發案之後回來的那一筆是 7 天 ＋幾秒 → `ceil` 成 8（真瀏覽器截圖抓到的）。
// 不裝計時器，粒度是「天」。

const CHIP = 'bg-surface text-caption whitespace-nowrap rounded px-1.5 py-0.5'

export function ProjectCard({ project, now, onOpen }: { project: ProjectOut; now: number; onOpen: (id: string) => void }) {
  const days = daysLeft(project.expires_at, now)
  return (
    <button
      type="button"
      data-testid="project-card"
      data-project-id={project.id}
      onClick={() => onOpen(project.id)}
      className="border-control-edge hover:bg-surface flex w-full flex-col gap-1 rounded border p-3 text-left"
    >
      <span data-testid="project-card-title" className="text-ink line-clamp-2 block font-medium">
        {project.title}
      </span>
      <span className="text-caption text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-testid="project-status">{PROJECT_STATUS_LABEL[project.status]}</span>
        {/* `≤ 0` 是已到期：列表本來就過濾掉過期的，但 `FE-J03` 我的案件會拿到自己過期的案子 —— 不印負數 */}
        <time data-testid="project-expires" dateTime={project.expires_at}>
          {days <= 0 ? '已到期' : `剩 ${days} 天`}
        </time>
        <span data-testid="project-seats">{project.seat_count} 個座位</span>
      </span>
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
    </button>
  )
}
