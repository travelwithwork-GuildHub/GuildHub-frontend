# `FE-W05` 相機朝向固定：走路時畫面不再擺動

## Why

**demo 試用回報：「走路的時候場景會自動轉角度，不要轉，有些人會頭暈。」**

相機本來就不該轉 —— `world-camera` 明訂固定的正交高角度相機、常數 offset、不給玩家旋轉。
但實作的 `useFrame` 是「**先阻尼平移位置、再每幀 `lookAt(target)`**」：靜止時 `camera.position − target === offset`，
朝向固定；**移動時位置阻尼落後 target，從落後的位置 `lookAt` 移動中的 target，視線就偏離常數 `−offset`**。
以走速約 3 單位/秒、半衰期 0.12 s 算，穩態落後約 0.52 單位、水平視線偏轉約 **2.5°**（俯角約 1.2°），
起步／停步／變向時反覆變化並反向 —— 這是**只在走路時發生、非使用者主導的旋轉光流**，對前庭敏感者是典型的暈眩源。

**不做會怎樣**：「進去會暈」是 demo 現場最難挽回的第一印象之一 —— 使用者不會說「相機每幀 lookAt 有問題」，只會離開。
而規格散文「並看向 target」正好**默許了會誘發問題的實作**；只修程式不修規格，下次有人照規格字面重寫就會回來。

## What Changes

- **`world-camera`〈固定的 Orthographic Elevated 相機〉（MODIFIED）**：朝向 SHALL 由常數 offset **一次決定並固定**，
  MUST NOT 隨 target 每幀重算；移動期間 target 得暫時偏離畫面中心。新增 **`FE-W05-S11`**：target 連續移動並變向時，
  相機朝向（四元數）與靜止基準的夾角 SHALL ≤ 0.01°，且位置仍朝 `target + offset` 收斂（不是靜止不動）。
  S01～S03 不變。
- **`world-camera`〈跟隨是平滑的，而且與影格率無關〉（MODIFIED）**：明寫**阻尼的是位置、不是朝向**；S04～S07 不變。
- **實作**：`WorldCamera` 在建立時 `lookAt` 一次固定朝向，`useFrame` 只阻尼位置、**移除每幀 `lookAt`**。

## Non-goals

- **不拿掉位置阻尼**（剛性跟隨）。那也能消除旋轉，但會把角色移動的離散感與輸入抖動直接傳到畫面；固定朝向＋位置阻尼同時做到零旋轉與平滑手感。
- **不改 offset、viewHeight、halfLife 的數值**（那是 `FE-W14` 的視覺調整）。
- **不改 `world-coordinates` 的對映**（+X 右、+Z 下）—— 固定朝向正是那份對映成立的依據，這次是把它釘得更緊。
- **不動門標籤／座位錨點／看板摘要的投影器** —— 它們讀 `camera.position − offset` 反推 target，與朝向無關。
