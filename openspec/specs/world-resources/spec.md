# world-resources Specification

## Purpose

3D 場景裡的 `BufferGeometry`／`Material`／`Texture` 在 GPU 端各有一份配置，
需要有人釋放。React Three Fiber 只釋放**它自己用 JSX 子元素建的那些** ——
用 prop 傳進 tree 的物件不在它的管轄內，而這條界線違反直覺、
也不在文件的顯眼處。

這份規格定義誰負責釋放什麼，並要求一個**在真瀏覽器裡量得到**的洩漏偵測：
量測台自己要先證明量得到（故意洩漏的 fixture 必須被抓到），
而 `src/world/` 底下每一個會建立 GPU 資源的模組都必須被它涵蓋 ——
否則新元件會落在偵測看不到的地方，而測試照樣全綠。

界線與代價都是量出來的，不是推論的；量到的數字與那兩條「量過之後決定
不寫」的禁令記在 `docs/adr/0003-gpu-resource-ownership.md`。

## Requirements

### Requirement: 元件自己建立的 GPU 資源，由建立它的那一層釋放

React Three Fiber 的 `removeChild` 只對 **reconciler 自己建的 instance**
呼叫 `disposeOnIdle`。**用 prop 傳進 tree 的物件不是 instance，不在它的管轄內。**

所以凡是正式碼自己 `new` 出來的 `BufferGeometry`／`Material`／`Texture`
（含它們的子類與 render target），建立它的那一層 MUST 在卸載時 `dispose()`。

這是量到的唯一一種**無聲**失敗：不釋放的話每一輪進出多留一份，
`renderer.info.memory` 線性成長，而畫面完全正常、console 完全乾淨。

> ⚠️ **反過來不成立。** 「釋放不是自己建的資源」量過，代價是下一次 render
> 重新上傳一次，不是壞掉（同一個 renderer 裡兩個使用者，其中一個釋放之後
> 另一個照樣畫得出來，零錯誤）。所以這裡**不立**一條 MUST NOT ——
> 沒有量到傷害的禁令沒有負向驗證，會是假防禦。

#### Scenario: [FE-W07-S01] 沒有釋放時，洩漏偵測 MUST 判定失敗

- **WHEN** 一個元件用 `useMemo(() => new BufferGeometry())` 建立資源並以 prop 掛進 tree
- **AND** 卸載時不呼叫 `dispose()`
- **AND** 掛載、卸載重複十輪
- **THEN** 洩漏偵測 MUST 判定失敗
- **AND** 失敗訊息 MUST 指出成長的是哪一類資源，以及**每輪成長量**
  （不是只給一個百分比 —— 百分比看不出是每輪多一份還是某一輪多十份）

> 實測基準：這個形狀六輪之後 `info.memory.geometries` 是 `1,2,3,4,5,6`。

#### Scenario: [FE-W07-S02] 正確釋放時，十輪之後數量不成長

- **WHEN** 同一個元件在卸載時對它建立的每一份資源呼叫 `dispose()`
- **AND** 掛載、卸載重複十輪
- **THEN** 從第二輪起，每一輪掛載完成時的 `renderer.info.memory.geometries`
  與 `.textures` **MUST 兩兩完全相等**（第一輪是暖機：shader 編譯、shadow map 建立）
- **AND** 把那一行 `dispose()` 拿掉，這條 MUST 變紅

> `renderer.info.memory` 只有 `geometries` 與 `textures` 兩個欄位，**沒有 materials**。
> material 的釋放要另外靠 `dispose` 事件計數，不能從 `info.memory` 推。

### Requirement: 洩漏偵測必須先證明自己量得到

一個永遠不會紅的洩漏偵測，比沒有洩漏偵測更糟 —— 它會讓人相信一件沒有被驗過的事。

載具 MUST 在同一次執行裡先跑一個**故意洩漏的 fixture**，
並在那個 fixture 沒有被判定為洩漏時，讓整個測試失敗。

#### Scenario: [FE-W07-S03] 故意洩漏的 fixture 沒被抓到時，以「尺量不到」失敗

