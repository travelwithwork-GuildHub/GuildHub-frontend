# tasks：`FE-A06 首次進入`（2026-09-21 反轉：取名直接進世界）

**切法**：每一刀都帶著直接證明它的判準。產品碼上限 250 行／刀。

> ⚠️ **這份 tasks 在 2026-09-21 被整份改寫。** 前一版是「取名 → 帶走金鑰 → 進世界」，
> 已實作並幾乎封存（只差 4.2 的人工走查）。產品負責人在 demo 前撤掉金鑰閘，方向反轉為
> 「取名 → 直接進世界」，恢復金鑰機制整段退場。下面是**反轉的實作**，多數是刪除。
> 反轉的理由、兩模型結論、基線漂移的處置都在 `proposal.md` 與 `design.md`。

## 1. 首次進入流程：取名直接進世界（`S01`–`S03`、`S18`）

- [ ] 1.1 `FirstEntryFlow`：送出合法名字 → `signInWithNickname` → 直接 `onDone(identity)`。
      **移除 `KeyHandoff` 的渲染與整個檔案。**
- [ ] 1.2 `/login` 的暱稱路（`LoginForm`）：`signed-in` 之後直接 `markFirstEntryDone()`＋`router.replace('/world')`，
      不再渲染 `KeyHandoff`。**移除「貼上恢復金鑰」表單。**
- [ ] 1.3 `RootEntry`／`FirstEntryNotice`：確認 `onDone` 路徑不再經過金鑰畫面。
- [ ] 1.4 判準：`S01`（根路徑是流程）、`S02`（送出合法名字直接進、中間無金鑰步驟、名字正確）、
      `S03`（已有身分不重問）、`S18`（`/login` 暱稱路直接進、頁面無金鑰文字）。
- [ ] 1.5 **負向斷言**：`S02`／`S18` 要能擋住「取名 → 顯示金鑰 → 進世界」的實作
      —— 斷言流程中／頁面上 SHALL NOT 出現金鑰文字或帶走金鑰的步驟。

## 2. 恢復金鑰機制退場（`identity-session` REMOVED／MODIFIED）

- [ ] 2.1 `session.ts`：移除 `signInWithRecoveryKey`、`persist`／`remember` 落地、
      `resolveIdentity` 裡的 localStorage 金鑰自動恢復回退。匿名身分只靠 `GET /api/me`（cookie）。
- [ ] 2.2 移除 `src/identity/recoveryKey.ts` 與其使用；移除 `SignInOptions.remember`／`store`
      在暱稱／帳密路上的意義（帳密路的 session 由後端 cookie 建立，不受影響）。
- [ ] 2.3 判準：`FE-A01-S04`（重整仍同一人，靠 cookie）、`FE-A01-S05`（401 就是訪客，無金鑰條件）、
      `FE-A01-S06`（後端故障不偽裝未登入）。
- [ ] 2.4 **移除**針對 `FE-A01-S07`／`S08`／`S09`／`S10`／`S17` 的測試（那些 Scenario 已 REMOVED）。

## 3. 測試遷移

- [ ] 3.1 刪除 `KeyHandoff` 相關單元測試（`first-entry-flow`、`login-form` 的金鑰段、`identity-*` 恢復段）。
- [ ] 3.2 e2e：走過 first-entry 的腳本（`first-entry.mjs`、`identity-flow.mjs` 及各功能 e2e 的進場段）
      改為「取名 → 直接進世界」，移除複製金鑰／填尾碼的步驟。
- [ ] 3.3 `app-shell` `FE-X01-S01` 不變（`/` 仍是流程、已有身分到 `/world`）。

## 4. 視覺（另一刀，走 `ui-ux-pro-max`）

- [ ] 4.1 `/`、`/login`、`/world` 引導層的登入／首入畫面重做成專業、置中、有層次的版面。
      **看得見的東西動到 `.tsx` 版面前先叫用 `ui-ux-pro-max`**（CLAUDE.md 第 6 條）。
