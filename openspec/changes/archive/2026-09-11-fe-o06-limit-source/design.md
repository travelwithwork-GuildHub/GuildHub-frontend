# `FE-O06` 設計：難逆轉的決定與代價

## D1｜不加 magic-number lint（兩位審查者第二輪一致）

「元件不得出現 20／300／2000」：`20` 可能是分頁、`300` 可能是 debounce，誤報多；`19 + 1` 就繞過；證明不了 UI 用對欄位；
repo 的 `docs/DECISIONS.md` 原則是沒有真實事故不加閘門。
改加一條**窄的**：只掃 `src/api/contract/{rest,ws}.ts` 的 `.min(<Literal>)`／`.max(<Literal>)`。那兩個檔案是「數字第二次出現」最可能的地方，
而且那裡沒有任何合法理由寫數字字面（連 `PAGE_SIZE` 都在 `limits.ts`）。用 `no-restricted-syntax` 的 esquery selector，跟 `FE-X03`／`FE-X04` 同一套做法。

## D2｜helper 放 `limits.ts`，不另開檔

它們只依賴 `LIMITS` 的形狀，跟數字住在一起最不容易漂。`limits.ts` 已經被 lint 規則保護成「唯一讀取點」的形狀（`FE-O01`）。

## D3｜`remaining` 可為負，不 clamp 到 0

表單要顯示「超過 3 字」，clamp 之後這個資訊就沒了。顯示怎麼寫是 `FE-X05` 的事；這裡只保證數字對。

## D4｜不用原生 `maxlength`

它數 UTF-16 code unit：`maxlength=20` 會在第 10 個 emoji 就擋住，而後端收得下 20 個。
輸入不截斷、送出鈕禁用 —— 使用者看得到自己多打了幾個字，而不是打不進去卻不知道為什麼。

## D5｜`LIMIT_SOURCES` 是資料

今天出處在註解裡，人讀得到、機器讀不到。變成 `Record<keyof typeof LIMITS, { source, checkedOn }>` 之後，
「哪個數字最久沒對過」可以列出來；`FE-O05` 對真後端跑綠的那一天，`checkedOn` 就該更新。

## D6｜`boundaryValues` 住在 `src/api/contract/`，不在 `tests/`

它是「從 limit 算出邊界值」的純函式，跟 `LIMITS` 同一層；`FE-O05` 的套件只負責「哪個欄位打哪個端點」。
兩邊審查者都抓到原本兩份規格各自宣稱擁有產生器 —— 現在值在這裡、端點在那裡，可以各自先做。

## 這一份怎麼驗

- `S01`：純函式（邊界表產生器接受注入的 `LIMITS`）。
- `S02`：`new ESLint({ cwd }).lintText` 帶虛擬路徑走 repo 實際設定（跟 `FE-X03-S16` 同一套）。
- `S03`～`S05`：純函式。
- `S06`～`S08`：jsdom 的 `LoginForm`，攔 `signInWithNickname`（mock），斷言沒被呼叫／被呼叫的引數。
- **測試不連任何外部服務。**
- 驗收不是全綠：helper 改用 `.length` → `S04`／`S07` 紅；表單寫死 20 → `S08` 紅；lint 規則拿掉 → `S02` 紅；`LIMIT_SOURCES` 少一個鍵 → `S03` 紅。
