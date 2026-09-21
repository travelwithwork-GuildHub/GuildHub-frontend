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