- [ ] 4.2 交付前跑 `ui-ux-pro-max` 的 pre-delivery checklist；用發表 viewport（1440×900 與手機寬）自問
      「專業嗎、知道按哪裡嗎」，附截圖。

## 5. 收尾

- [ ] 5.1 spec PR 談定（本檔＋`proposal`＋`design`＋三份 spec delta）。
- [ ] 5.2 全套件綠、`progress.sh --check` 綠、`openspec validate` 綠。
- [ ] 5.3 部署最新版到 Vercel（`ship.sh`），demo 走閘道網址。

## 6. 實作完成後補記（2026-09-21）

- [x] 1.x／2.x／3.x：src 反轉完成（取名直接進、砍 KeyHandoff／recovery-key／remember），測試遷移（fork）；vitest 綠、tsc／eslint 乾淨。實作 PR：feat/fe-a06-first-entry--direct-entry。
- [ ] **6.1 account-login（FE-A08）規格對齊 —— 封存前必補**：`openspec/specs/account-login/spec.md` 仍綁 recovery-key：
      〈登入頁有帳號密碼的入口〉說「兩個表單（暱稱、**恢復金鑰**）」＋busy-lock「三個送出鈕」（實作已改成「一個（暱稱）」＋兩個鈕，`FE-A08-S12` 測試已改 3→2）；
      〈註冊〉〈登入〉的「依記住我處置金鑰」＋`FE-A08-S07`（勾記住我落地金鑰／沒勾清掉，測試已刪）。
      要對這個 change 加 `account-login` 的 MODIFIED delta：三表單→兩表單、busy-lock 3→2、移除「記住我處置金鑰」；`S07` 因 OpenSpec 的 MODIFIED 不能丟 scenario，改寫成「登入成功後持久儲存中沒有恢復金鑰（我們根本不寫）」並補一條對應測試，或用 REMOVED＋ADDED 換掉那條 Requirement。**這是我（Claude）在 fe-a06 反轉時漏掉的 capability，fork 審出來的。**
- [ ] 6.2 RootEntry.tsx 第 17 行過時註解（提到「session 不在但手上有恢復金鑰」）順手改掉。

## 7. 二次反轉：進世界前要先有名字（2026-09-22，demo 前）

**規格（spec/ 分支）**
- [x] 7.1 `specs/first-entry/spec.md`：〈直接進世界的訪客會被提示，但不會被擋〉→〈進世界前要先有名字：訪客被導到取名，不匿名旁觀〉；反轉 `S04`（訪客看到取名不是世界）／`S05`（沒有繞過取名的旁觀出口）／`S06`（取名後進、已取名不再問）
- [x] 7.1b `S04` 的方法改成 method-agnostic：世界在取名前 SHALL NOT 收到指標／鍵盤事件，**取代世界（不 render）或蓋住並吃掉事件皆可** —— 讓「guest 不 render 世界」的實作對得上規格（`S05` 的註記一併泛化）
- [x] 7.1c **`specs/dom-visual-system/spec.md`（新 delta，二次反轉的跨規格連帶）**：MODIFY〈同一時間只有一個阻斷式面板…非阻斷的提示讓位〉——退役 `FE-X16-S15`（訪客提示讓位）、移除「訪客提示讓位」那段 prose、軟化 `S13`…`S22` 裡對訪客提示的附帶引用；保留場景聊天框／換角色彈出層的讓位。理由：訪客不 render 世界＝開不了面板，S15 前提消失（codex 一致；gemini 配額卡）
- [x] 7.2 proposal 加二次反轉段、Non-goals／已知限制對齊、Capabilities 加 `dom-visual-system`；`openspec validate fe-a06-first-entry --strict` 綠
- [ ] 7.3 `progress.sh --check` 綠（change-id 仍對回 FE-A06）

