# 0015. 看板摘要：第四個「render loop → DOM」的消費者；靜態錨、沿用工位錨點式的中央投影器，不抽通用元件；看板資料不共用面板的

- **Status**: Accepted
- **Date**: 2026-09-21
- **Deciders**: 寫 `FE-W20` 看板摘要規格的那個 session；codex（gpt-5.6）＋gemini（3.1 Pro）各問一次、互審
- **邊界狀態**: 已強制
- **證據**: `tests/world-board-summary.test.tsx`（四態＋兩塊配對＋讀不到 vs 空的的非文字色差，`S01`／`S02`／`S04`／`S05`／`S06`）、`tests/world-board-summary-data.test.tsx`（`useBoardSummary` 常駐輪詢生命週期、單飛 abort、失敗保留 stale，`S07`）、`tests/world-board-summary-consistency.test.tsx`（跟面板最終一致，`S08`）、`tests/e2e/board-summary.mjs`（真瀏覽器：spawn 分得出有內容／空／讀不到、移動 overlay 釘在看板、離屏 hidden，`S03`／`S09`）；`src/world/rooms/BoardSummary.tsx`（overlay＋節點登記表）、`src/world/rooms/BoardSummaryProjector.tsx`（Canvas 內 `useFrame` 投影）、`src/world/rooms/useBoardSummary.ts`、`src/world/rooms/boardAnchors.ts`（`BOARD_FACE_Y`／`BOARD_ANCHORS`）

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。

## 背景

ADR 0010 記了「render loop 直接寫 Canvas 外面的 DOM」這條路（門標籤、工位錨點），ADR 0012 記名字牌是第三個。
看板摘要（`FE-W20`）是**第四個**。ADR 0012 結尾的「重新考慮」條款寫：**出現第四個、而且它的錨也是每幀求值的，
就把「角色自己寫」抽成 hook**。這裡要判的是：看板摘要屬於哪一種錨。

## 決定

看板摘要的錨是**靜態**的（看板在 `board-project`／`board-talent` 的固定世界座標，跟門、桌子一樣不動），
**不是**名字牌那種每幀求值的位置。所以它落在**門標籤／工位錨點那一族**（靜態錨＋一個中央投影器每幀掃一遍），
**不是**名字牌那種「角色自己寫」的形狀。ADR 0012 的第四個消費者條款**不觸發**（它限定「錨也是每幀求值的」）。

沿用 `SeatAnchorProjector` 的形狀：DOM overlay 在 Canvas 外（一個 `Map<boardId, HTMLElement>` 節點登記表、不進 React state），
一個 projector 在 Canvas 內用 `useFrame` 每幀對每塊看板算 `screenPixelFor(boardFaceAnchor)`、寫 `translate3d`＋visibility、
NaN 前置檢查照抄、整塊落在畫面外就移出無障礙樹。**投影公式仍然只有一份**（`labelProjection.ts` → `framing.ts` 的 `toScreen`），一行不改。

**仍然不抽通用 `ScreenAnchors` 元件**：四個消費者裡三個是靜態錨、一個（名字牌）是每幀求值錨，內容型別（門名／座位標籤／人名／看板摘要）
與資料來源各異；共用的只有那一行投影數學，已經共用了。硬抽一個通用元件對名字牌不合身（ADR 0012 的結論不變）。

## 邊界

- **投影只有一份**：看板摘要、名字牌、門標籤、工位錨點的螢幕位置都經 `toScreen`；不得另寫公式。守它的是 `FE-W20` 的投影判準（overlay 位置差等於 `toScreen` 的差）。
- **不進 React**：看板 overlay 的**位置**每幀寫 `style`；只有**資料**（page 0 的前 4 筆、三態）進 state（`useBoardSummary`）。
- **看板資料不共用面板的**（D1）：`useBoardSummary(kind)` 是獨立的常駐輪詢（照 `useRooms`），跟面板的 `useListPage` 各自 fetch。
  理由：看板要在面板關著時也活著；把分頁狀態抬進共享 store 是 demo 不需要的耦合。兩邊最終一致（D2），不強一致。

## 代價

- 第四個消費者、兩種形狀（靜態錨 ×3、每幀求值錨 ×1）—— 下一個人要照著做，設計文件與這份 ADR 是路標。
- 看板資料與面板資料各一份在飛：同一份 `listProjects`／`listProfiles` 可能被兩邊各打一次（面板開著時）。可接受（各 30 秒／開面板一次，量級小）。

## 什麼情況下要重新考慮

- `FE-W14` 改相機（透視、可旋轉）：`toScreen` 的封閉式投影不再成立，四個消費者一起改用 `camera.project`（ADR 0010 同一條）。
- 看板摘要要顯示 total／翻頁：那時看板與面板就得共用資料來源（強一致），D1／D2 要重開。
- 出現第五個消費者、而且它的錨也是每幀求值的：那時每幀求值錨有兩個，值得把「角色自己寫」抽成 hook（ADR 0012 的條款）。
