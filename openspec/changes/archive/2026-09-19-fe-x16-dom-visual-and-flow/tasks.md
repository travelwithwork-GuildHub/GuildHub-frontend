# tasks：`fe-x16-dom-visual-and-flow`

五片 `feat/fe-x16-dom-visual-and-flow--<slice>` PR（每片產品碼 ≤250、手寫 ≤800）：`--tokens` → `--text` → `--shell` → `--flow` → `--surfaces`。
（原本四片；`--tokens` 做到一半量出 274 行 —— 60 個呼叫端改成 `{...PRIMARY}` 就吃掉 60 行，文字五級套到表面另外切一片。）
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查 → **前後截圖貼 PR**（1280×720：
`/login`、訪客提示、看板清單、看板詳情（owner 招募中）、收件匣對話；由 review 對，不進 CI）。
看得見的 tsx 動之前叫 `ui-ux-pro-max`（`--domain ux`／`--stack nextjs`），它是建議不是規格。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-x16-dom-visual-and-flow` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-x16-dom-visual-and-flow --strict` 通過且 PR 已合併
- [x] 1.2 `docs/WBS.md` 的 `FE-X16` 已在 governance #514 加好；ADR `docs/adr/0011` 隨這個 spec PR 進 main（Status: Proposed → 實作合併後改 Accepted、邊界狀態改「已強制」）
- [x] 1.3 基線 commit：合併這份規格時 `main` 的 SHA 寫在這裡：`16b12d2`（`S20` 的量對它做）

## 2. `--tokens`：token 七類、三級控制項、掃描擴到整個 `src/`（Requirement〈每一類視覺 token 單一來源〉〈控制項分三級〉〈動態〉〈預算〉）

- [x] 2.1 判準先紅：`tests/e2e/dom-visual.mjs` 的 `S02`（font-family 一致、含繁中家族、零字型請求）、
      `S10`（三級可區分、每一個按鈕的焦點環與 hover）、`S11`（高度 `≥ 40px`）、`S12`（每一個按鈕的時長相等、reduce → `0s`、面板不動寬高）；
      jsdom 的 `S01`（掃描 `src/**`、六段假輸入各被抓、豁免要理由且有上限）。實作前 79 條紅、實作後 139 綠
- [x] 2.2 `globals.css`：`--font-sans`（design D1）、圓角兩級、陰影兩級、`--motion` 與 `prefers-reduced-motion: reduce → 0ms`（transition 與 animation 都歸零）、
      `scrim`、`focus`、accent 降到白字 `≥ 4.5:1`（L 0.58 → 0.52：4.35 → 5.58:1）、`ink-muted` 對兩個 surface 都 `≥ 4.5:1`（L 0.52 原本就 5.21／5.53:1，不動）；字級五級＋行高。
      高度下限、過渡、焦點環放 `@layer base`（每一個 `<button>`／輸入框都吃到，卡片與對話列不走常數也在內）
- [x] 2.3 `controls.ts`：`PRIMARY`／`SECONDARY`／`TERTIARY`／`FIELD` 改成物件常數（`{ className, 'data-tier' }`，`{...PRIMARY}` 展開；`withClass()` 加版面 class）、hover 態；
      60 個呼叫端改套法；`IdentityBadge` 的名字、訪客提示的「先四處看看」改 `TERTIARY`；標題列加 `data-testid="app-header"`（`S19` 也要）
- [x] 2.4 新 `domTokenScan.ts`（`colorScan.ts` 留給 `src/world`）：範圍 `src/world/**` → `src/**`（token 定義檔豁免）；抓 `rgb(`／`hsl(`／`oklch(`／`color-mix(`、`font-family`、
      任意值 class（`bg-[`…`z-[`）、`data-tier=`／`data-text=` 字面值；`dom-token-allow: <理由>` 沒理由算違規；豁免上限寫在判準
- [x] 2.5 效能：對 1.3 的基線量 `/world` client JS 與 CSS（gzip）：JS 221,412 → 221,596 B gz（+184）、CSS 5,768 → 6,103 B gz（+335）；零字型請求（`S02`）

## 2b. `--text`：文字五級套到表面（Requirement〈文字有五級層次〉）

