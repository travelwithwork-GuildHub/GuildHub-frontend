# 一次性設定（建 repo 的人做一次）

本機沒有任何 hook，**唯一真正擋得住東西的是 GitHub 上的 required check**。
沒設它，這整套只是幾份文件。

## 0. OpenSpec CLI

**模板已經把它放進 `package.json` 的 devDependencies 並附了 lockfile**，
所以你只要裝：

```bash
npm ci
```

**不用跑 `openspec init`** —— 它會產生的 `openspec/config.yaml` 與 `.claude/`
底下 12 個檔案，模板都已經附了。

**不要全域安裝。** 版本由 `package-lock.json` 鎖住，CI 跟每個人本機跑的才是同一份。

模板釘的是 `"@fission-ai/openspec": "1.11.0"`（沒有 caret）。`npm ci` 本來就認
lockfile，但少了這個，有人跑 `npm install` 就會在 `1.x` 之內漂移然後把新的
lockfile commit 上去。

`.claude/` 底下的 6 個 skill 與 6 個 `/opsx:*` 指令**要跟著 git 走** ——
`.gitignore` 沒有擋它，隊友 clone 就有。它們的 frontmatter 是
`generatedBy: "1.11.0"`，跟 `package.json` 釘的版本綁在一起；
升級 CLI 的時候要跑 `npx openspec update` 把它們一起換掉。

### 讓 `openspec` 指到專案這一份

skill 呼叫的是**裸的 `openspec`**（frontmatter 是 `allowed-tools: Bash(openspec:*)`），
而 `node_modules/.bin` 預設不在 PATH 上。實測過：

```
$ command -v openspec
/Users/xxx/.nvm/versions/node/v24.16.0/bin/openspec    ← 全域那份，不是專案的
```

**如果有人全域裝了不同版本，skill 會安靜地用錯的版本。** 兩件事一起做：

1. **不要全域安裝 openspec。** 沒裝的話，PATH 沒設好會直接
   `command not found` —— 大聲失敗，比安靜用錯版本好。
2. 在專案目錄讓 shell 找得到它：

```bash
export PATH="$PWD/node_modules/.bin:$PATH"
```

（用 direnv 的話寫進 `.envrc`。）設完確認一次：

```bash
command -v openspec     # 要指到 <專案>/node_modules/.bin/openspec
openspec --version      # 要跟 package.json 裡的版本一致
```

升級流程見 `README.md`〈更新 OpenSpec CLI〉。

## 1. CODEOWNERS

```bash
mv .github/CODEOWNERS.example .github/CODEOWNERS
```

把裡面的 `@YOUR_TEAM` 換成真的 GitHub 帳號。留著範例值等於沒設。

## 2. package.json scripts

`.github/workflows/ci.yml` 會跑這四個。**模板裡它們是刻意會失敗的佔位**：

```json
"lint": "echo '✗ lint 還沒設定。編輯 package.json 的 scripts，或刪掉 ci.yml 的 Lint 那一步。' && exit 1"
```

所以新專案的 CI 一開始是紅的。**這是刻意的** —— 一個什麼都沒檢查卻全綠的 CI，
比紅的還危險。四個都要嘛設好、要嘛把 `ci.yml` 對應那一步刪掉。

工具自己挑，CI 只認 script 名稱：

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "next build"
  }
}
```

**用不到的關就把 `ci.yml` 裡對應那一步刪掉** —— 留一個永遠失敗的步驟，
團隊很快就會開始無視紅燈。

> **Next.js 專案注意**：16 起 `next lint` 已被移除，`lint` 要寫 `eslint .`，
> `next.config` 的 `eslint` 選項也不再需要。舊專案遷移用官方 codemod：
> `npx @next/codemod@canary next-lint-to-eslint-cli .`
> 另外 `create-next-app` 只會產生 `lint` 與 `build`，`typecheck` 與 `test` 要自己加。

## 3. CI

`.github/workflows/ci.yml` 是 Node 專案的預設形狀，**依你的 stack 改**
（換 setup action、換安裝指令、換 Node 版本）。

**但 `Spec` 那一關不要拿掉。** 它排在 `npm ci` 之後是刻意的 ——
`npx openspec` 要先有 `node_modules` 才解析得到 lockfile 鎖住的那個版本。
真的沒有 spec 變更的 change（純重構、工具、文件），在它的 `.openspec.yaml`
標 `skip_specs: true`，不是把這一關刪掉。

非 Node 專案沒有 lockfile 可以鎖，就改回釘死版本的
`npx --yes @fission-ai/openspec@1.11.0`，並自己確保團隊裝的是同一版。

`job` 的 `name: ci` 就是 required check 的名稱，改名要同步改下面的 ruleset。

## 4. repo 層級設定（**這些只存在於 GitHub 的網頁上**）

分支保護在下一節，這一節是 repo 自己的設定。它們不在版控裡 —— 所以模板附了
一份快照 `.github/repo-settings.json`，設完用 `check-ruleset.sh` 對一次。

```bash
gh api -X PATCH repos/OWNER/REPO -F delete_branch_on_merge=true
gh api -X PUT  repos/OWNER/REPO/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

