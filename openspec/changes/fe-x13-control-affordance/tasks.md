# `FE-X13` tasks

## 1. 一個語意 token

- [ ] 1.1 在 `src/app/globals.css` 的 `@theme` 新增**一個**控制項邊界用的 token
- [ ] 1.2 它對 `--color-surface` 的對比度 SHALL `≥ 3:1`（design 的 `M1`／`D5`）
- [ ] 1.3 ⚠️ **SHALL NOT 改 `--color-line`** —— 它還要給分隔線與卡片邊界用，
      而那些不需要 `3:1`；改了會讓整個介面變重

## 2. 共用的外觀定義

- [ ] 2.1 把 `FirstEntryFlow.tsx` 裡的 `PRIMARY`／`SECONDARY`／`CHECK_ROW`
      搬到一處共用的地方
- [ ] 2.2 補上輸入框的外觀（今天**完全沒有** —— preflight 把 border 清光了）
- [ ] 2.3 ⚠️ **SHALL NOT 做成帶 API、狀態與變體的 `<Button>` / `<Input>` 元件。**
      兩個審查者獨立指出這是最可能做錯的決定（design 的 `D6`）
- [ ] 2.4 ⚠️ **一份定義，不是複製兩份一樣的字串**（`S07`）

## 3. 套到兩個入口

- [ ] 3.1 首次進入流程改用共用定義（行為與外觀 SHALL 不變）
- [ ] 3.2 `/login` 套上同一份定義 —— 按鈕與**每一個輸入框**
- [ ] 3.3 ⚠️ **SHALL NOT 順手統一欄位尺寸、間距、錯誤狀態、focus 或
      responsive layout。** 那是 `FE-X05`

## 4. 判準

- [ ] 4.1 在真的瀏覽器上量 `getComputedStyle()`，做 alpha compositing 之後
      算 WCAG 對比度（design 的 `D1`）
- [ ] 4.2 ⚠️ **顏色要實際畫出來再讀，不可以 parse 字串** ——
      `getComputedStyle` 對 `oklch()` 原樣回傳，直接 parse 會算出
      `1.00:1` 而且看起來很合理（design 的 `M1`）
- [ ] 4.3 V1 按鈕：`/login` 與首次進入流程，每個啟用中的按鈕達 `3:1`
- [ ] 4.4 V2 輸入框：**空白且未聚焦**的狀態下量，達 `3:1` 且有非零面積
- [ ] 4.5 ⚠️ V2 SHALL NOT 靠 placeholder、游標或 focus ring 過關
- [ ] 4.6 V3 作弊路徑：`1px solid transparent` 合成後是 `1:1`，SHALL 不通過
- [ ] 4.7 V5 `disabled` 與啟用中的按鈕外觀可區分
- [ ] 4.8 V6 改共用定義會同時影響兩個入口
- [ ] 4.9 ⚠️ **判準裡 SHALL NOT 出現色碼、Tailwind class 名稱或 padding**

## 5. 突變（驗收條件）

⚠️ **不是「測試全綠」，是「把防禦拿掉，測試要變紅」。**

- [ ] 5.1 X1 移除共用外觀的 `className` → V1、V2 要紅
- [ ] 5.2 X2 邊界換成 `--color-line`（實測 `1.27:1`）→ V1、V2 要紅
- [ ] 5.3 X3 輸入框換成 `surface-raised` 白底（實測 `1.06:1`）→ V2 要紅
- [ ] 5.4 ⚠️ X4 **判準改成只檢查 `border-width > 0`** → 5.2 與 5.3 要變成抓不到。
      這一條驗的是**判準本身**，證明 `3:1` 不是可有可無的裝飾
- [ ] 5.5 X5 只修 `/login`、不動首次進入流程 → V6 要紅

## 6. 收尾

- [ ] 6.1 `npm run lint`、`npm run typecheck`、`npm test` 全綠
- [ ] 6.2 確認 `FE-A06` 既有的 18 條端到端斷言沒有變紅
- [ ] 6.3 確認 `FE-X01` 的 design token 判準沒有變紅（顏色沒有離開 token）
- [ ] 6.4 ⚠️ `docs/WBS.md` 這一列的敘述漏了輸入框 —— 開一個 `governance/` PR 補
