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

- [ ] 3.1 判準先紅：e2e `S05`（底 alpha `= 1`、邊界對 `surface` `3:1`、陰影存在且 alpha `> 0`、世界區沒有遮罩）、`S06`（確認視窗與密碼視窗有遮罩 `[0.3, 0.6]`、子畫面沒有、關了不在）、
      `S07`（1280×720 與 1024×640：標題列三個位置、關閉同 rect、同寬）、`S08`（溢出時內容區捲、文件不捲、標題列在捲動容器外）；
      jsdom 的 `S07` 結構半邊（標題列是第一個區塊、返回第一個可聚焦、關閉最後一個）
- [ ] 3.2 `PanelShell`：`back?: { label, onBack }` 插槽（返回在標題列最前）；**`{children}` 自己包一層捲動容器（`min-h-0 flex-1 overflow-y-auto`），`<header>` 留在容器外**（Gemini 抓到第一版把 overflow 加在含 header 的容器上）；
      覆蓋層的兩種形狀：子畫面（換標題列與內容、沒有遮罩）與確認視窗（`scrim`）；寬度改 token；出現的過渡只動 `opacity`／`transform`
- [ ] 3.3 看板詳情（`ProjectDetail`／`TalentDetail`）與收件匣對話的返回改走殼的插槽（既有 `FE-X06-S12`／`FE-K01-S07` 的焦點行為不變）
- [ ] 3.4 房間密碼視窗（世界上的視窗）：同一套底／邊界／陰影 token、對世界區的 `scrim`；結案確認與放棄修改確認套 `scrim`

## 4. `--flow`：協調者、提示讓位、聊天收起、網址（Requirement〈同一時間只有一個阻斷式面板〉）

- [ ] 4.1 判準先紅（jsdom）：`S13`（看板→收件匣→名片→收件匣、寄信那條路、焦點不經開啟者與 `body`、網址退）、`S14`（成軍送出中拒絕＋`role="status"`＋焦點留在按鈕；回來後接受；名片 dirty 拒絕且不出確認）、
      `S15`（提示讓位／回來／關掉不回來／走完不回來）、`S16`（收起顯示 3、不持鎖；展開有 3 則在底部；往上讀時收起再展開位置不動＋回到最新）、
      `S17`（下一頁：接受重開；送出中拒絕 → `replaceState` 一次、`pushState` 零次、再上一頁回原本那一筆）、`S18`（彈出層：成功就關、被拒也因焦點離開而關）、`S21`（同一個 handler 連續兩次 `requestOpen`：兩個 `true`、只掛最後一個；已登記且送出中 → `false`）、`S22`（殼延後 commit 時別人取代 → 舊的不掛；provider 卸載後 `useBlockingPanelOpen() === false`、提示不被壓；Strict Mode 殼掛→卸→掛後登記恰好一筆且 `active` 仍指向它）；`S21` 加：關掉後鎖放開、被取代的請求沒留鎖／opener
- [ ] 4.2 `src/panel/BlockingPanelCoordinator.tsx`（D3）：持有 `active: id | null`（state＋同步鏡像 ref）；`requestOpen(id)` 同步決定（空／未登記 → 取代；已登記且 `canYield()` → `onYield()` 後取代；否則 `false`＋`role="status"` 在 `toast` 層）；`requestClose(id)`；
      `register({ id, canYield, onYield })` 回一筆有身分的登記、cleanup 只刪自己那筆、**不動 `active`**；`requestClose(id)` compare-and-clear；`useActivePanel()`、`useBlockingPanelOpen()`（＝ `active` 指向的殼已登記）。`PanelShell` 掛載時登記（新 prop `canYield`、`onYield`）**並在 mount effect 取世界命令鎖、unmount 釋放**（鎖從 provider 的開啟呼叫搬過來）
- [ ] 4.3 三個 provider：`open` 改成 `useActivePanel() === 自己的 id`（不再 `useState(open)`）；`openX()` → `requestOpen()`、`closePanel()` → `requestClose()`；`onYield` 走既有關閉的副作用但**不還焦點**（三個 provider 都有還焦點的路：名片的 effect、看板的 `release()`、收件匣的 `closePanel()`，全部要有讓位旗標）；opener 與重取世代改在殼掛載後才記；`FE-K01-S02` 的「看板關」改走協調者；
      `PanelUrlSync.restore` 經過 `requestOpen()`，被拒 → `replaceState` 目前這一筆回實際狀態（不 push）
- [ ] 4.4 `FirstEntryNotice` 讀 `useBlockingPanelOpen()`（不卸載它的 `dismissed`／`alreadyDone`：用 `hidden`，不是 return null）；`SceneChatHud` 收成一行＋捲動位置還原（D5）；`AvatarPicker` 成功開面板時關、被拒時照既有焦點離開規則關
- [ ] 4.5 e2e：`S13`（記 `focusin` 序列）／`S15`／`S16`／`S17` 在真瀏覽器各走一次（`tests/e2e/dom-visual.mjs`）
- [ ] 4.6 ADR 0011 改 Accepted、邊界狀態「已強制」、證據補測試路徑