- [x] 2b.1 判準先紅：e2e `S03`（六個表面各自必備的層級逐一斷言、層級間比「高一級的最小 vs 低一級的最大」、內文 16px／1.5、說明 13px、面板標題 ≥ 1.25×、頁面標題 ≥ 1.5×）、
      `S04`（背景從元素自己往上**真的合成**到第一個不透明層；顏色空字串或 `CSS.supports` 不認就紅；整趟至少量到一個**有字的** `role="alert"` —— 多一個表面「/login（送出失敗）」空名字送出）；
      量的集合含 `p`／`[data-text]`／alert 底下自己帶文字的後代（審查：alert 裡換了顏色的 `span` 不能靠外層過關）；必備層級由每個表面自己宣告（人才清單／詳情跟案件同一組 —— 抓到 `TalentCard` 的名字沒有 heading）；
      jsdom 的定義檔 AST 測試擴到 `data-text`（四個 export 各一值、標 `TextStyle`、無 computed 鍵）。實作前 e2e 16 紅、jsdom 1 紅
- [x] 2b.2 `controls.ts` 加 `DISPLAY`／`TITLE`／`HEADING`／`CAPTION`（`TextStyle`，帶 `data-text`）；h1 三處 → `DISPLAY`、`text-title` 十四處 → `TITLE`、卡片標題與收件匣對話的名字 → `HEADING`、
      `text-caption` 42 處 → `CAPTION`（`OnlineCount` 不動：別人的檔）；`body` 的字級與行高從 `--text-body` 繼承。
      兩個表面原本沒有內文的 `p`：`/login` 加一句說這裡是什麼、名片的自我介紹從 `dd` 直放改成 `dd > p`（`data-testid` 跟著 `p`）；alert 文字（danger 對 surface）4.84:1

## 3. `--shell`：`PanelShell` 的解剖（Requirement〈表面有三層〉〈每一個阻斷式面板的解剖一致〉）

- [x] 3.1 判準先紅：e2e `tests/e2e/dom-shell.mjs`（獨立一支；`S05` 底 alpha `= 1`、邊界對 `surface` `3:1`、陰影存在且 alpha `> 0`、世界區上面板以外沒有 bg alpha > 0 且蓋住 ≥ 90% 的元素；
      `S06` 三個視窗的遮罩 `[0.3, 0.6]`、蓋滿被擋那一層、中心點命中、面板的 body 與 overlay `inert`（世界區沒有 inert 屬性：用中心點命中代替）、關了不在、子畫面沒有；
      `S07` 1280×720 與 1024×640 各開五個面板：第一個區塊是 `header` 且有 heading、關閉是最後一個可聚焦、返回第一個（清單／名片沒有）、五個關閉 rect ±1px、同寬；
      `S08` 一頁 20 筆溢出（分頁是換頁不是累加，「30 筆」在這個模型裡就是一頁滿的）：面板高 ≤ 視窗、內容區有在捲的容器、文件不捲、標題列往上沒有任何會捲的容器、捲到底標題列與關閉 rect 不變）；
      jsdom `tests/panel-shell-anatomy.test.tsx`（`S07` 結構半邊＋`PanelDialog` 的遮罩層／inert／沒有殼時原地渲染）。實作前 e2e 33 紅
- [x] 3.2 `PanelShell`：`back?: { label, onBack }`（返回在標題列最前，關閉最後，標題 `flex-1 truncate`）；標題列在內容區**外**、永不 inert；內容區容器 `${testId}-content`（relative）裡：body 自己 `overflow-y-auto`、
      子畫面 overlay 只蓋內容區並自帶不透明底；確認視窗走新的 `src/panel/PanelDialog.tsx`（context ＋ portal 到內容區容器：`scrim` 層 ＋ 殼把 body／overlay 標 `inert`；沒有殼就原地渲染）；
      面板 `shadow-panel rounded-panel w-panel`（新 token `--container-panel`／`--container-dialog`）
- [x] 3.3 `ProjectDetail`／`TalentDetail` 拿掉自己的返回鈕與 header（`labels` prop 一起拿掉），`BoardPanel` 給 `ListPanel` 新的 `subScreen={{ title, back }}`（標題換成「案件」／「人才」，案名／人名留在內容區當 `HEADING`）；
      收件匣的返回 handler 提到 `OpenInboxPanel`（殼的返回鈕與對話的 Escape 同一條），標題換「對話」；`TalentFacts` 的 `leading` 槽拿掉、名字 `HEADING`。既有測試改成在面板層找「返回」（焦點回卡片／回那一列的斷言不動、全綠）
- [x] 3.4 房間密碼視窗：外面包一層 `world-scrim`（對世界區、`layer('modal')`、flex 置中取代 translate），視窗 `shadow-dialog rounded-panel w-dialog`；結案確認與放棄修改確認包 `<PanelDialog>`（名片的確認從 overlay 槽改成內容區的孩子）

