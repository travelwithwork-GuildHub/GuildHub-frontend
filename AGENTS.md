# AGENTS.md

本檔是此 Repository **內**對 AI Coding Agent 的唯一 normative workflow 規範。
Repository 內其他文件與本檔衝突時，以本檔為準。

**沒有任何本機機制在執行本檔。** 這裡寫的是規範，不是閘門。真正擋得住東西的
只有 GitHub 上的 required status check 與 code owner review。你可以違反本檔，
但那會在 PR 上被人看到。

本檔裡**哪幾條真的有機器在執行、哪幾條只是文字**，寫在
〈這些閘門各自保護什麼、不保護什麼〉。先讀那一節再讀其他 ——
把只是文字的規則當成閘門，比沒有規則更危險。

## 職責分界

規格的**形狀與生命週期**由 OpenSpec CLI 管，不在本檔重述：

| 誰管 | 管什麼 |
|---|---|
| OpenSpec CLI 與它的 skills | change 的 artifact、delta spec 的格式、archive 與 sync |
| `openspec/config.yaml` 的 `rules:` | 規格要寫到什麼程度 |
| **本檔** | **git、PR、CI、團隊紀律 —— OpenSpec 不管的那一半** |

**不要另外造一套規格文件。** 需求的真相只在 OpenSpec 的 artifact 裡。

## Session 啟動

```bash
git branch --show-current      # 你在哪個 change 上
openspec list                  # 有哪些 change
openspec status --change <name>
```

讀 `AGENTS.md` → `CONTEXT.md` → 那個 change 的 artifact。
除非使用者指定其他語言，對人類使用繁體中文。

先確認階段：**這個 change 的 specs 在 PR 上談定了嗎？** 沒有就不要寫產品程式碼。

## Source of Truth

1. `openspec/specs/`（系統現在是什麼樣子）
2. `openspec/changes/<change>/`（這次要改成什麼樣）
3. `docs/adr/`（為什麼這樣決定）
4. `CONTEXT.md`（詞彙）
5. chat / notes（最低）

規格與對話衝突時以規格為準。**對話裡講過但沒寫進規格的，等於沒有。**

## 一個 change 的順序

**一個 change 有兩個 phase，每個 phase 是自己的分支與 PR。**

```
/opsx:explore（可跳過）
      ↓
/opsx:propose             產生 artifacts 後停下來
      ↓
spec/<change-id>          規格 PR。這時還沒有任何 code
      ↓
在 PR 上談定 → 合併        規格進 main，被凍住
      ↓
/opsx:apply               才開始實作
      ↓
feat/<change-id>--<slice> 實作 PR。可以有很多個
      ↓
CI 綠 → review → 合併
      ↓
archive/<change-id>       delta 同步進 openspec/specs/
```

**為什麼規格要單獨合併，而不是同一個分支從頭走到尾**：規格留在同一個分支上，
它隨時可以被改成「已經寫出來的樣子」，而那正是下面〈你不可以做的事〉
明文禁止、卻沒有任何機制擋得住的事。規格先合併進 main，
`check-pr-branch.sh` 才有辦法用 git object database 證明實作 PR 沒有回頭改它。

**實作可以是很多個小 PR。** W1 涵蓋 Canvas、移動、物理、camera、interaction、
WebSocket、interpolation 與 40-browser gate，在 400 行上限下不可能塞進一個 PR。
用 `--` 後面的 slice 區分：`feat/w1-world-spike--camera`、`--realtime`。

## 你不可以做的事

- **不得在 specs 談定前寫產品程式碼。** spike 分兩類，只有第一類不進 PR：
  - **Disposable spike**：只為了學會某件事，成果丟掉。不進 PR，不用寫規格。
  - **Foundation spike**：有時限、有 Go/No-Go 驗收、成果**預期合併**，
    是後面幾週的地基。**它要走完整的 OpenSpec 與 PR 流程。**
    W1 是這一類 —— `docs/WBS.md` 的標題寫「W1 技術 Spike」，
    但 `docs/ROADMAP.md` 把它的產出當 W2 以後的地基。
    這種 change 的規格只固定**已知的 Go/No-Go 可觀察結果**，
    把還不知道的常數（threshold、係數、collider 形狀）列成
    design 的待答問題，**不要假裝它們是事前需求**。
