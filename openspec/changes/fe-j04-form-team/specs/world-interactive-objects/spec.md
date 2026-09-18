## Applicability

權限：不適用
併發：適用 —— 立即重取與輪詢共用同一個在飛槽
持久資料相容性：不適用
失敗路徑：適用 —— 重取失敗照既有的 `stale` 規則
測試連到什麼：單元判準不連任何外部服務（`listRooms` 用替身）

## ADDED Requirements

### Requirement: 成軍／結案之後立即重取走廊的門

走廊的門 SHALL 提供一個「立即重取」的觸發（`refresh()`）：沒有請求在飛時 SHALL 立刻送出一次 `GET /api/rooms`；有請求在飛時 SHALL NOT 疊加，
而是在那一次結束（成功或失敗）後再送一次。立即重取 SHALL NOT 改變輪詢的週期、背景停止與 `stale` 規則（`FE-W12-S19`～`S24` 不變）。
沒有走廊（不在 Guild Hall）時觸發 SHALL 是 no-op。

#### Scenario: [FE-J04-S10] 立即重取：沒在飛就馬上打；在飛就等它結束再打一次；不在大廳是 no-op

- **WHEN** 走廊的門已載入（沒有請求在飛），呼叫 `refresh()`
- **THEN** SHALL 立刻送出一次 `GET /api/rooms`，回應 SHALL 更新門
- **AND WHEN** 一次輪詢還沒回來時呼叫 `refresh()` 兩次
- **THEN** 期間 SHALL NOT 送出第二個請求；那一次回來之後 SHALL 恰好再送一次（不是兩次）
- **AND WHEN** `enabled = false`（不在大廳）時呼叫 `refresh()`
- **THEN** SHALL NOT 送出任何請求
