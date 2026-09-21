# Tasks —— fe-j13-seat-relocation

## 1. 規格（本 PR）
- [ ] 1.1 `spec/fe-j13-seat-relocation` 分支，只動 `openspec/changes/fe-j13-seat-relocation/`
- [ ] 1.2 `pnpm exec openspec validate fe-j13-seat-relocation --strict` 綠
- [ ] 1.3 規格 PR 合併到 main

## 2. 實作：就位機制（feat/fe-j13-seat-relocation--relocate）
- [x] 2.1 `src/world/physics/world.ts`：加 `teleportPlayer(pw, { x, z })` —— `pw.player.setTranslation({x,0,z}, true)`（物理體位置設定留在 physics 模組）
- [x] 2.2 `src/world/seats/seatRelocation.ts`：`facingForSeat`／`relocationForSeat` 由 `stationAt` 與通道中線導出（西 `left`、東 `right`；純函式）
- [x] 2.3 relocation 型別＋消費：`src/world/player/relocation.ts`（`Relocation`／`RelocationRef`／`applyRelocation`／`consumeRelocation`）；`WorldCanvas` `useRef<Relocation | null>(null)` 傳給 `LocalPlayer`（消費）與 `RoomSeats`（產生）
- [x] 2.4 `LocalPlayer`：`useFrame` 開頭呼叫 `consumeRelocation`（原子設物理／`motion.prev=cur=dest`／root／facing／rotation／`targetRef`／`poseRef`、消費後清空）；物理未載入時 `pw` 為 null 也設畫面（載入後 `movePlayer` 接手）
- [x] 2.5 單元 `tests/player-relocation.test.ts`（真 Rapier）：`FE-W03-S18` —— `teleportPlayer` 設位置、`consumeRelocation` 原子套用＋清空＋只一次、prev=cur ⇒ advance 不回彈

## 3. 實作：觸發（併入 --relocate）
- [x] 3.1 `src/world/seats/useSeats.ts`：加 `onRelocate?` 選項（effect 更新 ref、不在 render 寫），**只在 201 成功分支**（refetch 後、非 abort）呼叫一次
- [x] 3.2 `src/world/seats/SeatMarkers.tsx`：`onRelocate` 接成「算 `relocationForSeat(i)` 寫進 relocateRef」；relocateRef 由 `WorldCanvas` 經 props 下來
- [x] 3.3 單元 `tests/room-seats-state.test.tsx`：`FE-J13-S07` —— 201 → onRelocate(i) 一次；被搶 409／已有座位 409／403／500／輪詢／重整既有座位 → 不呼叫；`relocationForSeat` 純函式西 left 東 right

## 4. 真瀏覽器 e2e（併入既有 `tests/e2e/room-seats.mjs`）
- [x] 4.1 `FE-J13-S08` 併入 `room-seats.mjs`：A 按 E 入座 201 後，回報位置就位到 0 號站位（Δ0.00）、按 E 前後跳躍 1.85（證明真的移動）、之後仍可自由走離站位；B 入座後就位到 1 號站位
- [x] 4.2 本機跑綠（db:reset → internal build → next start 3101 → 全部通過）。⚠️ `next start` 的 **runtime** 也要 `NEXT_PUBLIC_APP_ENV=local`（不只 build），否則 next.config.ts 驗證擋下

## 5. 收尾
- [x] 5.1 `pnpm lint` ＋ `tsc` ＋ `pnpm test` 全綠（唯一失敗 `FE-O04-S01` 是本機 backend clone 分歧、CI skip、與本 change 無關）
- [ ] 5.2 部署由使用者 `vercel --prod`；真機走查：入座後人真的到工位
- [ ] 5.3 archive-review ＋封存（使用者手動）
