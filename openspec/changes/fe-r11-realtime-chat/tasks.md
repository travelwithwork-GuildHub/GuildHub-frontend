# `FE-R11` RealtimeChat —— 任務

每一片是一個 `feat/fe-r11-realtime-chat--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-r11-realtime-chat`；兩位外部審查）
- [x] 1.2 ADR：chat 只走 `RemoteWorld` 注入的窄介面、不 import client 的值（design D1；邊界狀態、證據照 `docs/adr/README.md`）
  - 2026-09-15：`docs/adr/0009-scene-chat-through-remoteworld-port.md`（已強制：eslint 的 client 邊界＋ S01／S05 靜態邊界＋ type fixtures）。

## 2. 記憶體與限制（PR：`--memory`；產品碼 ≤120、測試 ≤150）

- [x] 2.1 先寫單元：`[FE-R11-S04]`（101 → 100、最舊淘汰；2001 code point → 留 2000 標 truncated、2000 原值）、`[FE-R11-S05]` 的靜態邊界（sceneChat 模組不 import operations／transport、不出現 storage／indexedDB 字樣）、`[FE-R11-S09]`（`LIMITS.chatBody` 是 `{0, UNBOUNDED}`、來源、`ChatIn`／`ChatOut` 的 body 沒有長度 checks（自省）、2001 字與空字串通過）
- [x] 2.2 `src/realtime/sceneChat.ts`：純 reducer（append、筆數截斷 100、單則保留 2000 code point＋`truncated`、clear）；`limits.ts` 加 `chatBody` 與來源
  - 2026-09-15：`appendChat(log, ChatOut): ChatLog`＋`EMPTY_CHAT`（clear 就是回到它）、`CHAT_KEEP`／`CHAT_BODY_BUDGET`；`ws.ts` 補 `export type ChatOut`；
    `LIMITS.chatBody = {0, UNBOUNDED}`、`LIMIT_SOURCES.chatBody`；`tests/contract/boundaries.ts` 加 `pending`（WS 不走 REST 那張表）。
- [x] 2.3 突變：拿掉筆數截斷 → S04 紅；拿掉單則預算 → S04 紅；`max` 改 2000 或 `min` 改 1 → S09 紅；`ChatIn.body` 加 `.max(10_000_000)` → S09 自省紅
  - 2026-09-15 結果（`tests/scene-chat-memory.test.ts`，5 條）：全部如上紅；另外 用 UTF-16 `.length` 截 → S04 emoji 那條紅；原始碼出現 `sessionStorage` → S05 紅；import `@/api/operations` → S05 紅。
    執行紀錄貼在 PR #434 的留言（每一種：套用 → 跑 → checkout；含無突變的對照）。**流程上的誠實紀錄**：這一片的判準與實作是同一個 commit 進來的（`22033b0`），沒有「先紅再綠」的 commit 證據 —— 審查指出；之後的片先 commit 紅的判準。
    靜態邊界的尺是 `tests/lib/importGraph.ts`（TypeScript AST：`require`／`import =`／`import()` 都算、`import type` 與註解不算；有正反對照）。

## 3. 分派與送出（PR：`--transport`；產品碼 ≤180、測試 ≤300 —— 原估 200：從 `RemoteWorld` 的 raw 入口進要一份 FakeSocket harness，型別 fixture 的 runner 抽成 `tests/lib/typeFixtures.ts` 給 `path-params.test.ts` 共用）

- [x] 3.1 先寫單元：`[FE-R11-S01]`（從 raw `onMessage` 進、假驗證器四則都成功、chat 回 sentinel M、sink `toBe(M)` 恰好一次；靜態邊界 lint；型別測試 sink 不收 string）、`[FE-R11-S10]`（正式驗證器＋分派：缺 name／body 非字串不到 sink；空字串、全空白、HTML 的 name 與 body 照原值）、`[FE-R11-S02]`（四個非 ready 狀態各一 case → `toThrow(RealtimeError)`、socket.send 沒被叫、不補送；ready 但 socket.send 拋 → 原樣拋、不 append、不排隊）、`[FE-R11-S03]`（送出不 append、回聲後恰好一筆、`id === me` 不略過）
- [x] 3.2 `RemoteWorld`：驗證後的 `ChatOut` 分派給 chat；注入 `send(chatIn)` port（包 `client.send(JSON.stringify(...))`）；用 context 暴露給 Canvas 外
  - 2026-09-15：`sceneChatStore.ts`（`port.attach(sendRaw) → { receive, detach }`：連線身分綁在閉包、`current` 不是就不收；`send` 不 catch）、
    `SceneChatProvider.tsx`（`useSceneChat()` 給 K04；`useSceneChatPortIfProvided()` 給 `WorldCanvas` 當 prop 交給 `RemoteWorld` —— context 不跨 R3F）、
    `page.tsx` 掛 provider（`SceneProvider` 底下）。`send` 沒有連線時拋一般 `Error`（`RealtimeError` 在 client.ts，chat 不 import 它的值）。
    審查退回兩點：注入的 sender 改成**只收 `ChatIn`**（序列化回到 `RemoteWorld`，chat 模組不碰 raw frame 的任何一端，照 D1／3.2 的字面）；context 只放穩定的 store、`useSyncExternalStore` 在 `useSceneChat()` 裡（`WorldCanvas` 拿 port 不隨訊息重繪）。
