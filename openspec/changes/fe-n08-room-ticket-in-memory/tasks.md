# tasks：fe-n08-room-ticket-in-memory

## 1. 規格（spec/ 分支）

- [x] 1.1 `specs/world-scenes/spec.md`：MODIFIED〈票由前端持有〉—— prose 改記憶體為主／storage best-effort，S14 沿用（註明重整撿回），新增 S22
- [x] 1.2 `specs/room-entry-gate/spec.md`：REMOVED + ADDED〈成功先存票再進房〉—— 改名、沿用 S06/S07/S11/S15、退役 S14、新增 S17／S18
- [x] 1.3 `pnpm exec openspec validate fe-n08-room-ticket-in-memory --strict` 通過
- [x] 1.4 在 openspec 樹的副本上 trial-archive（`node node_modules/.bin/openspec archive … --yes --json`）確認退役＋同義重用 archive-safe（+1/~1/−1、archive 後兩份 spec strict valid）
- [x] 1.5 proposal 有 Non-goals、design 記兩模型結論／ID 計畫／實作邊界

## 2. 記憶體為主的票（feat/ 分支）

- [x] 2.1 `roomTokens.ts`：模組級 `Map<string, string | null>` 當權威；`holdRoomToken` 寫記憶體＋best-effort storage
- [x] 2.2 `heldRoomToken`：`Map.has` → 以記憶體為準（票／墓碑 `null`）；未見過 → storage 撿回並快取
- [x] 2.3 `dropRoomToken`：記憶體墓碑（`null`）＋best-effort 清 storage；`DropResult = 'dropped'`（拿掉三態）
- [x] 2.4 `withStorage`：取得 storage 與每個操作各自 try、回 fallback、不拋
- [x] 2.5 `__resetRoomTokenMemory`（測試專用）＋ `vitest.setup.ts` 全域 `afterEach` 清記憶體（模組單例跨測試會漏）

## 3. 移除「存不進就失敗」的產品行為（feat/ 分支）

- [x] 3.1 `RoomPasswordDialog.tsx`：`TicketNotHeldError` 只在空 `room_token` 或 `me === null` 拋；讀回檢查靠記憶體必過
- [x] 3.2 `notHeld` 文案改成「這間房目前拿不到通行證，請稍後再試」（不再說「這個瀏覽器存不了通行證」）
- [x] 3.3 `SceneNotices.tsx`：拿掉 `dropFailed` 狀態與「storage 刪不掉就擋著」的分支；`reenter` 一律丟票、關通知、開視窗

## 4. 測試對齊新規格（feat/ 分支）

- [x] 4.1 `world-scenes-room-tokens.test.ts`：storage 被擋仍持有／重整撿回／墓碑蓋過殘留 三條標 **FE-V01-S22**；基本持有讀丟＋鍵含身分＋不進 localStorage 留 S14
- [x] 4.2 `room-entry-submit.test.tsx`：反轉的「storage 失敗照進」`it.each` 與「空 `room_token` 才失敗」標 **FE-N08-S17**；S06／S15 的票斷言改以 `heldRoomToken` 為準（storage 是 best-effort）
- [x] 4.3 `room-entry-retry.test.tsx`：`removeItem` 失敗的 `it.each` 標 **FE-N08-S18**（墓碑保證：視窗照開、`heldRoomToken` 回 `null`）；S11 主流程票斷言改 `heldRoomToken`
- [x] 4.4 `world-scenes-transition-ui.test.tsx`：mid-test「沒票」處清記憶體（`sessionStorage.clear` 已不代表沒票）

## 5. 收尾

- [x] 5.1 `pnpm test` 全綠（既有唯一 pre-existing 失敗 `FE-O04-S01` 不算；`server-auth` 的常數時間 benchmark 全套平行時偶爾 flake，單跑綠）、`pnpm lint`（含 `.mjs`）rc=0、`pnpm exec tsc --noEmit` rc=0
- [ ] 5.2 使用者重新部署（`vercel --prod`）後，在**主力瀏覽器（非無痕）**走查：輸密碼 → 進得了房間
- [ ] 5.3 封存前 archive-review（請使用者手動 `!bash …archive-review.sh fe-n08-room-ticket-in-memory`）
