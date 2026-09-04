# GuildHub 12 週產品全貌與場景設計

> 定位：有空間感的自由工作者／專案媒合平台。
> **3D 負責空間、Presence 與探索；DOM / React 負責搜尋、表單、詳細資料與高效率操作。**

技術實作細節見 `docs/WBS.md`；產品功能與場景以本檔為主。

> ## ⚠️ 這份是在後端存在之前寫的，而且 W6–W12 已經被換掉了
>
> 後端（`GuildHub-backend`）已經寫完第一版，它不支援這裡描述的大部分東西。
> **但那不是牆** —— 後端跟前端一樣在開發中，大部分只是還沒規劃到。
>
> 更重要的是：**這份漏掉了整個媒合閉環。**
> 「接案」在這裡只有一個動作 —— 寄站內信給發起人。
> 沒有應徵、沒有申請狀態、沒有洽談、沒有 offer、沒有錢與時間、沒有信任訊號。
>
> 所以 `docs/WBS.md` 把 **W6–W12 換成了媒合閉環**，
> 原本排在那裡的 Skill Spaces、Looking For、Team Formation、世界導覽、社群活動
> 被往後挪或被取代。
>
> **這份讀作「產品意圖與場景設計」，不是「排程」。**
> 排程看 `docs/WBS.md` 的〈里程碑〉那一節。
>
> ```bash
> bash .github/scripts/progress.sh --blocked
> ```
>
> ## ⚠️ 而且這份漏掉了整個媒合閉環
>
> 「接案」在這份規劃裡只有一個動作：**寄站內信給發起人**。
> 沒有應徵、沒有申請狀態、沒有洽談、沒有雙方承諾、沒有合作條件（錢與時間）、
> 沒有信任訊號、`closed` 也分不出「停止招募」與「專案完成」。
>
> 缺的東西列在 `docs/WBS.md` 的 `FE-M`（媒合閉環）、`FE-T`（信任與邊界）、
> `FE-V`（空間的產品價值）三組，**共 24 項，目前全部是 `TBD`** ——
> 它們不是還沒排到，是**還沒決定要不要做**。

## 核心使用流程

```
1 建立身分 → 2 進入世界 → 3 發現機會 → 4 媒合聯絡 → 5 組成團隊 → 6 進入專案房 → 7 協作 → 8 回訪
暱稱+Avatar   Guild Hall   Marketplace/Office  Profile/Inbox/Chat  Team Formation  Project Room  Resources/Meeting  Events/未讀/最近專案
```

## 場景設計

| 場景 | 產品目的 | 主要行為 | 3D 空間元素 | 主要功能 | 導入 | 強化 |
|---|---|---|---|---|---|---|
| **Guild Hall** | 世界首頁／中央樞紐 | 看線上玩家、前往其他場景、查看熱門內容 | 中央大廳、入口、公告區、傳送點、Project Doors | Presence、Status、場景入口、熱門案件/場景 | W3 | W10–W12 |
| **Marketplace** | 發案／接案／找人才 | 瀏覽、搜尋、篩選、查看人才、發案 | Project Board、Talent Board、案件區、人才區 | Project Board、Talent Board、Project Detail、Create Project | W4 | W12 |
| **Office** | 工作 Presence／輕社交 | 選工作桌、看誰在線、查看狀態、找人聊天 | 工作桌、座位、休息區、玩家區 | Presence、Profile、Message、Personal Desk | W4–W5 | W6–W7 |
| **Skill Spaces** | 按技能分流的人才空間 | 前往 Developer / Design / AI 等空間找同領域人才 | Developer Office、Design Studio、AI Lab | Skills 推薦、Looking For、人才探索 | W6 | W7 |
| **Project Room** | 成軍後的專案空間 | 進房、看隊員、坐席、聊天、開會、開資源 | 專案桌、Seat、Team Board、Resources Board | Password、Seat、Room Chat、Meeting Link、Team Presence | W4 | W8–W9 |
| **Event Space** | 社群活動／留存 | 參加 Demo Day、Networking、Meetup | 舞台、觀眾區、活動看板 | Event Detail、Participants、Presence、Chat | W11 | W12 |

備註：所有場景都可回到 Guild Hall。Marketplace 的 3D 用於探索，**真正搜尋／篩選使用 DOM**。
Project Room 不重做 GitHub / Figma / Notion。

## 功能地圖

