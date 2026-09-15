# `FE-N08` 房間門禁 —— 任務

每一片是一個 `feat/fe-n08-room-entry-gate--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（#421；已刪名片那列的已知差異與 S16 在 #423）（`spec/fe-n08-room-entry-gate`；兩位外部審查）
- [x] 1.2（流程，不對應 Requirement）ADR（`docs/adr/0008-room-ticket-is-issuer-local.md`）：票只在簽發者的 process 內有意義、本地與真後端各自簽（design D7；邊界狀態、證據照 `docs/adr/README.md`）

## 2. 本地 enter 與契約（PR：`--local-enter`；產品碼 ≤150、測試 ≤200）

- [x] 2.1 先寫 `tests/contract/rest/enter.contract.ts`：`[FE-N08-S12]` 的矩陣（401、404、404、403、200、closed 有密碼 200；名片已刪那列是已知差異，不進矩陣）；另寫 `tests/server-enter.test.ts`：`[FE-N08-S16]`（node、假 db：名片查不到 → 401、body 沒有 `room_token`、沒有第二道 SQL）、座位空與滿都 200、票對替身握手（同房同人收、別房拒、別人的 cookie 拒）、`[FE-N08-S13]` 兩個目標同一份 —— 對 `local` 目標先紅
- [x] 2.2 簽章函式抽成兩邊共用的模組（不 import `server-only`）、簽 `room:<uuid>|<profileId>`；`scripts/realtime-stub.ts` 改 import 它、握手改成**先解析 cookie 身分再驗票**，並把「`FE-W16` 把 enter 接上」的筆誤改成 `FE-N08`；既有用 `roomToken(scene)` 算票的測試跟著改
- [x] 2.3 `src/app/api/projects/[project_id]/enter/route.ts`：走 `handle()` 管線（沒有 session、或名片查不到 → 401；後者是跟真後端的已知差異，`S16`）、查 `password_hash`（不看 status）→ 404、`verifyPassword` → 403、簽票（綁 projectId＋profileId）
- [x] 2.4 突變：拿掉 `verifyPassword` → 403 那列紅；handler 不走 `handle()`、只 `sessionIdFrom` → S16 紅；替身換一把 secret → 握手那段紅；票不綁人 → 換 cookie 那段紅；handler 改回 `{ token }` → `EnterOut` 紅
  - 2026-09-15 結果：`internal` 目標 51 passed／10 todo（enter 3 條、rooms S22 用 `enter` 拿票）；`guildhub` 目標（wrapper 自起真後端）49 passed／2 skipped（S22／S23：真後端沒有 `/online`）。rooms 裡「uuid 不合法但票算對」那條拿掉：契約檔不得引用 `src/server`（`FE-O05-S02`），而票的格式是簽發者的事（ADR 0008）；S21 的三種拒絕仍在 `lobby.contract.ts`。
    突變全紅：拿掉 `verifyPassword` → 403 兩列紅（含空字串密碼）；回 `{ token }` → `EnterOut` 四處紅；替身換 secret → 握手兩條紅；簽章去掉 `|<profileId>` → 「別人拿著這張票進了房」紅；
    `auth: 'none'` → S16 紅（403 而不是 401）；handler 加 `status = 'active'` → closed 那列紅；handler 看座位 → 滿座那列紅。
    ⚠️ 突變改了 `src/` 之後要**重新 `next build`** 才算數（契約測試打的是 `next start`）；第一輪沒重建，紅在錯的地方。
    審查後補：`tests/room-token-sign.test.ts`（簽章綁房也綁人；`roomSceneProject` 對不合法 uuid 回 null —— 替身在驗票前先用它擋格式，契約檔手上沒有票所以由這裡守）、S13 對 401／403／404 斷言 `toUiError(...).kind`、
    替身在 `identify()` 期間 client 斷線的防護（`socket.on('error')`、`destroyed` 就不 `write`）；ADR 0008 邊界狀態改「僅約定」（契約守不住「前端不解析」與「簽章只有一份」）。
    突變：`roomSceneProject` 不驗 uuid → 那條單元紅；403 改 400 → S12 兩列紅。
    第二輪審查後：替身的裁決集中成 `roomHandshakeAllowed`（替身只呼叫它）；harness 對 `internal` 給一個「探針」（登入一張名片、用同一把 secret 簽「不合法 scene 的票」與「seed 房間的票」），
    `rooms.contract.ts` 的 S21 經替身握手驗「uuid 不合法但票算對也拒」，對照組（seed 房間連得上、`hello.you` 是那個人）擋 harness 簽法漂掉的恆真。
    突變：裁決只看 `room:` 前綴 → S21 紅；harness 簽法改 `:` → 對照組紅（403）。internal 52 passed。

## 3. 視窗、焦點、世界鎖（PR：`--modal`；產品碼 ≤200、測試 ≤200）

- [x] 3.1（流程，不對應 Requirement）動 tsx 之前先過 `ui-ux-pro-max`（`--domain` 表單／對話框；按鈕用 `@/design/controls`）
- [x] 3.2 先寫 jsdom：`[FE-N08-S01]`（provider 收到 projectId／title、dialog 語意、一次 E 一個視窗、預設說明不出現）、`[FE-N08-S02]`（Esc、清密碼、焦點回錨、再開是空的）、`[FE-N08-S03]`（焦點在按鈕上世界不動、Tab 不出視窗、關閉只放自己的鎖）
- [x] 3.3 實作 `RoomEntryGateProvider`（Canvas 外，實作 `EntryGateProvider`）與 `RoomPasswordDialog`：`focusTrap`、`holdInputLock`、`DiscardConfirm` 的 dialog 寫法；不新增 E 監聽
- [x] 3.4 突變：不掛 provider → S01 紅；視窗不持鎖 → S03 紅；關閉不放鎖 → S03 的「恢復」紅；關閉不清密碼 → S02 紅；焦點丟 `body` → S02 紅
  - 2026-09-15 結果（`tests/room-entry-modal.test.tsx`，7 條）：needsToken 不接 → 全紅；`WorldCanvas` 不掛 `<RoomPasswordDialog />` → S01「正式 WorldCanvas 的接線」紅（審查要求：掛真的 `WorldCanvas`）；
    **`page.tsx` 不掛 provider 在 jsdom 不紅** —— 那是 e2e 的（tasks 6：真的走到門前按 E 出現視窗，少了 provider 只會看到預設說明）；「鎖著按 W 不動、放開會動」同樣是 e2e 的，jsdom 那段恆真的 W/E 斷言已拿掉（兩位審查都抓到）；不持鎖 → S03 紅；鎖不放 → S03「漏在那裡」紅；焦點丟 body → S02 兩條紅；
    Tab 不攔 → S03 紅；關閉不卸載只 hidden（密碼留著）→ S02 三處紅；第二次 needsToken 換 key 重掛 → S01「仍是 ab」紅（只拿掉 provider 的物件同一性 guard 而 key 仍是 projectId 時不紅 —— key 才是防線，guard 只是省 re-render）。
    `ui-ux-pro-max`（`--domain ux`：focus ring 每個控制都要、錯誤放欄位下並 `aria-describedby`、允許貼上／密碼管理員、不用只靠 placeholder 當標籤）：用 `@/design/controls` 的 `FIELD`／`PRIMARY`／`SECONDARY`（已含 focus 樣式）、可見的 `<label>`、`autoComplete="current-password"`；顯示／隱藏密碼的切換沒做（規格沒有，之後要就開 spec）。

## 4. 送出、錯誤、成功進房（PR：`--submit`；產品碼 ≤200、測試 ≤350 —— S15 一條就七段，原估 250 不夠）

- [x] 4.1 先寫 jsdom：`[FE-N08-S04]`（去重、busy、送出中 Esc 關得掉、晚到結果丟棄、空字串照送、不自動重送）、`[FE-N08-S06]` 的順序（`holdRoomToken` 在 `enterRoom` 之前；用呼叫順序斷言）、`[FE-N08-S14]`（四種 storage 故障＋空字串票 → 不進房、視窗留著、alert 不含「密碼」）、`[FE-N08-S15]`（換房間 → 作廢；關了重開同一間房 → 舊回應作廢；視窗不關、身分 P→Q → 舊輪作廢且 busy 立刻解除、Q 可送；P 舊回應晚到不動 Q 的 busy；P→Q→P → 作廢；登出 → 作廢；視窗都還開著）、`[FE-N08-S08]`～`S10`（403／404×3 種 detail／401／網路／500／422／壞 body；detail 不進 DOM；不存票、不 `enterRoom`）
- [x] 4.2 `useForm` ＋ `enterProject()`；錯誤分類只看 `kind`（`isForbidden`／`isNotFound` 的寫法照 `identity/session.ts`）；文案在元件常數，不在規格
  - 2026-09-15：`RoomPasswordDialog` 改用 `useForm`（schema 只有 `z.string()`，D6）、`SubmitError`；`describeError` 給 403／404／票存不住三句，其餘退回語彙表。
    代號＝每一輪在 `waiting` 裡的喚醒器：卸載（關閉、換房）與 `profileId` 變化都叫醒還在等的那一輪 → 它直接 resolve（交出 busy）、回應晚到什麼都不動；
    不用 `AbortSignal`（D9）。成功：`holdRoomToken` → `heldRoomToken` 嚴格等於 → `enterRoom` → 關（D2、D10）；空字串票另外擋。
- [x] 4.3 突變：把 `detail` 印出來 → S09 紅；403 與 404 同一句 → S08／S09 紅；重開視窗保留上次密碼 → S05 紅（e2e）；反轉存票與 `enterRoom` 的順序 → S06 紅；submit 不去重 → S04 紅；存票不讀回或只驗非 null → S14 紅；關閉後不作廢那一輪 → S04 晚到那段紅；換代號不解除 busy → S15 紅
  - 2026-09-15 結果（`tests/room-entry-submit.test.tsx`，15 條）：detail 進 DOM → S09 紅；403 用 404 那句 → S08 紅；反轉順序 → S06＋S14 四種紅；不讀回 → S14 四種紅；只驗非 null → S14「舊票 OLD」紅；
    空字串票放行 → S14 空字串紅；`.min(1)` → S04 空字串段紅（連帶 S09／S10／S15 —— 它們都用空欄位送）；卸載不換代號 → S04 晚到段＋S15 紅；身分變化不換代號 → S15 紅；
    換代號不叫醒舊輪 → S15「立刻可按」紅；`useForm` 拿掉 in-flight guard → S04 紅；送出鈕不 disabled → S04／S15 紅；失敗時寫票 → S08／S09／S10／S15 八條紅。
    **拿掉的防禦**：曾有一個「回應落地後再比一次代號計數」的檢查，沒有任何突變讓它紅（promise 鏈在 microtask、換代號的 effect 在 task，插不進去）→ 刪掉，只留 race。
    S05（密碼不落地、重開是空的）是 e2e 的（tasks 6）。

## 5. 重新輸入密碼（PR：`--retry`；產品碼 ≤120、測試 ≤150）

- [ ] 5.1 先寫 jsdom：`[FE-N08-S11]`（被拒後票還在；不按就同票再試；按了才 drop、確認不在了才關通知開空視窗、可及名稱含房名；啟動前沒有 `/enter`；drop 三種故障 → 不開視窗、通知留著；深連結沒 title → 無房名的視窗，視窗開著時清單回來 → 同一個節點的名稱更新）；`FE-V01-S07`／`S11` 的既有測試不動（新條件由 `FE-N08-S11`／`S01` 自己驗）
- [ ] 5.2 `SceneNotices` 的 alert 加「重新輸入密碼」（那句話不變；`SECONDARY`）；`SceneProvider` 的失敗通知多記 `title`；`roomTokens.ts` 的 drop 回報三態；接 drop → 三態判斷 → `dismissNotice` → `needsToken(projectId, title ?? 清單查到的 ?? null)`
- [ ] 5.3 突變：失敗時自動 `dropRoomToken` → S11 第一段紅；動作不丟票 → S11 鍵仍在紅；`world-scenes-transition-ui.test.tsx` 的 `FE-V01-S07` 全綠不動

## 6. 瀏覽器與收尾

- [ ] 6.1 `tests/e2e/room-entry.mjs`（`next start` 正式建置、`page.route` 偽造 `/enter`、`routeWebSocket` 偽造房間 socket；走位用 `scene-switch.mjs` 的門標籤里程計）：`S01`（真的按 E 開視窗、Canvas 同一節點）、`S02`（Esc 後 activeElement）、`S03`（焦點在送出鈕上按 W／E 世界不動、關閉後會動）、`S05`（密碼不落地：網址軌跡＋storage；同一扇門再開是空的）、`S06`／`S07`（帶票的連線、網址沒票、回大廳再按 E 不問）、`S08`（403 留著）、`S09`（一種 404）、`S10`（401 與網路失敗）、`S11`（被拒→同票再試→重新輸入）、`S13` 後半（換身分）、`S14`（`setItem` 拋）、`S15` 第一段（延遲回應＋Esc＋重開）
- [ ] 6.2 e2e 加進 `.github/scripts/e2e-main.sh`（`governance/`，獨立 PR）
- [ ] 6.3 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test`、契約測試兩個目標的結果如實記在這裡
- [ ] 6.4（流程，不對應 Requirement）Google Sheet：`FE-N08` → On-going／Done 各一次
- [ ] 6.5 封存（`archive/fe-n08-room-entry-gate`；勾勾先用 `feat/fe-n08-room-entry-gate--tasks` 進 main）
