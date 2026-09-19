# tasks：`fe-j13-seats`

四個 `feat/fe-j13-seats--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--backend`（替身的 seats route＋契約）→ `--state`（`useSeats`、`seatRules`、名字）→ `--markers`（`SeatAnchors` 插槽、`SeatMarkers`、回饋、掛進 `WorldCanvas`）→ `--e2e`（真瀏覽器兩人坐位、截圖）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。看得見的 tsx 動之前叫 `ui-ux-pro-max`。

## 1. 規格

- [x] 1.1（#544）規格已在 PR 上談定（`spec/fe-j13-seats` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j13-seats --strict` 通過且 PR 已合併

## 2. `--backend`：替身的 seats（`internal-backend` ADDED；design D5）

- [x] 2.1 判準先紅：`tests/contract/rest/seats.contract.ts` 的 `S06`（403 沒票、200 `[]`、201、兩種 409 逐字、400 ×2、422、401、404→403）；對 internal 是 404（沒有 route）
- [x] 2.2 `src/server/seats.ts`（`listSeats`、`claimSeat`：單一句 INSERT … SELECT、PG 錯誤碼分類）、`src/app/api/projects/[project_id]/seats/route.ts`（`handle({ auth: 'required' })`＋`hasRoomGrant`）
- [x] 2.3（internal 綠；guildhub 本機自起：seats＋lifecycle 3 綠；突變三個三紅：拿掉門 → 200 ≠ 403、409 文字對調 → 紅、`< seat_count` 拿掉 → 2 號 201 ≠ 400）對 `internal` 綠；對 `guildhub`（本機自起）跑一次綠；突變：拿掉 `hasRoomGrant` → 403 那段紅；409 兩種文字對調 → 紅；`< seat_count` 拿掉 → 400 那段紅

## 3. `--state`：`useSeats`、`seatRules`、名字（〈重取為準〉〈失敗回饋〉的狀態半邊；design D2／D3）

- [x] 3.1（`room-seats-state.test.tsx` 6 條）判準先紅：`tests/seat-rules.test.ts`（`classify409` 兩種文字與其他、`canClaim` 的四個條件）；`tests/room-seats-state.test.tsx`（hook：`S04` 全部 —— 30 秒、不可見停／可見立即、離開停、輪詢失敗留舊、換房間不混；`S02` 的 claim 送出中只送一次與 201 重取；`S03` 四種結果的狀態）
- [x] 3.2（`useSeatNames` 留到 `--markers` 跟標籤一起做：它的判準是 S01 的畫面）`src/world/seats/seatRules.ts`、`src/world/seats/useSeats.ts`、`src/world/seats/useSeatNames.ts`
- [x] 3.3（6 個 6 紅：不可見仍輪詢、離開不 abort、輪詢失敗清空、409 文字對調、連按不擋、403 不鎖）突變：不可見仍輪詢 → `S04` 紅；離開房間不 abort → `S04` 紅；輪詢失敗清空 → `S04` 紅；409 不分文字 → `S03` 紅；claim 中再按送第二個 → `S02` 紅

## 4. `--markers`：錨點插槽、標籤、回饋、掛進世界（〈每個座位有一個標籤〉〈一鍵入座〉〈失敗回饋〉的畫面半邊；`project-room-layout` MODIFIED；design D1／D4）

- [x] 4.1（`room-seats.test.tsx` 8 條、anchors 測試改 S06；`seat-rules` 併在 `room-seats-state.test.tsx`）判準先紅：`tests/room-seats.test.tsx`（`S01` 四個座位兩個有人、`seat_count` 以外沒有、載到之前沒有、404 名字→「有人」、回 hall 沒有；`S02` 按鈕 payload／停用／成功後沒有「入座」／closed 沒有；`S03` 四種回饋的畫面）；`tests/seat-anchors*.test.tsx` 改 `S06`：有內容的錨點不 `aria-hidden`、沒內容的照舊
- [x] 4.2 `SeatAnchors` 接 `render(seatIndex)`（有內容才拿掉 `aria-hidden`／`pointer-events-none`）、新 `src/world/seats/SeatMarkers.tsx`（名字／自己的／空位／入座／回饋，`ui-ux-pro-max` 先問）、`WorldCanvas` 房間裡掛上
- [x] 4.3（8 個 8 紅：closed 長入座、已有座位長入座、404 畫 id、載到前畫空位、有內容仍 aria-hidden、容器仍 aria-hidden、回饋不消失、ticket 說密碼錯）突變：`closed` 也長「入座」→ `S02` 紅；已有座位仍長「入座」→ `S02` 紅；名字查不到畫 id → `S01` 紅；載到之前先畫「空位」→ `S01` 紅；有內容仍 `aria-hidden` → `S06` 紅

## 5. `--e2e`：真瀏覽器（〈真瀏覽器裡兩個人各自進房〉）

- [x] 5.1（28 綠 ×3；突變 3 個 3 紅：輪詢 300 秒 → 「30 秒內看到」紅、409 不分文字 → 「被搶」紅、201 不重取 → 「0 號是我的」紅；regression project-room／room-entry／scene-switch／name-tags 全綠）`tests/e2e/room-seats.mjs` 的 `S05`（對 `internal`：兩個 context、密碼進房、A 坐 0、B 搶 0 被拒、B 坐 1、A 30 秒內看到、A 重新整理）；`FE-W16-S08`、`room-entry`、`scene-switch`、`name-tags` 沒變紅
- [x] 5.2（`docs/evidence/fe-j13-seats/`；world chunk +1,839 B gz 在 #551；房間裡 ~80 秒：GET seats ×5、GET profile ×1）截圖貼 PR（兩個名字、一個空位、回饋）；`ui-ux-pro-max` pre-delivery checklist；效能：world chunk 前後差、房間裡的請求數

## 6. 收尾

- [x] 6.1（#545／#546／#551／#553／#555 各自 eslint／tsc／pnpm test 全綠、PR 都有效能段）每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響
- [x] 6.2（7dc69ba 與 32687cf 各部署一次；走閘道進 seed 的成軍房：兩個真名字、兩個空位有「入座」、8 個錨點、請求數同 design D6）合併後 `vercel deploy --prod`、閘道 `/world?room=<seed 的房>` 一次人工 smoke（只走不壓）
- [x] 6.3（#552 之後第一個真的跑起來的樣本：bundle 160 KB；codex 3 條需修正全部先紅再修 #555、gemini 0 條；--rereview 兩模型皆「已修」；三條 --judge 已修）tasks 全勾後、archive 前：`bash .github/scripts/archive-review.sh fe-j13-seats`（背景）；需修正修完 `--rereview` 一次、每條 `--judge`
- [x] 6.4（e2e S05 28 綠 ×3、正式站閘道 smoke 之後打）Sheet `FE-J13` → Done（瀏覽器層驗過之後才打）