## 4. `--flow`：協調者、提示讓位、聊天收起、網址（Requirement〈同一時間只有一個阻斷式面板〉）

（做到一半量出 413 行 —— 拆成兩片：**`--flow`**＝協調者＋看板＋收件匣（`S13` 看板↔收件匣與寄信那條路、`S17` 接受的那一半、`S21` 前兩段、`S22`）；
**`--flow-yield`**＝名片 provider、讓位規則（`canYield`：送出中、dirty）、拒絕的 `role="status"` 回饋、訪客提示、聊天收起、換角色（`S13` 名片兩段、`S14`、`S15`、`S16`、`S17` 拒絕的那一半、`S18`、`S21` 末段）。）

- [x] 4.1 判準先紅（jsdom）—— `--flow` 做完 `S13`（看板↔收件匣、寄信）／`S17`（接受）／`S21`（前兩段；`Suspense` 延後 commit 的殼、provider 在 commit 前卸載）／`S22`（`tests/dom-visual-flow.test.tsx`，5 條）；其餘在 `--flow-yield`：`S13`（看板→收件匣→名片→收件匣、寄信那條路、焦點不經開啟者與 `body`、網址退）、`S14`（成軍送出中拒絕＋`role="status"`＋焦點留在按鈕；回來後接受；名片 dirty 拒絕且不出確認）、
      `S15`（提示讓位／回來／關掉不回來／走完不回來）、`S16`（收起顯示 3、不持鎖；展開有 3 則在底部；往上讀時收起再展開位置不動＋回到最新）、
      `S17`（下一頁：接受重開；送出中拒絕 → `replaceState` 一次、`pushState` 零次、再上一頁回原本那一筆）、`S18`（彈出層：成功就關、被拒也因焦點離開而關）、`S21`（同一個 handler 連續兩次 `requestOpen`：兩個 `true`、只掛最後一個；已登記且送出中 → `false`）、`S22`（殼延後 commit 時別人取代 → 舊的不掛；provider 卸載後 `useBlockingPanelOpen() === false`、提示不被壓；Strict Mode 殼掛→卸→掛後登記恰好一筆且 `active` 仍指向它）；`S21` 加：關掉後鎖放開、被取代的請求沒留鎖／opener。（`--flow-yield` 做完：`tests/dom-visual-flow.test.tsx` 10 條；`S14` 多量一段發案表單 dirty —— 突變抓到沒量）
- [x] 4.2 `src/panel/BlockingPanelCoordinator.tsx`（D3；`role="status"` 回饋在 `--flow-yield`）：持有 `active: id | null`（state＋同步鏡像 ref）；`requestOpen(id)` 同步決定（空／未登記 → 取代；已登記且 `canYield()` → `onYield()` 後取代；否則 `false`＋`role="status"` 在 `toast` 層）；`requestClose(id)`；
      `register({ id, canYield, onYield })` 回一筆有身分的登記、cleanup 只刪自己那筆、**不動 `active`**；`requestClose(id)` compare-and-clear；`useActivePanel()`、`useBlockingPanelOpen()`（＝ `active` 指向的殼已登記）。`PanelShell` 掛載時登記（新 prop `panel: { id, canYield, onYield }`）；**鎖跟著殼的登記走**：持有者仍是 `ListPanelProvider`（`InteractionProvider` 在它那一層；R3F test renderer 掛不了 DOM 的殼，`list-panel-input-lock` 用同 id 的登記當殼的替身），effect 的條件是「殼已登記且是我」—— 沒掛成的請求不留鎖；深連結在 state 初始化時就 `requestOpen`（子 effect 先跑，晚了 `WorldUrlSync` 會先把網址退掉）
- [x] 4.3 三個 provider（`--flow` 做完看板與收件匣；名片在 `--flow-yield`）：`open` 改成 `useActivePanel() === 自己的 id`（不再 `useState(open)`）；`openX()` → `requestOpen()`、`closePanel()` → `requestClose()`；`onYield` 走既有關閉的副作用但**不還焦點**（三個 provider 都有還焦點的路：名片的 effect、看板的 `release()`、收件匣的 `closePanel()`，全部要有讓位旗標）；opener 與重取世代改在殼掛載後才記；`FE-K01-S02` 的「看板關」改走協調者；
      `PanelUrlSync.restore` 經過 `requestOpen()`，被拒 → `replaceState` 目前這一筆回實際狀態（不 push）
