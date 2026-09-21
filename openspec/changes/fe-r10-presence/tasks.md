## 1. 規格閘門

- [x] 1.1 規格已在 PR 上談定並合併進 `main`；以 `openspec validate fe-r10-presence --strict` 通過及 main 上存在本 change 為驗證，未完成前不得寫產品程式碼
      —— PR #293 於 2026-09-11T17:24Z 合併；`validate --strict` → `Change 'fe-r10-presence' is valid`；
      `check-pr-branch.sh main feat/fe-r10-presence--status` → `✓ 實作階段：fe-r10-presence（規格已在 main 上）`

## 2. 遠端狀態文字

- [x] 2.1 先為 `FE-R10-S01`／`S02` 寫失敗測試，證明 snapshot 與 presence.join 的 `st` 目前會被丟掉
      —— 實作前 R10 的 7 條測試是 **6 紅 1 綠**（#405 審查後更正；原文「六條全紅」不精確）。
      S01／S02 紅在 `st` 被丟掉
- [x] 2.2 將狀態文字納入低頻 roster identity，讓 `FE-R10-S01`／`S02` 通過，並確認既有 `FE-R07`／`FE-R08` 測試仍綠
      —— `RemoteIdentity.st`；`remote-players`（22）與 `remote-players-render` 全綠。突變「`identityOf` 丟掉 st」→ S01／S02 紅
- [x] 2.3 先為 `FE-R10-S03`／`S04` 寫失敗測試，涵蓋指定玩家更新、相同文字不重繪、未知 id 與自己的 id 不建立鬼影
      —— ⚠️ 不是每一條都能先紅：「相同文字不換名單」實作前本來就綠（舊程式忽略 `status`），它守的是實作後不退化，
      靠突變「相同文字也換 Map」證明；S04 實作前紅在最後的 `st` 斷言，「不建立鬼影」那半由突變證明
- [x] 2.4 處理已驗證的 `status` 訊息並把回傳語意改為低頻 Presence view 是否改變；以 `FE-R10-S03`／`S04` 通過及 `pos` 仍不觸發 roster 重繪驗證
      —— `FE-R07-S01` 仍綠（pos 回 false、名單物件不換）。突變：未知 id 建立新的人 → S04 紅；
      相同文字也換 Map → S03 紅；改到所有人 → S03 紅；改了卻回 false → S03 紅。
      #405 合併後審查補的判準（`fix/fe-r10-presence--status-tests`）：就地改舊物件不換 Map、換 Map 但沿用被改過的物件、
      丟掉 name／av、把 name 改掉、status 做 trim、截成 2 字 → S03 紅；未知 id 清空所有人樣本 → S04 紅；
      snapshot／join 做 trim → S01／S02 紅（改用 12 個 code point、前後有空白的文字）
- [x] 2.5 先為 `FE-R10-S05`／`S06` 寫清理測試，直接驗證 leave 與新 snapshot 後舊狀態不可再讀
      —— S05 直接斷言 leave 之後名單裡沒有他（不靠「再加入之後是空白」，`FE-R08-S11` 的教訓）
- [x] 2.6 完成 leave／snapshot 的狀態清理，讓 `FE-R10-S05`／`S06` 通過，並確認其他玩家的 identity 與 motion 不受影響
      —— 狀態放在名單項目裡，leave 移除項目即清掉（design D1）。突變：snapshot 合併舊 st → S06 紅；
      leave 不移除名單項目 → S05 與 `FE-R07-S04` 紅；leave 連帶換掉其他人的身分物件 → S05 紅
