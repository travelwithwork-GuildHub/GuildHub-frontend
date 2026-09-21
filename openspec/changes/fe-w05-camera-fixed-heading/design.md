# Design —— fe-w05-camera-fixed-heading

## D1 朝向固定一次，不是每幀重算

`cameraOffset()` 是常數，所以「從 `target + offset` 看向 `target`」的方向永遠是 `−offset`，**與 target 在哪無關**。
建立相機時 `lookAt` 一次就得到正確且永久有效的四元數；之後每幀只改 `position`。

不用「每幀 `lookAt(camera.position − offset)`」這種等價寫法 —— 它每幀重算出同一個四元數，
多了一次 `lookAt` 的矩陣運算卻沒有任何資訊增量，而且把「朝向是常數」這件事藏進運算裡，讀的人看不出來。

## D2 位置阻尼保留

「相機 SHALL 平滑地跟隨 target，不得瞬移」（S04～S07）不動。副作用：移動期間 target 暫時偏離畫面中心約 0.5 單位（穩態落後），
停下 ~0.5 s 內收斂回中心。這是可接受的、也是所有平滑跟隨相機的常態；**旋轉才是暈眩源，偏心不是**。

codex 評估「固定朝向＋位置阻尼」對防暈與手感都優於「拿掉阻尼、剛性跟隨」。（gemini 配額封鎖，這輪只有一票。）

## D3 判準用夾角，不比四元數元件

四元數 `q` 與 `−q` 是同一個旋轉；直接比元件會被表示法的正負號咬到。
判準寫成 **`baseline.angleTo(camera.quaternion) ≤ ε`**（three 的 `Quaternion.angleTo` 回弧度），ε 取 0.01° ≈ 1.7e-4 rad。
今天的實作在走路時偏轉約 2.5° ≈ 4.4e-2 rad，**這條會紅**；修完是 0。

判準同時要求**位置仍在收斂**（`|camera.position − (target + offset)|` 隨幀遞減、最後接近 0）——
少了這半句，一台完全不動的相機也會通過「朝向不變」。

## D4 R3F 的矩陣更新

正交相機的投影矩陣只跟 frustum 有關，位置與旋轉不需要 `updateProjectionMatrix`。
`camera.matrixAutoUpdate` 維持預設 `true`，R3F 每幀 render 時更新 `matrixWorld`；不需要手動 `updateMatrixWorld`。

## D5 驗證

- jsdom：照 `tests/camera-no-rerender.test.tsx` 的做法 mock `useFrame`／`useThree`，拿到 frameCb 與 camera，直接驅動 —— 這是**正式的 `WorldCamera`**，不是重刻一份。
- 修前先跑一次確認 S11 紅（每幀 `lookAt` 的偏轉量測得到），再改實作跑綠；順手記下量到的偏轉角。
- 真瀏規器：既有 e2e 走位判準（門標籤投影、座位錨點、`FE-W05-S02` 的對映）全部不變即為回歸證據；不另加 e2e —— 朝向是純數學，jsdom 量得準。
