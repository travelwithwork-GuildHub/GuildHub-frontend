# tasks：`fe-j13-seats`

四個 `feat/fe-j13-seats--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--backend`（替身的 seats route＋契約）→ `--state`（`useSeats`、`seatRules`、名字）→ `--markers`（`SeatAnchors` 插槽、`SeatMarkers`、回饋、掛進 `WorldCanvas`）→ `--e2e`（真瀏覽器兩人坐位、截圖）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。看得見的 tsx 動之前叫 `ui-ux-pro-max`。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-j13-seats` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j13-seats --strict` 通過且 PR 已合併

## 2. `--backend`：替身的 seats（`internal-backend` ADDED；design D5）

- [ ] 2.1 判準先紅：`tests/contract/rest/seats.contract.ts` 的 `S06`（403 沒票、200 `[]`、201、兩種 409 逐字、400 ×2、422、401、404→403）；對 internal 是 404（沒有 route）
- [ ] 2.2 `src/server/seats.ts`（`listSeats`、`claimSeat`：單一句 INSERT … SELECT、PG 錯誤碼分類）、`src/app/api/projects/[project_id]/seats/route.ts`（`handle({ auth: 'required' })`＋`hasRoomGrant`）
- [ ] 2.3 對 `internal` 綠；對 `guildhub`（本機自起）跑一次綠；突變：拿掉 `hasRoomGrant` → 403 那段紅；409 兩種文字對調 → 紅；`< seat_count` 拿掉 → 400 那段紅

## 3. `--state`：`useSeats`、`seatRules`、名字（〈重取為準〉〈失敗回饋〉的狀態半邊；design D2／D3）

- [ ] 3.1 判準先紅：`tests/seat-rules.test.ts`（`classify409` 兩種文字與其他、`canClaim` 的四個條件）；`tests/room-seats-state.test.tsx`（hook：`S04` 全部 —— 30 秒、不可見停／可見立即、離開停、輪詢失敗留舊、換房間不混；`S02` 的 claim 送出中只送一次與 201 重取；`S03` 四種結果的狀態）
- [ ] 3.2 `src/world/seats/seatRules.ts`、`src/world/seats/useSeats.ts`、`src/world/seats/useSeatNames.ts`
- [ ] 3.3 突變：不可見仍輪詢 → `S04` 紅；離開房間不 abort → `S04` 紅；輪詢失敗清空 → `S04` 紅；409 不分文字 → `S03` 紅；claim 中再按送第二個 → `S02` 紅

## 4. `--markers`：錨點插槽、標籤、回饋、掛進世界（〈每個座位有一個標籤〉〈一鍵入座〉〈失敗回饋〉的畫面半邊；`project-room-layout` MODIFIED；design D1／D4）

- [ ] 4.1 判準先紅：`tests/room-seats.test.tsx`（`S01` 四個座位兩個有人、`seat_count` 以外沒有、載到之前沒有、404 名字→「有人」、回 hall 沒有；`S02` 按鈕 payload／停用／成功後沒有「入座」／closed 沒有；`S03` 四種回饋的畫面）；`tests/seat-anchors*.test.tsx` 改 `S06`：有內容的錨點不 `aria-hidden`、沒內容的照舊
- [ ] 4.2 `SeatAnchors` 接 `render(seatIndex)`（有內容才拿掉 `aria-hidden`／`pointer-events-none`）、新 `src/world/seats/SeatMarkers.tsx`（名字／自己的／空位／入座／回饋，`ui-ux-pro-max` 先問）、`WorldCanvas` 房間裡掛上
- [ ] 4.3 突變：`closed` 也長「入座」→ `S02` 紅；已有座位仍長「入座」→ `S02` 紅；名字查不到畫 id → `S01` 紅；載到之前先畫「空位」→ `S01` 紅；有內容仍 `aria-hidden` → `S06` 紅

## 5. `--e2e`：真瀏覽器（〈真瀏覽器裡兩個人各自進房〉）

- [ ] 5.1 `tests/e2e/room-seats.mjs` 的 `S05`（對 `internal`：兩個 context、密碼進房、A 坐 0、B 搶 0 被拒、B 坐 1、A 30 秒內看到、A 重新整理）；`FE-W16-S08`、`room-entry`、`scene-switch`、`name-tags` 沒變紅
- [ ] 5.2 截圖貼 PR（兩個名字、一個空位、回饋）；`ui-ux-pro-max` pre-delivery checklist；效能：world chunk 前後差、房間裡的請求數

## 6. 收尾

- [ ] 6.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響
- [ ] 6.2 合併後 `vercel deploy --prod`、閘道 `/world?room=<seed 的房>` 一次人工 smoke（只走不壓）
- [ ] 6.3 tasks 全勾後、archive 前：`bash .github/scripts/archive-review.sh fe-j13-seats`（背景）；需修正修完 `--rereview` 一次、每條 `--judge`
- [ ] 6.4 Sheet `FE-J13` → Done（瀏覽器層驗過之後才打）
