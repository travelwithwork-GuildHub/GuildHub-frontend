## Context

動機見 `proposal.md`，需求見 `specs/`。四個既有條件：

1. **角色現在直接寫 transform**（`FE-W03`）。加上物理之後，
   位置的權威來源要換成 rigid body。
2. **`CONTEXT.md` 允許 rigid body 放高頻資料**（第 214 行）——
   所以這個換法不違反「高頻資料不進 React」，反而是它明列的做法之一。
3. **✅ Rapier 在 jsdom 裡跑得起來**（開工前實測過）。
   這一項因此跟 `FE-W01` 完全不同：碰撞、邊界、穿牆**全部測得到**。
4. **`FE-W06` 要 sensor**。`CONTEXT.md` 定義 Interaction Range 是
   「走近可互動物件的觸發範圍（Rapier sensor）」。

## Goals / Non-Goals

**Goals:**

- 讓角色撞得到東西、走不出去
- 讓 `FE-W06` 有 sensor 可以用
- **把物理的正確性放進單元測試** —— 這是本項最大的機會，
  因為 Rapier 不需要瀏覽器

**Non-Goals（設計層面）:**

- 不決定關卡長什麼樣（`FE-W10`／`FE-W11`）
- 不做物理拆除的順序（`FE-W07` 的 W4 那一列）

## Decisions

### D1：Kinematic character controller，不是 dynamic rigid body

Dynamic 會有慣性、會被推、會滑 —— 那是動作遊戲的手感。
這是**俯視角的平面移動**，`FE-W03` 已經定了「瞬間到全速」，
dynamic 會跟它打架。

Rapier 的 `KinematicCharacterController` 正好：
它做 shape-cast、自動沿表面滑動、而且**不會穿牆**（見 D3）。

### D2：邊界用靜態 collider，不夾座標

夾座標（`x = clamp(x, -10, 10)`）看起來簡單，但有兩個問題：

1. **角色會在邊界上抖動** —— 移動把它推出去、夾回來、下一幀再推出去
2. **跟 sensor 判定對不起來** —— sensor 的重疊是物理世界算的，
   夾座標是在物理之外做的，兩者會不一致

規格把這件事寫成 MUST NOT，因為它是「看起來對但之後會咬人」的那種選擇。

### D3：穿牆防護靠 character controller 的 shape-cast，不是「移動後檢查」

「移動後再檢查有沒有重疊」在低速時完全正確，**高速時直接穿過去** ——
而且測試如果只用正常速度，永遠測不出來。

`S05` 刻意用「單幀位移遠大於牆厚」的位移去測。
character controller 內部做的是 shape-cast（把形狀沿路徑掃過去），
所以位移多大都不會穿。

### D4：物理步進的固定時間步

Rapier 預設 1/60 秒。**不跟著 render 的 `dt` 變** ——
影格率不穩時可變時間步會讓解算結果抖動。
累積時間、每滿一個固定步就 step 一次。

這也讓測試可重現：同樣的輸入永遠得到同樣的結果。

### D5：暫定值放這裡，不進 Requirement

跟 `FE-W05`／`FE-W03` 同一個判準（視覺／關卡係數）：

- **遊玩區域 20 × 20 世界單位**（`FE-W11` 會定真正的 Guild Hall 尺寸）
- **角色 collider：半徑 0.25、高度 1.2 的膠囊**（`FE-W08` 換 Avatar 時會調）
- **邊界牆厚 0.5**

Requirement 寫的是**性質**：走不出去、擋得住、任何速度都不穿。

## 驗證方式

**這一項跟 `FE-W01` 完全相反：幾乎全部測得到。**

| Scenario | 怎麼證明 |
|---|---|
| `S01`–`S03` 碰撞與滑動 | 單元測試（建物理世界、step、斷言位置） |
| `S04` 邊界 | 單元測試（朝邊界走很久，斷言還在範圍內） |
| `S05` 穿牆防護 | 單元測試（**單幀位移遠大於牆厚**） |
| `S06` `S07` sensor | 單元測試（重疊查詢） |
| `S08` 不觸發 re-render | 單元測試（渲染次數計數） |

### 人工瀏覽器驗證（production build）

只剩「手感」——

| # | 動作 | 要留的證據 |
|---|---|---|
| V1 | 朝地板邊緣走 | 截圖：角色停住，**不再走出地板** |
| V2 | 沿著邊界斜走 | 目視：滑動，不是卡死 |
| V3 | 繞場一圈 | console 無 error |

### 自動化證明不到的

1. **手感** —— 撞牆時會不會覺得黏、滑動順不順。`FE-W14` 的事
2. **效能** —— Rapier 的 step 成本。`FE-O12`／`FE-W13`

## Risks / Trade-offs

**R1｜Rapier 的 WASM 讓 bundle 再長一塊** → `FE-O12` 的效能預算要記這一筆。
緩解：在 PR 上記錄 build 的 chunk 大小，跟 `FE-W01` 那次的 866K 對照。

**R2｜物理步進與 render loop 的耦合** → 固定時間步（D4）需要累積器，
寫錯會變成「影格率高時物理跑得快」。
緩解：累積器的邏輯做成純函式，測得到。

**R3｜character controller 的參數（斜坡角度、autostep）沒有測試釘住** →
本次是平面移動，那些參數用不到，但之後 `FE-W10` 加了高低差就會用到。
緩解：現在不設，需要時再加，不要先猜。

**R4｜`world-player` 的 MODIFIED 讓「速度」的語意分兩層** →
期望位移由 `world-player` 算，最終位置由 `world-physics` 解算。
規格已經寫明速度性質是對**期望位移**成立的。
緩解：MODIFIED 的措辭已處理；但這是之後讀規格的人容易誤會的地方。

## Open Questions

- **遊玩區域的真正尺寸。** `FE-W11` Guild Hall 會定。
- **要不要 autostep 與斜坡。** `FE-W10` 加了高低差再說（R3）。
