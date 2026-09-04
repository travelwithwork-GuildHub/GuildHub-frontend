# GuildHub Frontend

**有空間感的自由工作者／專案媒合平台。** 使用者以 Avatar 進入 GuildHub，
在不同場景發案、接案、找人才、組隊、工作與社交。

## 一條原則，決定所有介面爭議

> **3D 負責空間、Presence 與探索；DOM / React 負責搜尋、表單、詳細資料與高效率操作。**

所以：Marketplace 的 3D 看板是**入口**，真正的搜尋與篩選一律用 DOM。
不強迫玩家走路找案。**Canvas 裡不放複雜表單。**

## 核心使用流程

```
建立身分 → 進入世界 → 發現機會 → 媒合聯絡 → 組成團隊 → 進入專案房 → 協作 → 回訪
暱稱+Avatar  Guild Hall  Marketplace  Profile/Inbox  Team Formation  Project Room  Resources  Events
```

## 技術

| | |
|---|---|
| 框架 | Next.js（App Router）+ TypeScript strict |
| 3D | React Three Fiber / Three.js / Drei |
| 物理 | Rapier |
| 狀態 | Zustand（低頻）+ TanStack Query（伺服器狀態） |
| 驗證 | Zod —— **所有 API / WebSocket 外部資料都要過** |
| 表單 | React Hook Form + Zod |
| 樣式 | Tailwind CSS |
| 連線 | **Native WebSocket**（不用 Socket.IO） |
| 後端 | FastAPI，另一個 repository |

狀態管理用 **Zustand**，連線用 **Native WebSocket** —— 這兩個是規劃裡指定的，
不要換成 Redux 或 Socket.IO。

## 現在的狀態

**W1 尚未開始。** 這個 repo 目前只有開發流程的骨架 ——
`package.json` 的四個 script 是刻意會失敗的佔位，CI 是紅的，
要在 W1 建立 Next.js 專案時一併設好。

```bash
bash .github/scripts/progress.sh --all       # 161 項各自在什麼狀態
bash .github/scripts/progress.sh --blocked   # 不在自己手上的，以及誰依賴它
bash .github/scripts/wbs-page.sh --open      # 整份計畫的網頁版
```

**前兩個是每天用的**（現在做到哪裡）、**第三個是 review 時用的**（整份計畫長什麼樣）。
兩者都是從 `docs/WBS.md` 算出來的，沒有人手動維護 —— 所以不會漂。
網頁版的產物 `docs/wbs.html` **不進版控**，改了 WBS 就重跑一次。

## 怎麼開發

規格由 **OpenSpec CLI** 管，git / PR / CI 的紀律在 `AGENTS.md`。

```
   訪談需求          prompts/01-discovery.md
        ↓
/opsx:propose        產生 proposal → specs → design → tasks，產完就停
        ↓
   開 draft PR       讓隊友先看規格，這時還沒有任何 code
        ↓
   規格審查          prompts/03-spec-review.md + openspec validate --strict
        ↓
/opsx:apply          談定之後才實作
        ↓
   驗證              prompts/05-verify.md
        ↓
   CI 綠 + review → 合併
        ↓
/opsx:archive        delta 同步進 openspec/specs/
```

一個 change = 一個目錄 = 一個分支 = 一個 PR，可以平行。

```bash
npm ci
npx openspec list
```

## 讀哪些檔案

| | |
|---|---|
| `AGENTS.md` | 給 AI coding agent 的規範（git / PR / CI 那一半） |
| `CONTEXT.md` | **domain 詞彙。** 進 change 之前先讀 |
| `docs/ROADMAP.md` | 場景設計、功能地圖、12 週演進、階段邊界 |
| `docs/WBS.md` | 工作分解（Work Breakdown Structure）。**前端工作**：FE-A 身分與個人資料 / FE-B 探索 / FE-M 媒合 / FE-N 洽談與成立 / FE-J 專案營運與生命週期 / FE-K 通訊與通知 / FE-T 信任、安全與隱私 / FE-W 3D 世界與角色 / FE-R 即時同步 / FE-V 場景與空間活動 / FE-X 產品體驗共用 / FE-O 平台與交付；**後端銜接清單**：BE-G（不擋任何前端工作 —— 前端有自己的後端） |
| `.github/scripts/progress.sh` | **現在做到哪裡。** 算出來的，沒有人維護。`--check` 在 CI 裡跑 |
| `.github/scripts/wbs-page.sh` | 把 `docs/WBS.md` 產成一頁可以點開收合的網頁 |
| `docs/adr/` | 難逆轉的決策 |
| `openspec/config.yaml` | 規格要寫到什麼程度 |
| `openspec/specs/` | 系統現在是什麼樣子（archive 時自動同步） |
| `SETUP-GITHUB.md` | 建 repo 的人做一次，**設完可刪** |

## 幾條不會變的

- Realtime 資料（position、presence、chat）**不落 DB**，refresh 後清空
- 持久訊息（Inbox）**不可 Edit / Delete**
- GuildHub 管人與入口，**不重做 GitHub / Figma / Notion**，不自建音視訊
- 高頻資料（position / rotation / 動畫相位）**不得寫入 React state 或 Zustand**
- 40 Browser 壓測與單 Browser 39 remote 渲染測試 **分開驗證**
- 階段邊界要守：MVP（W1–W5）不再塞新功能；W11–W12 **不做 MMORPG 化**