- [x] 4.4 `FirstEntryNotice` 讀 `useBlockingPanelOpen()`（不卸載它的 `dismissed`／`alreadyDone`：用 `hidden`，不是 return null）；`SceneChatHud` 收成一行＋捲動位置還原（D5）；`AvatarPicker` 成功開面板時關、被拒時照既有焦點離開規則關（做完量到：兩條路都是「面板取焦 → 焦點移出 → 關」，另外讀協調者的那段拔掉判準也不紅 —— 不留）
- [x] 4.5 e2e：`S13`（記 `focusin` 序列）／`S15`／`S16`／`S17` 在真瀏覽器各走一次（獨立一支 `tests/e2e/dom-flow.mjs`，不塞進 524 條的 `dom-visual.mjs`；`--flow` 做完 `S13` 兩條路、`S17` 下一頁、`S21` 關掉後走得動：13 綠；`--flow-yield` 加 `S16`（收成一行、真的 `scrollTop`）、`S15`（訪客 context）、`S14`（`page.route` 壓著成軍回應；status 要是按了之後**新出現**的那則 —— 清單的空狀態也是 `role="status"`）：22 綠）
- [x] 4.6 ADR 0011 改 Accepted、邊界狀態「已強制」、證據補測試路徑

## 5. `--surfaces`：每個操作區套上三級與層次、標題列（Requirement〈控制項分三級〉〈標題列是固定的導覽〉）

- [x] 5.1（`tests/dom-visual-surfaces.test.tsx`：S09 八條逐操作區數 `data-tier="primary"`、S19 兩條結構；e2e `tests/e2e/dom-surfaces.mjs`：三種身分 rect、面板不相交，18 綠；第一版實作就被抓到房間的標題列高 2px）判準先紅（jsdom）：`S09` 逐操作區數 `data-tier="primary"`（`≤ 1`）且是列出的那一個、零個的狀態真的零個；`S19` 標題列順序與 `≤ 5`；e2e `S19` 三種身分的 rect 相同、面板 rect 與整個標題列 rect 交集為 0
- [x] 5.2（金鑰表單升主要；後兩個 h2 降 `HEADING`）`/login`：三個表單各自一個主要（暱稱：進入世界；金鑰：用金鑰回來；帳號：登入／註冊）；版面順序與標題層次讓暱稱那條領先（D4）
- [x] 5.3（兩顆的層級跟 `done` 走）金鑰交接：複製前「複製鑰匙」主要、複製後「進入世界」主要、「複製鑰匙」退成次要；訪客提示「先四處看看」文字級
- [x] 5.4（「結案」在密碼呈現中退次要、否則主要；「複製密碼」主要；`SendMessageButton` 主要）案件詳情：owner 成軍／結案主要、送出中零個；密碼呈現「複製密碼」主要、「寄給隊員」次要；非 owner「私訊發案者」主要；結案確認「取消」主要
- [x] 5.5（名片「儲存」加 `|| !dirty`；聊天送出 `SECONDARY`；標題列抽成 `AppHeader`、入口 `ml-auto` 一組、`ReturnToHallButton` 拿掉 `min-h-11`）收件匣對話「送出」主要；名片「儲存」主要（沒改 `disabled`）；**場景聊天框「送出」次要**（非阻斷的表面不搶）；標題列（品牌左、其餘右、`≤ 5`）
- [x] 5.6（`docs/evidence/fe-x16/surfaces-{before,after}/` 各五張）前後截圖五張貼 PR；`ui-ux-pro-max` 的 pre-delivery checklist 逐條對
- [x] 5.7（同 lockfile／Node、`NEXT_PUBLIC_REALTIME_ADAPTER=guildhub`：JS 221,402 → 223,101 B gz（**+1,699**）、CSS 5,768 → 6,403 B gz（**+635**）；請求清單 20 筆 multiset 相同、零 font／image）`S20` 裁決：對 1.3 的基線量一次（JS `≤ +4 KB`、CSS `≤ +6 KB` gzip；請求清單：全新 context、停用快取、`(resourceType, 去 hash 路徑)` multiset 相同）

## 6. 突變（驗收條件：拔掉防禦要紅）