- [x] 2.7 先為 `FE-R10-S11` 寫失敗測試，證明目前重複 join 會忽略已在名單的 id 的 payload；改為以新 `st` 更新該 id 的 identity，同時驗證不新增名單筆數、不改變在線人數，且其他玩家不受影響
      —— 實作前紅在「狀態真的變了 —— 呼叫端要重繪」（`st` 被忽略）。只刷新 `st`；`name`／`av` 規格沒寫，維持原行為。
      突變：重複 join 忽略 st → S11 紅；內容相同也換 Map → S11 紅；
      套用 #405 審查的突變類型：就地改舊物件不換 Map、換 Map 但沿用被改過的物件、刷新時丟掉 name／av、刷新時 trim → S11 紅。
      「刷新時改用 join 帶來的 name」刻意不釘（規格只要求 `st`，測試讓 payload 的 name／av 與原本相同）

## 3. 目前 scene 的在線人數

- [x] 3.1 先為 `FE-R10-S07`／`S08` 寫失敗測試，證明初始人數包含自己，新 id 會增加、同一 id 的重複 join 不會增加，且只有有效 leave 會減少人數
      —— `tests/online-count.test.tsx` 掛整個 `WorldCanvas`，`RemoteWorld → RealtimeClient → WebSocket` 是正式碼（只換全域 WebSocket）；
      實作前三條都紅在「畫面上沒有人數」。推導另有資料層測試（不掛 Scenario ID：THEN 是「顯示的」人數）
- [x] 3.2 以 snapshot-ready 與遠端 roster 推導 distinct player id 數 `roster.size + 1`，讓 `FE-R10-S07`／`S08` 通過，不新增獨立累加器
      —— `onlineCountOf`／`resetRemotePlayers`。突變：少了 +1、未就緒回 0、snapshot 沒設 ready、join 也設 ready → 紅
- [x] 3.3 先為 `FE-R10-S09` 寫失敗測試，涵蓋卸載、換連線以及新 snapshot 到達前不顯示任何人數數字
      —— 換場景（`FE-V01` 的 key 重掛）→ 等舊 close（`FE-V01-S18`）→ hello → 早到的 join → snapshot，每一步斷言畫面上沒有任何「N 人在線」。
      slice 2 審查後補：①「同一個元件換連線」路徑（`generation` 加一，state 沿用、不重掛）→ hello → 早到的 join，
      突變「cleanup 不清 ready 但直接通知 null」只有這條會紅；②「沒有人數」改成人數元素不存在，且「在線」前後都沒有數字，
      突變「null 時渲染『在線 0 人』」→ S07／S09 紅
- [x] 3.4 以穩定 callback 把低頻人數送到 Canvas 外的 DOM 顯示，讓 `FE-R10-S09` 通過，並驗證單純更新人數不會建立新的 WebSocket client generation
      —— `WorldCanvas` 直接傳 `useState` setter；`S08` 斷言整段只有一條 WebSocket。突變：inline 箭頭函式、cleanup 不通知、
      cleanup 不重設 ready、名單變動不通知、不渲染、顯示遠端數、多算十個人 → 紅。畫面過 ui-ux-pro-max（ux／react），
      截圖（dev server ＋ 偽造 REST／`/ws`）抓到文案在 800×600 被首次進入提示卡壓住 → 縮短並在窄於 md 時放左下角；合併後量到窄視窗跟 `FE-K04` 的聊天區（固定左下角）重疊，改回一律左上角

## 4. 雙瀏覽器姓名驗收

- [x] 4.1 確認 `FE-W08` 的姓名渲染能力已合併；以 main 上的規格與產品碼能在遠端角色旁顯示 `RemoteIdentity.name` 為證據，未滿足時本節維持未完成
      —— **已解除阻塞**：`c9d3835`（實作 #523）與 `e23f5b8`（archive #525）都在 main，`openspec/specs/name-tag/spec.md`
      與 `src/world/NameTags.tsx`／`src/world/player/nameTag.ts` 在 main 上。牌子的文字**就是**協定的 `name`
      （不 trim、不改寫、**沒有替代字**），走的是 `RemoteWorld` 的 `onRosterChange` → 同一份 `RemoteIdentity`。
      在本 change 的建置上重跑 W08 自己的真瀏覽器判準 `tests/e2e/name-tags.mjs` → **全部通過**（渲染能力沒有退化）
