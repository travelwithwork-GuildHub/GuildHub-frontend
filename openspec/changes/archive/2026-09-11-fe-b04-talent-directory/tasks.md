# `FE-B04` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-b04-talent-directory`）

## 2. 人才卡（`src/talent/TalentCard.tsx`）

對應 Requirement〈人才卡讓人一眼判斷〉、〈卡片是控制項〉

- [x] 2.1 `<button>`：名字、`avatarLook` 色塊、技能、時數；`null` 不是 0；沒有 `bio`／`updated_at`
- [x] 2.2 判準：`S01`、`S02`、`S03`
- [x] 2.3 **突變**：`hours_per_week ?? 0` → `S02` 要紅；把 `bio` 印上卡片 → `S03` 要紅

## 3. 詳情與它的載入（`src/talent/TalentDetail.tsx`、`useProfileDetail.ts`）

對應 Requirement〈詳情在同一個面板裡，內容一律來自 `GET /api/profiles/{id}`〉

- [x] 3.1 `useProfileDetail(id, preview)`：identity = `id`，中止前一個，`aborted` 不進狀態
- [x] 3.2 `<TalentDetail>`：載入中標記看 `phase`；失敗用 `EmptyState kind="failure"`；`<time dateTime>`
- [x] 3.3 `ListPanel` 多 `overlay` 插槽（design `D1`）；列表區 `inert`
- [x] 3.4 判準：`S06`、`S07`、`S08`、`S15`（500 與 401 成對）、`S09`、`S10`、`S16`
- [x] 3.5 **突變**：詳情用預覽不打 id → `S06` 紅；identity 檢查拿掉 → `S09` 紅；失敗仍標 ready → `S08` 紅

## 4. 接上人才看板

對應 Requirement〈卡片是控制項〉、〈返回列表時，頁碼與捲動位置都還在〉

- [x] 4.1 `BoardPanel` 人才那一支：`renderItem` 換成 `TalentCard`，選中的 id → `overlay` 放 `TalentDetail`
- [x] 4.2 判準：`S04`、`S05`（Enter 與 Space）、`S11`、`S12`（含 not display:none）
- [x] 4.3 **突變**：卡片改成 `div` → `S05` 紅；返回時卸載列表 → `S11`／`S12` 紅

## 5. 鍵盤與世界

對應 Requirement〈詳情層的鍵盤不驅動世界，Escape 之後詳情不再顯示〉

- [x] 5.1 判準：`S13`、`S14`（真的 `LocalPlayer`）
- [x] 5.2 **不改** Escape 的語意（`FE-X06` 的事）

## 6. 收尾

- [x] 6.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [x] 6.2 真瀏覽器：`tests/e2e/board-panel.mjs` 人才那一段多點一張卡、看詳情、返回；截圖進 `docs/evidence/fe-b04/`
- [x] 6.3 封存（`archive/fe-b04-talent-directory`，獨立 PR）
