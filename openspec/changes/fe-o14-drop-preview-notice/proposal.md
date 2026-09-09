## Why

`FE-O14` 為了讓 `guildhub-frontend.vercel.app` 這個沒有即時後端的部署
不要看起來像壞掉，在畫面上放了一段常駐說明：

```
目前是單人預覽，看不到其他人。
這個版本沒有連上即時伺服器。
```

**產品決定：把它拿掉。** 這個網址現在的用途是「給人看世界長什麼樣子」，
而那段字是整個畫面上唯一的文字，第一眼會先被讀到 ——
它把「來看看這個世界」變成「先讀一段技術狀態說明」。
訪客沒有在等別人出現，所以「看不到其他人」對他們不構成疑問。

不做會怎樣：那段字會一直是這個公開網址的第一印象，
直到即時後端部署上去為止（`FE-O14` 的續行列，標 `Pending`，
需要帳號與帳單決策）。那個時間點不由我們決定。

## 但有一半不能一起拿掉

`FE-O14-S10` 守的是一件真的事：**「刻意沒有後端」與「後端連不上」
不可以共用同一段文字** —— 共用等於在真的壞掉的那天告訴使用者一切正常。

如果只是把元件刪掉、測試一起刪掉，這條防禦就消失了。
下一個人（或下一個我）加回任何一段「看不到其他人」的提示時，
沒有任何東西會擋住他把它也用在連線失敗上。

所以這個 change **把 Requirement 反過來寫**，不是刪掉：
從「SHALL 呈現說明」變成「MUST NOT 呈現說明」，
而 `S10` 的形狀（工廠確實被呼叫過、close 之後仍然不出現）原封保留。

負向驗證因此仍然有效：**把 `SinglePlayerNotice` 加回 `WorldCanvas`，
新的兩條 Scenario 都要變紅。** 那是這個 change 的驗收條件。

## What Changes

- **REMOVED**：`沒有即時後端時訪客看得到說明`（`FE-O14-S09`、`FE-O14-S10`）
- **ADDED**：`世界不呈現即時層狀態的說明`（`FE-O14-S11`、`FE-O14-S12`）
- 正式碼：刪掉 `src/world/SinglePlayerNotice.tsx`，
  以及 `WorldCanvas` 裡那一行
- 測試：`tests/single-player-preview.test.tsx` 的 `S09`／`S10` 兩條
  改寫成 `S11`／`S12`。**同一個檔案的其他 Scenario（`S07`、`S08`）不動**

## Non-goals

- **不決定「有位址但連不上」要怎麼呈現。** 那是 `FE-R12`（W5）。
  這個 change 只保證那件事之後被做出來時，不會借用一段
  「一切正常」的文字
- **不做任何替代呈現。** 不換成 icon、不換成淡入淡出、不做可關閉的提示 ——
  那些都還是「畫面上有一段技術狀態說明」，只是比較不吵。
  要的是沒有
- **不動 `RemoteWorld` 的早退**（`adapter === 'none'` 時不建立連線）。
  那是 `FE-O14-S07`，跟這段文字無關
- **不碰即時後端要部署到哪裡**（`FE-O14` 的續行列）

## Impact

- `openspec/specs/runtime-config/spec.md`：一條 Requirement 換掉
- `src/world/SinglePlayerNotice.tsx`：刪除
- `src/world/WorldCanvas.tsx`：少一個子元素
- `tests/single-player-preview.test.tsx`：兩條 Scenario 改寫
- 部署：`vercel --prod` 重發一版