- [x] 4.2 為 `FE-R10-S10` 建立兩個隔離 cookie 的 browser context，測試只啟動並連到當次 loopback 前端、可拋棄後端與測試資料庫，不使用團隊共用環境
      —— `tests/e2e/two-browsers-names.mjs`。兩個 `browser.newContext()`（不是兩個分頁），各自打同源的
      `POST /api/login` 拿自己的簽章 session cookie。後端是**本地的**：`NEXT_PUBLIC_DATA_ADAPTER=internal` 的
      Route Handlers ＋ 即時層替身（`scripts/realtime-stub.ts`，`FE-O03`，照 `protocol.py` 寫、解 cookie 後**查名片表**才知道名字），
      資料庫是**只為這次建、跑完可以直接 drop** 的 `guildhub_r10_s10`（`scripts/db.mjs reset --init` 的三道守門：
      非 loopback 不連、沒有 `_guildhub_disposable` 標記不動、有表就不准 `--init`）。
      `assertLoopback` ＋ `guardLoopback` 保證整支腳本一個請求都沒有打出本機。**沒有碰任何團隊共用環境。**
      ⚠️ 名字帶**這次執行才產生的亂數尾碼**：寫死的名字會在殘留的資料庫上假綠
- [x] 4.3 跑 `FE-R10-S10`：兩個瀏覽器各建立不同姓名並進入同一 scene，雙方都在對方角色旁看到正確姓名；保存可重跑的 E2E 與驗證輸出
      —— 12 條全綠（輸出見 PR）。每一邊各驗五件事：看得到對方的名字牌、不是共用 fallback（`訪客`／`未命名`／`Guest`…）、
      沒有看到自己的名字、**恰有一塊**牌子、而且那塊牌子**真的看得見**（`visibility: visible`、176×28 px、整塊在視窗內）
      —— 「在 DOM 裡」不算數。截圖 `docs/evidence/fe-r10/two-browsers-{jia,yi}.png`：兩邊都同時拍到對方的名字牌與「2 人在線」。
      ⚠️ **另外補了一條 `assertOwnSession`**：跑完之後用該 context 當下的 cookie 打 `GET /api/me`，回來的名片要是自己。
      理由是突變量到的 —— 見 5.2 的第四個突變

## 5. 收尾驗證

- [x] 5.1 執行 lint、typecheck、完整單元測試與適用的 integration／E2E；記錄通過數量，並逐條對照 `FE-R10-S01`–`S11` 都有非恆真的證據
      —— `eslint` exit 0、`tsc --noEmit` exit 0。全套 `vitest run`：**1313 綠、7 skip、16 紅**（174 檔中 8 檔）——
      那 16 條是這台 Windows 開發機的既有基線（`contract-drift`、`leak-coverage`、`typecheck-negative`、`design-tokens`、
      `dom-token-scan`、`deploy-build-gate`、`rehearsal-report`、`scene-chat-memory`；路徑分隔符與 CRLF，CI 的 Linux 上是綠的），
      **與本分支無關**：本分支一行產品碼都沒有改（diff 只有測試、tasks 與證據）。R10 直接相關的兩個檔單獨跑 **31 綠**。
      真瀏覽器：`tests/e2e/two-browsers-names.mjs` **12 綠**、`tests/e2e/name-tags.mjs`（`FE-W08` 的渲染能力）**全綠**。
      `tests/**/*.itest.ts`（3 個）**不適用**：它們要真的 Python 後端在 `:8000`，而且沒有任何一條掛 `FE-R10` 的 Scenario ID
      —— 那是 `FE-R01`／`R07`／`R08` 的 live 檢查，不在本 change 的義務內（這裡寫出來，不是靜悄悄跳過）。

      | Scenario | 非恆真的證據 |
      |---|---|
      | `S01`／`S02` | `remote-players.test.ts`；突變：`snapshot`／`join` 做 trim、`identityOf` 丟掉 `st` → 紅 |
      | `S03` | `remote-players.test.ts`（3 處）；**本節突變 6**：`status` 一律不更新 → 紅 |
      | `S04` | `remote-players.test.ts`；突變：未知 id 建立新的人、清空所有人樣本 → 紅 |
      | `S05`／`S06` | `remote-players.test.ts`；突變：`leave` 不移除名單項目、`snapshot` 合併舊 `st` → 紅 |
      | `S07`／`S08`／`S09` | `online-count.test.tsx`（掛整個 `WorldCanvas`，`RemoteWorld → RealtimeClient → WebSocket` 是正式碼）；**本節突變 5** → 8 條紅 |
      | `S10` | `tests/e2e/two-browsers-names.mjs`（真瀏覽器、兩個隔離 cookie、本地後端、可拋棄資料庫）；**本節突變 1～4** |
      | `S11` | `remote-players.test.ts`（2 處）；**本節突變 7**：重複 join 不刷新 `st` → 紅 |
