import { IdentityBadge } from '@/identity/IdentityBadge'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { AvatarDraftProvider } from '@/identity/AvatarDraftProvider'
import { InboxButton } from '@/inbox/InboxButton'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { RealtimeGenerationProvider } from '@/realtime/RealtimeGenerationProvider'
import { ReturnToHallButton } from '@/world/scenes/ReturnToHallButton'
import { RoomEntryGateProvider } from '@/world/scenes/RoomEntryGate'
import { SceneChatProvider } from '@/realtime/SceneChatProvider'
import { SceneNotices } from '@/world/scenes/SceneNotices'
import { SceneProvider } from '@/world/scenes/SceneProvider'
import { AvatarPicker } from './AvatarPicker'
import { FirstEntryNotice } from './FirstEntryNotice'
import { OtherTabNotice } from './OtherTabNotice'
import { WorldGate } from './WorldGate'
import { WorldBoundary } from './WorldBoundary'

// 規格 FE-X01-S03。**這個元件刻意保持同步**（不是 async Server Component）——
// Vitest 目前不支援 async Server Component，非同步的話這條 Scenario
// 就只剩人工驗得到（見 design.md 的 R2）。
export default function WorldPage() {
  // World 區域要有真的高度，否則 `h-full` 撐不開 —— 實測過：
  // 父層沒有高度時 canvas 只有 150px 高，而一個 150px 高的 3D 世界
  // 不算「進得了 3D 世界」，FE-W03 也沒辦法在裡面走路。
  return (
    <IdentityProvider>
      <AvatarDraftProvider>
        {/* 「我的名片」面板的開關（`FE-A04`）：按鈕在標題列、面板在 World 裡 —— provider 要包住兩者。 */}
        <ProfilePanelProvider>
        {/* 收件匣（`FE-K01`）：按鈕在標題列、面板在 World 裡、資料在 provider —— 同樣要包住兩者。 */}
        <InboxPanelProvider>
        <RealtimeGenerationProvider>
        {/* 在哪個場景（`FE-V01`）：從網址與票推導，要身分（`IdentityProvider` 在外面）；世界與網址那一層都在它底下。 */}
        <SceneProvider>
        {/* 正式門禁（`FE-N08`）：沒票的門開密碼視窗。開關在這裡、視窗在 `WorldCanvas` 裡（鎖與焦點錨在那邊）。 */}
        <RoomEntryGateProvider>
        {/* 場景聊天（`FE-R11`）：記憶體與送出口在這裡，Canvas 裡的 `RemoteWorld` 靠 `WorldCanvas` 用 prop 接上；UI 是 `FE-K04`。 */}
        <SceneChatProvider>
        <WorldGate>
          <main className="flex h-dvh flex-col">
            {/* ⚠️ **`IdentityBadge` 是 client component，這一頁仍然是同步的
                Server Component** —— 上面那段註解說的限制沒有改變。
                身分的查詢在瀏覽器端發生，因為它要帶 cookie。 */}
            {/* ⚠️ **`relative` 是換角色面板 `absolute` 的定位基準。**
                少了它，面板會相對於整個視窗定位。 */}
            <div data-testid="app-header" className="p-gutter relative flex shrink-0 items-center gap-gutter">
              <h1 className="text-title">GuildHub</h1>
              <IdentityBadge />
              {/* 收件匣入口（`FE-K01`）：只在已登入時出現。 */}
              <InboxButton />
              {/* ⚠️ **入口一直都在**（規格 `FE-A05-S11`）。它在標題列裡，
                  也就是 `<Canvas>` 的兄弟 —— 所以天生不會被 3D 畫面蓋住。 */}
              <AvatarPicker />
              {/* 「回到 Guild Hall」（`FE-V01-S13`）：只在房間裡出現；在標題列，不被 Canvas 蓋住。 */}
              <ReturnToHallButton />
            </div>
            <OtherTabNotice />
            {/* 進不去的通知、沒票的說明（`FE-V01-S07`／`S14`）。 */}
            <SceneNotices />
            {/* ⚠️ **`relative` 是引導層 `absolute inset-0` 的定位基準。**
                少了它，引導層會相對於整個視窗定位 —— 蓋到標題列上。 */}
            <div className="relative min-h-0 flex-1">
              <WorldBoundary />
              <FirstEntryNotice />
            </div>
          </main>
        </WorldGate>
        </SceneChatProvider>
        </RoomEntryGateProvider>
        </SceneProvider>
        </RealtimeGenerationProvider>
        </InboxPanelProvider>
        </ProfilePanelProvider>
      </AvatarDraftProvider>
    </IdentityProvider>
  )
}
