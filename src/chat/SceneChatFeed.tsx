'use client'

import type { ChatLog } from '@/realtime/sceneChat'

// 場景聊天的列表。規格 `FE-K04`〈列表依接收順序呈現發言者與原始文字；被截斷的看得出來；空狀態不偽造結論〉（design D2、D6）、
// `output-safety`〈使用者提供的字串以文字呈現（具名元件）〉的 chat 兩個節點。
//
// 純呈現：`log` 是注入的（`SceneChatHud` 從 `useSceneChat()` 拿；測試直接給）。append-only、不用 `ListPanel`（沒有分頁、total、has_more）。
// `name`／`body` 只當文字節點 —— 沒有 Markdown、沒有連結、沒有 `dangerouslySetInnerHTML`（lint 也擋）。
// 截與不截是 `scene-chat-transport` 的事：這裡只忠實顯示交來的 `body`，`truncated` 的那一列多一個標記。
// `role="log"`：chat log 的 ARIA 角色（隱含 `aria-live="polite"`），螢幕閱讀器會念新加的列、不打斷正在念的。
// ⚠️ 這裡的字是元件常數，不是規格：空狀態說的是「這一頁還沒收到」，不說「沒有歷史」「沒有人講過」（後端沒有那種資訊，design D2）。

export const CHAT_FEED_LABELS = {
  empty: '這一頁還沒收到訊息。',
  truncated: '（已截斷）',
  /** 列表的可及名稱。 */
  log: '場景聊天',
}

export function SceneChatFeed({ log }: { log: ChatLog }) {
  return (
    <div data-testid="chat-feed" className="flex min-h-0 flex-col gap-1">
      {log.length === 0 ? (
        <p data-testid="chat-empty" className="text-ink-muted text-caption">
          {CHAT_FEED_LABELS.empty}
        </p>
      ) : (
        <ol role="log" aria-label={CHAT_FEED_LABELS.log} className="m-0 flex list-none flex-col gap-1 p-0">
          {/* key 用 index：協定沒有訊息 id；列表只會在尾端加、在頭端淘汰，錯位的代價是純文字列重畫一次。 */}
          {log.map((record, index) => (
            <li key={index} data-testid="chat-row" className="flex flex-wrap gap-x-2">
              <span data-testid="chat-name" className="font-semibold">
                {record.name}
              </span>
              <span data-testid="chat-body" className="whitespace-pre-wrap break-words">
                {record.body}
              </span>
              {record.truncated && (
                <span data-testid="chat-truncated" className="text-ink-muted text-caption">
                  {CHAT_FEED_LABELS.truncated}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