- **不得為了讓實作順利而修改 specs。** 發現規格有問題就停下來講，
  在 PR 上改規格、讓人重新看過，不要一邊寫一邊把規格調整成已經寫出來的樣子。
- **不得擴大範圍。** 規格沒寫的功能不要順手做。想做就先提，寫進規格。
- **不得宣稱「已完成」而沒有證據。** 貼實際的指令輸出。
- **不得手工造 `openspec/` 的目錄結構。** 用 `openspec new change` 或 `/opsx:propose`。
- **不得為了讓 `openspec validate` 過而編造 requirement。** 真的沒有 spec 變更
  （純重構、工具、文件），走 `chore/` 分支 —— 那條通道不需要 change。
  但它有 20000 bytes 的上界，而且不得碰 `openspec/` 與 `.github/`。
  超過上界就代表它其實需要一份規格。

## 寫規格的判準

**在 `openspec/config.yaml` 的 `rules:`。** 那裡才是有效力的地方 ——
`openspec instructions` 會把它餵給 agent。寫在文件裡只有人看得到。

要調整規格的品質要求，改 `config.yaml`，不要改這裡。

## 分支命名

**封閉列舉。沒列到的一律被 CI 擋下。** 分支名是 change id 的機器權威來源 ——
PR 標題和內文都不是（它們隨時可以改，而且不影響 CI 看到的東西）。

| 分支 | 能改什麼 | 機器上界 |
|---|---|---|
| `spec/<id>` | `openspec/changes/<id>/**` + `docs/adr/**` | 目錄，加 `openspec validate <id> --strict`，加 **Scenario ID 格式與唯一性** |
| `feat/<id>--<slice>` | 不限，但**不得回改**任何 change 的 proposal/design/specs | `<id>` 必須已經在 main 上 |
| `fix/<id>--<slice>` | 同上 | 同上 |
| `chore/<描述>` | 不得碰 `openspec/`、`.github/` 與 `.gitattributes` | diff ≤ **20000 bytes**（lockfile 另計 ≤ 1000000），拒絕 binary / symlink / submodule / LFS pointer |
| `archive/<id>` | 只有那三種 openspec 路徑 | `validate --archived --strict` **與** `validate --all --strict` 都要過 |
| `governance/<描述>` | 規則本身（CI、CODEOWNERS、AGENTS.md、config.yaml） | 只允許列舉的治理路徑；**機器不判斷那些檔案的內容是不是真的治理變更** |

**base 一定要是 main。** 對其他分支開 PR 拿到的綠燈不算數，CI 會直接擋 ——
ruleset 只保護 main，別處的綠燈可以被帶過來。

`<id>` 只准小寫、數字、單個連字號，**不得含 `--`**。這樣 `--` 就永遠是
change id 與 slice 的分界，不需要任何消歧邏輯。

**change id 要以 `docs/WBS.md` 的工作項目 ID 開頭（小寫）**，
例如 `fe-c01-appshell` 對應 `FE-C01`。這不是美觀問題 ——
`progress.sh` 靠它把 change 對回 WBS，對不上的會被單獨列成紅字。

### 開 change 之前先看它擋在哪

`docs/WBS.md` 有兩欄是**人寫的**，其他狀態都是 `progress.sh` 算的：

| 欄 | 放什麼 |
|---|---|
| `阻塞` | **`後端待規劃`**（後端還沒規劃到）／`後端行為有誤`／`BE-拒`（後端**明文不做**）／`待裁決`／`外部` |
| `標記` | `Cancelled`／`Pending`／`TBD`／`Alarm`／`Regular`，**後面接 `｜` 與理由** |