## 5. `--surfaces`：每個操作區套上三級與層次、標題列（Requirement〈控制項分三級〉〈標題列是固定的導覽〉）

- [ ] 5.1 判準先紅（jsdom）：`S09` 逐操作區數 `data-tier="primary"`（`≤ 1`）且是列出的那一個、零個的狀態真的零個；`S19` 標題列順序與 `≤ 5`；e2e `S19` 三種身分的 rect 相同、面板 rect 與整個標題列 rect 交集為 0
- [ ] 5.2 `/login`：三個表單各自一個主要（暱稱：進入世界；金鑰：用金鑰回來；帳號：登入／註冊）；版面順序與標題層次讓暱稱那條領先（D4）
- [ ] 5.3 金鑰交接：複製前「複製鑰匙」主要、複製後「進入世界」主要、「複製鑰匙」退成次要；訪客提示「先四處看看」文字級
- [ ] 5.4 案件詳情：owner 成軍／結案主要、送出中零個；密碼呈現「複製密碼」主要、「寄給隊員」次要；非 owner「私訊發案者」主要；結案確認「取消」主要
- [ ] 5.5 收件匣對話「送出」主要；名片「儲存」主要（沒改 `disabled`）；**場景聊天框「送出」次要**（非阻斷的表面不搶）；標題列（品牌左、其餘右、`≤ 5`）
- [ ] 5.6 前後截圖五張貼 PR；`ui-ux-pro-max` 的 pre-delivery checklist 逐條對
- [ ] 5.7 `S20` 裁決：對 1.3 的基線量一次（JS `≤ +4 KB`、CSS `≤ +6 KB` gzip；請求清單：全新 context、停用快取、`(resourceType, 去 hash 路徑)` multiset 相同）

## 6. 突變（驗收條件：拔掉防禦要紅）

- [ ] 6.1 拿掉 `--font-sans` 的繁中家族 → `S02` 紅；把某個表面的內文改成 `14px` → `S03` 紅（`--text`：`--text-body` 改 0.875rem → 17 條紅）；`ink-muted` 調淡 → `S04` 紅（`--text`：L 0.52 → 0.7 → 29 條 2.51～2.67:1）；假輸入六段任一掃不到 → `S01` 紅
- [ ] 6.2 面板底改成半透明 → `S05` 紅；給面板加一層世界遮罩 → `S05` 紅；確認視窗遮罩拿掉 → `S06` 紅；關閉搬到標題列最前 → `S07` 紅；`<header>` 放進捲動容器 → `S08` 紅
- [ ] 6.3 場景聊天框「送出」改主要 → `S09` 紅；名片沒改時「儲存」啟用 → `S09` 紅；焦點環拿掉 → `S10` 紅；`reduce` 的 media query 拿掉 → `S12` 紅；面板 `transition-property: all` → `S12` 紅
- [ ] 6.4 協調者不 `onYield()` 就取代 → `S13` 紅；讓位時還焦點給開啟者 → `S13` 紅；provider 自己持有 open（不從 `active` 推導）→ `S22` 紅；鎖留在 provider 的開啟呼叫裡同步取 → `S21` 紅；殼的 cleanup 清 `active` → `S22` Strict Mode 段紅；`useBlockingPanelOpen` 用 `active !== null` → `S22` 幽靈段紅；`canYield` 恆真 → `S14` 紅；拒絕不發 `status` → `S14` 紅；提示用 return null 讓位（重設狀態）→ `S15` 紅；
      聊天框展開不還原 `scrollTop` → `S16` 紅；下一頁被拒不 `replaceState`（或用了 `pushState`）→ `S17` 紅；被拒時彈出層留著 → `S18` 紅；同一事件的第二個請求不取代第一個（兩個都掛）→ `S21` 紅
- [ ] 6.5 每次突變前 commit；突變後還原並重 build `.next`

## 7. 收尾

- [ ] 7.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；e2e 對 `next start` 跑過（`board-panel`、`inbox`、`first-entry`、`form-team`、`scene-chat`、`deep-link`、`control-contrast`、`dom-visual`）
- [ ] 7.2 既有判準沒有變紅：`FE-X13`（對比）、`FE-X06`（Escape 層級、焦點、彈出層）、`FE-A06`（提示不擋世界、關掉不落地）、`FE-K04`（聊天記憶體、S11／S12）、`FE-K01-S02`、`FE-B09`（網址）
- [ ] 7.3 合併後 `vercel deploy --prod`、閘道 `/login` smoke（只走不壓）
- [ ] 7.4 Sheet `FE-X16` 進度（使用者先在 Sheet 加列）；每片 PR 回報效能影響