- [x] 3.3 突變：送出時 append → S03 紅；`id === selfId` 略過 → S03 紅；status 也餵 sink → S01 紅；sink 裡 trim → S10 紅；驗證失敗也餵 → S10 紅
  - 2026-09-15 結果（`tests/scene-chat-transport.test.tsx`，6 條；S02 分兩條）：全部如上紅；另 送出 catch 後 setTimeout 補送 → S02 兩條紅；交複本不交原物件 → S01 紅。
    型別那段：`tests/type-fixtures/scene-chat-{sink,link}-string.ts` 各恰好一則 TS2345（`tests/lib/typeFixtures.ts` 是從 `path-params.test.ts` 抽出的共用 runner）。

## 4. 場景 generation（PR：`--scene-generation`；產品碼 ≤120、測試 ≤300 —— 原估 200：整條鏈的 harness（FakeSocket＋WorldCanvas）本身 100 行，審查後又加了同一 task 的競態與整合版 S08）

- [x] 4.1 先寫 jsdom／單元：`[FE-R11-S06]`（過場中不清、committed 的 wsScene 變了才清）、`[FE-R11-S07]`（握手被拒、自動回大廳的新連線 ready 後訊息還在，且新連線的 chat 進得來）、`[FE-R11-S08]`（保存舊 callback 引用、直接呼叫 → 不進）
- [x] 4.2 綁 `SceneProvider.committed` 的 `wsScene`（不是 `RealtimeGenerationProvider.generation`）；`RemoteWorld` 把連線身分帶進 `onMessage`，不是目前連線的不收
  - 2026-09-15：判準先 commit（S06 紅）再實作。`SceneChatProvider` 讀 `useScene()`：committed ＝ `transition === null ? scene : transition.from` 的 `wsScene`。
    第一版「committed 變了就 `clear()`」被審查抓到排程縫：新場景的第一則 chat 可能跟 `hello` 在同一個 task 裡到（React 還沒 render 成 committed），clear 會把它一起清掉 ——
    換 layout effect 也補不上（訊息在 render 之前就到了；判準先 commit 紅了它）。改成**按連線的場景歸檔**：`attach(send, wsScene)`，
    不是 committed 場景的訊息先放 `pending`，provider 在 layout effect 裡 `store.commit(wsScene)` 接手；那條連線 detach 時它的 pending 丟掉（失敗退回的房間之後再進不會看到舊的）。
    S08 兩個層次：整合（偷大廳 socket 的 message listener，committed 到房間後直接叫）＋ store 層。
- [x] 4.3 突變：過場開始就清 → S07 紅；用連線換了當清空條件 → S07 紅；換場景不清 → S06 紅；拿掉連線身分判斷 → S08 紅
  - 2026-09-15 結果（`tests/scene-chat-scene.test.tsx`，6 條）：commit 看 `scene` 不看 committed → S06＋S07 紅；不 commit → S06×2＋S08 紅；attach 就換場景 → S06＋S07×2 紅；拿掉 link 比對 → S08（store）紅；
    commit 時清掉而不是接手 pending → 同一 task 那條 S06 紅；detach 不丟 pending → S07（store）紅；`RemoteWorld` 不帶場景（全歸 lobby）→ S06×2＋S08 紅。
    **沒有判準區分的**：`useLayoutEffect` 換回 `useEffect` 不紅（歸檔之後時機不影響正確性；留 layout effect 只是少畫一幀舊訊息）。執行紀錄貼在 PR 留言。

## 5. 收尾

- [x] 5.1 `[FE-R11-S05]` 的 e2e 併入 `FE-K04` 的 `tests/e2e/scene-chat.mjs`，K04 的 tasks 正式引用 `[FE-R11-S05]`（這一層沒有可見面：**這條與 5.4 在 K04 的 e2e 綠之前不得打勾**）
  - 2026-09-16：K04 的 `scene-chat.mjs` S10 段標 `[FE-R11-S05]`（#440；K04 tasks 6.1 引用）：reload 後只回 hello＋snapshot、38 個請求都在 allowlist 內。本機對 `next start` 綠；`e2e-main` 在 ubuntu runner 上 `scene-chat` 121 秒綠（#446）。K04 已封存（#448）。
- [x] 5.2 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test` 的結果如實記在這裡
  - 2026-09-16（main `38213f3`）：typecheck 過；eslint 乾淨；`pnpm test` 第一次 148 檔 **9 failed**／1116 passed／7 skipped —— 8 個是 lint／tsc 子行程的逾時（機器 load 8、三個 session 同時在跑；單檔重跑 130～334 秒才跑完），
    1 個是 `deploy-build-gate` S05 的 `next build` 撞到 `typecheck-negative` 同時放在 `src/` 的探針檔（平行跑的隔離缺口，跟 R11 無關、記著）。把 9 檔單獨重跑：全部通過（103／103）。
- [x] 5.3 Google Sheet：`FE-R11` → On-going；Done 等 K04 的 e2e 綠了才打
  - 2026-09-16：On-going（#434 後）→ Done（K04 e2e 在 runner 上綠、K04 封存後）。
- [x] 5.4 封存（`archive/fe-r11-realtime-chat`）
  - 2026-09-16：這個 PR 就是那個勾勾；封存接著開。
