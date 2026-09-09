## MODIFIED Requirements

### Requirement: Sensor 回報重疊但不擋路

系統 SHALL 支援標記為 sensor 的 collider：它**回報**與角色的重疊，
但 MUST NOT 阻擋角色移動。

**它是物理的觸發原語。它不是 `Interaction Range` 的判定方式。**

這一段原本寫的是「這是 `Interaction Range` 的原語」。`FE-W06` 開工時實測
（真 Rapier，見那個 change 的 proposal）推翻了它：

| 情況 | 結果 |
|---|---|
| `world.step()` **之前**查 `intersectionPairsWith` | `false` —— **假的**，narrow phase 還沒跑過，而且不會報錯 |
| step 之後，角色與 sensor 中間隔一道實心牆 | **`true`** —— 牆完全擋不住 |

也就是：

- **sensor 重疊 MUST NOT 被當成「可互動」。** 遮蔽不在它的範圍內，
  要處理遮蔽只能另外做 raycast
- `Interaction Range` 的判定由 `FE-W06` 以**距離**進行，
  因為下游需要的是連續的接近度而不是 boolean
- sensor 仍然是「非圓形的、不對稱的接近區」之後可用的手段，
  但它是候選的篩選，不是可互動性的結論

**查詢 sensor 的重疊之前 MUST 先讓物理世界步進過。** 沒步進過的查詢
一律回「沒有重疊」，而那是無聲的。

#### Scenario: [FE-W04-S06] 走進 sensor 不會被擋

- **WHEN** 角色走進一個 sensor 的範圍
- **THEN** 它照常通過，位置不受影響

#### Scenario: [FE-W04-S07] Sensor 回報重疊

- **WHEN** 角色在 sensor 的範圍內
- **AND** 物理世界已經步進過
- **THEN** 系統查得到那個重疊
- **AND WHEN** 角色離開該範圍
- **THEN** 系統查不到那個重疊

#### Scenario: [FE-W04-S09] Sensor 的重疊不代表可互動 —— 牆擋不住它

- **WHEN** 角色與一個 sensor 之間隔著一道實心的靜態 collider
- **AND** 角色仍在 sensor 的範圍內
- **THEN** 系統**仍然**查得到那個重疊
- **AND** 這個結果 MUST NOT 被當成「角色可以跟那個物件互動」