| 功能域 | 完整功能 | 產品價值 | 場景／介面 | 週數 | MVP | 依賴 |
|---|---|---|---|---|---|---|
| 帳號與 Onboarding | 暱稱登入、Session、Guest/Member、首次 Avatar Creator | 降低進入門檻並建立世界身分 | 登入 / Avatar Preview | W1–W2 | 是 | Session / Avatar Schema |
| Avatar | Body、Hair、Hair Color、Outfit、Outfit Color、Skin、即時 Preview | 每個人外觀不同且風格一致 | 所有 3D 場景 | W2–W3 | 是 | ProceduralAvatar |
| Profile | Display Name、Skills、Hours、Bio、Avatar | 快速判斷合作對象 | DOM Panel | W2 | 是 | REST / Zod |
| 發案 | Create Project、需求技能、Project Detail、狀態 | 形成案件供給 | Marketplace / DOM | W2 | 是 | Project API |
| 接案 | 瀏覽 recruiting、搜尋/篩選、Detail、聯絡發起人 | 形成需求端 | Marketplace | W2–W4 | 是 | Project Board / Inbox |
| 找人才 | Talent Board、Skills filter、Available Hours、Profile、聯絡 | 讓發案者主動找人 | Marketplace / Office / Skill Spaces | W2–W7 | 是 | Profile / Inbox |
| Inbox | List、Detail、Send、Read/Unread | 陌生人第一接觸的持久溝通 | DOM | W2 | 是 | Message API |
| Presence | Online、Status、Display Name、Online Count | 建立「大家同時在這裡」 | 所有場景 | W1–W5 | 是 | WebSocket |
| Realtime Chat | Lobby / Room Chat、近期記憶 | 場景內即時輕量交流 | Guild Hall / Office / Room / Event | W3–W11 | 是 | WebSocket |
| 場景切換 | Guild Hall / Marketplace / Office / Room / Skill / Event | 讓世界結構承載不同目的 | 3D World | W4–W11 | 是 | SceneNavigation / WS membership |
| Office 工作桌 | Claim/Leave Desk、Avatar、Skills、Status | 讓工作狀態可視化 | Office | W4–W6 | 部分 | Seat / Presence |
| Looking For | Available for Work、Hiring、技能/角色需求 | 把 Presence 轉成媒合訊號 | Office / Skill Spaces / Profile | W7 | 否 | Profile / Presence |
| Team Formation | Founder、Team、Open Roles、Role Slot、邀請 | 從「刊登」進入「組隊」 | Project Detail / Room | W7–W8 | 否 | Projects / Talent / Inbox |
| Project Door | Active Project Door、Project Name、Online Count、Password | 把專案變成世界中的入口 | Guild Hall Corridor | W4 | 是 | Project lifecycle / Room |
| Project Room | Seat、Team、Room Chat、Meeting | 成軍後的共同空間 | Project Room | W4–W9 | 是 | Room / Seat / WS |
| Project Resources | GitHub/Figma/Notion/Drive/Meeting 外部資源 | 專案工具集中於同一入口 | Project Room | W9 | 否 | Project Room |
| 世界導覽 | 場景地圖、快速移動、Online Count | 世界變大後仍可導航 | Guild Hall / Global UI | W10 | 否 | Scene registry |
| Community Events | 活動列表、Demo Day、Networking、Meetup | 增加社群與回訪理由 | Event Space | W11 | 否 | Event model / Presence |
| Discovery / Retention | 熱門案件、缺人 Project、熱門場景、新手導覽、最近 Project、未讀 Inbox | 提高啟動與回訪效率 | Guild Hall / Global UI | W12 | 否 | 多個模組 |

## 12 週演進

| 週 | 階段 | 這週完成後產品長什麼樣 | 驗收重點 | 不是這週做的 |
|---|---|---|---|---|
| **W1** | 世界技術成立 | 玩家能進 3D 世界、移動、碰撞、互動，兩個以上 browser 看得到彼此 | 10Hz network → 60FPS render；單 browser 顯示 39 remote | 正式美術、產品 CRUD |
| **W2** | 媒合產品成立 | **關掉 3D 也能**建身分、發案、找案、找人才、寄訊息 | 首次登入可完成暱稱與角色建立；完整發案／找人流程可用 | 正式場景美化 |
| **W3** | Guild Hall 成形 | 風格統一的世界，看得到其他玩家與狀態 | 風格一致；Board 可從 3D 入口開 DOM | 更多場景 |
| **W4** | 世界開始分區 | 可去 Marketplace、Office、Project Room | 場景切換時 WS membership 正確；發案→成軍→進房走得通 | 技能場景、社群活動 |
| **W5** | **MVP 可發表** | Office 有 Presence，Project Room 可協作，Guest / Loading / Error / 效能完成 | 完整 E2E Demo；壓測與渲染測試分開驗證 | 新功能膨脹 |
| **W6** | 職能社群形成 | 可進 Developer Office / Design Studio / AI Lab，可認領工作桌 | 技能與場景推薦合理；共用同一 3D 元件系統 | Team Formation |
| **W7** | Presence 變成媒合訊號 | 能表示 Available、Hiring、正在找什麼角色 | 媒合狀態清楚但頭頂不過載 | 專案資源整合 |
| **W8** | 案件變成隊伍 | Project 可視覺化 Founder / Team / Open Roles，可從人才頁邀請 | 角色缺口與成員狀態一致；成軍後空間同步 | Community |
| **W9** | Project Room 變成工作入口 | 房內看得到 Team/Presence/Seats，集中外部資源 | 外部資源可管理與開啟 | 內建文件／影音協作 |
| **W10** | 世界可導航 | 可透過地圖、快速移動、Online Count 找目的地 | 不必靠走路完成高頻任務 | 活動功能 |
| **W11** | 社群活動成立 | 可辦 Demo Day、Networking、Meetup | 活動列表→進場→Presence/Chat 流程完整 | 複雜直播系統 |
| **W12** | 完整產品閉環 | 新手知道怎麼玩，舊使用者知道回來做什麼 | 新手首輪與回訪流程清楚 | 再新增大型模組 |

## 階段邊界

| 階段 | 週 | 必須交付 | 可以延後 | 核心指標 | 原則 |
|---|---|---|---|---|---|
| **MVP** | W1–W5 | 發案/接案/找人才、Avatar、Presence、Chat、四大場景 | Skill Spaces、Looking For、Events | 核心流程走通、多人穩定 | **不再塞新功能** |
| **媒合深化** | W6–W10 | 技能場景、工作桌、Looking For、Team Formation、Project Resources、世界導覽 | Community Events | 媒合互動率、組隊完成率 | 空間功能必須服務媒合 |
| **社群閉環** | W11–W12 | Events、Event Space、Discovery、Retention | 更大型社群／遊戲化 | 回訪、活動參與、未讀/最近專案回流 | **不做 MMORPG 化** |
