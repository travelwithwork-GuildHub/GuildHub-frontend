# `FE-K04` 場景 chat UI —— 任務

每一片是一個 `feat/fe-k04-scene-chat-ui--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
**先 commit 紅的判準 → 實作（綠）→ 突變（拔掉防禦要紅，執行紀錄貼 PR 留言）。** 看得見的 tsx 動之前先過 `ui-ux-pro-max`；按鈕用 `@/design/controls`。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-k04-scene-chat-ui`；兩位外部審查）—— #437，2 輪

## 2. 列表與輸出安全（PR：`--feed`；產品碼 ≤180、測試 ≤200）

- [x] 2.1 先寫 jsdom：`[FE-K04-S03]`（注入的 `ChatRecord[]`：順序、name、截斷標記只在那一列、body 就是交來的）、`[FE-K04-S04]`（空狀態標記、沒有列；多一則 → 標記消失、恰好一列）、`[FE-K04-S13]`（兩個節點 `textContent` 原字串、沒有子元素、整區沒有 `script`／`img`／`a[href^="javascript"]`）
- [x] 2.2 `src/chat/SceneChatFeed.tsx`：讀 `useSceneChat().log`；append-only 的列表（不用 `ListPanel`）；每列 `[data-testid="chat-name"]`／`[data-testid="chat-body"]` 純文字節點；`truncated` 標記；空狀態（元件常數，不擴充 `FE-X04`）
  - 2026-09-15：判準先 commit（紅：元件不存在）再實作。`SceneChatFeed({ log })` 是純呈現（`useSceneChat()` 在 `--world` 的 `SceneChatHud` 接）。
    審查退回四點：`role="log"` 常駐在外層容器（不是有訊息才掛，第一則才會被當 live update）；key 改用 `ChatRecord.seq`（store 跨場景單調遞增的本地序號 ——
    協定沒訊息 id、`id` 是發言者；index 當 key 會在淘汰第一筆時把每一列改字、live region 全部重念）；`overflow-wrap:anywhere`＋`min-w-0`（`break-words` 壓不低 flex item 的 min-content，2000 字無空白會撐出 HUD）；
    標記與空狀態要有字、不能 hidden／aria-hidden。`ui-ux-pro-max`（`--domain ux`：語意 HTML／ARIA、空狀態要有訊息）。
- [x] 2.3 `output-safety` 的具名元件判準加 chat 的兩個節點 —— S13 放在 `tests/scene-chat-feed.test.tsx`（同一個元件的葉測試裡；`output-safety-render.test.tsx` 要起 HTTP server，chat 不需要）
- [x] 2.4 突變：列表用 `dangerouslySetInnerHTML` → S13 紅＋既有 lint 紅；順序反轉 → S03 紅；`truncated` 全標或不標 → S03 紅；UI 自己再截一次 → S03 紅；空狀態拿掉 → S04 紅
  - 2026-09-15 結果（`tests/scene-chat-feed.test.tsx`，4 條）：十種全紅（`innerHTML` 同時 eslint 紅；另 index 當 key、`role=log` 只在非空才掛、空狀態沒字、標記 hidden 各自紅）。執行紀錄貼在 PR 留言。

## 3. 輸入與送出（PR：`--composer`；產品碼 ≤200、測試 ≤250）

- [ ] 3.1 先寫 jsdom：`[FE-K04-S05]`（空與全空白不送、辨識要輸入、原字串含首尾空白）、`[FE-K04-S06]`（兩種 cause 各一：拋 → 保留、恰好一個 alert 在送出控制之前且取得焦點、不含例外訊息、跑完計時器沒重送；接受 → `send` 一次、清空、alert 消失、回聲前列表沒有；回聲後恰好一列）、`[FE-K04-S07]`（沒 `maxlength`、2001 code point 完整送）、`[FE-K04-S14]`（Enter 送、控制送、Shift+Enter 換行不送、含換行的 body 原樣）
- [ ] 3.2 `src/chat/SceneChatComposer.tsx`：`textarea`（Enter 送、Shift+Enter 換行）＋送出控制；`trim()` 空就不送；`send` 沒拋才清空；拋 → 保留、`SubmitError` 風格的 alert（文案在元件常數；不含例外訊息）；不自動重送；不用 `useForm` 的 schema 驗證（沒有規則可驗），但 alert 的位置與焦點照 `form-conventions`
- [ ] 3.3 突變：送出前 trim → S05 紅；不擋全空白 → S05 紅；拋錯後仍清空 → S06 紅；吞掉例外、或只接 `RealtimeError` → S06 紅；alert 印例外訊息 → S06 紅；送出時本地 append → S06 紅；加 `maxLength={2000}` → S07 紅；Enter 不送或 Shift+Enter 也送 → S14 紅

