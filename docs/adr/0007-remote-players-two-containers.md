# 0007. 遠端玩家的高頻位置放在 React 看不到的地方

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: `FE-R07`（`openspec/changes/archive/2026-09-08-fe-r07-remote-players/design.md` 的 D1）；2026-09-12 事後審查以突變測試確認
- **邊界狀態**: 已強制
- **證據**: tests/remote-players-render.test.tsx:122、src/world/player/RemotePlayer.tsx:55

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

`CONTEXT.md`〈已知的邊界與限制〉：「高頻資料不進 React。position / rotation / 動畫相位
不得寫入 React state 或 Zustand。違反這條不會有錯誤訊息，只會變慢。」

每秒約 400 次位置更新（40 人 × 10 Hz）。原規劃是一個 store。

## 選項

### A. 一個 store，加一條「不要對位置呼叫 setState」的約定
- 好：一個容器。
- 壞：那條約定沒有任何東西在擋，違反不會有錯誤訊息。

### B. 兩個容器
- 低頻（誰在線、名字、外觀）走 React state，會 re-render。
- 高頻（位置樣本）放一個 **React 從來沒訂閱過的 `Map`**，`RemotePlayer` 在 `useFrame`
  裡直接寫 `root.position`。
- 好：400 次更新不可能觸發 re-render，因為 React 看不到那個 Map —— **這是結構不是約定**。
- 壞：兩個容器要各自維護新增／移除。

## 決定

選 B。

## 為什麼標「已強制」

`tests/remote-players-render.test.tsx` 的 `[FE-R07-S08]` 數 render 次數。
2026-09-12 做過一次突變：把 `RemotePlayer` 的位置塞進 `useState`，那條測試紅在
`).toBe(rendersBefore)`，不是紅在別的地方。**測試真的鎖住了這條邊界。**

## 代價

新增一種高頻資料（例如朝向、動畫相位）的人要知道它該進哪個容器。
`RemotePlayer.tsx` 開頭的註解寫了。

## 什麼情況下要重新考慮

- 需要 InstancedMesh（`fe-r07-remote-players/D4` 明確不做）—— 那時容器的形狀會變。
