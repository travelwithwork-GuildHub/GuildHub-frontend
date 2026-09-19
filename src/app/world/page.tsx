import { IdentityProvider } from '@/identity/IdentityProvider'
import { AvatarDraftProvider } from '@/identity/AvatarDraftProvider'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { BlockingPanelCoordinator } from '@/panel/BlockingPanelCoordinator'
import { ProfilePanelProvider } from '@/profile/ProfilePanelProvider'
import { RealtimeGenerationProvider } from '@/realtime/RealtimeGenerationProvider'
import { RoomEntryGateProvider } from '@/world/scenes/RoomEntryGate'
import { SceneChatProvider } from '@/realtime/SceneChatProvider'
import { StatusProvider } from '@/realtime/StatusProvider'
import { SceneNotices } from '@/world/scenes/SceneNotices'
import { SceneProvider } from '@/world/scenes/SceneProvider'
import { AppHeader } from './AppHeader'
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
        {/* 同一時間只有一個阻斷式面板（`FE-X16`）：三個面板 provider 的「開著」都從它推導；訪客提示、聊天框、換角色讀它讓位。 */}
        <BlockingPanelCoordinator>
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
        {/* 自己的狀態文字（`FE-K05`）：送出口與「目前狀態」在這裡，跨場景不清；`RemoteWorld` 同樣靠 `WorldCanvas` 用 prop 接上。 */}
        <StatusProvider>
        <WorldGate>
          <main className="flex h-dvh flex-col">
            {/* ⚠️ 標題列裡的 `IdentityBadge` 是 client component，這一頁仍然是同步的
                Server Component —— 上面那段註解說的限制沒有改變。身分的查詢在瀏覽器端發生，因為它要帶 cookie。 */}
            {/* 標題列（`FE-X16-S19`）：品牌左、身分與入口靠右一組；`<Canvas>` 的兄弟、在世界區上方，所以不被 3D 畫面與面板蓋住。 */}
            <AppHeader />
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
        </StatusProvider>
        </SceneChatProvider>
        </RoomEntryGateProvider>
        </SceneProvider>
        </RealtimeGenerationProvider>
        </InboxPanelProvider>
        </ProfilePanelProvider>
        </BlockingPanelCoordinator>
      </AvatarDraftProvider>
    </IdentityProvider>
  )
}