## 4. 世界整合（PR：`--world`；產品碼 ≤150、測試 ≤200）

- [ ] 4.1 先寫 jsdom：`[FE-K04-S02]` 的鎖與焦點（chat 區可見 `inputLockRef` 是 false；textarea 焦點 → true；Escape → activeElement 是錨、chat 區還在、值保留）；`[FE-K04-S01]` 的 jsdom 可驗部分（掛在 `WorldCanvas` 裡、沒有 dialog、記憶體有一則就顯示）
- [ ] 4.2 `WorldCanvas` 掛 `<SceneChatHud />`（`layer('hud')`，焦點錨容器裡、版面上避開 `InteractionPrompt` 的位置）；Escape 在 textarea 裡 → focus 錨（**textarea 的 `onKeyDown`**，不是 `useEscapeLayer`：常駐 HUD 不是可關閉的層，掛成層會永遠是最上層、破壞 `FE-X06`）；`ui-ux-pro-max`（`--domain ux`：chat／feed／輸入區的可及性與對比）
- [ ] 4.3 突變：chat 區可見就 `holdInputLock` → S02 紅；Escape 不回錨 → S02 紅；掛在 `PanelShell` 裡 → S01 紅（有 dialog）；chat 區放到提示的位置 → S15 紅（e2e）

## 5. 捲動（PR：`--scroll`；產品碼 ≤120、測試 ≤150）

- [ ] 5.1 先寫瀏覽器判準（`tests/e2e/scene-chat.mjs` 的 S11／S12 段）：在底部收新訊息 → 最新可見；往上捲 → `scrollTop` 差 ≤1px、出現控制、按了最新可見且控制消失
- [ ] 5.2 實作底部跟隨、往上讀不搶、「有新訊息」控制；量「底部附近」的閾值 —— 量出來若改變了 S11／S12 的可觀察結果，停下重開 spec PR
- [ ] 5.3 突變：每則都 `scrollIntoView` → S12 紅；不跟隨 → S11 紅；拿掉控制 → S12 紅

## 6. 瀏覽器與收尾

- [ ] 6.1 `tests/e2e/scene-chat.mjs`（`next start`；`tests/e2e/lib/world.mjs` 的偽造與走位）：`S01`（出生點附近、沒按 E、沒有 dialog、訊息出現）、`S02`（真的按 W 位移、textarea 裡打 w 不動、Escape 回錨、再按 W 會動）、`S15`（30 則多行訊息、兩個 viewport、chat 區與提示的 rect 交集 0）、`S08`（走到門前按 E 進房、hello 後只剩房間的）、`S09`（`refuse` 房間握手 → 大廳的話還在）、`S10`（reload、只回 hello＋snapshot、空狀態）＋同一段標 `[FE-R11-S05]` 並照它原文驗請求 allowlist（`/api/me`、`/api/rooms`、`/api/profiles/*`、靜態資源、`/ws`）—— **若 `/world` 載入必然打別的端點，先開 `spec/fe-r11-realtime-chat` PR 修 allowlist，不在這裡放寬**、`S11`／`S12`
- [ ] 6.2 e2e 加進 `.github/scripts/e2e-main.sh`（`governance/`，獨立 PR）
- [ ] 6.3 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test`、e2e 的結果如實記在這裡；`FE-R11` 的 5.1 在 S10 綠了之後才勾
- [ ] 6.4 封存（`archive/fe-k04-scene-chat-ui`；勾勾先用 `feat/fe-k04-scene-chat-ui--tasks` 進 main）
