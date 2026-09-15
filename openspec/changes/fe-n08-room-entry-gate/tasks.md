# `FE-N08` 房間門禁 —— 任務

每一片是一個 `feat/fe-n08-room-entry-gate--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-n08-room-entry-gate`；兩位外部審查）
- [ ] 1.2 ADR：票只在簽發者的 process 內有意義、本地與真後端各自簽（design D7；邊界狀態、證據照 `docs/adr/README.md`）

## 2. 本地 enter 與契約（PR：`--local-enter`；產品碼 ≤150、測試 ≤200）

- [ ] 2.1 先寫 `tests/contract/rest/enter.contract.ts`：`[FE-N08-S12]` 的矩陣（401／404／404／403／200）、票對替身握手（同房收、別房拒）、`[FE-N08-S13]` 兩個目標同一份 —— 對 `local` 目標先紅
- [ ] 2.2 簽章函式抽成兩邊共用的模組（不 import `server-only`）；`scripts/realtime-stub.ts` 改 import 它，並把「`FE-W16` 把 enter 接上」的筆誤改成 `FE-N08`
- [ ] 2.3 `src/app/api/projects/[project_id]/enter/route.ts`：走 `handle()` 管線、`sessionIdFrom` → 401、查 `password_hash` → 404、`verifyPassword` → 403、簽票
- [ ] 2.4 突變：拿掉 `verifyPassword` → 403 那列紅；替身換一把 secret → 握手那段紅；handler 改回 `{ token }` → `EnterOut` 紅

## 3. 視窗、焦點、世界鎖（PR：`--modal`；產品碼 ≤200、測試 ≤200）

- [ ] 3.1 動 tsx 之前先過 `ui-ux-pro-max`（`--domain` 表單／對話框；按鈕用 `@/design/controls`）
- [ ] 3.2 先寫 jsdom：`[FE-N08-S01]`（provider 收到 projectId／title、dialog 語意、一次 E 一個視窗、預設說明不出現）、`[FE-N08-S02]`（Esc、清密碼、焦點回錨、再開是空的）、`[FE-N08-S03]`（焦點在按鈕上世界不動、Tab 不出視窗、關閉只放自己的鎖）
- [ ] 3.3 實作 `RoomEntryGateProvider`（Canvas 外，實作 `EntryGateProvider`）與 `RoomPasswordDialog`：`focusTrap`、`holdInputLock`、`DiscardConfirm` 的 dialog 寫法；不新增 E 監聽
- [ ] 3.4 突變：不掛 provider → S01 紅；視窗不持鎖 → S03 紅；關閉不清密碼 → S02 紅；焦點丟 `body` → S02 紅

## 4. 送出、錯誤、成功進房（PR：`--submit`；產品碼 ≤200、測試 ≤250）

- [ ] 4.1 先寫 jsdom：`[FE-N08-S04]`（去重、busy、空字串照送、不自動重送）、`[FE-N08-S06]` 的順序（`holdRoomToken` 在 `enterRoom` 之前；用呼叫順序斷言）、`[FE-N08-S08]`～`S10`（403／404×3 種 detail／401／網路／500／422／壞 body；detail 不進 DOM；不存票、不 `enterRoom`）
- [ ] 4.2 `useForm` ＋ `enterProject()`；錯誤分類只看 `kind`（`isForbidden`／`isNotFound` 的寫法照 `identity/session.ts`）；文案在元件常數，不在規格
- [ ] 4.3 突變：把 `detail` 印出來 → S09 紅；403 與 404 同一句 → S08／S09 紅；先 `enterRoom` 再存票 → S06 紅；submit 不去重 → S04 紅

## 5. 重新輸入密碼（PR：`--retry`；產品碼 ≤120、測試 ≤150）

- [ ] 5.1 先寫 jsdom：`[FE-N08-S11]`（被拒後票還在；不按就同票再試；按了才 `dropRoomToken`、關通知、開空視窗；啟動前沒有 `/enter`）
- [ ] 5.2 `SceneNotices` 的 alert 加「重新輸入密碼」（那句話不變；`SECONDARY`）；接 `dropRoomToken` → `dismissNotice` → `needsToken`
- [ ] 5.3 突變：失敗時自動 `dropRoomToken` → S11 第一段紅；動作不丟票 → S11 鍵仍在紅；`world-scenes-transition-ui.test.tsx` 的 `FE-V01-S07` 全綠不動

## 6. 瀏覽器與收尾

- [ ] 6.1 `tests/e2e/room-entry.mjs`（`next start` 正式建置、`page.route` 偽造 `/enter`、`routeWebSocket` 偽造房間 socket；走位用 `scene-switch.mjs` 的門標籤里程計）：`S01`（真的按 E 開視窗、Canvas 同一節點）、`S02`（Esc 後 activeElement）、`S05`（密碼不落地：網址軌跡＋storage）、`S06`／`S07`（帶票的連線、網址沒票、回大廳再按 E 不問）、`S08`（403 留著）、`S11`（被拒→同票再試→重新輸入）、`S13` 後半（換身分）
- [ ] 6.2 e2e 加進 `.github/scripts/e2e-main.sh`（`governance/`，獨立 PR）
- [ ] 6.3 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test`、契約測試兩個目標的結果如實記在這裡
- [ ] 6.4 Google Sheet：`FE-N08` → On-going／Done 各一次
- [ ] 6.5 封存（`archive/fe-n08-room-entry-gate`；勾勾先用 `feat/fe-n08-room-entry-gate--tasks` 進 main）
