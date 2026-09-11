# `FE-X06` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-x06-keyboard-focus`）

## 2. 可合成的鎖（`InteractionProvider`）

對應 Requirement〈世界命令有一把可合成的鎖〉

- [x] 2.1 `holdInputLock(reason) → release`，token 式，釋放冪等；`inputLockRef` 變推導值
- [x] 2.2 `ListPanelProvider` 改用 hold／release；`SpatialInteraction` 的 E 看鎖
- [x] 2.3 判準：`S03`、`S04`、`S05`、`S06`
- [x] 2.4 **突變**：鎖改回單一 boolean，`S03` 要紅；E 不看鎖，`S05` 要紅

## 3. 文字輸入焦點

對應 Requirement〈焦點在能輸入文字的控制上時，打字不是走路〉

- [x] 3.1 `<EditableFocusLock />`：`focusin`／`focusout` → microtask 後依 `activeElement` 重算
- [x] 3.2 判準：`S07`、`S09`、`S10`；內部不變量「輸入框間轉移不放鎖」對釋放函式下 spy
- [x] 3.3 **突變**：`focusout` 當下就釋放，不變量的 spy 要紅；checkbox 也算，`S09` 的變體要紅

## 4. Escape 的層級

對應 Requirement〈Escape 每次只關最上層〉、MODIFIED `FE-B01-S16`、MODIFIED `FE-B04-S14`

- [x] 4.1 `useEscapeLayer`：層堆疊，token 式，卸載依 token 移除（不是 pop），只呼叫最上層
- [x] 4.2 `ListPanel`（底層）與 overlay（上層）接上；`BoardPanel` 詳情關閉 = `selected = null`
- [x] 4.3 判準：`S01`、`S02`（成對）；`FE-B01-S16`、`FE-B04-S14` 的既有判準改寫
- [x] 4.4 **突變**：兩層各關各的，`S01` 要紅；卸載改成 `pop()`，`S17` 之後再按 Escape 要紅

## 5. 焦點邊界與歸還

對應 Requirement〈焦點有邊界，關閉之後有地方去〉

- [x] 5.1 `ListPanel` 的 Tab 循環；世界焦點錨（`data-focus-anchor="world"`）；`closePanel` 回錨；詳情關閉回那張卡
- [x] 5.2 判準：`S12`（jsdom）、`S11`、`S13`（Playwright）
- [x] 5.3 **突變**：關閉不回錨，`S13` 要紅

## 6. `AvatarPicker`

對應 Requirement〈非阻斷式的彈出層〉

- [x] 6.1 Escape、Tab 走離即關、關閉回按鈕；不 hold 鎖
- [x] 6.2 判準：`S14`、`S15`、`S16`、`S17`
- [x] 6.3 **突變**：拿掉 Tab 走離即關，`S16`／`S17` 要紅；picker hold 鎖，`S14` 要紅

## 7. 收尾

- [x] 7.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [x] 7.2 Playwright：`S11`、`S13`，以及 Escape 兩層各一次；截圖進 `docs/evidence/fe-x06/`
- [x] 7.3 封存（`archive/fe-x06-keyboard-focus`，獨立 PR）—— 會同步 `list-panel` 與 `talent-directory` 的 MODIFIED
