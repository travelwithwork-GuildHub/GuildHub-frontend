# Design —— fe-k04-chat-length-guard

## 反轉的是哪一條決定，為什麼

`FE-R11` 的 design `D5`「chat 沒有上限、沒有剩餘字數（沒有上限可數）」是**在後端還沒加上限時**下的。前提（後端 `ChatIn.body` 無限制）已被部署後端推翻（relay 層 `len > 500` 靜默丟棄，2026-09-21 實測）。這裡反轉的是**那個前提所支撐的結論**，不是憑空加限制 —— 判準是「靜默資料遺失比違反一條過時的『無上限』規格更糟」。

## 兩個模型的結論（一致，無分歧）

問 codex（gpt-5.6）與 gemini（3.1 Pro）：是否反轉、Zod 要不要加 max、WBS 對映、漏了什麼。兩者**逐點一致**：

- **反轉：做。** 比照 `statusText`（同樣是後端靜默丟棄、前端用 `LIMITS` 擋）。
- **Zod 不加 `.max(500)`。** `ChatIn`／`ChatOut` schema 的責任是 wire 形狀能否 parse；relay 的丟棄不是 parse 拒絕。500 只住 `LIMITS` ＋ composer 送出守門。保留 FE-R11-S09 的「schema 自省無 length check」與「超長 `safeParse` 通過」。
- **WBS 對映 `fe-k04`**（不是 FE-X05）。使用者可見行為在 composer 的送出守門與字數顯示；這不是前端自訂上限（FE-X05 是「後端沒上限、前端自己訂」），是對齊一個**實測到的後端上限**。`limits.ts` 的小改隨本 change 一起。

## parse 層 vs 送出守門的切分

```
使用者輸入 ──▶ SceneChatComposer.submit()
                 ├─ trim 空？        → 欄位級提示，不送（既有）
                 ├─ violates too-long? → 擋、不送、禁用（本 change）  ← 500 住這裡
                 └─ send({t:'chat', body}) ──▶ ChatIn (Zod, 無長度 check)  ← schema 不擋長度
                                                   └─▶ WS ──▶ 後端 relay：len>500 靜默丟棄
```

500 是「送出前要擋的既成事實」，落在 `LIMITS.chatBody` ＋ composer；wire schema 維持能 parse 任意長度（未來若收到別處來的長 `ChatOut` 也不該 parse 崩潰）。

## 實作約束（比照既有前例，不新造）

- **算法用 `remaining`／`violates`／`codePointLength`**（`limits.ts` 既有、按 code point，對上後端 `len()`）。**不用原生 `maxlength`**（數 UTF-16 code unit，emoji 誤判）—— 與 `LoginForm` 暱稱欄（FE-O06）同一套。
- **`submit()` 自己要擋**，不只禁用按鈕：Enter／form submit 不經按鈕的 disabled 狀態。
- **超長 = 欄位級**（`aria-invalid` ＋ `aria-describedby` 指向剩餘字數），不佔用送出失敗的 `role="alert"`（那句留給 transport 真的拋）。
- **貼上超長保留全文**、顯示負剩餘、禁用送出讓使用者刪 —— 不自動截斷。
- **IME 組字中**不送（既有 `isComposing` 守門保留）；字數依最終 code point 更新。

## 動到看得見的 .tsx

`SceneChatComposer` 加一行剩餘字數、送出按鈕多一個 disabled 條件 —— 交付前過 `ui-ux-pro-max`（forms/feedback：剩餘字數的視覺層級、超長的欄位級回饋對比、按 `CAPTION`／`text-danger` token）。
