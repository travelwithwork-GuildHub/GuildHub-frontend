## Applicability

權限：不適用
併發：適用 —— 立即重取與輪詢共用同一個在飛槽
持久資料相容性：不適用
失敗路徑：適用 —— 重取失敗照既有的 `stale` 規則
測試連到什麼：單元判準不連任何外部服務（`listRooms` 用替身）

## ADDED Requirements

### Requirement: 成軍／結案之後立即重取走廊的門

走廊的門 SHALL 提供一個「立即重取」的觸發（`refresh()`）：沒有請求在飛時 SHALL 立刻送出一次 `GET /api/rooms`；有請求在飛時 SHALL NOT 疊加，
而是記下一次待辦，在那一次**真的結束**（成功或失敗）後再送一次；被中止的（切到背景、卸載、不在大廳）不算結束 —— 中止時 SHALL 一併清掉待辦，SHALL NOT 在背景或卸載後送出。
分頁不可見時呼叫 `refresh()` SHALL 是 no-op（回到可見時既有的立即更新會取）；沒有走廊（不在 Guild Hall）時 SHALL 是 no-op。
立即重取失敗照既有的 `failed`／`stale` 規則。立即重取 SHALL NOT 改變輪詢的週期、背景停止與 `stale` 規則（`FE-W12-S19`～`S24` 不變）。

#### Scenario: [FE-J04-S10] 立即重取：沒在飛就馬上打；在飛就等它結束再打一次；不在大廳是 no-op

- **WHEN** 走廊的門已載入（沒有請求在飛），呼叫 `refresh()`
- **THEN** SHALL 立刻送出一次 `GET /api/rooms`，回應 SHALL 更新門
- **AND WHEN** 一次輪詢還沒回來時呼叫 `refresh()` 兩次
- **THEN** 期間 SHALL NOT 送出第二個請求；那一次回來之後 SHALL 恰好再送一次（不是兩次）
- **AND WHEN** `enabled = false`（不在大廳）時呼叫 `refresh()`；另一次：分頁不可見時呼叫
- **THEN** 兩次 SHALL 都不送出任何請求
- **AND WHEN** 一次請求在飛時呼叫 `refresh()`，隨即分頁切到背景（在飛的被中止）
- **THEN** SHALL NOT 再送出請求（待辦被清掉，中止的 `finally` 不消費它）；回到前景時 SHALL 恰好送出一次（既有的「立即更新」，`FE-W12-S20`），不是兩次
- **AND WHEN** 一次請求在飛時呼叫 `refresh()`，隨即卸載
- **THEN** SHALL NOT 再送出請求、SHALL NOT 寫任何狀態；重新掛載 SHALL 恰好送出一次（首次載入）
- **AND WHEN** 一次請求在飛時呼叫 `refresh()`，隨即 `enabled` 變 false
- **THEN** SHALL NOT 再送出請求；`enabled` 變回 true 時 SHALL 恰好送出一次（既有規則），不是兩次
- **AND WHEN** 立即重取回 500
- **THEN** 門 SHALL 留在原地並標為 `stale`（既有規則），沒有別的副作用
