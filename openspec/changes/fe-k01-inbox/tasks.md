# `FE-K01` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-k01-inbox`）

## 2. 本地後端與契約

對應 Requirement〈本地後端與契約測試補上 messages〉

- [ ] 2.1 `src/app/api/messages/route.ts`（GET：WHERE 帶主體條件、分頁；POST：201、`no_self_send` → 400、FK → 404）；`src/server/messages.ts`
- [ ] 2.2 契約測試 `tests/contract/rest/messages.contract.ts`（兩個目標）；422 golden 重錄
- [ ] 2.3 判準：`S13`、`S14`、`S15`；資料層形狀判準（`tests/server-messages.test.ts`：一道 SQL、含主體條件）
- [ ] 2.4 **突變**：主體條件拿掉（取前 20 再在應用層過濾）→ `S13`（丙丁 21 封讓我的第 0 頁變空）；取全部再過濾 → 資料層形狀判準；400／404 對錯 → `S14`；`page=abc` 不 422 → `S15`

## 3. 純函式與資料層

對應 Requirement〈清單是對話，不是信〉、design `D2`／`D3`／`D5`

- [ ] 3.1 `src/inbox/threads.ts`（`groupThreads`、`preview`、`counterpartOf`、`shortId`、`mergeById`）；資料放 `InboxPanelProvider`（分頁世代 ＋ 一個 in-flight 槽、舊世代只合併訊息、合併只增不減、寄出後重取第 0 頁、名字快取、送出中的請求、401 清空）
- [ ] 3.2 判準：`S03`（純函式）
- [ ] 3.3 **突變**：不去重 → `S03`；組內排序反了 → `S03`；組排序用第一封不用最新 → `S03`；`preview` 不壓空白 → `S03`

## 4. 面板

對應 Requirement〈收件匣是阻斷式面板，兩個入口〉、〈對話詳情⋯⋯〉、〈寄信是悲觀更新⋯⋯〉

- [ ] 4.1 `src/inbox/InboxPanelProvider.tsx`（`page.tsx`；view ＋ 資料）、`InboxButton`（標題列）、`InboxPanel.tsx`（`WorldCanvas`；清單／對話；對話裡沒有載入更多）、`TalentDetail` 的「寄信給他」（只在 signed-in、關看板）、`ComposeForm`（`useForm`；404 的 `describeError`）
- [ ] 4.2 判準：`S01`、`S02`、`S04`～`S12`、`S16`
- [ ] 4.3 **突變**：不分組 → `S04`；第二頁不重分組 → `S05`；名字解析失敗擋清單 → `S04`；樂觀接上 → `S08`；寄信後不重取第 0 頁 → `S08`；失敗清 body → `S09`；送出中鎖導航 → `S12`；對話裡放載入更多 → `S07`；載入更多失敗清掉清單／頁碼前進 → `S16`；寄信鈕給訪客／自己 → `S02`；重開不重取 → `S01`；舊世代回應改 pagesLoaded → `S16`；401 不清 → `S06`；401 後舊 201 寫回 → `S06`

## 5. 收尾

- [ ] 5.1 `npm run typecheck`、`npm run lint`、`npm test`、`test:contract:internal` 全綠；`test:contract:guildhub` 本機綠；真瀏覽器兩個人互寄（`docs/evidence/fe-k01/`）
- [ ] 5.2 封存（`archive/fe-k01-inbox`，獨立 PR）