bash .github/scripts/check-ruleset.sh      # 兩份快照一起對，要全部 ✓
```

| 設定 | 值 | 為什麼 |
|---|---|---|
| `delete_branch_on_merge` | `true` | 見下面 |
| Actions `default_workflow_permissions` | `read` | workflow 拿到的 `GITHUB_TOKEN` 預設唯讀。要寫入的 job 自己在 `permissions:` 裡明寫，範圍才看得見 |
| Actions `can_approve_pull_request_reviews` | `false` | 不讓 workflow 自己 approve PR —— 那會讓 review 這一層形同虛設 |

**合併後自動刪分支為什麼要特別講**：這裡的 PR **習慣上**走 squash 合併，而
squash 產生的是一個全新的 commit —— 原分支的 tip 不是 `main` 的祖先，於是本機
刪分支的指令**永遠**判定「還沒合併」而拒絕動手，必須改用強制刪除。實際發生
過：21 個已經合併的分支堆在本機，一般的刪除一個都不肯做，只能逐一確認內容真
的在 main 上之後強制刪掉。

> **注意**：模板附的 `ruleset.json` 把 `allowed_merge_methods` 設成
> `["merge", "squash", "rebase"]` —— **三種都開，squash 只是約定不是規則**。
> 要讓它變成規則就改成 `["squash"]` 再重新套用；不改的話，上面那段「squash
> 之後刪不掉」只在別人也走 squash 的時候成立。**兩種都可以，但要選一個** ——
> 文件宣稱 A、設定是 B，是這套東西最常見的失效方式。

三層各自要處理，缺一層就會堆：

| 層 | 做法 |
|---|---|
| **遠端分支** | 上面那個設定，合併後 GitHub 自己刪 |
| **本機的遠端追蹤分支**（`origin/xxx`） | `git config fetch.prune true`，`git fetch` 時自己清 |
| **本機分支** | 合併時用 `gh pr merge <PR> --squash --delete-branch`，它會連本機一起刪 |

最後一層要注意：**分支被 worktree 佔著的時候刪不掉**（訊息是
`cannot delete branch 'x' used by worktree at ...`）。先 `git worktree remove`
再合併，或者事後補刪。在 worktree 裡開分支是這個流程的預設做法，
所以這件事會常常遇到。

## 5. Branch Ruleset

Settings → Rules → Rulesets → New branch ruleset

| 欄位 | 值 |
|---|---|
| Enforcement status | **Active**（留在 Disabled 等於沒設） |
| Target branches | default branch |
| Require a pull request before merging | ☑ |
| Require review from Code Owners | ☑ |
| Require status checks to pass | ☑ → 加入 `ci` |
| Bypass list | **留空** |

> 免費方案需要 **Public** repository 才能設 ruleset；private 要付費方案。

## 6. 實測 —— 這步不能跳

開一個帶著故意失敗測試的 PR，**親眼看到合併按鈕變灰**。

```bash
git switch -c test/ruleset
# 故意寫一條會失敗的測試
git commit -am "test: 驗證 required check"
git push -u origin test/ruleset
gh pr create --title "驗證 ruleset" --body "故意失敗，測完就關"
```

按鈕還是綠的，代表 ruleset 沒 Active、target 沒涵蓋這個分支、
或 check 名稱選錯 —— 三個都要回頭查。

測完關掉 PR、刪分支。

**沒看過按鈕變灰，就不能宣稱這一層存在。**

---

設定完成後可以刪掉本檔。
