# `FE-R11` RealtimeChat —— 任務

每一片是一個 `feat/fe-r11-realtime-chat--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-r11-realtime-chat`；兩位外部審查）
- [ ] 1.2 ADR：chat 只走 `RemoteWorld` 注入的窄介面、不 import client 的值（design D1；邊界狀態、證據照 `docs/adr/README.md`）

## 2. 記憶體與限制（PR：`--memory`；產品碼 ≤120、測試 ≤150）

- [x] 2.1 先寫單元：`[FE-R11-S04]`（101 → 100、最舊淘汰；2001 code point → 留 2000 標 truncated、2000 原值）、`[FE-R11-S05]` 的靜態邊界（sceneChat 模組不 import operations／transport、不出現 storage／indexedDB 字樣）、`[FE-R11-S09]`（`LIMITS.chatBody` 是 `{0, UNBOUNDED}`、來源、`ChatIn`／`ChatOut` 的 body 沒有長度 checks（自省）、2001 字與空字串通過）
- [x] 2.2 `src/realtime/sceneChat.ts`：純 reducer（append、筆數截斷 100、單則保留 2000 code point＋`truncated`、clear）；`limits.ts` 加 `chatBody` 與來源
  - 2026-09-15：`appendChat(log, ChatOut): ChatLog`＋`EMPTY_CHAT`（clear 就是回到它）、`CHAT_KEEP`／`CHAT_BODY_BUDGET`；`ws.ts` 補 `export type ChatOut`；
    `LIMITS.chatBody = {0, UNBOUNDED}`、`LIMIT_SOURCES.chatBody`；`tests/contract/boundaries.ts` 加 `pending`（WS 不走 REST 那張表）。
- [x] 2.3 突變：拿掉筆數截斷 → S04 紅；拿掉單則預算 → S04 紅；`max` 改 2000 或 `min` 改 1 → S09 紅；`ChatIn.body` 加 `.max(10_000_000)` → S09 自省紅
  - 2026-09-15 結果（`tests/scene-chat-memory.test.ts`，5 條）：全部如上紅；另外 用 UTF-16 `.length` 截 → S04 emoji 那條紅；原始碼出現 `sessionStorage` → S05 紅；import `@/api/operations` → S05 紅。
    執行紀錄貼在 PR #434 的留言（每一種：套用 → 跑 → checkout；含無突變的對照）。**流程上的誠實紀錄**：這一片的判準與實作是同一個 commit 進來的（`22033b0`），沒有「先紅再綠」的 commit 證據 —— 審查指出；之後的片先 commit 紅的判準。
    靜態邊界的尺是 `tests/lib/importGraph.ts`（TypeScript AST：`require`／`import =`／`import()` 都算、`import type` 與註解不算；有正反對照）。

## 3. 分派與送出（PR：`--transport`；產品碼 ≤180、測試 ≤200）

- [ ] 3.1 先寫單元：`[FE-R11-S01]`（從 raw `onMessage` 進、假驗證器四則都成功、chat 回 sentinel M、sink `toBe(M)` 恰好一次；靜態邊界 lint；型別測試 sink 不收 string）、`[FE-R11-S10]`（正式驗證器＋分派：缺 name／body 非字串不到 sink；空字串、全空白、HTML 的 name 與 body 照原值）、`[FE-R11-S02]`（四個非 ready 狀態各一 case → `toThrow(RealtimeError)`、socket.send 沒被叫、不補送；ready 但 socket.send 拋 → 原樣拋、不 append、不排隊）、`[FE-R11-S03]`（送出不 append、回聲後恰好一筆、`id === me` 不略過）
- [ ] 3.2 `RemoteWorld`：驗證後的 `ChatOut` 分派給 chat；注入 `send(chatIn)` port（包 `client.send(JSON.stringify(...))`）；用 context 暴露給 Canvas 外
- [ ] 3.3 突變：送出時 append → S03 紅；`id === selfId` 略過 → S03 紅；status 也餵 sink → S01 紅；sink 裡 trim → S10 紅；驗證失敗也餵 → S10 紅

## 4. 場景 generation（PR：`--scene-generation`；產品碼 ≤120、測試 ≤200）

- [ ] 4.1 先寫 jsdom／單元：`[FE-R11-S06]`（過場中不清、committed 的 wsScene 變了才清）、`[FE-R11-S07]`（握手被拒、自動回大廳的新連線 ready 後訊息還在，且新連線的 chat 進得來）、`[FE-R11-S08]`（保存舊 callback 引用、直接呼叫 → 不進）
- [ ] 4.2 綁 `SceneProvider.committed` 的 `wsScene`（不是 `RealtimeGenerationProvider.generation`）；`RemoteWorld` 把連線身分帶進 `onMessage`，不是目前連線的不收
- [ ] 4.3 突變：過場開始就清 → S07 紅；用連線換了當清空條件 → S07 紅；換場景不清 → S06 紅；拿掉連線身分判斷 → S08 紅

## 5. 收尾

- [ ] 5.1 `[FE-R11-S05]` 的 e2e 併入 `FE-K04` 的 `tests/e2e/scene-chat.mjs`，K04 的 tasks 正式引用 `[FE-R11-S05]`（這一層沒有可見面：**這條與 5.4 在 K04 的 e2e 綠之前不得打勾**）
- [ ] 5.2 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test` 的結果如實記在這裡
- [ ] 5.3 Google Sheet：`FE-R11` → On-going；Done 等 K04 的 e2e 綠了才打
- [ ] 5.4 封存（`archive/fe-r11-realtime-chat`）
