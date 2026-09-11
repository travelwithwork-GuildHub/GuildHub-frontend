# `FE-A04` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-a04-profile-editor`）；`FE-X05` 已實作（`useForm`、`FORM_LIMITS`）

## 2. 面板殼與入口

對應 Requirement〈名字是入口，面板是阻斷式的〉、〈顯示我的名片〉

- [ ] 2.1 抽 `src/panel/PanelShell.tsx`；`ListPanel` 改用它，`FE-B01`／`FE-X06` 判準全綠（獨立一片）
- [ ] 2.2 `src/profile/ProfilePanelProvider.tsx`（開關與焦點回開啟者）；`IdentityBadge` 的名字變按鈕；抽 `src/talent/TalentFacts.tsx`（`TalentDetail` 改用它）；`src/profile/ProfilePanel.tsx`（渲染在 `WorldCanvas` 裡、effect 持鎖；顯示：`TalentFacts` ＋ 編輯鈕）
- [ ] 2.3 判準：`S01`～`S03`
- [ ] 2.4 **突變**：不持鎖 → `S01`；焦點不回按鈕 → `S02`；`TalentFacts` 自己長編輯鈕 → `S03`（別人的也有）；面板改用 `TalentDetail` → `S03`（多了一個請求）

## 3. 表單

對應 Requirement〈編輯四欄，payload 白名單，悲觀更新〉

- [ ] 3.1 `src/profile/normalizeSkills.ts`（純函式＋判準）、`ProfileForm.tsx`（`useForm`、schema 用 `LIMITS`／`FORM_LIMITS`）、`saveProfile()`（白名單 payload → `updateMyProfile` → adopt）
- [ ] 3.2 判準：`S04`～`S08`
- [ ] 3.3 **突變**：帶 `avatar_id` → `S04`／`S07`；用 input 當結果 → `S05`；失敗 reset → `S06`；去重不分大小寫拿掉 → `S04`

## 4. 未儲存就關

對應 Requirement〈未儲存就關要確認；送出中不可關；重開從身分初始化〉

- [ ] 4.1 dirty = 正規化 payload 差異；確認層（Escape 層再疊一層）攔所有關閉意圖；送出中全部無效；重開初始化
- [ ] 4.2 判準：`S09`～`S11`
- [ ] 4.3 **突變**：不確認就關 → `S09`；送出中可關 → `S10`；草稿沿用 → `S11`

## 5. 收尾

- [ ] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠；真瀏覽器：開面板 → 編輯 → 送出 → 人才看板上自己那張變了（截圖 `docs/evidence/fe-a04/`）
- [ ] 5.2 封存（`archive/fe-a04-profile-editor`，獨立 PR）
