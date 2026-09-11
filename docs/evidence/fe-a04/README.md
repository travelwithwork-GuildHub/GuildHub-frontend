# FE-A04 名片編輯 —— 真瀏覽器證據

`node tests/e2e/profile-editor.mjs` 在 `NEXT_PUBLIC_DATA_ADAPTER=internal` 的 dev server（本地 Route Handlers ＋ 可拋棄的 Postgres）上跑，2026-09-12，全部通過。

| 檔案 | 看什麼 |
|---|---|
| `1-panel-view.png` | 按標題列的名字開「我的名片」；`TalentFacts` ＋ 編輯鈕 |
| `2-panel-edit.png` | 原地切成表單；四欄預填、改好還沒送 |
| `3-panel-saved.png` | 送出成功回到顯示，顯示的是伺服器回的值；標題列的名字也變了 |
| `4-talent-board-updated.png` | Escape 關面板、走到人才看板按 E：自己那張變了（資料真的進了本地資料庫） |

腳本另外驗了：PATCH body 只有四鍵（無 `avatar_id`）、skills 去重不分大小寫且全形逗號也切、Escape 之後焦點回到那個按鈕。