**實作（feat/ 分支）** —— 兩片：**gate＋文案**（feat-A，已做）／**藏帳密**（feat-B，卡 `FE-A01-S16` spec）
- [x] 7.4 **不在 `guest` 時 render 世界**：`/world/page.tsx` 用 client gate（`WorldEntryGate`）包 `<WorldBoundary/>` —— `guest` → 取名門檻（置中、焦點落名字框、無旁觀鈕；**不用 `aria-modal`** —— 世界沒 render、它是主畫面，`aria-modal` 反而會把標題列藏掉）；`unknown`／`signed-in`／`unavailable` → 交給 `<WorldBoundary/>`（`unknown` 由它顯示載入層，不閃取名）。拿掉 `<FirstEntryNotice/>`。原因：不 render 世界＝沒有世界可漏 WASD、也不抓 3D chunk。feat-A：`feat/fe-a06-first-entry--require-name-gate`
- [x] 7.5 文案：取名門檻用 `FirstEntryFlow`（標題「取一個名字就可以進去」＋新 `description`「填一個名字就能加入 —— 不用帳號、不用密碼…」，都不含「登入」）；`uiError.ts` 的 `authentication-required` 改成「這裡要有身分才看得到 —— 先取個名字加入。」（不含「登入」、仍在唯一語彙表、仍與其他句不同）—— 看板那句誤導文案經此語彙流出，一改就修好
- [x] 7.6a **（feat-B spec）** MODIFY `identity-session` 的 `FE-A01-S16`：「建立身分入口」的義務改由取名門檻承擔（門檻本身即暱稱流程）、訪客標題列不再導去 `/login`、補負向驗收「門檻顯示時 SHALL NOT 有導向帳密表單的入口」；`unavailable` 時標題列仍保留入口當安全閥（codex 裁定 B、強化式）。背景：`FE-X16-S19`＋`FE-A01-S16` 兩條 live 規格一起把「訪客標題列看得到 /login 入口」釘死
- [ ] 7.6b **（feat-B impl）** 改 `IdentityBadge`：`guest` 只顯示「訪客」不帶 `/login` 連結；`unavailable` 保留入口；改 `identity-badge` 的 `FE-A01-S16` 葉測試（guest 由門檻承擔、unavailable 保留、負向：門檻顯示時無帳密入口）；`/login` 頁與帳密表單不動
- [x] 7.7 測試：`first-entry-entries` 的 `S04`／`S05`／`S06` 改寫成 gate 行為（取代世界、無旁觀出口、取名後進、已取名不再問、unavailable 放行）；**連帶改**：`dom-visual-surfaces` 的 `FE-X16-S09`（訪客提示→取名門檻、拿掉「先四處看看」斷言）、`dom-visual-flow` 移除兩條 `FE-X16-S15`（規格已退役）；`identity-session` 的 `FE-A01-S12` 仍綠
- [x] 7.8 e2e：`tests/e2e/first-entry-gate.mjs` —— 訪客進 `/world` → 看到取名門檻、世界沒 render（沒 canvas/載入層）、無旁觀出口 → 取名 → 世界載入。**真瀏覽器 4 條全綠**（`next start` local build）。未接進 CI 的 `e2e-main.sh`（那是 `.github/`＝governance，且清單是策展的，另開 governance PR）

**收尾**
- [x] 7.9 `pnpm test` 綠、`tsc`／`lint` rc=0；e2e 真瀏覽器綠、截圖 `require-name-after.png`（feat-A 部分；feat-B 的 IdentityBadge 待做）
- [ ] 7.10 封存前 archive-review（含前面 4.x 視覺、6.1 account-login 對齊 —— 都是封存前才擋的）請使用者手動跑
- [ ] 7.11 **封存前人工同步 dom-visual-system 前言名詞表**：把「訪客提示」自「非阻斷的提示」清單移除、正名為「取名門檻」（`FE-X16-S03`／`S04`／`S09` 與前言的表面名一起），並清掉前一版遺留的「金鑰交接」等已移除表面的漂移 —— 這是 `archive/fe-a06-first-entry` diff 必審的跨 change 覆蓋