規則：

- **週次是排程的證據。** 沒有週次（寫 `—`）的項目就是現在做不了 ——
  不要替它開 change
- **`後端待規劃` 不是「做不了」。** 後端跟前端一樣在開發中，那只是後端的待辦。
  這種項目**照樣排週次**，規格裡要寫清楚需要什麼合約 ——
  把它標成做不了，等於自己封路，而且後端永遠不會知道我們需要什麼。
  **週次同時就是後端最晚什麼時候要交出來**（`--check` 會驗這件事）
- **`BE-拒` 才是真的牆。** 那是後端 `CLAUDE.md`〈不要實作的功能〉裡明列的，
  要翻案得先翻後端的產品決策，不是前端寫個 workaround
- **`Cancelled` 的列不刪。** 「考慮過並決定不做」跟「沒想到」是兩件事，
  刪掉之後沒有人分得出來
- **`BE-G` 那一組沒有週次也沒有點數**，因為完成時間不由前端控制。
  給它排週次就是在假裝我們排得動

```bash
bash .github/scripts/progress.sh --blocked   # 現在做不了的，以及被什麼擋住
bash .github/scripts/progress.sh --check     # 有規則違規就以非零結束
```

`--check` 驗的是這張表自己訂的規則：標記要附理由、互斥的處置不得並存、
缺口要有決策期限與 fallback、**工作的週次必須嚴格晚於它依賴的裁決期限**。
**改了 `docs/WBS.md` 就跑一次。** 那些規則如果只寫在文件裡，它們就只是規範。

判定在 `.github/scripts/check-pr-branch.sh`，它的測試在旁邊：

```bash
bash .github/scripts/test-check-pr-branch.sh
```

**改那支腳本之前跑一次，改完再跑一次。** 它是執法層本體，
而它壞掉的方式是安靜的 —— 不會有東西變紅，只會有本來該紅的東西變綠。

## 平行開發

一個 change = 一個目錄。一個 phase = 一個分支 = 一個 PR。
實作 phase 可以有多個 PR，共用同一個 change id。

兩個 change 會動到同一個 capability 的 spec 時，**先講**。
不要各自 archive 完才發現 `openspec/specs/` 被覆蓋 ——
那是這套流程唯一會安靜壞掉的地方。

## 注意力預算

**這套流程最終的信任錨是有人真的把 diff 讀過，而 agent 的產出速度沒有上限。**

**而且現在連「有人按過批准」都沒有機制保證** —— ruleset 的
`required_approving_review_count` 是 0，作者可以自己合併（見上面那張表第一列）。
所以閘門擋得住的只有形狀（分支、路徑、結構），擋不住的是內容。

就算把批准要求加回來，也**沒有任何機制能保護「批准的時候真的有在看」** ——
approve 的簽章永遠是真的，橡皮圖章偵測不出來。
所以稀缺資源不是 CI 算力，是人的注意力。

| 上限 | 值 | 為什麼 |
|---|---|---|
| 一個 PR 的 diff | **400 行**（不含 lockfile 與生成物） | 超過就沒有人會真的讀完 |
| 每人同時進行的 change | **2 個** | 平行做三件事的人，三件都不會被看仔細 |

超過上限就拆。拆不動的話，那是 change 的範圍定錯了，回去改規格。

### 人類該深讀什麼

| 深讀 | 抽查 |
|---|---|
| `specs` 的 Requirement 與 Scenario | 有規格的產品程式碼 |
| **測試的 diff** | |
| 驗證輸出的證據 | |
| **`chore/` PR 的每一行** | |

**`chore/` 一律深讀，不抽查。** 那是唯一一條不需要規格的通道，
所以它沒有「規格說它該做什麼」可以對照 —— **diff 本身就是規格**。
機器只保證它小到讀得完（20000 bytes），保證不了它不是功能。
跳過規格的代價就是有人要把每一行讀過。

