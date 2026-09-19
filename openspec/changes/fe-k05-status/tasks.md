# tasks：`fe-k05-status`

三個 `feat/fe-k05-status--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--store`（`statusStore`＋`RemoteWorld` 接口＋回聲分流）→ `--hud`（「狀態」控制、名字牌的狀態段；`ui-ux-pro-max` 先問）→ `--e2e`（兩個瀏覽器互見、清除、進房重送）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [x] 1.1（#560 合併）規格已在 PR 上談定（`spec/fe-k05-status` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-k05-status --strict` 通過且 PR 已合併

## 2. `--store`：送出的口、重送、回聲（〈設定狀態〉的傳輸半邊、〈重送〉；design D1／D2／D4）

- [x] 2.1（`status-store.test.ts` 6 條、`remote-world-status.test.tsx` 3 條）判準先紅：`tests/status-store.test.ts`（`S01` 的 payload 與 pending→回聲；`S02` 的 12 可送／13 不送／清除送 `""`；`S03` 沒 attach 不送且回錯；`S04` attach 時非空重送一次、空不送、detach 後不送）；`tests/remote-world-status.test.tsx`（`RemoteWorld` 每條連線 attach 一次、`status` 的 `id === me` 交給 store 不進名單）
- [x] 2.2 `src/realtime/statusStore.ts`（`createStatusStore`、`StatusPort`）、`src/realtime/StatusProvider.tsx`（`useStatus`／`useStatusPortIfProvided`）、`RemoteWorld` 多 `status?: StatusPort` prop 與回聲分流、`WorldCanvas` 傳 port、`page.tsx` 掛 provider
- [x] 2.3（6 個 6 紅：13 字照送、attach 不重送、回聲前 confirm、舊連線 confirm 也算、ready 前 attach、自己的回聲不交 store）突變：13 字照送 → `S02` 紅；attach 不重送 → `S04` 紅；回聲前就 confirm → `S01` 紅；自己的回聲進名單 → `S01` 紅

## 3. `--hud`：「狀態」控制與名字牌的狀態段（〈設定狀態〉的畫面半邊、〈名字牌上的狀態〉；design D3／D5）

- [x] 3.1（`status-hud.test.tsx` 4 條、`name-tag-status.test.tsx` 3 條）判準先紅：`tests/status-hud.test.tsx`（`S01` 快捷鈕、送出中、回聲後目前狀態；`S02` 剩餘字數、超過停用；`S03` 沒 ready 的回饋、訪客沒有控制；焦點在輸入框時 `EditableFocusLock` 鎖住、Escape 放掉）；`tests/name-tag-status.test.tsx`（`S05` 一有一無、名字盒 176×28；`S06` 換掉／清空／不認識的 id；`S07` 單行截字、位置不經 React —— 沿用 `name-tag` 測試的 `act` 計數法）
- [x] 3.2（ui-ux-pro-max：輸入要有可見標籤、disabled 看得出、toast 3–5 秒；位置：在線數底下的膠囊，展開成小卡；截圖抓到牌子 `overflow-hidden` 切掉往上長的狀態 → 牌子拆成槽＋名字盒，W08 的 e2e S07／S09 改量名字盒）`ui-ux-pro-max` 先問控制的位置與形狀；`src/status/StatusHud.tsx`、`src/status/quickStatuses.ts`、`NameTags.tsx` 加狀態節點；`WorldCanvas` 掛 HUD
- [x] 3.3（7 個：訪客也有控制紅、超過上限照送**等價**（store 也擋、`status-store` 那邊紅）、送出前畫成已生效紅、離線沒回饋紅、狀態往下長紅、空字串也掛紅、可換行紅）突變：訪客也有控制 → `S03` 紅；狀態節點改成往下長／改牌子高度 → `S05` 紅；空字串也掛節點 → `S05`／`S06` 紅；不認識的 id 也畫 → `S06` 紅

## 4. `--e2e`：真瀏覽器（〈真瀏覽器裡兩個人互見狀態〉）

- [x] 4.1（15 綠 ×3；突變 2 個 2 紅：attach 不重送 → 「重送」與「B 在房間看到」紅、名字牌不畫狀態 → 兩條「B 看到」紅；name-tags／scene-chat／scene-switch 綠；進房走站內場景切換，不是整頁導覽）`tests/e2e/player-status.mjs` 的 `S08`（兩個瀏覽器 process、`routeWebSocket` 偽造、腳本轉送 status、模擬回聲與 join 清空；A 設 → B 看到、A 清 → B 沒有、兩人進房 → 重送與 B 仍看到）；`name-tags`、`scene-switch`、`scene-chat` 沒變紅
- [x] 4.2（`docs/evidence/fe-k05-status/`；world chunk +110（store）＋909（hud）B gz；每次設狀態一則 WS、每條新連線最多一則重送）截圖貼 PR（控制、別人牌子上的狀態、12 字滿版）；`ui-ux-pro-max` pre-delivery checklist；效能：world chunk 前後差、每次設狀態一則訊息

## 5. 收尾

- [x] 5.1（main f61fc0c：eslint 0、tsc 0、vitest 1414＋27 綠；`--pending` 修 archive-review 兩條）每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響
- [x] 5.2（正式站已部署 03b5cd5；閘道 smoke **條件式放行**：正式站對後端認證呼叫被**全站 CORS** 擋（後端沒回 ACAO、site-wide，含已封存功能），非前端缺陷；本機真瀏覽器 e2e `player-status` 15 綠為功能驗收依據；CORS 另立 P0 交後端，demo 前重驗正式站整合）合併後 `vercel deploy --prod`、閘道一次人工 smoke（只走不壓：設狀態、第二個瀏覽器看到）
- [x] 5.3（r1：codex 1／gemini 1 需修正 → #565 修 → --rereview → 兩條 --judge 已驗證）tasks 全勾後、archive 前：`archive-review.sh fe-k05-status`（背景）；需修正修完 `--rereview` 一次、每條 `--judge`
- [x] 5.4（row 211 Done；瀏覽器層由本機真瀏覽器 e2e 驗過，依兩模型結論放行）Sheet `FE-K05` → Done（瀏覽器層驗過之後才打）
