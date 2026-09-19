import { TITLE } from '@/design/controls'
import { IdentityBadge } from '@/identity/IdentityBadge'
import { InboxButton } from '@/inbox/InboxButton'
import { ReturnToHallButton } from '@/world/scenes/ReturnToHallButton'
import { AvatarPicker } from './AvatarPicker'

// `/world` 的標題列。規格 `FE-X16`〈標題列是固定的導覽〉（`S19`）：**品牌在左、其餘是靠右的一組身分與入口**，互動控制 `≤ 5`；
// 每個世界畫面上同一位置（它是 `<Canvas>` 的兄弟、在世界區上方，所以天生不被 3D 畫面與面板蓋住 —— 面板掛在世界區裡）。
//
// 抽成一個元件是為了讓 jsdom 的判準渲染**真的那一列**（`page.tsx` 是 Server Component，測試掛不起來）。
// 這裡沒有任何狀態：有哪些入口由各功能決定（`IdentityBadge`、`InboxButton` 只在登入後、`ReturnToHallButton` 只在房間）。
// 房間裡是品牌＋身分＋收件匣＋換角色＋回大廳＝5，剛好在上限（design 待答問題）；再加入口要合併某個，不是擠進去。
//
// ⚠️ **`relative` 是換角色彈出層 `absolute` 的定位基準。** 少了它，彈出層會相對於整個視窗定位。

export function AppHeader() {
  return (
    <header data-testid="app-header" className="p-gutter relative flex shrink-0 items-center gap-gutter">
      <h1 {...TITLE}>GuildHub</h1>
      <div data-testid="app-header-entries" className="ml-auto flex items-center gap-gutter">
        <IdentityBadge />
        <InboxButton />
        <AvatarPicker />
        <ReturnToHallButton />
      </div>
    </header>
  )
}