理由：規格和測試是「這個系統該做什麼」的定義，錯了之後面全錯。
產品程式碼有 CI、有型別、有測試在擋，人重複做機器做得比較好的事沒有效益。

## 新增流程閘門的門檻

**新增任何流程 gate，必須先有一次真實事故作為證據。**

沒有這條規則的話，這個 repo 會長成一套沒有人違反過、卻要三個人維護的免疫系統，
而注意力會從「審規格」被抽走 —— 那正是這整套設計想保護的東西。

想加閘門時先回答：**哪一個 PR、哪一次合併，因為缺少它而出事？**
答不出來就先記在待辦，不要加。

**「事故」包含可重現的繞法，不限於已經污染 main 的損害。** ——
把門檻定成「必須先讓已知漏洞真的傷害 main」會產生荒謬的誘因。
這條規則要擋的是**臆測性**的閘門，不是已經被實測重現的洞。
判準是：你能不能在一個測試 repo 裡把繞法跑一次給人看。
跑得出來就算證據；跑不出來就是臆測。

## 這些閘門各自保護什麼、不保護什麼

**每一條都寫清楚邊界。** 高估一個閘門比沒有它更危險 ——
以為被擋住的地方，沒有人會再去看。

| 機制 | 真的保證 | **不**保證 |
|---|---|---|
| ruleset 的 review 要求 | **目前是 0。什麼都不保證。** | 任何人都能合併自己的 PR。CODEOWNERS 那份檔案現在沒有效力 —— 見下一節 |
| required check 綁 `integration_id` | 外部拿 write token 直接 POST 一個假 `ci: success` 會被拒 | **workflow 檔案的內容**。在 PR 裡把某一步改成 `run: true`，綠燈來源完全合法 |
| `check-pr-branch.sh` 的 `feat/` 那條 | phase ordering：規格已經在 main 上、實作沒有回頭改它（含 rename 搬走） | **diff 真的對應那份規格**。引用 change A 然後寫 change B 的程式碼會全綠 |
| `check-pr-branch.sh` 的 `spec/` 那條 | 每個 Scenario 有唯一且格式正確的 ID | ID 取得對不對、Scenario 寫得好不好 |
| `check-pr-branch.sh` 的 `archive/` 那條 | 封存的內容跟 main 上那份**逐檔 blob 相同**（不是只看檔案有沒有被刪） | `openspec/specs/` 有沒有被另一個 change 覆蓋掉 |
| `chore/` 的 bytes 上界 | review 面積小到人讀得完（lockfile 另有上界，不是無限） | 「這不是功能」。80 行的功能可以冒充 chore |
| `openspec validate --strict` | 規格的**結構**：有沒有 Scenario、Purpose 夠不夠長 | 規格的**內容**對不對 |
| `progress.sh --check` | 工作分解表的**形式**：標記附了理由、互斥的處置沒有並存、缺口有決策期限與 fallback、工作沒有排在它依賴的裁決之前、依賴不懸空；以及**解析本身 fail-closed**（表頭畸形、表格被截斷、欄數對不上、ID 重複或漏掉都會紅，不會安靜跳過） | **那些理由與 fallback 寫得對不對**。「`Pending｜等後端`」格式完全合法，內容等於沒說 |
| `archive/` 的雙重 validate | tasks 全部完成、archive 後 main spec 不會紅 | `openspec/specs/` 有沒有被另一個 change 覆蓋掉 |

**最重要的那一格是空的：沒有任何機制能證明 diff 對應規格。**
能逼近它的是 Scenario ID ↔ 測試的對應，而那要等第一批測試存在才有意義。
在那之前，「這段程式碼是不是這份規格要的東西」只有人回答得了。

