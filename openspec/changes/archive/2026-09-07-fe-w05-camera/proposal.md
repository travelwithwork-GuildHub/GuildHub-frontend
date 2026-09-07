## Why

`/world` 現在的相機是 `FE-W01` 隨手設的 **perspective**
（`camera={{ position: [4, 4, 4], fov: 50 }}`）。`CONTEXT.md` 明訂的是
**Orthographic、Elevated、固定角度與距離、平滑跟隨、不給玩家自由旋轉**。
兩者不一樣，而且差別不是美觀問題。

不做會怎樣，有兩件事：

1. **`FE-W02` 的視覺契約現在沒有依據。** 那份規格定了
   「+X 是畫面右、+Z 是畫面下」，但**那件事是由相機決定的**。
   現在的相機是暫時的，所以那個對映目前只是巧合
2. **`FE-W03` 交接過來的驗證沒有基準。** `FE-W02` 交接了一件它證明不了的事：
   「按下往下的鍵，角色在畫面上往下走」。**那個驗證要在定案的相機下做才算數**
   —— 相機之後改角度的話，驗過的結論就作廢

所以相機排在角色之前。

## What Changes

- 用 Orthographic 相機取代 `FE-W01` 的 perspective 相機
- 把相機固定在 target 的**上方且 +Z 側**，看向 target ——
  這是 `FE-W02` 那個「+X 右、+Z 下」對映在畫面上成立的物理實作
- 相機平滑跟隨一個 target，平滑是 **frame-rate independent** 的
- 視窗尺寸改變時**垂直可見範圍固定**，水平隨長寬比
- **不提供任何讓玩家旋轉相機的操作**

## Non-goals

- **不做角色與輸入** —— `FE-W03`（W1）。本次的 target 是靜止的
- **不做物理與碰撞** —— `FE-W04`（W1）
- **不做場景元件** —— `FE-W10`（W3）。除錯用的平面與方塊照舊，`FE-W10` 移除
- **不做構圖與可讀性的調校** —— `FE-W14`（W5）VisualPolish。
  本次的垂直可見高度與平滑半衰期是**暫定值**，寫在 `design.md` 不寫進 Requirement
- **不做 Guild Hall 的固定 Camera 構圖驗證** —— `FE-W11`（W3）
- **不碰畫布尺寸與 DPR** —— 那是 `FE-W01` 已經封存的範圍

## Capabilities

### New Capabilities

- `world-camera`: World 的相機 —— 投影型別、方位、跟隨與平滑、
  以及視窗尺寸改變時的構圖

### Modified Capabilities

- `world-canvas`: Requirement「World 以 WebGL Canvas 渲染」——
  `FE-W01` 的 perspective 相機被取代。**Scenario ID 不變**

## Impact

- **新增**：`src/world/camera.ts`（平滑的純函式）與 `WorldCamera` 元件
- **修改**：`src/world/WorldCanvas.tsx` 的相機設定
- **不新增任何相依套件**
- ⚠️ **架構約束**：`CONTEXT.md` 明訂「高頻資料不進 React」——
  target 以 **ref** 傳遞，**不得**每幀寫進 React state 或 prop。
  違反這條不會有錯誤訊息，只會變慢
- **後續項目**：`FE-W03` 會把角色接成 target，並驗證交接過來的視覺對映
