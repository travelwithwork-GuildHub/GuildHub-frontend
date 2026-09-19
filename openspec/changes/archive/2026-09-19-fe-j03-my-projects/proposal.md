## Why

發了案的人今天找不到自己的案子：專案看板只列**招募中**（後端 `GET /api/projects` 預設 `status=recruiting`），
成軍之後案子就從看板消失，owner 要再看到它只剩「記得網址」一條路（`?panel=projects&project=<id>`）。
demo 閉環（發案 → 成軍 → 門 → 進房 → 結案）的最後一步「結案」因此沒有入口 —— `FE-J04` 做了結案的動作，但沒有地方走到已成軍的案子。
這是 `docs/WBS.md`〈demo 之前的核准順序〉的 #8（`FE-J03`）。

後端沒有 owner 篩選、沒有總數（`FE-O08` 量過：`PAGE_SIZE=20`、只回 `status` 一種、`expires_at > now()` 對三種狀態都過濾），
所以「我的案件」只能由前端**逐頁載入三種狀態、以 `owner_id` 過濾**，而且要**誠實標明**看了多少、有沒有到上限、到期的看不到。
2026-09-19 使用者定案：後端現有的 API 就做，不等 owner 篩選（已列進給後端的清單，來了再換）。

## What Changes

- 新 capability **`my-projects`**：專案看板的工具列多一個視圖切換「招募中｜我的案件」（只給已登入的人，跟「發案」同一條規則）。
  「我的案件」是**同一個面板的另一個視圖**：
  - 資料：`recruiting`／`active`／`closed` 三種狀態各自從第 0 頁往下載到不滿一頁為止、**每種狀態最多 5 頁（100 筆）**；只留 `owner_id` 等於自己的；三種合併後依 `updated_at` 由新到舊。
  - 誠實標明：看過幾個案子、哪一種狀態到了掃描上限、已到期的案子後端不回。
  - 三種狀態：載入中可辨識；三種都掃完沒有我的 → 空狀態；任一請求失敗 → 失敗＋重試（不把部分結果當成完整）；401 → 權限阻擋（既有 `EmptyState`）。
  - 每一筆是既有的案件卡（`FE-B02`），點開是同一個詳情（`FE-B03`）、owner 的成軍／結案就在那裡（`FE-J04`）—— 「直達成軍／結案」＝兩步。
    詳情裡成軍或結案之後返回，那一筆的狀態 SHALL 是新的（用回應就地更新，不重掃三種狀態）。
  - 晚到的回應不得混進另一個視圖（`FE-B01-S15` 那一條在視圖切換上也成立）。
- **`deep-link`**（MODIFIED〈網址表示開著哪一層，複製它就能還原〉）：`panel=projects` 下多一個 `view=mine`；只在 `panel=projects` 下有意義、不合法的值視同沒有；
  `view=mine` 時 `page` 沒有意義 SHALL 去掉；`project` 照舊；視圖切換用 replace（跟翻頁一樣不加紀錄）。
- `listProjects` 操作多 `status` 參數（契約本來就有，替身的 route 已經接受 `status`）。
- 真瀏覽器 e2e：登入 → 發兩個案 → 我的案件看到兩筆 → 開一筆成軍 → 回來是「已成軍」→ 重新整理 `?panel=projects&view=mine` 仍在我的案件。

## Non-goals

- **不做應徵數、缺什麼角色、隊員名單**（`BE-G10`，WBS 2026-09-17 縮成後端有的欄位）。
- **不做 owner 篩選的後端 API**、不做總數：清單已交使用者轉達後端（2.2）；來了以後只換資料層，這份規格的可見行為不變（掃描上限那一段會變成不需要）。
- **不動看板的招募中視圖**（分頁、卡片、詳情、發案）與 `ListPanel` 容器的狀態機；「我的案件」是容器裡另一個列表，不是第二個面板。
- **不做搜尋、排序切換、狀態篩選**（`BE-G11`）。
- **不進標題列**：標題列在房間裡已經 4 個入口（`FE-X16-S19` 上限 5，`FE-K05` 還要一個），入口放在看板工具列。

## Capabilities

### New Capabilities
- `my-projects`：專案看板的「我的案件」視圖 —— 入口、三種狀態的掃描與上限、誠實標示、三種狀態、與詳情／成軍／結案的接合、晚到的回應。

### Modified Capabilities
- `deep-link`：〈網址表示開著哪一層，複製它就能還原〉多 `view=mine`（只在 `panel=projects` 下、去掉 `page`、不合法視同沒有、切換用 replace）。

## Impact

- `src/api/operations.ts`（`listProjects` 多 `status`）；契約判準 `tests/contract/rest/*projects*` 補 `status` 的請求形狀
- `src/list-panel/urlState.ts`／`PanelUrlSync.tsx`／`ListPanelProvider.tsx`（`view`）、`src/list-panel/BoardPanel.tsx`（工具列切換、`body`）、`src/list-panel/ListPanel.tsx`（`body` 插槽：有它時不畫分頁列表與翻頁）
- 新 `src/projects/MyProjects.tsx`（掃描、合併、標示、三種狀態）、`src/projects/myProjectsScan.ts`（純函式：合併、排序、上限）
- 判準：新 `tests/my-projects.test.tsx`、`tests/deep-link` 既有檔補 `view`；e2e `tests/e2e/my-projects.mjs`
- 效能：一個新元件進 board chunk，預期 +2 KB gz 以內；掃描最多 15 個請求（3 狀態 × 5 頁）、只在切到「我的案件」時發，招募中視圖零成本；量前後差貼 PR
