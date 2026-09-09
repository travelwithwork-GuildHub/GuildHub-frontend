## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-w07-resource-ownership` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-w07-resource-ownership --strict` 通過且 PR 已合併

## 2. 量測台（`FE-W07-S04`、`S05`）

- [x] 2.1 `vite` 升成直接 `devDependency`；`tests/e2e/leak-harness/` 放
      `index.html` ＋ vite config，root 限制在 `tests/` 底下。
      驗證：`npx vite --config tests/e2e/leak-harness/vite.config.mts` 起得來
- [x] 2.2 量測台 entry：`createRoot` 反覆 render / unmount，
      讀 `renderer.info.memory` 與 patch 過的 `dispose` 計數，結果放 `window.__LEAK_RESULT__`。
      每輪之間的等待寫成具名常數，**值由 Q1 量出來**
- [x] 2.3 driver：`playwright-core` 起 Chromium、起 vite server、讀結果、關掉兩者。
      逾時值寫成具名常數。
      驗證：故意把 port 佔住 → 測試紅，且訊息指出是 server 那一環（`FE-W07-S04`）
- [x] 2.4 `FE-W07-S05`：攔 `page.on('request')`，非 `127.0.0.1` 的位址一律讓測試失敗。
      驗證：暫時在量測台 import 一個會連線的模組，確認它紅

## 3. 尺要先證明自己量得到（`FE-W07-S03`）

- [x] 3.1 故意洩漏的 fixture（`useMemo(() => new BufferGeometry())`，卸載不 dispose），
      放在量測台裡當**第一個**受測對象
- [x] 3.2 它沒有被判定為洩漏時，整個測試以「這把尺量不到東西」失敗，
      且訊息與「有洩漏」明顯不同。
      驗證：把 fixture 改成有 dispose → 測試紅，且訊息是「尺量不到」不是「有洩漏」

## 4. 所有權規則的兩條路徑（`FE-W07-S01`、`S02`）

- [x] 4.1 `FE-W07-S01`：洩漏的形狀被抓到，失敗訊息指出資源類別與**每輪成長量**。
      驗證：貼失敗訊息原文
- [x] 4.2 `FE-W07-S02`：同一個 fixture 加上 `dispose()` 之後，第二輪起兩兩相等。
      驗證：貼十輪的實際數字
- [x] 4.3 **負向**：把 4.2 那一行 `dispose()` 拿掉 → S02 必須變紅。貼證據

## 5. 受測清單的機械檢查（`FE-W07-S06`、`S07`）

- [x] 5.1 一般 vitest 測試（不需要瀏覽器）：掃 `src/world/`，找出宣告
      geometry／material／texture 的 JSX intrinsic **或**用 `new` 建立
      three 對應子類的模組，比對受測清單
- [x] 5.2 `FE-W07-S06` 負向：新增一個空的場景元件（只宣告一個 `<boxGeometry>`）
      而不登記 → 必須紅，訊息要指出檔名
- [x] 5.3 `FE-W07-S06` 的另一半：用 `new BoxGeometry()` 而不是 JSX 的模組
      也要被抓到（兩種形狀都掃）
- [x] 5.4 `FE-W07-S07` 負向：清單裡加一個假路徑 → 必須紅

## 6. 負向驗證（**這一節是驗收，不是收尾**）

- [x] 6.1 拿掉 3.2 的「尺」防護 → **不是變綠，是失敗訊息變成錯的診斷**：
      配上一把壞掉的尺（每輪一個新的 Canvas），它會說「1 個受測對象的判定與預期不符
      （S01／S02）」—— 指著產品說有洩漏，而實際上是量測台壞了。
      規格要求的「兩者的處置方式完全相反」就是這件事
- [x] 6.2 拿掉 5.1 的清單比對 → S06／S07 **變紅**（原本寫「變綠」是我寫錯了 ——
      那兩條斷言的是「檢查要回報問題」，拿掉之後它回報不出問題，所以是紅的。
      這比變綠強：防護不在的時候測試自己會說）。
      另外把掃描器弄成永遠回 `false` → 防恆真的那兩行也紅
- [x] 6.3 `SETTLE_MS` 掃 0／30／100：**0 毫秒時乾淨的三個受測對象全部被判成洩漏**，
      校正砝碼的成長也變成每輪 0.375 份；30 毫秒起全部正確。下限在 0 與 30 之間，取 500。
      過程中發現初次等 renderer 與每輪沉澱共用同一個常數會報「WebGL2 起不來」（假的原因），
      已拆成兩個常數

## 7. 文件

- [ ] 7.1 `docs/adr/0003-gpu-resource-ownership.md`：所有權規則，
      以及**量過之後決定不寫的那兩條禁令**。
      change 會被 archive，ADR 不會 —— `FE-W08`～`FE-W15` 要看得到它