- [x] 5.2 對狀態更新、在線人數與姓名驗收各做至少一個反向突變，確認對應測試真的變紅；還原後重跑相關測試為綠
      —— 七個突變，每一個都單獨做、量完立刻 `git checkout` 還原（`S10` 那四個各重 build 一次）：

      | # | 面向 | 突變 | 結果 |
      |---|---|---|---|
      | 1 | 姓名 | `identityOf` 的 `name: p.name` → `name: ''` | `S10` **4 紅**（兩邊都「畫面上的牌子：[]」） |
      | 2 | 姓名 | `identityOf` 的 `name: p.name` → `name: '訪客'`（重演 `BE-G02` 那一整片「訪客」） | `S10` **4 紅**，其中兩條正是「有 fallback 名字」 |
      | 3 | 姓名 | `snapshot` 的 `if (p.id === selfId) continue` → `if (false) continue`（自己也進名單） | `S10` **4 紅**（「在牌子上看到自己的名字」「有 2 塊名字牌」） |
      | 4 | 姓名（**判準本身**） | 兩個 context 改成同一個 context 的兩個分頁 | ⚠️ **原本全部照樣綠** —— 見下 |
      | 5 | 在線人數 | `onlineCountOf` 的 `roster.size + 1` → `roster.size` | `remote-players`＋`online-count` **8 紅** |
      | 6 | 狀態更新 | `status` 的 `if (current.st === message.text) return false` → `if (true) return false` | `[FE-R10-S03]` **紅** |
      | 7 | 狀態更新 | 重複 join 的 `} else if (current.st !== p.st) {` → `} else if (false) {` | `[FE-R10-S11]` **紅** |

      ⚠️⚠️ **突變 4 抓到的是真的漏洞，要寫清楚。** 規格明文「MUST NOT 使用共用 cookie 的兩個普通分頁冒充兩個登入身分」，
      而腳本原本的 12 條判準**分不出來** —— 把兩個 context 換成同一個 context 的兩個分頁，**全部照樣綠**。
      原因：第二次登入雖然把 cookie 蓋掉了，第一個分頁那條 WS 的身分是**握手當下**決定的、之後不會變，
      所以「互相看得見對方的名字」在「兩個身分」與「一個身分加一條過期的連線」底下長得一模一樣。
      補法：`assertOwnSession` —— 用該 context **當下**的 cookie 打 `GET /api/me`，回來的名片要是自己。
      補完之後同一個突變 → **紅**（先登入的那一邊拿到後登入那個人的名片），正常路徑仍然 **12 綠**。
      「兩個隔離 cookie」這個前提從此是承重的，不是註解裡的一句話。

      還原後重跑：`git status` 對 `src/` 沒有任何改動；`remote-players`＋`online-count` **31 綠**、`two-browsers-names.mjs` **12 綠**。
