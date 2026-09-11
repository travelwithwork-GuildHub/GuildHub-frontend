# FE-B04 的瀏覽器證據

`node tests/e2e/board-panel.mjs`（需要 `npm run dev`）產生的。攔截的回應是腳本偽造的（`page.route`），
證明的是元件行為，**不**證明真 GuildHub 整合。**不連任何團隊共用的位址。**

| 檔案 | 情況 |
|---|---|
| `talent-board-open.png` | 人才看板：兩張卡 —— 名字、角色色塊（跟世界裡同一個 `avatar_id` 一致）、時數（`null` 是「未提供」不是 0）、技能；沒有 `bio`、沒有時間 |
| `talent-detail-open.png` | Tab 一下到第一張卡、**真的按 Enter** 開的詳情：`bio` 是 `GET /api/profiles/{id}` 回的那一句（跟列表上的不同），名片更新於用 `<time>`；列表區 `inert` |

```
[B04-S05] Tab 一下就到了第一張人才卡（Space 那一輪）
[B04-S05] 按 Space 開出了詳情
[B04-S05] Tab 一下就到了第一張人才卡（Enter 那一輪）
[B04-S05] 按 Enter 開出了詳情
[B04-S06] 詳情呈現的是 GET /api/profiles/{id} 回的那一筆，不是列表那一筆
[B04-S16] 詳情開著時列表區是 inert
[B04-S11] 返回之後列表還在（2 張卡）
```

第一次跑 Space 那一輪之後、Enter 那一輪 Tab 不到卡 —— 返回之後焦點掉到 body。
**這是這支腳本抓到的真 bug**（jsdom 裡 `fireEvent` 不動 activeElement，單元判準本來是恆真的）；
修法是 overlay 關掉時把焦點還給列表。
