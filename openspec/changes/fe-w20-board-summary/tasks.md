# Tasks —— fe-w20-board-summary

## 1. 規格（本 PR）
- [ ] 1.1 `spec/fe-w20-board-summary` 分支，只動 `openspec/changes/fe-w20-board-summary/` 與 `docs/adr/0015-*`
- [ ] 1.2 `pnpm exec openspec validate fe-w20-board-summary --strict` 綠
- [ ] 1.3 規格 PR 合併到 main

## 2. 實作：常駐資料 hook（feat/fe-w20-board-summary--data）
- [x] 2.1 `useBoardSummary(kind)`：抓 page 0、每 30 秒輪詢、分頁隱藏停／可見立即重取、單飛 `AbortController`、失敗保留 stale —— 照 `useRooms`
- [x] 2.2 回 `{ status: 'loading'|'ready'|'stale'|'failed', items: 前 4 筆, error }`（三態＋stale；page 0、N=4 是內部常數）
- [x] 2.3 跟面板 `useListPage` 各自獨立（不共享 fetch／cache）；離開 Guild Hall 場景 abort
- [x] 2.4 單元測試：進場抓一次、30 秒輪詢、隱藏停／可見重取、離場 abort、舊回應不蓋新的、失敗保留 stale（`S07`／`S05` 的 stale）

## 3. 實作：看板面上的摘要與投影（feat/fe-w20-board-summary--render）
- [ ] 3.1 `BoardSummary`（DOM，Canvas 外）：兩塊看板各一組卡槽節點登記表（`Map<boardId, HTMLElement>`，不進 React state）；掛在 `WorldCanvas` 的 overlay 層（跟 `DoorLabels`／`RoomSeats` 同層，hall 場景才掛）
- [ ] 3.2 `BoardSummaryProjector`（Canvas 內，`useFrame`）：每塊看板算 `screenPixelFor(看板面錨點)`、寫 `translate3d`＋visibility、NaN 前置檢查、畫面外移出無障礙樹 —— 照 `SeatAnchorProjector`；掛進 `SceneObjects`（`BoardTargets` 旁）
- [ ] 3.3 看板面錨點的世界 y（卡槽中心）量出實際數字寫進常數（`fe-b01` D5 的頭部裁切懸案：出生點看得出粗略形狀即可）
- [ ] 3.4 卡片內容：專案＝標題、人才＝`display_name`；單行截斷（固定寬）；`min(4, n)` 張、其餘空槽（`S01`／`S02`）
- [ ] 3.5 單元測試：兩筆→兩張填字卡＋兩空槽、超過 4 只畫 4 且無 total（`S01`／`S02`）、位置差＝`toScreen` 差（`S03`）、不進 React（Profiler 0 commit）

## 4. 實作：四種狀態（feat/fe-w20-board-summary--states）
- [ ] 4.1 載入中＝骨架卡（不先畫空位，`S06`）；空的＝`FE-X04`「這裡還沒有東西。」看板版、`role="status"`（`S04`）
- [ ] 4.2 讀不到＝環境化錯誤：`role="status"`、**無 retry**、語彙 `FE-X03`、分類 `FE-X04` `failureKind`、一律降級成 status（`S05`）
- [ ] 4.3 stale：曾有資料後輪詢失敗保留舊的、不閃空白（`S05` 後半）
- [ ] 4.4 一致性：兩邊 ready 對同一 page 0 時，看板標題＝面板前 4 筆同序（`S08`）—— 用 jsdom 同掛兩者比對
- [ ] 4.5 ui-ux-pro-max：狀態訊號要從遠處分得出（對比、骨架動效 motion-safe）；跑 `--domain loading-and-skeleton-states --stack nextjs` 的 pre-delivery

## 5. 真瀏覽器 e2e（feat/fe-w20-board-summary--e2e）
- [ ] 5.1 `tests/e2e/board-summary.mjs`：spawn 不按 E，專案看板有資料／人才看板空 → 兩種狀態訊號從 spawn 分得出來（`S09`）
- [ ] 5.2 移動時 overlay 釘在看板上（螢幕位置跟 `screenPixelFor` 走、不游移到看板外）、畫面外移出無障礙樹（`S09` 後半）
- [ ] 5.3 本機 build 帶 `NEXT_PUBLIC_APP_ENV=local`（見 reference_local_e2e_build_env）；跑綠

## 6. 收尾
- [ ] 6.1 部署（`vercel --prod`）＋真機走查：進世界不按 E 就看得出兩塊看板有沒有東西
- [ ] 6.2 `docs/adr/0015` 的「邊界狀態」改「已強制」、補證據路徑
- [ ] 6.3 archive-review ＋封存
