# `FE-B09` 設計：難逆轉的決定與代價

## D1｜網址讀寫用 `window.history` ＋ `popstate`，不用 Next 的 router

Next.js App Router 明文支援原生的 `history.pushState`／`replaceState` 做 shallow routing，
並會把它們同步進自己的 router（`usePathname`／`useSearchParams` 跟著變）。
這裡反過來**不**用 `useSearchParams`（要 `<Suspense>` 邊界、測試要 mock `next/navigation`），
直接讀 `window.location.search`、聽 `popstate`。jsdom 有這兩個，判準不用 mock。

**代價**：Server Component 不知道網址上開著什麼 —— 它本來就不需要知道（`FE-X01-S03` 讓 `page.tsx` 保持同步）。

## D2｜一個元件負責兩個方向：`<PanelUrlSync />`

```
網址 → 狀態：掛載時、popstate 時，解析 query（canonical 化） → openPanel／selected／page
狀態 → 網址：狀態改變時，算出 canonical query；跟目前網址一樣就不動（迴圈的終止條件）
```

層數變多（開清單、開詳情）→ `pushState`；層數不變（翻頁、canonicalize）→ `replaceState`；
層數變少 → **不寫網址**，改成「退」：本站有上一層就 `history.back()`（popstate 會把網址變成上一層，
解析出來跟狀態一樣，終止），沒有就 `replaceState` 成上一層的網址。

**「本站有沒有上一層」用 `history.state` 上的血緣判斷，而且要保留 Next 放在裡面的東西。**
Next.js App Router 把自己的路由狀態放在 `history.state`，整個覆蓋掉會讓上一頁離開 `/world` 時 router 崩潰
（審查抓到的）。所以每次 push／replace 都是 `{ ...history.state, guildhubPanel: { session, depth } }`：
`session` 是這次掛載隨機產生的識別，`depth` 是層數。Escape 只在「目前 entry 的 `guildhubPanel.session`
等於這次的 session 且 `depth > 0`」時 `back()`；深連結直達（`state` 裡沒有）、或先去了別的路由再回來
（`session` 不同）都走 replace。

## D3｜Escape 照舊**同步**改狀態；退網址的事交給 `PanelUrlSync`

`FE-X06-S01` 是同步斷言「按一次 Escape 詳情不再顯示」。`history.back()` 觸發的 popstate 是非同步的 ——
讓 Escape 等 popstate 才關 UI 會撞上那條已封存的判準（兩位審查者都指出）。

所以 Escape 不動：`useEscapeLayer` 的 `onEscape` 照舊同步 `setSelected(null)`／`closePanel()`。
`PanelUrlSync` 看到「狀態少了一層、網址還在深層」才依 D2 退網址；之後 popstate 進來時網址已經跟狀態一致，
「一樣就不動」終止。退網址期間掛一個 `pendingBack` 旗標，避免狀態→網址那一支在 popstate 之前又把短網址 push 回去。

**代價**：Escape 之後網址晚一個 tick 才變 —— 判準對網址用 `waitFor`，對畫面照舊同步斷言。

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

## D6｜Canvas 不重掛的判準：Playwright 的節點同一性是主判準

jsdom 掛不了 WebGL，`WorldCanvas` 會退成 `WebGLUnavailable`。jsdom 裡的探針（在 `ListPanelProvider` 底下
計數自己的掛載次數）只證明「那一層沒重掛」—— `key={url}` 綁在 Canvas 上探針照樣是 1（審查指出）。
所以 `S12` 的主判準是 Playwright：一開始抓住 `canvas` 的 element handle（不是 locator，locator 會重新解析到新節點），
走完一串網址變化之後它仍 `isConnected`、且頁面上只有一個 `canvas`。探針只是快的輔助。

## 待答問題

1. **`panel=projects` 的深連結要不要現在支援？** 案件面板存在（佔位卡），網址形狀一樣，順手支援；
   案件的 `project=<id>` 等 `FE-B03`。
2. **分享按鈕。** 這一列只保證網址可複製、可還原；「複製連結」的按鈕是不是要做，等 `FE-B04` 的詳情有人用。

## 這一份怎麼驗

- `S01`–`S11`：jsdom，整棵真的 provider 樹 ＋ `PanelUrlSync`，`window.history` 是真的（jsdom 實作 pushState／popstate）。
- `S12`：Playwright 的 `canvas` 節點同一性（主）＋ jsdom 探針（輔）。
- `S13`：`panel=projects`。
- 深連結直達：測試先 `history.replaceState(null, '', url)` 再掛載。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：push 改 replace → `S06`／`S07` 紅；翻頁 push → `S08` 紅；Escape 不改網址 → `S10` 紅；
  直達時 Escape 用 back → `S11` 紅（jsdom 的 back 在只有一層時是 no-op，網址不變）；
  起始頁撲空不退回 → `S04` 紅；不驗參數 → `S05` 紅。
