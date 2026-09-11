# FE-K01 Inbox —— 真瀏覽器證據

`FRONTEND=http://localhost:3104 node tests/e2e/inbox.mjs` 在 `NEXT_PUBLIC_DATA_ADAPTER=internal` 的 dev server（本地 Route Handlers ＋ 可拋棄的 Postgres）上跑，兩個瀏覽器 context 各登入一個人，2026-09-12，全部通過。

| 檔案 | 看什麼 |
|---|---|
| `1-a-new-thread.png` | A 在人才看板按 B 名片上的「寄信給他」：看板關、收件匣直接進跟 B 的（還沒有信的）對話 |
| `2-a-sent.png` | A 寄出：`POST /api/messages` 201、對話裡出現、表單清空 |
| `3-b-inbox-list.png` | B 開收件匣：對話清單有 A（名字解析出來）、摘要是那一句 |
| `4-b-thread-replied.png` | B 進對話回信：兩封、舊到新、自己的靠右 |
| `5-a-thread-with-reply.png` | A 重開收件匣（第 0 頁重取）看到 B 的回信；對話順序正確 |

腳本另外驗了：別人的名片有寄信鈕、交接後 `data-with` 是 B 的 id、摘要不以「你：」開頭（最新一封是 B 寄的）。
