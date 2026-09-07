# FE-O11：人工驗證的證據要是不可變、離線取得回的

## Why

`fe-o11-coverage` 給三條 Scenario 加了 `manual-browser` 豁免，證據欄寫的是
**「PR #37 的 V1／V2／V3 驗證紀錄」**。

外部審查（gpt-5.6-sol）指出那不是證據，是**宣告**：

- PR 內文可以被編輯、附件可以被刪
- 要連網才查得到 —— 一份離線的 clone 沒辦法確認它存在
  （審查者實測：沙箱裡 `gh pr view 37` rc=1，無法確認附件是否存在）

而這一格是整套覆蓋檢查裡**唯一機器不驗的地方**，它必須是最硬的，不是最軟的。

## What Changes

三條 `manual-browser` 的證據換成 **40 位完整 commit SHA**：

```
d9cc115b14a5e58df7a3dbe2554dfaaf730f07bb
```

那是 `archive: fe-w01-worldcanvas` 的 commit，它的 `tasks.md` 裡記著
7.3「走完 `design.md`〈驗證方式〉的 V1–V4（production build）」已完成，
以及 3.1／3.2 各自由 V1／V2／V3 驗。

**commit 進了 main 就改不掉、離線也驗得到、`git show` 就取得回它帶的內容。**

## Non-Goals

- **不要求截圖進 repo。** 機器證明不了「人真的看過畫面」——
  它能證明的是「這份紀錄存在、而且從此不會變」。人工項的可信度來自 review，
  不是來自截圖；截圖進 repo 只會讓 diff 變大，沒有多證明什麼。
- 不改任何 Requirement 的 SHALL／MUST，只換證據欄的字串。

## 順序

這一份要**先**落地，機器檢查才能上。反過來的話，新規則會擋住修證據的那個 PR。
