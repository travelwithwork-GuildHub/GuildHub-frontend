# tasks：fe-v01-room-exit

## 1. 規格（spec/ 分支）

- [ ] 1.1 `specs/world-scenes/spec.md`：MODIFIED〈房間裡隨時回得了 Guild Hall〉—— 加穿門即走（S20）＋門前按 E（S21），保留 S13／S19、保留 DOM 按鈕
- [ ] 1.2 `pnpm exec openspec validate fe-v01-room-exit --strict` 通過
- [ ] 1.3 proposal 有 Non-goals、design 記兩模型結論與門檻數字、觸發一次性、不對稱防迴圈

## 2. 觸發常數（feat/ 分支）

- [ ] 2.1 `projectRoomLayout.ts`：加 `EXIT_TRIGGER = { z: 10.5, halfX: 0.75 }`（或同義），跟 `ENTRY` 同一份、有註解說明為什麼是這兩個數
- [ ] 2.2 單元測試釘門檻在門洞以南、`|x|` 在門洞內（門移了測試跟著動）

## 3. 穿門即走（S20）

- [ ] 3.1 新元件 `RoomExitTrigger`（Canvas 內、`useFrame`、不渲染）：讀 `poseRef`，進 `z ≥ 10.5 且 |x| ≤ 0.75` → `returnToHall()`，`fired` ref 一次性
- [ ] 3.2 掛在 `SceneObjects` 的 `room` 分支（跟工位錨點投影器同一處）；`hall` 分支不掛
- [ ] 3.3 jsdom：位置序列跨門檻 → `returnToHall` 恰一次；正常走動（z<10.5）→ 零次；跨門檻後再動 → 不再呼叫

## 4. 門前按 E（S21）

- [ ] 4.1 `SceneObjects` 的 `room` 分支註冊 `Interactable(id='room-exit', x=ENTRY.doorX, z=ENTRY.wallZ, label='回到大廳', onInteract=returnToHall)`；`useCallback` 釘 callback
- [ ] 4.2 jsdom：`room` 場景走到門前提示是「回到大廳」、按 E → `returnToHall`；`hall` 場景沒有這個 target

## 5. DOM 按鈕保留（S13）

- [ ] 5.1 確認 `ReturnToHallButton` 不動、`room` 有／`hall` 沒有（既有 S13 仍綠）；補一句無障礙 `aria-label` 若缺
- [ ] 5.2 視覺降級**不在這裡做** —— 記進 `FE-X17`（header 群島化）；tasks 註明

## 6. e2e

- [ ] 6.1 `scene-switch.mjs` 或新片：進房 → 往南走穿門 → 回大廳（socket `scene=lobby`、只一條）、票還在、網址 `/world`
- [ ] 6.2 走位沿用 `lib/world.mjs` 的 walker（門標籤里程計，不按固定毫秒）

## 7. 收尾

- [ ] 7.1 `pnpm test` 全綠、`pnpm lint`（含 `.mjs`）全綠
- [ ] 7.2 前後截圖：進房 → 走出去回大廳，自問「離開直覺嗎、看得出門是出口嗎」
- [ ] 7.3 封存前 archive-review（請使用者手動跑）