**`governance/` 只擋路徑，不擋內容。** 它保證這個 PR 只碰了列舉的治理檔案，
**不保證那些檔案裡放的是治理變更** —— `package.json` 的 inline script、
`.github/actions/` 底下的 JavaScript、workflow 裡的 shell，都是能執行的東西
而且都在允許清單內。精確的說法是：

> governance PR 只能使用列舉的治理／設定 carrier path；
> 內容是不是真的治理變更，機器不判斷。

**`.github/` 的保護是人，不是機器。** GitHub 在 `pull_request` 事件跑的是
PR 分支上的 workflow，所以 CI 保護不了 CI。能機械封住的是 ruleset 的
「Require workflows to pass」（workflow 檔從 main 取），但那需要
org ruleset + Team/Enterprise 方案，這個 org 是 free。
所以看到 file list 裡有 `.github/` 的時候，那就是要用眼睛的時候。

## GitHub 上的設定在哪裡看

**ruleset 不在版控裡。** 它是 GitHub 上的設定，clone 這個 repo 看不到它。
所以有一份快照：

| 檔案 | 是什麼 |
|---|---|
| `.github/ruleset.json` | 實際設定的快照，就是 API payload 本身 |
| `.github/scripts/check-ruleset.sh` | 把線上設定抓下來跟快照比對，不一致就列出差在哪 |

```bash
bash .github/scripts/check-ruleset.sh
```

**那份快照不是執法。** 改它不會改變 GitHub 上任何東西；有人在 UI 上改了設定，
它也不會自己更新。它存在的理由是**讓漂移查得出來** ——
這個 repo 發生過：`AGENTS.md` 寫著「CODEOWNERS review 擋得住東西」，
而實際設定是 `require_code_owner_review: false`，那三行 CODEOWNERS 完全沒有效力。
**沒有任何東西會告訴你這件事。**

### ⚠️ 目前不需要任何人批准

```
required_approving_review_count: 0
require_code_owner_review:       false
```

**2026-09-04 起改成這樣**，因為四個人的團隊在開發初期跑不動 ——
每個 PR 都要另一個人在線上按批准。

**這代表 `.github/CODEOWNERS` 目前是一份沒有效力的檔案。**
它列的四個人不會被要求 review，作者可以自己合併自己的 PR。

還在的保護只有：

- required check `ci`（綁定 GitHub Actions，外部偽造的 status 不算數）
- 不能直接推 main、不能 force push、不能刪 main
- `check-pr-branch.sh` 的分支類別判定

**所以上面那張表關於「有第二個人看過」的每一列都不成立。**
規格會不會被人看過、chore 會不會被逐行讀，現在**完全靠自覺**。

要收緊的時候：把 `.github/ruleset.json` 的那兩個值改回 `1` / `true`，
重新套用，然後跑 `check-ruleset.sh` 確認。

### 誰能繞過

`@fergusKe`（org owner 兼 repo admin）在 PR 頁面會看到一個勾選框：

> ☐ Merge without waiting for requirements to be met (bypass rules)

勾了就能直接合併，**包含 CI 紅的時候**。GitHub 的 ruleset 沒辦法只繞過 review
而保留 required status check —— bypass 是整組的。

其他協作者看不到那個勾選框。要確認自己有沒有：

```bash
gh api repos/travelwithwork-GuildHub/GuildHub-frontend/rulesets/21930388 \
  --jq .current_user_can_bypass
```

`always` 就是有，`null` 就是沒有。

**這代表上面那張閘門表的第一列對 @fergusKe 不成立。**
所有「一定要有第二個人看過」的推論，在他身上都是自願的，不是機制。

## 測試

測試對應 **Scenario**。一個 Scenario 的 WHEN/THEN 就是一條測試該證明的事。

優先 unit / integration；E2E 只覆蓋 critical journeys。

### 測試環境隔離

> **不是叫 AI 別動共用的服務，是給它一個動了也沒關係的。**

