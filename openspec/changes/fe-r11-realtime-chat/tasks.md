# `FE-R11` RealtimeChat —— 任務

每一片是一個 `feat/fe-r11-realtime-chat--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-r11-realtime-chat`；兩位外部審查）
- [ ] 1.2 ADR：chat 只走 `RemoteWorld` 注入的窄介面、不 import client 的值（design D1；邊界狀態、證據照 `docs/adr/README.md`）

## 2. 記憶體與限制（PR：`--memory`；產品碼 ≤120、測試 ≤150）

- [ ] 2.1 先寫單元：`[FE-R11-S04]`（101 → 100、最舊淘汰）、`[FE-R11-S09]`（`LIMITS.chatBody`、來源、2001 字通過 `ChatIn`）
- [ ] 2.2 `src/realtime/sceneChat.ts`：純 reducer（append、截斷 100、clear）；`limits.ts` 加 `chatBody` 與來源
- [ ] 2.3 突變：拿掉截斷 → S04 紅；`max` 改 2000 → S09 紅

## 3. 分派與送出（PR：`--transport`；產品碼 ≤180、測試 ≤200）

- [ ] 3.1 先寫單元：`[FE-R11-S01]`（只有 chat 進；沒有 raw）、`[FE-R11-S02]`（沒 ready 拋錯、不排隊、不補送）、`[FE-R11-S03]`（送出不 append、回聲後恰好一筆、`id === me` 不略過）
- [ ] 3.2 `RemoteWorld`：驗證後的 `ChatOut` 分派給 chat；注入 `send(chatIn)` port（包 `client.send(JSON.stringify(...))`）；用 context 暴露給 Canvas 外
- [ ] 3.3 突變：送出時 append → S03 紅；`id === selfId` 略過 → S03 紅；status 也餵 chat → S01 紅

## 4. 場景 generation（PR：`--scene-generation`；產品碼 ≤120、測試 ≤200）

- [ ] 4.1 先寫 jsdom／單元：`[FE-R11-S06]`（過場中不清、committed 才清）、`[FE-R11-S07]`（握手被拒回大廳訊息還在）、`[FE-R11-S08]`（舊 generation 晚到不進）
- [ ] 4.2 綁 `SceneProvider.committed` 與 generation；callback 捕捉 generation
- [ ] 4.3 突變：過場開始就清 → S07 紅；拿掉 generation 判斷 → S08 紅

## 5. 收尾

- [ ] 5.1 `[FE-R11-S05]` 的 e2e 併入 `FE-K04` 的 `tests/e2e/scene-chat.mjs`（這一層沒有可見面，先在這裡記下：K04 合併前 R11 不封存）
- [ ] 5.2 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test` 的結果如實記在這裡
- [ ] 5.3 Google Sheet：`FE-R11` → On-going；Done 等 K04 的 e2e 綠了才打
- [ ] 5.4 封存（`archive/fe-r11-realtime-chat`）
