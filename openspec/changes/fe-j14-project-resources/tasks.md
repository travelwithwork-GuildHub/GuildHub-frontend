# `FE-J14` 專案資源 —— 任務

每一片是一個 `feat/fe-j14-project-resources--<slice>` PR，產品碼（`src/`）≤250 行；**實作與直接證明它的判準在同一個 PR**。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。PR 說明寫：對應哪幾條 Scenario、突變紀錄、實際測試輸出；碰到後端契約的地方引用後端 PR／commit。

⚠️ **沒有掛進 Project Room（第 8 節）之前，`FE-J14` SHALL NOT 被宣稱完成。**

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-j14-project-resources`；Codex＋Antigravity 第一輪互審已完成、逐條處置寫在 PR 與 `TWW/AI-CLI-COLLABORATION-LOG.md`；Q2 精確化由小玉 2026-09-16 確認）

## 2. 契約（PR：`--contract`；前置：**後端 BE-G12 已合併進後端 main**）

- [x] 2.1 先寫判準：`[FE-J14-S25]`（新增／更新／輸出三個 schema 的正反例，更新 `{"label":null}` 失敗）、`[FE-J14-S26]`（產出型別檔恰好 21 組、operations coverage 含 `DELETE`）、`[FE-J14-S27]`（label 100／101／0、url 2048／2049、`LIMIT_SOURCES` 兩筆）—— 重產前先紅
- [x] 2.2 從合併後的後端重產 `src/api/contract/schema.d.ts`；`rest.ts` 加三個 schema（更新用 `.optional()`，不用 `.nullable()`）；`drift.ts` 登錄三個實體；`rest.ts` 檔頭與 `api-contract` 範圍改 21；`transport.ts` 的 `METHODS` 加 `DELETE`；`limits.ts` 加 `resourceLabel`、`resourceUrl`、`resourcesPerProject`，`LIMIT_SOURCES` 指向後端檔案行號（design D9）；`operations.ts` 加四個操作 —— `pnpm run typecheck`、`pnpm test` 綠
- [x] 2.3 突變：更新 schema 改 `.nullable()` → drift 相等斷言紅；`drift.ts` 少登錄一個 → 涵蓋率紅；`METHODS` 拿掉 `DELETE` → 刪除操作 typecheck 紅；`LIMITS.resourceUrl.max` 改 2000 → S27 紅

## 3. 本地後端：資源四端點（PR：`--local-resources`；前置：2）

- [x] 3.1 先寫契約測試 `tests/contract/rest/resources.contract.ts`：`[FE-J14-S28]`、`[FE-J14-S30]`、`[FE-J14-S31]`、`[FE-J14-S32]`，以及 `[FE-J14-S29]` 裡**不需要票**的每一列（未登入、專案不存在、owner 的三種狀態、非 owner 沒有票）；`tests/contract/boundaries.ts` 加兩欄與網址的保長度塑形（`min` 側只驗 reject、用原值，design／`contract-tests` delta）、`[FE-J14-S33]` —— 先對 `guildhub` 目標綠、對 `internal` 紅
- [x] 3.2 `db/schema/001_schema.sql` 逐位元組同步後端 001（`FE-O04-S01` 綠）；若後端這次也動了 `002_seed.sql`，一起同步並依實際筆數更新 `FE-O04-S03`（今天後端 seed 沒有資源列，預期不用改）；`db:reset`
- [x] 3.3 `handle()` 支援 `DELETE` 與 `204` 無 body、`loc` 以 `path` 開頭的 422
- [x] 3.4 `src/app/api/projects/[project_id]/resources/route.ts`（GET／POST）與 `…/[resource_id]/route.ts`（PATCH／DELETE）：矩陣、先鎖再計數寫入兩句（design D3）、未知欄位忽略、PATCH `{}` 原樣、網址 check 不分大小寫（`~*`）
- [x] 3.5 突變：鎖跟計數合成一句 → S32 並行那段紅；closed 允許寫 → S29 紅；handler 自己擋長度回 422 → S33 紅；PATCH 改到 `created_at` → S31 紅；DELETE 不走 `handle()` → S28 的 422 那段紅；網址 check 寫成 `~`（區分大小寫）→ S30 的大寫那列紅（`next build` 之後才算數）

## 4. 本地後端：房間票的伺服器端記錄（PR：`--room-grants`；前置：3）

- [x] 4.1 先寫 `tests/contract/rest/enter.contract.ts` 的 `[FE-J14-S34]`，與 `[FE-J14-S37]`（本地獨有：cookie 屬性、偽造、換身分）、`[FE-J14-S29]` 的持票兩列
- [x] 4.2 本地 `enter` 成功時 `Set-Cookie: room_grant_<project_id>`（一間房一個 cookie；**HMAC 同時簽 `project_id` 與 profile id**，design D4）；資源端點驗它
- [x] 4.3 突變：不記票 → S34 第一個 200 紅；grant 用一個裝集合的 cookie → S37 的**並行 enter C、D** 那段紅（只對 `local`）；HMAC 只簽 profile id → S37 的「A 的值改放 B 的名稱」紅；不綁身分 → S34／S37 換人紅；明文不簽章 → S37 偽造紅

## 5. 資料存取（PR：`--api`；前置：2）

- [x] 5.1 先寫單元：四個存取函式送出的 method／path／body（原字串、PATCH 只帶有改的鍵）、回應在邊界以契約解析、失敗丟 `HttpError`／`NetworkError`
- [x] 5.2 實作；確認元件不 `fetch`（既有 lint）
- [x] 5.3 突變：PATCH 改成送全部欄位 → 5.1 的 body 斷言紅；回應不經契約解析 → 邊界測試紅

## 6. 面板：清單、狀態、共享狀態與結案確認（PR：`--panel`；前置：4、5）

> D1（看板與面板同一份資源狀態）與 D2（403／409 之後確認一次）**在這一片實作**，因為直接證明它們的 Scenario 在這裡。
>
> ⚠️ **這一節實際送出兩個 PR**（`--resources-state` ＋ `--panel`）：一個 PR 量到 407 行產品碼，超過
> `AGENTS.md`〈PR 的大小〉的 250。按 Scenario 切成「共享資源狀態」與「面板畫面」兩半，兩半**各自帶著
> 證明它的判準**（`tests/resources-state.test.ts`／`tests/resources-panel.test.tsx`），沒有把實作與判準拆開。
>
> ⚠️ **三個半條判準延到第 7 片**（它們要的東西在這一片還不存在，不是漏做）：
> `S21` 的「在欄位裡打 wasde」與「Escape 先關表單、鎖不放」要新增表單；
> `S35` 的「刪除確認層」要刪除確認層；`S36` 的「新增成功後晚到的讀取」要成功的寫入。
> 第 7 片（`--form`）補齊，`7.1` 的判準清單涵蓋它們。

- [x] 6.1（流程，不對應 Requirement）動 tsx 前過 `ui-ux-pro-max`（`--domain` 清單／狀態；type 圖示；按鈕用 `@/design/controls`）
- [x] 6.2 先寫 jsdom：`[FE-J14-S01]`、`[S02]`、`[S03]`、`[S04]`、`[S05]`、`[S06]`、`[S09]`、`[S10]`、`[S21]`、`[S36]`、`[S35]` 的**面板**那段（**確認層那段不在這一片** —— 刪除確認層要到 7.2 才存在，見上面那則延後）
- [x] 6.3 實作共享資源狀態（每個 `project_id` 一份；讀取時機照〈讀取的時機是封閉的〉那四種；晚到的讀取**與晚到的狀態確認**都丟棄）、結案確認流程、面板（`PanelShell`、`empty-state`、`SafeExternalLink`、世界命令鎖、Escape 分層、focus trap）
- [x] 6.4 突變：自己組 `<a href>` → S01／S02 紅（lint 也紅）；403 不確認直接說已結案 → S06 紅；確認結果快取起來重用 → S05 的「關掉再開才發現」紅；加輪詢 → S05 紅；寫入控制用 `hidden` → S10 紅；面板不持鎖或關表單就放鎖 → S21 紅；晚到的讀取或晚到的 `active` 確認覆蓋畫面 → S36 紅；第二次開啟面板不重讀 → S05 紅；第一次開啟面板多讀一次 → S24 紅

## 7. 面板：新增、修改、刪除（PR：`--form`、`--edit-delete`；前置：6）

> ⚠️ **這一節也送出兩個 PR**（理由同第 6 節）：一個 PR 量到 334 行產品碼，超過 `AGENTS.md`〈PR 的大小〉的 250。
> 按 Scenario 切，兩半**各自帶著證明它的判準**：
>
> | 片 | Scenario | 判準 |
> |---|---|---|
> | `--form` | `S11`～`S15`、`S21` 的表單那半、`S36` 的寫入那半（＋`FE-X16-S14` 的讓位協定） | `tests/resources-form.test.tsx` |
> | `--edit-delete` | `S07`、`S08`、`S16`、`S17`～`S20`、`S35` 的確認層那段 | 那一支自己的判準檔 |
>
> **寫入失敗之後的那一次專案狀態確認（D2）整條放在 `--edit-delete`**：新增、修改、刪除共用同一條路徑，
> 拆開會讓兩個 PR 各拿到它的一半。所以 `--form` 合併後、`--edit-delete` 合併前，新增的 403／409
> 只會走 `FE-X05` 的預設失敗呈現（不確認、不會說「已結案」）—— **這是已知的缺口，不是漏做**，
> 7.2、7.3 的 checkbox 要等 `--edit-delete` 才勾得起來。

- [ ] 7.1 先寫 jsdom：`[FE-J14-S07]`、`[S08]`、`[S11]`～`[S20]`，**以及第 6 節延後的那三個半條**：`[S21]` 的「在欄位裡打 wasde 角色不動」與「Escape 先關表單、鎖不放」、`[S35]` 的刪除確認層那段、`[S36]` 的「新增成功後晚到的讀取不得覆蓋」那段
- [ ] 7.2 實作新增／修改表單（`useForm`；名稱只含空白是送出時錯誤；網址 `safeHref` ∧ 無空白是即時錯誤，design D5）、刪除確認層、上限、可見範圍說明
- [ ] 7.3 突變：送 `safeHref` 正規化值 → S11 紅；拿掉「含空白」判定 → S13 紅；`LIMITS` 或上限常數寫死 → S12／S16 的 mock 那段紅；PATCH 送全部欄位 → S17 紅；沒改也送 → S18 紅；409 不重讀清單 → S08 紅；樂觀更新 → S11 的「201 之前仍是兩筆」紅；確認層不防連按 → S20 紅；表單開著時 Escape 直接關掉面板 → `S21` 的表單那半紅；確認層自己組 `<a href>` → `S35` 紅；寫入成功後不丟棄晚到的讀取 → `S36` 紅

## 8. 看板與房間（PR：`--board`、`--room`）

- [ ] 8.1 （前置：7）`--board`：先寫 jsdom `[FE-J14-S22]`（含長名稱截斷與完整可及名稱）、`[S23]`（含 403＋closed）、`[S24]`（含兩個專案互不污染）、`[S35]` 的看板那段 → 實作看板元件（卡槽常數、三種非資料呈現＋已結案、互動註冊、共用第 6 片的狀態） → 突變：看板自己讀一份 → S24 請求次數紅；狀態不以 `project_id` 隔離 → S24 兩個專案那段紅；可見文字不截斷 → S22 紅；截斷後把可及名稱也截掉 → S22／S35 紅
  ⚠️ 這一片 **MUST NOT** 把看板掛進 `room` 場景、MUST NOT 讓 `world-scenes` 的場景註冊表引用它 —— 現行 `FE-V01-S03` 還禁止房間有任何看板註冊，8.2 合併前掛上去就是違反規格（`tests/world-scenes-hall-only.test.tsx` 也會紅）
- [ ] 8.2 （流程，不對應 Requirement）**前置：`FE-W16` 實作完成並封存**（2026-09-16 現況：`feat/fe-w16-project-room--layout` 已在跑）；開 `spec/` PR 補 `world-scenes`（MODIFIED `FE-V01-S03`：範圍收成 Guild Hall 的看板與門、加「房間裡恰好一塊資源看板」）與 `project-room-layout`（看板位置）的 delta，合併後才做 8.3
  **fallback**：W16 若停住到讓前七片先合併卻遲遲不能 archive（main 的規格落後 main 的程式碼，design 風險那一節），把房間整合抽成同一個 WBS ID 底下的另一個 change，讓這個 change 先封存
- [ ] 8.3 `--room`：把看板掛進 Project Room、量出卡槽數 C 與名稱截斷寬度並寫進常數（design 待答）、e2e：進房看得到看板與前幾筆、按 E 開面板、在欄位打字角色不動（補 `[S21]` 的真瀏覽器那半）、長名稱不溢出看板、面板開著時結案走 S05／S07 的路徑（`page.route` 偽造）；`tests/world-scenes-hall-only.test.tsx` 照 8.2 的新規格改（**不換識別字前綴**）
- [ ] 8.4 突變：看板不掛進房間 → e2e 紅；在房間裡多掛一塊 Guild Hall 看板 → `FE-V01-S03` 的新判準紅

## 9. 封存

- [ ] 9.1 （流程，不對應 Requirement）tasks 全勾、實作 PR 都合併、CI 綠 → 影子審查（`prompts/06-archive-review.md`）→ `archive/fe-j14-project-resources`；新主規格 `project-resources` 的 Purpose 不得是 `TBD`
- [ ] 9.2 （流程，不對應 Requirement）全部做完後，`governance/` PR 改 `docs/WBS.md` 的 BE-G12 列（FE-J14 列不手寫 `Done`）、跑 `progress.sh --render` 與 `--check`，輸出貼 PR
