# AGENTS.md

本檔是此 Repository **內**對 AI Coding Agent 的唯一 normative workflow 規範。
Repository 內其他文件與本檔衝突時，以本檔為準。

**沒有任何本機機制在執行本檔。** 這裡寫的是規範，不是閘門。真正擋得住東西的
只有 GitHub 上的 required status check 與 CODEOWNERS review。你可以違反本檔，
但那會在 PR 上被人看到。

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

```
/opsx:explore（可跳過）
      ↓
/opsx:propose        產生 artifacts 後停下來
      ↓
開 draft PR          規格先給人看，這時還沒有任何 code
      ↓
在 PR 上談定
      ↓
/opsx:apply          才開始實作
      ↓
CI 綠 → review → 合併
      ↓
/opsx:archive        delta 同步進 openspec/specs/
```

**規格要先開 PR。** 不要寫完 code 才讓人看規格 —— 那時候規格已經是實作的
說明書，不是討論的對象。

## 你不可以做的事

- **不得在 specs 談定前寫產品程式碼。** 探索性的 spike 可以，但要說明是 spike，
  而且不進 PR。
- **不得為了讓實作順利而修改 specs。** 發現規格有問題就停下來講，
  在 PR 上改規格、讓人重新看過，不要一邊寫一邊把規格調整成已經寫出來的樣子。
- **不得擴大範圍。** 規格沒寫的功能不要順手做。想做就先提，寫進規格。
- **不得宣稱「已完成」而沒有證據。** 貼實際的指令輸出。
- **不得手工造 `openspec/` 的目錄結構。** 用 `openspec new change` 或 `/opsx:propose`。
- **不得為了讓 `openspec validate` 過而編造 requirement。** 真的沒有 spec 變更
  （純重構、工具、文件），在 `.openspec.yaml` 標 `skip_specs: true`。

## 寫規格的判準

**在 `openspec/config.yaml` 的 `rules:`。** 那裡才是有效力的地方 ——
`openspec instructions` 會把它餵給 agent。寫在文件裡只有人看得到。

要調整規格的品質要求，改 `config.yaml`，不要改這裡。

## 平行開發

一個 change = 一個目錄 = 一個分支 = 一個 PR。彼此獨立。

兩個 change 會動到同一個 capability 的 spec 時，**先講**。
不要各自 archive 完才發現 `openspec/specs/` 被覆蓋 ——
那是這套流程唯一會安靜壞掉的地方。

## 注意力預算

**這套流程最終的信任錨是三個人的 approval，而 agent 的產出速度沒有上限。**

上面所有的閘門都在保護「人類有批准」這件事，但**沒有任何機制能保護
「人類批准的時候真的有在看」** —— approve 的簽章永遠是真的，
橡皮圖章偵測不出來。所以稀缺資源不是 CI 算力，是人的注意力。

| 上限 | 值 | 為什麼 |
|---|---|---|
| 一個 PR 的 diff | **400 行**（不含 lockfile 與生成物） | 超過就沒有人會真的讀完 |
| 每人同時進行的 change | **2 個** | 平行做三件事的人，三件都不會被看仔細 |

超過上限就拆。拆不動的話，那是 change 的範圍定錯了，回去改規格。

### 人類該深讀什麼

| 深讀 | 抽查 |
|---|---|
| `specs` 的 Requirement 與 Scenario | 產品程式碼 |
| **測試的 diff** | |
| 驗證輸出的證據 | |

理由：規格和測試是「這個系統該做什麼」的定義，錯了之後面全錯。
產品程式碼有 CI、有型別、有測試在擋，人重複做機器做得比較好的事沒有效益。

## 新增流程閘門的門檻

**新增任何流程 gate，必須先有一次真實事故作為證據。**

沒有這條規則的話，這個 repo 會長成一套沒有人違反過、卻要三個人維護的免疫系統，
而注意力會從「審規格」被抽走 —— 那正是這整套設計想保護的東西。

想加閘門時先回答：**哪一個 PR、哪一次合併，因為缺少它而出事？**
答不出來就先記在待辦，不要加。

## 測試

測試對應 **Scenario**。一個 Scenario 的 WHEN/THEN 就是一條測試該證明的事。

優先 unit / integration；E2E 只覆蓋 critical journeys。

Tests 不得碰 production data。破壞性的 DB 操作前必須先證明連的是 test database。

## Git / CI

- 分支命名：`feat/<change>`、`fix/<change>`
- 一個 PR 對應一個 change
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
6. CODEOWNERS review 通過

散文式的「已完成」不算證據。

合併之後才 `/opsx:archive`，讓 delta 同步進 `openspec/specs/`。
**沒 archive 的 change 等於這次的成果沒有進入系統的現況描述。**
