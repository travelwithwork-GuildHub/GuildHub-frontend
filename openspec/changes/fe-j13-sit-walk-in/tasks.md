# Tasks —— fe-j13-sit-walk-in

## 1. 規格（本 PR）
- [x] 1.1 `spec/fe-j13-sit-walk-in` 分支，只動 `openspec/changes/fe-j13-sit-walk-in/`
- [x] 1.2 `pnpm exec openspec validate fe-j13-sit-walk-in --strict` 綠
- [x] 1.3 規格 PR 合併到 main

## 2. 實作：站位互動（feat/fe-j13-sit-walk-in--interaction）
- [x] 2.1 `SeatMarkers`／新元件：對「可入座的空位」在**站位**（`stationAt(i).x/z`）註冊 `Interactable`（label「入座」、`onInteract` → `claim(i)`）
- [x] 2.2 只在 `active`、自己沒座位、該格空、`i < seat_count` 時掛；自己有座位 → 全部不掛
- [x] 2.3 拿掉常駐「入座」按鈕；標籤（名字／「空位」）保持不動
- [x] 2.4 單元測試：站位註冊/不註冊的四種條件、`onInteract` 呼叫 `claim(i)`、已有座位不掛、closed 不掛
- [x] 2.5 修既有測試：`world-scenes-room-exit` 的 room 互動集合多了 `seat-*`；`SeatMarkers` 測試改成互動而非按鈕

## 3. 真瀏覽器 e2e（feat/fe-j13-sit-walk-in--e2e）
- [x] 3.1 `tests/e2e/` 加/改 S05：兩 context 進房、走到 0 號站位、A 按 E 入座、B 按 E 被搶、B 走到 1 號按 E、A 30 秒內看到、A 重整仍在 0 號
- [x] 3.2 驗「走近不送 POST、按 E 才送」（S02 的關鍵防線）
- [x] 3.3 本機 build 帶 `NEXT_PUBLIC_APP_ENV=local`（見 reference_local_e2e_build_env）；跑綠

## 4. 收尾
- [x] 4.1 更新 `projectRoomLayout.ts` 過時註解（「桌椅不註冊互動」→ 站位現在會註冊入座互動）
- [ ] 4.2 部署（`vercel --prod`）＋真機走查：走到空位按 E 坐下、已坐下不再提示
- [ ] 4.3 archive-review ＋封存（`FE-J13` 的既有封存不動，本 change 另封存）
