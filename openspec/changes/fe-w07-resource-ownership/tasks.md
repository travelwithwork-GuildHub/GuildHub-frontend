## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-w07-resource-ownership` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-w07-resource-ownership --strict` 通過且 PR 已合併

## 2. 量測台（`FE-W07-S04`、`S05`）

- [ ] 2.1 `vite` 升成直接 `devDependency`；`tests/e2e/leak-harness/` 放
      `index.html` ＋ vite config，root 限制在 `tests/` 底下。
      驗證：`npx vite --config tests/e2e/leak-harness/vite.config.mts` 起得來
- [ ] 2.2 量測台 entry：`createRoot` 反覆 render / unmount，
      讀 `renderer.info.memory` 與 patch 過的 `dispose` 計數，結果放 `window.__LEAK_RESULT__`。
      每輪之間的等待寫成具名常數，**值由 Q1 量出來**
- [ ] 2.3 driver：`playwright-core` 起 Chromium、起 vite server、讀結果、關掉兩者。
      逾時值寫成具名常數。
      驗證：故意把 port 佔住 → 測試紅，且訊息指出是 server 那一環（`FE-W07-S04`）
- [ ] 2.4 `FE-W07-S05`：攔 `page.on('request')`，非 `127.0.0.1` 的位址一律讓測試失敗。
      驗證：暫時在量測台 import 一個會連線的模組，確認它紅

## 3. 尺要先證明自己量得到（`FE-W07-S03`）

- [ ] 3.1 故意洩漏的 fixture（`useMemo(() => new BufferGeometry())`，卸載不 dispose），
      放在量測台裡當**第一個**受測對象
- [ ] 3.2 它沒有被判定為洩漏時，整個測試以「這把尺量不到東西」失敗，
      且訊息與「有洩漏」明顯不同。
      驗證：把 fixture 改成有 dispose → 測試紅，且訊息是「尺量不到」不是「有洩漏」

## 4. 所有權規則的兩條路徑（`FE-W07-S01`、`S02`）

- [ ] 4.1 `FE-W07-S01`：洩漏的形狀被抓到，失敗訊息指出資源類別與**每輪成長量**。
      驗證：貼失敗訊息原文
- [ ] 4.2 `FE-W07-S02`：同一個 fixture 加上 `dispose()` 之後，第二輪起兩兩相等。
      驗證：貼十輪的實際數字
- [ ] 4.3 **負向**：把 4.2 那一行 `dispose()` 拿掉 → S02 必須變紅。貼證據

## 5. 受測清單的機械檢查（`FE-W07-S06`、`S07`）

- [ ] 5.1 一般 vitest 測試（不需要瀏覽器）：掃 `src/world/`，找出宣告
      geometry／material／texture 的 JSX intrinsic **或**用 `new` 建立
      three 對應子類的模組，比對受測清單
- [ ] 5.2 `FE-W07-S06` 負向：新增一個空的場景元件（只宣告一個 `<boxGeometry>`）
      而不登記 → 必須紅，訊息要指出檔名
- [ ] 5.3 `FE-W07-S06` 的另一半：用 `new BoxGeometry()` 而不是 JSX 的模組
      也要被抓到（兩種形狀都掃）
- [ ] 5.4 `FE-W07-S07` 負向：清單裡加一個假路徑 → 必須紅

## 6. 負向驗證（**這一節是驗收，不是收尾**）

- [ ] 6.1 拿掉 3.2 的「尺」防護 → S03 失去保護作用（貼證據）
- [ ] 6.2 拿掉 5.1 的清單比對 → S06／S07 變綠（證明防護真的在那一行）
- [ ] 6.3 把 2.2 的等待改成 0 → 記錄 S02 從第幾輪開始不穩，回答 Q1

## 7. 文件

- [ ] 7.1 `docs/adr/0003-gpu-resource-ownership.md`：所有權規則，
      以及**量過之後決定不寫的那兩條禁令**。
      change 會被 archive，ADR 不會 —— `FE-W08`～`FE-W15` 要看得到它