- [x] 6.1（`--tasks`：拿掉三個繁中家族 → `S02` 18 條紅（每個表面一條＋整趟）；假輸入六段是 `tests/dom-token-scan.test.ts` 自己的負向 fixture，掃不到那條就紅）拿掉 `--font-sans` 的繁中家族 → `S02` 紅；把某個表面的內文改成 `14px` → `S03` 紅（`--text`：`--text-body` 改 0.875rem → 17 條紅）；`ink-muted` 調淡 → `S04` 紅（`--text`：L 0.52 → 0.7 → 29 條 2.51～2.67:1）；假輸入六段任一掃不到 → `S01` 紅
- [x] 6.2 面板底改成半透明 → `S05` 紅（`/80`：三個面板「底 alpha 0.8」）；給面板加一層世界遮罩 → `S05` 紅（「有 1 個蓋住世界的元素」）；確認視窗遮罩拿掉 → `S06` 紅（三個視窗「遮罩 alpha 0」）；
      關閉搬到標題列最前 → `S07` 紅（十個面板×viewport 各兩條）；`<header>` 放進捲動容器 → `S08` 紅（「標題列在捲動容器裡面」）＋ `S07` 紅（第一個區塊是 div）；陰影拿掉 → `S05` 紅；視窗開著內容區不 inert → `S06` 紅（兩個確認視窗）
- [x] 6.3（`--surfaces` 跑過前兩個＋五個自己加的：7 紅；`min-h-11` 留著 → e2e `S19` 紅；`--tasks`：`outline: none` → `S10` 66 條紅、`reduce` 的 media query 改成 `no-preference` → `S12` 95 條紅、殼 `transition-all` → `S12` 9 條紅（每個面板一條））場景聊天框「送出」改主要 → `S09` 紅；名片沒改時「儲存」啟用 → `S09` 紅；焦點環拿掉 → `S10` 紅；`reduce` 的 media query 拿掉 → `S12` 紅；面板 `transition-property: all` → `S12` 紅
- [x] 6.4（`--flow-yield` 跑過 12 個：11 紅、1 量不到 —— `AvatarPicker` 另讀協調者關自己，焦點移出已經關了它，那段拔掉；jsdom 量不到的 `scrollTop` 用真瀏覽器 `S16` 量（拔掉還原 → 紅）；`--flow` 跑過 11 個、10 紅：收件匣的 `yieldPanel` 只清子狀態與 ref、下一次開啟都會覆寫 —— 量不到，記著）協調者不 `onYield()` 就取代 → `S13` 紅（第一版量不到：讓位只靠推導「不掛」也全綠 —— 補「再按 E 是乾淨的清單」）；讓位時還焦點給開啟者 → `S13` 紅；provider 自己持有 open（不從 `active` 推導）→ `S22` 紅；鎖留在 provider 的開啟呼叫裡同步取 → `S21` 紅；殼的 cleanup 清 `active` → `S22` Strict Mode 段紅；`useBlockingPanelOpen` 用 `active !== null` → `S22` 幽靈段紅；`canYield` 恆真 → `S14` 紅；拒絕不發 `status` → `S14` 紅；提示用 return null 讓位（重設狀態）→ `S15` 紅；
      聊天框展開不還原 `scrollTop` → `S16` 紅；下一頁被拒不 `replaceState`（或用了 `pushState`）→ `S17` 紅；被拒時彈出層留著 → `S18` 紅；同一事件的第二個請求不取代第一個（兩個都掛）→ `S21` 紅
- [x] 6.5（每個突變前都在 commit 上、`git checkout --` 還原、跑完重 build）每次突變前 commit；突變後還原並重 build `.next`

## 7. 收尾

- [x] 7.1（每片的 PR 都貼了；`--surfaces` 之後在 main `882408e` 再跑 `deep-link` 23 綠）每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；e2e 對 `next start` 跑過（`board-panel`、`inbox`、`first-entry`、`form-team`、`scene-chat`、`deep-link`、`control-contrast`、`dom-visual`）
- [x] 7.2（`pnpm test` 177 檔 1356 綠；e2e `control-contrast`／`first-entry`／`scene-chat`／`inbox`／`deep-link` 綠）既有判準沒有變紅：`FE-X13`（對比）、`FE-X06`（Escape 層級、焦點、彈出層）、`FE-A06`（提示不擋世界、關掉不落地）、`FE-K04`（聊天記憶體、S11／S12）、`FE-K01-S02`、`FE-B09`（網址）
- [x] 7.3（每片合併後都部署；#535 → `guildhub-frontend-63ji1w3ic`，`/login` 一次人工 200）合併後 `vercel deploy --prod`、閘道 `/login` smoke（只走不壓）
- [x] 7.4（每片 PR 都有〈效能影響〉；Sheet 2026-09-19 仍沒有 `FE-X16` 列 —— 同步回「找不到 ID」，列加上之後打 Done）Sheet `FE-X16` 進度（使用者先在 Sheet 加列）；每片 PR 回報效能影響
