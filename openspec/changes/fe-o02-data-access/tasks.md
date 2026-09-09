## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o02-data-access` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-o02-data-access --strict` 通過且 PR 已合併

## 2. 測試的載具先做（否則後面每一條都沒有辦法驗）

- [x] 2.1 微型 HTTP server：`127.0.0.1`，當次建立當次銷毀。
      **handler 拿 `src/api/contract/` 的 schema 去 `safeParse` 收到的 request**，
      不合就回 400。回應也用同一份 response schema 產生
- [x] 2.2 Q2：port 取 0，`server.address().port` 拿得回實際 port。
      Q3：**驗不到** —— `document.cookie` 設得進去，但 server 收到的
      `req.headers.cookie` 是 `null`（jsdom 的 cookie jar 跟 Node 的 fetch 沒連通）。
      改驗 `Request.credentials`，預設是 `same-origin` 所以拿掉那一行會紅。
      `FE-O02-S01` 的措辭已經回去更正（#149）

## 3. adapter 切換（`FE-O02-S01`～`S03`）

- [x] 3.1 `NEXT_PUBLIC_DATA_ADAPTER` 進 `src/config/env.ts`（唯一准許讀 env 的檔案）
- [x] 3.2 `FE-O02-S01`：選 `guildhub` 時打到 `restBase()`，並帶 session cookie
- [x] 3.3 `FE-O02-S02`：選 `internal` 時每個操作拋錯，**而且不送出任何請求**。
      驗證：測試 server 記錄收到的請求數，必須是 0
- [x] 3.4 `FE-O02-S03`：值無法辨識時拋錯並列出合法值。
      **負向**：改成「無法辨識就退回 guildhub」→ 這條必須紅

## 4. 送出去之前對照契約（`FE-O02-S04`）

- [x] 4.1 輸入用該操作的契約 schema 驗，不合就拋錯（**而且操作要是 `async`** ——
      不然驗證錯誤是同步拋出的，呼叫端的 `.catch()` 接不到）
- [x] 4.2 `FE-O02-S04`：不合契約時**不得送出請求**（測試 server 的請求數是 0）。
      **負向**：拿掉輸入驗證 → 請求會送出去，而且測試 server 的 Zod 會回 400

## 5. 回來的東西在邊界驗（`FE-O02-S05`～`S07`）

- [x] 5.1 `FE-O02-S05`：回應少必填欄位 → 拋契約漂移錯誤，訊息含操作名與欄位。
      驗證：測試 server 故意回一個少欄位的 body
- [x] 5.2 `FE-O02-S06`：回應多未知欄位 → 正常通過，而且回傳值裡沒有那個欄位。
      **這一條釘住 Zod 的 strip 行為** —— 有人加 `.strict()` 就會紅
- [x] 5.3 `FE-O02-S07`：4xx／5xx 拋錯、帶 status、保留錯誤 envelope 的內容。
      **負向**：拿掉 `response.ok` 的檢查 → 這條必須紅
- [x] 5.4 **負向**：拿掉回應的 `parse` → `S05` 與 `S06` **都**紅

## 6. 位址與憑證只有一個來源（`FE-O02-S08`）

- [ ] 6.1 掃 `src/api/`：除了 `src/config/env.ts` 之外不得出現後端位址字面值。
      **負向**：在某個操作裡寫死一個 `http://` 位址 → 必須紅

## 7. 沒有契約的 domain（`FE-O02-S09`、`S10`）

- [ ] 7.1 檢查：`src/api/` 出現那四個 domain 的操作、而契約層沒有對應 schema → 紅
- [ ] 7.2 `FE-O02-S10`：契約層補上之後要放行。
      **負向**：兩個方向各做一次 —— 加一個沒有契約的操作、以及模擬契約已補上

## 8. domain operations（`FE-O02-S01` 的實際內容）

- [x] 8.1 Profile：`GET /api/profiles/me`、`PATCH /api/profiles/me`
- [x] 8.2 Project、Room、Seat、Message —— 以 `rest.ts` 已經涵蓋的端點為準，
      **不多做一個**
- [ ] 8.3 每個操作都有一條走真實路徑（測試 server）的測試

## 9. 文件

- [ ] 9.1 `docs/WBS.md` 的 `FE-O02` 那一列把 `local` 改成 `internal`（另開 `chore/`）
