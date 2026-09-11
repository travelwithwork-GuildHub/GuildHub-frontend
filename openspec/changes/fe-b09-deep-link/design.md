# `FE-B09` 設計：難逆轉的決定與代價

## D1｜網址讀寫用 `window.history` ＋ `popstate`，不用 Next 的 router

Next.js App Router 明文支援原生的 `history.pushState`／`replaceState` 做 shallow routing，
並會把它們同步進自己的 router（`usePathname`／`useSearchParams` 跟著變）。
這裡反過來**不**用 `useSearchParams`（要 `<Suspense>` 邊界、測試要 mock `next/navigation`），
直接讀 `window.location.search`、聽 `popstate`。jsdom 有這兩個，判準不用 mock。

**代價**：Server Component 不知道網址上開著什麼 —— 它本來就不需要知道（`FE-X01-S03` 讓 `page.tsx` 保持同步）。

## D2｜一個元件負責兩個方向：`<PanelUrlSync />`

```
網址 → 狀態：掛載時、popstate 時，解析 query → openPanel／selected／page
狀態 → 網址：狀態改變時，算出 canonical query；跟目前網址一樣就不動（迴圈的終止條件）
```

push 或 replace 由「層數有沒有變」決定：層數變多 → push；層數不變（翻頁、canonicalize）→ replace；
層數變少 → 如果是上一頁觸發的（popstate 進來的）不動，如果是 Escape 觸發的且本站有上一層 → `history.back()`，
沒有上一層（深連結直達）→ replace。

「本站有沒有上一層」：我們自己 push 的時候在 `history.state` 上放一個標記 `{ guildhub: depth }`；
popstate／掛載時讀它。深連結直達的 `history.state` 是 `null` → 沒有上一層。

## D3｜Escape 從「直接改狀態」變成「改網址」

`FE-X06` 的 `useEscapeLayer(onEscape)` 不動；`ListPanel` 與 `TalentDetail` 的 `onEscape` 改成呼叫
`PanelUrlSync` 給的 `back()`：有上一層 → `history.back()`（popstate 會把狀態關一層）；沒有 → replace 上一層的網址再套用。
這樣 Escape 與瀏覽器上一頁**走同一條路**，不會漂。

**代價**：Escape 的效果從同步變成經過 popstate（非同步一個 tick）。判準用 `waitFor`。

## D4｜翻頁狀態機多一條：起始頁撲空 → 退回第 0 頁

`opened(kind, page)` 允許起始頁；`resolved` 空陣列且 `shown === null` 且 `identity.page > 0`
→ `identity.page = 0`、phase 仍 loading（驅動層會重新請求）。第 0 頁本來就空 → 首次無資料（不變）。
`FE-B01-S09` 的規則（從滿頁前進撲空留在原頁）不受影響：那條的前提是 `shown !== null`。

## D5｜參數的 canonical 形式

| 輸入 | canonical |
|---|---|
| `panel=profiles` | 同 |
| `panel=profiles&page=0` | `panel=profiles` |
| `profile=<id>`（沒有 panel） | `panel=profiles&profile=<id>` |
| `page=-1`／`page=abc`／`page=1.5` | 去掉 `page` |
| `panel=bogus` | 去掉全部（`/world`） |
| `panel=projects` | 同（案件面板開著，佔位卡） |
| `panel=projects&profile=<id>` | 去掉 `profile`（案件面板沒有人才詳情） |

`<id>` 只做形狀檢查（uuid），存不存在由 `GET /api/profiles/{id}` 的 404 → `FE-X04` 載入失敗處理。

## D6｜Canvas 不重掛的判準

jsdom 掛不了 WebGL，`WorldCanvas` 會退成 `WebGLUnavailable`。判準掛的是**同一棵樹裡的一個探針**
（在 `ListPanelProvider` 底下、`PanelUrlSync` 旁邊，計數自己的掛載次數）—— 網址變化若讓那一層重掛，探針會數到 2。
真的 Canvas 在 Playwright 用 `canvas` 的 DOM 節點同一性驗。

## 待答問題

1. **`panel=projects` 的深連結要不要現在支援？** 案件面板存在（佔位卡），網址形狀一樣，順手支援；
   案件的 `project=<id>` 等 `FE-B03`。
2. **分享按鈕。** 這一列只保證網址可複製、可還原；「複製連結」的按鈕是不是要做，等 `FE-B04` 的詳情有人用。

## 這一份怎麼驗

- `S01`–`S11`：jsdom，整棵真的 provider 樹 ＋ `PanelUrlSync`，`window.history` 是真的（jsdom 實作 pushState／popstate）。
- `S12`：探針計數（jsdom）＋ Playwright 的 `canvas` 節點同一性。
- 深連結直達：測試先 `history.replaceState(null, '', url)` 再掛載。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：push 改 replace → `S06`／`S07` 紅；翻頁 push → `S08` 紅；Escape 不改網址 → `S10` 紅；
  直達時 Escape 用 back → `S11` 紅（jsdom 的 back 在只有一層時是 no-op，網址不變）；
  起始頁撲空不退回 → `S04` 紅；不驗參數 → `S05` 紅。
