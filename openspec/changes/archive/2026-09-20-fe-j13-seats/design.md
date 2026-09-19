## Context

房間場景（`FE-W16`）：八個工位的桌椅從配置推導，每個工位有一個投影錨點（`SeatAnchors`，Canvas 外的 DOM，`SeatAnchorProjector` 每幀把
`translate3d` 寫進錨點的 style；0×0、`aria-hidden`、`pointer-events-none`、畫面外 hidden）。錨點的**中心**就是桌面中心的投影。
場景由 `SceneProvider` 管（`scene.id === 'room'` 帶 `projectId`）；門標籤（`DoorLabels`）與名字牌是同一種「DOM 跟著投影走」的做法。

後端座位（`app/api/seats.py`，`FE-O08` 量過）：`require_room_token` 從 **session** 讀 `enter` 存進去的票（前端請求上不帶票，帶的是 cookie）；
`GET` 回全部座位；`POST` 是單一句 `INSERT … SELECT … WHERE seat_index < seat_count`，PK／unique 衝突轉 409（**只靠 `detail` 文字分**）、
range check 400、`seat_count` 以外 400（訊息含座位數）、不存在 404；沒有釋放；`close` 清座位；協定沒有座位事件。
前端 `src/api/operations.ts` 已有 `listSeats`／`claimSeat`；替身（`internal`）**沒有** seats 的 route（有 `seats` 表、有 `roomGrant` cookie 機制）。
名字：`SeatOut` 只有 `user_id`，收件匣的 `resolveNames` 已示範「每個 id 查一次、失敗記 null」。

## Decisions

### D1｜標籤住在錨點裡（錨點的 children），位置零成本；`SeatAnchors` 接一個 `render(seatIndex)` 插槽

投影器每幀只寫錨點的 `translate3d`；標籤是錨點的子節點，跟著動、跟著 hidden，**每幀零新工作**（不另開一個投影消費者、不讀錨點的 style）。
代價是 `project-room-layout` 那條 Requirement 要改（錨點有內容時不 `aria-hidden`、接指標事件）—— `FE-W16-S06` 當初就寫「給 `FE-J13` 用」，這是預期中的修改。
錨點仍是 0×0 的定位點；標籤用 `absolute` ＋ `translate(-50%, 0)` 掛在錨點中心的正下方（桌面中心往下 12px），不動錨點的中心（`S08` 的尺不變）。
`aria-hidden`、`pointer-events` 依「有沒有內容」推導：`render` 回 null 的錨點照舊。

### D2｜`useSeats(projectId, me, active)`：載入＋輪詢＋claim＋重取，作廢靠 abort；狀態機明列

```
{ phase: 'loading' | 'ready' | 'failed', seats: SeatOut[], project: { seatCount, status } | null, claiming: number | null, feedback: Feedback | null }
```
- 進房：並行 `getProject(id)` 與 `listSeats(id)`；兩個都到才 `ready`（標籤要 `seat_count` 才知道畫幾個）。任一失敗 → `failed`（可重試）。
- 輪詢：`setInterval(30_000)` 只在 `ready` 且 `document.visibilityState === 'visible'`；不可見停、可見立即重取一次（`useRooms` 的規則，`FE-W12` 那條）；輪詢失敗留舊的（stale）。
- claim：`claiming = seatIndex`（送出中全部「入座」停用、連按靠 `claiming !== null` 同步擋）；201 → 重取；409 → 依文字分類（`seatRules.classify409(detail)`）→ 重取＋回饋；403／401 → `feedback: 'ticket'`、`locked = true`（「入座」全停）；其他 → `feedback: 'failed'`。
- 作廢：`projectId`／`me`／`active` 變就 abort 在飛的、清 interval、狀態回 `loading`（同 `useMyProjects`：abort 是防線）。
- 名字：`useSeatNames(userIds)` —— 每個 id 查一次 `getProfile`，`Record<id, string | null>`（null ＝ 查不到 → 「有人」）；自己的 id 不查（身分裡有）。

### D3｜「可不可以入座」是純推導：`canClaim(state, me)`

`status === 'active' && !locked && claiming === null && !seats.some(s => s.user_id === me)`。空位才有按鈕；一人一格不用等 409。
`closed` 不給入口（anomaly 圍堵）；`recruiting` 的房間理論上進不來（沒有密碼），一樣不給。

### D4｜回饋是一則 `role="status"`／`role="alert"` 的訊息，掛在座位層的固定位置（不是每格一個）

被搶／已有座位是 `status`（不是錯誤，是資訊）；票失效與服務失敗是 `alert`。文案是常數（`SEAT_FEEDBACK`），不進契約；不回顯後端字串。
4 秒自動消失（跟 `RefusalStatus` 同一個節奏），下一次動作換掉上一則。

### D5｜替身：`src/server/seats.ts`＋`route.ts`，門用 `hasRoomGrant`，寫入是單一句 INSERT … SELECT

跟真後端同一個形狀：`INSERT INTO seats … SELECT … FROM projects WHERE id = $1 AND $2 < seat_count RETURNING …`；PG 的 `23505` 依 `constraint` 名分兩種 409 文字（`seats_pkey` vs `seats_project_id_user_id_key`）、`23514` → 400 範圍、`23503` → 404；`rowCount = 0` → 查 `seat_count` 決定 404 或 400。
契約套件 `tests/contract/rest/seats.contract.ts` 對兩個目標各跑一次（`S06`）。

### D6｜效能

標籤是 DOM、跟著既有投影器（每幀零新工作）；房間裡多 `GET seats`（進房一次、30 秒一次）與每個占用者一次 `GET profile`；
不在大廳發任何請求。world chunk 預期 +2 KB gz 以內；量前後差貼 PR。

## Risks

- 兩種 409 靠文字分：後端改字前端就分不出 —— 已在給後端的清單（1.4 要 `code`）；`classify409` 集中一處，來了只改它。
- 30 秒輪詢：別人坐了最慢 30 秒才看到；demo 裡兩個人同時操作時靠 409 的重取補。
- 標籤重疊：八個工位的投影在 1280×720 下彼此距離夠（`FE-W16` 量過），標籤寬度要 ≤ 相鄰錨點的距離；截圖對，不進 CI。
