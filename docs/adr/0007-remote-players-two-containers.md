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

## 「已強制」鎖住的是哪一句 —— 說清楚，不要多

`tests/remote-players-render.test.tsx` 的 `[FE-R07-S08]` 做兩件事：改動態 Map 之後
（a）角色真的移動了、（b）`RemotePlayer` 的 render 次數**沒有變**。
2026-09-12 做過一次突變：把 `RemotePlayer` 的位置塞進 `useState`，那條測試紅在
`).toBe(rendersBefore)`，不是紅在別的地方。

所以**被鎖住的是可觀察的那句：「位置更新不會讓遠端角色重繪」**。這正是 `CONTEXT.md`
那條規則要防的損害（「只會變慢」）。

**沒被鎖住的是規格的字面**：`remote-players/spec.md` 寫「MUST NOT 寫入 React state 或
Zustand」。把位置同時抄一份進一個沒有人訂閱的 store，render 次數不變、測試不紅，但字面
違反了。（`zustand` 目前不在 `package.json` 裡，所以那條路要先加依賴才走得到；
`RemoteWorld.tsx:67` 用 `useState` 的 lazy initializer **持有**那個 Map，Map 本身被就地改寫、
從不 `setState` —— 這算不算「進 React state」是語意之爭，測試對它沒有意見。）
字面那句是 `僅約定`，靠 review。codex 2026-09-12 的審查指出第一版把「已強制」寫得
比測試證明的寬，這一節是改過的。

## 代價

新增一種高頻資料（例如朝向、動畫相位）的人要知道它該進哪個容器。
`RemotePlayer.tsx` 開頭的註解寫了。

## 什麼情況下要重新考慮

- 需要 InstancedMesh（`fe-r07-remote-players/D4` 明確不做）—— 那時容器的形狀會變。
