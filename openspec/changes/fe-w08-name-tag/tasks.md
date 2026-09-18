# `FE-W08` 名字牌 —— 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-w08-name-tag` 合併進 main）

## 2. 判準先紅（Requirement〈每個遠端玩家頭上有一塊寫著名字的牌子〉〈牌子釘在頭頂…〉〈寬度固定〉〈畫面外…〉〈房間裡也有〉）

- [ ] 2.1 jsdom `tests/name-tags.test.tsx`：`S01`／`S02`／`S03` 的名單半邊（有名字的人有牌子、離開的人節點不在、空白／非字串沒有牌子、不顯示替代字）；
      `S05` 的「React render 次數 0」（`Profiler` 包 `NameTags`，推進多幀後 commit 次數不變）；`S06` 空窗停在原地不拋錯
- [ ] 2.2 jsdom `tests/name-tags.test.tsx` 另補 `S08` 的點判準（錨點在畫面內、矩形越界仍 visible；錨點出畫面 hidden）與 `S06` 的「還沒有樣本的人不呈現」
- [ ] 2.3 真瀏覽器 `tests/e2e/name-tags.mjs`（`fakeRealtime` 的 `others()` 給名單；`next start` 本機）：`S01` 兩塊牌子的文字、
      `S04` 位置差等於投影差、`S05` 走 10 幀 transform 每幀不同且與頭頂投影對齊 ±1 px、`S07` 二十個全形字寬高不變＋單行截字、
      `S08` 越出一部分 hidden／整個在外 hidden／走回 visible＋無障礙樹、`S09` `elementFromPoint` 不是牌子＋對比 ≥ 4.5:1＋alpha 1＋打開看板後 `elementFromPoint` 在面板子樹裡、
      `S10` 進房間看到房間的人、大廳的牌子不在 DOM
- [ ] 2.4 `tests/e2e/dom-shell.mjs` 的 HUD 白名單加 `name-tags`（design D7）；跑一次確認 71 綠不變

## 3. 實作

- [ ] 3.1 `src/realtime/remotePlayers.ts`：把 `RemoteIdentity.name`／`av` 那兩段過時的註解（「目前每個人都是訪客」「遠端一律 0」）改成現況（`BE-G02`／`G03` 後端已修、登入後送得到）
- [ ] 3.2 `src/world/player/nameTag.ts`：`NAME_TAG_SIZE = {176, 28}`、`NAME_TAG_ANCHOR_Y = 1.6`、`hasName(name: unknown)`（唯一一份合法性判斷）
- [ ] 3.3 `src/world/NameTags.tsx`（Canvas 外、HUD 層）：`data-testid="name-tags"` 容器 `pointer-events-none absolute inset-0 overflow-hidden`（越界的牌子由它裁）；
      每個合法名字一個 `data-testid="name-tag" data-player=<id>` 節點，`CAPTION`＋token 的底／邊／字色、固定尺寸、單行省略、初始 `visibility: hidden`、
      `zIndex: layer('hud')`；ref callback 登記進 `nodesRef`
- [ ] 3.4 `src/world/player/RemotePlayer.tsx`：新 prop `tagNodesRef`；`useFrame((state) => …)` 寫完 root 之後，用 `state.camera`／`state.size` 與 `cameraOffset()`
      算頭頂錨點的 `screenPixelFor`，寫 `transform`（`translate3d` 到錨點；置中與抬升靠 CSS 的 `translate(-50%, -100%)`）／`visibility`（`inside` 為 false 就 hidden）；空窗（`track` 沒有／`pose` null）整段 return（牌子跟角色一起停在原地）
- [ ] 3.5 `src/world/RemotePlayers.tsx`／`src/world/RemoteWorld.tsx`：把 `tagNodesRef` 傳下去；`RemoteWorld` 新 prop `onRosterChange`（名單改變時呼叫，身分穩定）
- [ ] 3.6 `src/world/WorldCanvas.tsx`：`roster` state ＋ `useNameTagNodes()`；HUD 層掛 `<NameTags roster nodesRef>`（兩個場景都掛）

## 4. 驗證

- [ ] 4.1 突變（每個突變前 commit；紀錄貼 PR）：拿掉 `onRosterChange` 呼叫 → `S01` 紅；牌子文字改成 `name.trim()` → `S01` 或 `S07` 紅；
      空白名字顯示「訪客」→ `S03` 紅；`RemotePlayer` 不寫 transform → `S05` 紅；另外 `evaluate` 一次並落後一幀 → `S05` 對齊紅；
      牌子寬度改 `max-content` → `S07` 紅；拿掉 `overflow: hidden` → `S07` 紅；錨點出畫面不設 hidden → `S08` 紅；改成矩形越界就 hidden → `S08` 紅；拿掉 `pointer-events-none` → `S09` 紅；只在大廳掛 → `S10` 紅
- [ ] 4.2 `render-budget.mjs` 在 40 人名單下量一次（design 待答）；數字貼 PR，超預算就改成只投影畫面內的人
- [ ] 4.3 `docs/adr/0012-name-tags-third-render-loop-consumer.md` Accepted，`邊界狀態`／`證據` 填實際檔案與行
- [ ] 4.4 截圖 `docs/evidence/fe-w08/`：大廳三個人、房間一個人、二十字名字、面板開著時被蓋住
- [ ] 4.5 效能影響（`/world` JS／CSS gz 前後）貼 PR