這條規則的來源是一個真實事故：有人沒要求 AI 寫測試，AI 自作主張寫了，
測試全綠 —— 然後打開後台才發現**整個資料庫被清空，連管理者帳號都不見了**。
測試「通過」跟「沒有破壞東西」是兩件事，而前者不蘊含後者。

**「共用的服務」不只是資料庫。** 團隊共用的後端、staging 環境、
第三方 API 的沙箱、佇列 —— 只要有第二個人可能同時在用，就算。
一次壓測就能把所有人踢下線。

| 層級 | 可以碰什麼 | 絕對不可以 |
|---|---|---|
| unit / component | 什麼都不連。外部依賴一律 mock | — |
| integration | **本機起一份可拋棄的**，測完丟掉 | 團隊共用的任何一份 |
| E2E / 壓測 | loopback 或當次建立、當次銷毀的 ephemeral 實例 | 同上，而且壓測特別致命 |

三條硬規則：

1. **測試連到哪裡，由環境變數決定，不得寫死在測試檔裡。**
   寫死的位址是最常見的失控方式 —— 它在別人的機器上會指到別人的東西。
2. **CI 不提供任何服務。** 需要後端／資料庫的測試，要在 CI 裡自己起一份
   （service container 或測試前的啟動腳本）。CI 連得到共用環境本身就是問題。
3. **破壞性操作之前先證明連的是可拋棄的那一份。** 不是「相信環境變數設對了」——
   是在測試開始前實際檢查一次，不對就直接失敗。
   npm 的 `pretest` 生命週期鉤子是放這個檢查的地方。

**這一條目前沒有機器在擋**，只有規範。判斷「這個位址是不是共用的」需要
知道團隊實際怎麼部署，機器看不出來。
加閘門的觸發條件寫在 `docs/DECISIONS.md`。

## Git / CI

- 分支命名見上面〈分支命名〉那張表。**CI 會擋，不是建議**
- 一個 PR 對應一個 phase；實作 phase 可以有多個 PR
- **不得 `git commit --no-verify`**（就算本機沒有 hook，這個習慣要留著）
- **不得改 `.github/`**（CI 與 CODEOWNERS 是執法層自己，改它要獨立 PR 並讓人明確看到）
- CI 紅燈不要靠 re-run 賭它變綠，去看為什麼紅

## 完成的定義

以下全部成立才算完成：

1. `openspec validate <change> --strict` 通過
2. specs 的每一條 Requirement 都有對應實作，每個 Scenario 都有對應測試
3. `tasks.md` 沒有殘留的 `- [ ]`
4. lint / typecheck / tests / build 全綠，**貼出實際輸出**
5. CI 在 PR 上綠燈
6. **橫向面在這一項裡就處理完，不是留給以後**：
   - 使用者輸入的顯示沒有走 `dangerouslySetInnerHTML`；外開連結有 `rel="noopener noreferrer"`
   - 鍵盤走得完（含 Escape 與 focus trap），而且**沒有跟 WASD 打架**
   - 有空狀態與錯誤狀態，不是只有 happy path
   - 送出的每個欄位都有前置驗證（**後端刻意不擋長度**，超長只會拿到資料庫錯誤）

   `docs/WBS.md` 的 `FE-X` 那一組是**共用機制與稽核**，
   **不是**把上面這幾條延後的地方。一旦允許「之後 FE-X 再補」，它們就不會被補。

散文式的「已完成」不算證據。

> **目前沒有「要別人批准」這一條。** ruleset 的
> `required_approving_review_count` 是 `0`，作者可以自己合併 ——
> 這是 2026-09-04 刻意放寬的，理由與代價寫在 `.github/ruleset.json` 的
> `_review_note`。**不要憑記憶寫「要 CODEOWNERS 批准」**，
> 實際設定用 `bash .github/scripts/check-ruleset.sh` 查。

合併之後才 `/opsx:archive`，讓 delta 同步進 `openspec/specs/`。
**沒 archive 的 change 等於這次的成果沒有進入系統的現況描述。**
