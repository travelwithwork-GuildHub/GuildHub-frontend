# `FE-O06` 限制值的來源

## Why

`limits.ts` 已經是唯一一份（`FE-O01`），契約 schema 從它取值。但兩件事還沒有：
1. **沒有任何 UI 真的拿到那些數字。** 登入表單的暱稱欄沒有 maxlength、沒有剩餘字數、送出鈕不會因為超長而禁用 ——
   超長是送出後才被 Zod 擋下來變成一則錯誤。WBS：「maxlength、剩餘字數、送出鈕禁用都要真的拿到那些數字」。
2. **長度單位沒有 helper。** 後端數的是 Unicode code point（`char_length`、Python `len`），JS 的 `.length` 與 HTML `maxlength` 數的是 UTF-16 code unit ——
   20 個 emoji 在後端是 20 字、在 `.length` 是 40。沒有 helper 的話，第一個表單就會用 `.length`，而那是「UI 說超長、後端卻接受」的差異。

WBS 的 Alarm：「沒有明確來源的話，最後一定有人在元件裡再寫一次 20／300／2000」。

不做會怎樣：`FE-A04`（Profile 表單）與 `FE-X05`（表單一致性）各自算長度、各自抄數字。

## What Changes

- `limits.ts` 加三個 helper：`codePointLength(s)`、`remaining(limit, s)`（可為負）、`violates(limit, s)`（`'too-short' | 'too-long' | null`）。
- 契約 schema（`rest.ts`、`ws.ts`）的 `.min()`／`.max()` **只能**接 `LIMITS.*`：一條窄的 lint 規則（只掃這兩個檔案的 `.min(<數字字面>)`／`.max(<數字字面>)`），
  不是「元件不得出現 20」那種 magic-number 規則（討論談定：誤報多、`19+1` 就繞過、repo 原則是沒有事故不加閘門）。
- `FE-O05` 的邊界表從 `LIMITS` 產生（那邊的義務；這裡的判準是「改 `LIMITS` 邊界表跟著變」）。
- **登入表單的暱稱欄**是第一個真的拿到數字的 UI：剩餘字數（以 code point 算）、超出時送出鈕禁用；**不用原生 `maxlength`**（單位不同，會擋掉後端收得下的字串）。
- `LIMIT_SOURCES`：每一個 `LIMITS` 的鍵都有 `{ source, checkedOn }`，測試逐鍵檢查 —— 「這個數字從哪抄的、什麼時候對過」是資料，不是註解。

## ⚠️ 不做什麼

- **SHALL NOT 加「元件不得出現 20／300／2000」的 lint。**
- **SHALL NOT 用原生 `maxlength` 當契約**（它可以是輔助，但這一列不加）。
- **SHALL NOT 做 Profile 表單**（`FE-A04`）或表單一致性（`FE-X05`）；它們來的時候用這裡的 helper。
- **SHALL NOT 從 OpenAPI 產 maxLength**：後端的 OpenAPI 沒有任何 `maxLength`（實測），優先序 ① 今天是空集合。
