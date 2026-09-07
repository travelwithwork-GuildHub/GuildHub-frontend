## 1. 規格

- [x] 1.1 規格已在 PR 上談定：`spec/fe-w01-worldcanvas` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-w01-worldcanvas/proposal.md` 有輸出（`feat/` 的閘門就是去 main 上找這個檔案）

## 2. 相依套件與偵測（Requirement: WebGL2 不可用時不留白畫面）

- [x] 2.1 安裝 `three`、`@react-three/fiber`、`@types/three`，版本釘死；驗證：`npm run typecheck` 與 `npm run build` 都 rc=0，且 `@react-three/fiber` 的 react peer 上界（`<19.3`）記在 PR 上
- [x] 2.2 寫 WebGL2 偵測的純函式（`canvas.getContext('webgl2')`），**在掛 Canvas 之前呼叫**；驗證：mock `getContext` 回 `null` 的測試斷言它回 false，回一個物件時回 true
- [x] 2.3 WebGL2 不可用時顯示可辨識說明，**且畫面上不得有重試操作**；驗證：測試斷言說明出現、`queryByRole('button')` 找不到重試（Scenario `FE-W01-S06`）
- [x] 2.4 WebGL2 可用時不顯示該說明；驗證：測試斷言說明不在（Scenario `FE-W01-S07`）
- [x] 2.5 **負向驗證**：把偵測改成永遠回 true，`S06` 那條要從綠變紅；驗證：記錄兩次的退出碼

## 3. Canvas 與場景（Requirement: World 以 WebGL Canvas 渲染／燈光與陰影）

- [x] 3.1 用 R3F `<Canvas>` 取代 `WorldPlaceholder`，畫布填滿容器，DPR 限制在 `[1, 2]`；驗證：`npm run build` rc=0，實際尺寸與 DPR 由 V1／V2 驗
- [x] 3.2 設定一個投射陰影的方向性光源與一個環境光；驗證：由 V3 的截圖驗
- [x] 3.3 加入除錯用的接收陰影平面與投射陰影方塊，**檔名與註解寫明由 `FE-W10` 移除，不得命名為 `Floor`**；驗證：檔案裡有那句註解，且 `grep -r "Floor" src/` 沒有命中這兩個物件
- [x] 3.4 移除 `src/app/world/WorldPlaceholder.tsx`；`WorldBoundary.tsx` **只准改動態 import 指向的路徑**，殼的結構、`catchError` 邊界、fallback 內容與 `retryByReload` 都不得變更；驗證：`git diff src/app/world/WorldBoundary.tsx` 只有 import 那一行（＋必要的註解），其餘為零 —— 那道縫就是為了這件事留的

## 4. 載入中的呈現（Requirement: 3D 內容載入中的呈現）

- [x] 4.1 用 `<Suspense>` 包住 3D 內容，fallback 是**DOM 疊層**不是 3D 物件；驗證：測試斷言等待狀態可以被 DOM 查詢找到（Scenario `FE-W01-S04`）
- [x] 4.2 內容 ready 之後等待狀態消失；驗證：測試斷言它不在畫面上（Scenario `FE-W01-S05`）

## 5. 卸載（Requirement: 卸載時釋放資源）

- [x] 5.1 確認卸載時沒有殘留的全域事件監聽；驗證：測試包裝 `window.addEventListener`／`removeEventListener` 計數，斷言（a）掛載期間**曾經高於**掛載前、（b）卸載後回到掛載前的水準（Scenario `FE-W01-S08`）
- [x] 5.2 **負向驗證**：故意掛一個不移除的 `resize` 監聽，`S08` 要從綠變紅；驗證：記錄兩次的退出碼
- [x] 5.3 **確認 `S08` 不是恆真的**：如果 jsdom 裡掛載期間的監聽數量從來沒有高於掛載前，那條測試會失敗 —— 這時 `S08` 只能靠 V4，**要在 PR 上明說**，不得把它算進自動化涵蓋範圍；驗證：貼出測試的實際輸出

## 6. 更新 app-shell 的既有測試（MODIFIED Requirement）

- [x] 6.1 `tests/world-boundary.test.tsx` 的 `FE-X01-S03` 原本斷言佔位內容，改成斷言 World 的內容；驗證：`npm test` rc=0，且 **Scenario ID 不變**
- [x] 6.2 確認 `FE-X01-S04`（載入失敗的邊界）仍然通過 —— 那個殼沒有被動到；驗證：`tests/world-boundary-failure.test.tsx` 仍然綠

## 7. 完成前的驗收

- [x] 7.1 交出 Scenario ID ↔ 證明方式的對照表，`FE-W01-S01`–`S08` 每一條都指得出是 component test 還是哪一條人工驗證；驗證：表格中沒有空格
- [x] 7.2 貼出 `npm run lint` / `typecheck` / `test` / `build` 四個指令的實際輸出，`test` 要看得到測試數量
- [x] 7.3 走完 `design.md`〈驗證方式〉的 **V1–V4**（production build），證據貼在實作 PR 上；驗證：四列都有輸出或截圖。**V4 要重複進出三次並用 DevTools 的 Event Listeners 確認 `window` 上的數量沒有逐次疊加**
- [x] 7.4 記錄 `npm run build` 輸出的 chunk 大小當基準線，讓 `FE-O12` 有東西可比；驗證：數字貼在 PR 上
- [x] 7.5 `npx openspec validate fe-w01-worldcanvas --strict` 通過，且本檔案沒有殘留的未完成項