- **WHEN** 洩漏偵測載具執行
- **THEN** 它 MUST 先對一個已知會洩漏的 fixture（`FE-W07-S01` 的形狀）跑一次
- **AND** 該 fixture MUST 被判定為洩漏
- **AND** 若它被判定為乾淨，載具 MUST 以「這把尺量不到東西」失敗，
  且失敗訊息 MUST 與「有洩漏」明顯不同 —— 兩者的處置方式完全相反

### Requirement: 只在真瀏覽器裡驗，載具的失敗必須明顯

R3F 的釋放走 `unstable_scheduleCallback(unstable_IdlePriority, …)`，**是延後的**。
實測：用 `@react-three/test-renderer` 跑（vitest 的 jsdom 環境）掛載卸載之後
dispose 計數是 `0`，等 200 毫秒仍然是 `0` —— **同一件事得到與真瀏覽器相反的答案**。

所以：

- 這份驗收 MUST 在真 Chromium 裡跑；`@react-three/test-renderer` **MUST NOT** 作為判準來源
- 每一輪卸載之後 MUST 等待再讀數。等待值 MUST 寫成一個具名常數，
  **它的值由實作量出來**（見 design 的 Q1）—— 不等的話讀到的是
  「還沒輪到釋放」而不是「沒有釋放」
- 載具 MUST NOT 對 `127.0.0.1` 以外的任何位址發出請求

#### Scenario: [FE-W07-S04] 瀏覽器或 server 起不來時，明顯失敗

- **WHEN** Chromium 啟動失敗，或 vite server 在逾時之前沒有就緒
- **THEN** 測試 **MUST 失敗並指出是哪一個環節**
- **AND** MUST NOT 被當成「沒有洩漏」而通過
- **AND** 逾時值 MUST 寫成具名常數

#### Scenario: [FE-W07-S05] 載具對外連線時，測試失敗

- **WHEN** 載具執行期間，頁面對 `127.0.0.1` 以外的位址發出任何請求
  （含 HTTP 與 WebSocket）
- **THEN** 測試 **MUST 失敗並列出那些位址**

> 這條不是形式主義。這個 repo 的規矩是壓測與 E2E 只准打自己起的服務；
> 而量測台一旦 import 到會自己建立連線的元件（例如 `RemoteWorld`），
> 它就會**安靜地**去連預設後端位址。

### Requirement: 會建立 GPU 資源的場景元件必須被偵測涵蓋

一份手寫的清單會漂 —— 新元件加進 `src/world/` 而沒有人記得加進清單，
洩漏偵測就會在**它沒有看的地方**通過。

所以清單 MUST 被機械檢查：`src/world/` 底下每一個會建立 GPU 資源的模組
（宣告 `<*Geometry>`／`<*Material>`／`<*Texture>` 的 JSX intrinsic，
或用 `new` 建立 three 的 `BufferGeometry`／`Material`／`Texture` 子類）
MUST 出現在受測清單裡。

> ⚠️ **這條的可否證性在涵蓋率，不在 R3F 的行為。** 現有元件今天全部乾淨
> （量過），所以對它們的斷言今天恆綠 —— 那是刻意的，它是回歸守衛。
> 會紅的是「新元件沒登記」，而那件事**每一次都可以驗**。

#### Scenario: [FE-W07-S06] 新增會建立 GPU 資源的元件而沒有登記時，變紅

- **WHEN** `src/world/` 底下新增一個模組，它宣告了 geometry／material／texture
  的 JSX intrinsic，**或**用 `new` 建立 three 的對應子類
- **AND** 它沒有被加進洩漏偵測的受測清單
- **THEN** 檢查 MUST 失敗
- **AND** 失敗訊息 MUST 指出是哪一個檔案，以及要加到哪裡

#### Scenario: [FE-W07-S07] 清單裡列了不存在的檔案時，也要紅

- **WHEN** 受測清單裡的某一項在 `src/world/` 底下找不到對應檔案
- **THEN** 檢查 MUST 失敗

> 兩個方向都要擋。只擋一邊的話，元件被刪掉或改名之後清單會留下一個
> 永遠不會被執行的項目，而測試照樣全綠。
