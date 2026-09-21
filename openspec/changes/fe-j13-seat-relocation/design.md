# Design —— fe-j13-seat-relocation

## 為什麼是新 change，不是回改 fe-j13-sit-walk-in

`fe-j13-sit-walk-in` 已封存、且明文規範「角色不會真的移到椅子」。要加「就位」是**反過來**加表現層行為，屬規格級變更，開新 `spec/fe-j13-seat-relocation`。change-id 以 `fe-j13-` 開頭 → 對映既有 WBS `FE-J13`，不新增工作項目（demo 修正）。

## 模型諮詢（codex；gemini 這輪額度卡住約 40h）

codex 的方案，逐點採用：

1. **要移**：只改標籤解不掉語意矛盾。
2. **移到「站位」不是椅子**：站姿方塊站椅子上更像 bug；站位可達、與碰撞相容。
3. **瞬移（就位），不做尋路**：只在 201 成功後發生，定位為「就位」。
4. **面向桌子**：由站位與桌子相對 x 導出。⚠️ codex 口述「西朝右、東朝左」**方向講反了**；依 `projectRoomLayout` 幾何：站位 x = ±2.5、桌子 x = ±3.6（更外側），`facingFromDirection(deskX − stanceX, 0)` → **西側 `left`、東側 `right`**。規格寫語意（面向桌子）、impl 依幾何導、e2e 驗畫面 —— 不硬抄口述方向。
5. **不鎖移動、不做離席**：座位是資料 claim、走開仍占位。
6. **不處理遠端占用者 avatar**：遠端可能沒連線；拿座位資料當 remote 權威會破壞 Presence。
7. **最小安全實作**：`LocalPlayer` 是唯一位置權威；外部只寫一次性命令。

## 資料流

```
按 E → SeatMarkers.claim(i) → useSeats: POST seats
  → 201 成功分支（refetch 後、非 abort）→ onRelocate(i)
     → SeatMarkers 算 station = stationAt(i)、facing = 面向桌子
       → 寫 WorldCanvas 持的 relocateRef.current = { x, z, f }
         → LocalPlayer.useFrame 開頭：若 relocateRef.current，原子套用後清空
            teleportPlayer(pw, {x,z})  ← 物理體（權威）
            motion.prev = motion.cur = {x,z}  ← 不回彈
            root.position、facing、root.rotation、targetRef、poseRef
```

**只有 201 成功分支發命令**：409（被搶／已有座位）、403／401、500、輪詢重取、重整既有座位都不發 —— 舊資料／晚到回應/既有座位不得變成就位命令（`FE-J13-S07`）。

## 保住的核心不變量（world-player）

- **Rapier 仍是位置權威**：就位用 `teleportPlayer`（`setTranslation`）搬物理體，不是繞過它直接寫畫面。
- **不回彈**：`renderMotion` 的 `prev` 與 `cur` 同時設成目的地 —— 下一次 `advanceRenderMotion` 位移為 0（`FE-W03-S14` 的插值語意不破）。
- **相機跟畫面位置**（`FE-W03-S17`）：同幀更新 `targetRef`。
- **PositionSync 送物理位置**：同幀更新 `poseRef`（`motion.cur`）。
- **命令為空時零影響**：ref 為 `null` 的每幀走原路徑。

## 動到看得見的東西

`LocalPlayer` 是 Canvas 內的角色，就位是位置/朝向變化 —— 不改 DOM 版面、不新增控制項。過 `ui-ux-pro-max` 不適用（沒有 DOM 版面/表單/對比改動）；驗證靠 e2e 的可見就位（`FE-J13-S08`）。
