# CONTEXT

GuildHub 的 domain 詞彙與背景。**穩定之後才寫進來** —— 這裡不是草稿區。
還在爭論的東西放 change 的「未決問題」，不要放這裡。

## 這個專案是什麼

GuildHub 的前端。有空間感的自由工作者／專案媒合平台：使用者以 Avatar 進入世界，
在不同場景發案、接案、找人才、組隊、工作與社交。

後端是 FastAPI，另一個 repository。本 repo 不落 DB、不做認證判斷 ——
所有持久資料與授權由後端負責。

## 後端在哪、合約的真實來源

```
後端 repo   ~/Desktop/workshop/fergus/GuildHub-backend
啟動        ./run.sh        REST http://localhost:8000   WS ws://localhost:8000/ws
整合指南    GuildHub-backend/API-前端整合指南.md      ← 先讀這份
```

| 東西 | 真實來源 | 不要看哪裡 |
|---|---|---|
| REST 欄位與型別 | `http://localhost:8000/docs`（OpenAPI，自動產生） | 任何手寫的複述 |
| WebSocket 協定 | `GuildHub-backend/app/realtime/protocol.py` | 同上 |

**不要在本 repo 複述後端的欄位定義。** 複述一定會漂，而漂掉的合約比沒有合約危險。
規格寫「行為與驗收條件」，欄位指過去。理由見 `docs/adr/0001-backend-contract.md`。

REST client 用產的，不要手寫：

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

**大廳的 WebSocket 不需要登入、不需要資料庫。** `./run.sh` 之後直接連得上，
所以即時層可以先開工，不必等身分系統。

## ⚠️ ROADMAP 與 WBS 是在後端存在之前寫的

`docs/ROADMAP.md` 與 `docs/WBS.md` 描述的即時層，與實際協定**對不上至少七處**。
寫規格的時候以 `protocol.py` 為準，不是以 WBS 的敘述為準：

| WBS / 舊 CONTEXT 寫的 | 實際協定 |
|---|---|
| `snapshot` / `player_joined` / `player_left` / `positions` | `hello` / `snapshot` / **`pos`** / **`presence`（join 與 leave 合併成一則）** / `status` / `chat` / `err` |
| FE-R03「position / **rotation** 取樣」 | `f` 是 **0–3 的離散朝向**（0 下 1 左 2 右 3 上），沒有 rotation |
| 「移動限 **X/Z** 平面」 | 協定是 **`x` / `y` 整數像素**。送浮點會被 `StrictInt` 擋下，**整則訊息丟棄** |
| 沒提 | **自己的 `move` 會原路廣播回自己**。後端不做逐人過濾，前端要以本地預測為準、收到自己的 id 就忽略 |
| 沒提 | **握手失敗不會有 `err` 訊息**，直接 close `1008` —— 連線根本沒 accept。前端只看得到「被關掉」 |
| 沒提 | **狀態文字超過 12 字會被靜默丟棄**，舊狀態不變。前端一定要 `maxlength=12`，否則使用者以為壞了 |
| 沒提 | **一條連線只屬於一個 scene。切場景等於關掉重開**，沒有 switch 訊息 |
| 沒提 | **不合法的訊息一律靜默丟棄**，不回錯誤。送出去沒反應就是格式不對 |

另外兩件跟 W1 驗收直接相關的：

- **靜止時完全收不到 `pos`** —— 沒有人移動時整則訊息不送，不是送空陣列。
  **不要拿它當心跳**
- 後端已經有壓測工具：`python tools/run_swarm.py --n 40 --seconds 300`
  （40 個會走動的假人，拿來調插值）、`--n 5 --idle`（驗證靜止時封包數為 0）

**FE-R06 的 40 browser 壓測只准打自己本機起的後端。** 後端就在隔壁目錄，
`./run.sh` 起來就是自己的一份 —— 沒有理由去打任何共用的實例。
一次 40 個連線的壓測足以把同時在用那份後端的人全部踢下線。
判準見 `AGENTS.md`〈測試環境隔離〉。

## 一條原則

> **3D 負責空間、Presence 與探索；DOM / React 負責搜尋、表單、詳細資料與高效率操作。**

介面爭議先用這條解。

## 場景

| 場景 | 產品目的 | 導入 |
|---|---|---|
| **Guild Hall** | 世界首頁／中央樞紐。所有場景都可以回到這裡 | W3 |
| **Marketplace** | 發案／接案／找人才 | W4 |
| **Office** | 工作 Presence／輕社交。讓「人正在工作」可被看見 | W4–W5 |
| **Skill Spaces** | 按技能分流的人才空間（Developer Office / Design Studio / AI Lab） | W6 |
| **Project Room** | 成軍後的專案空間 | W4 |
| **Event Space** | 社群活動／留存 | W11 |

## 詞彙

| 詞 | 意思 | 不是什麼 |
|---|---|---|
| **Presence** | 誰在線、在哪個場景、什麼狀態 | **不是** chat。也不是「最後上線時間」—— 它是即時的 |
| **Realtime 資料** | position、presence、chat | **不落 DB。** refresh 後清空，這是刻意的，不是還沒做 |
| **持久資料** | Profile、Project、Inbox、Room、Seat | **不是**全部資料。上面那三種不算 |
| **Avatar Configuration** | Body / Hair / Hair Color / Outfit / Outfit Color / Skin 的設定值 | **不是**模型檔。DB 存設定，不存 `.glb` |
| **Procedural Avatar** | 由 primitive（RoundedBox / Capsule / Sphere）組出來的 Chibi 角色 | **不是**載入外部模型。Local 與 Remote 共用同一套 |
| **Project Door** | Guild Hall 走廊上，一個 active project 的空間入口 | **不是** Project Room 本身。它是門，不是房間 |
| **Seat** | Project Room 裡的座位 | **不是** Personal Desk |
| **Personal Desk** | Office 裡認領的工作桌 | **不是** Seat。兩者的認領與釋放規則不同（W6 才做） |
| **Looking For** | Available for Work / Hiring / 正在找什麼角色 | **不是** Status。Status 是自由文字（12 字上限），Looking For 是結構化媒合訊號 |
| **Board** | Project Board / Talent Board，3D 場景裡的看板 | **不是**搜尋介面。它是**入口**，點了開 DOM Panel |
| **Interaction Range** | 走近可互動物件的觸發範圍（Rapier sensor） | **不是** click。玩家用 E 互動，不是滑鼠點 3D 物件 |
| **`interactionTarget`** | 目前可互動對象，寫在 Zustand，由 React DOM 顯示提示 | **不是** 3D text。提示是 DOM 元素 |
| **40 Browser Gate** | 40 個真實 Chromium / R3F browser 的 E2E 壓測 | **不是** 40 個 WebSocket fake client。那是另一條 network baseline 測試 |
| **39 Remote** | 單一 browser 同畫面渲染 1 local + 39 remote 的**渲染**測試 | **不是**壓測。跟 40 Browser Gate **分開驗證**，不要混在一起 |
| **Room Password** | 成軍時強制設定，進 Project Room 要輸入 | **不是**帳號密碼。它綁專案，不綁人 |
| **Guest** | 可移動、看玩家、看板的訪客 | **不是**「還沒填暱稱的人」。Guest 有暱稱和 avatar，只是不能發案 / 寄信 / 進房 |

## Project lifecycle

```
recruiting → active → closed
```

`recruiting` 才會出現在 Project Board。成軍後產生 Project Door 與 Project Room。

## 已知的邊界與限制

- **Realtime chat 不落 DB**，refresh 後清空。Lobby 與 Room chat 都一樣。
  要留存的東西放外部工具。
- **Inbox 訊息不可 Edit / Delete** —— 陌生人第一接觸的持久紀錄，防止事後抵賴。
- **高頻資料不進 React。** position / rotation / 動畫相位**不得**寫入 React state
  或 Zustand，只能放 ref、Three object transform、Rapier rigid body。
  違反這條不會有錯誤訊息，只會變慢。
- **Camera 固定。** Orthographic、Elevated、固定角度與距離、平滑跟隨。
  **不提供玩家自由旋轉**（FE-W04）。
- **移動是 2D gameplay logic**（FE-W02）。3D rendering + 2D 邏輯。
  **座標見上面〈後端在哪〉那張表** —— 協定用的是 `x`/`y` 整數像素。
- **不自建音視訊。** Meeting 是外部 URL。
- **GuildHub 管人與入口，不重做 GitHub / Figma / Notion。**
- **外部 GLB 預設不排入 MVP 工時**（FE-W16）。只有程式生成成本過高才用，
  且需符合統一色票與風格。
- **階段邊界**：MVP（W1–W5）不再塞新功能；W11–W12 **不做 MMORPG 化**。

## 詳細規劃

- `docs/ROADMAP.md` —— 場景設計、功能地圖、12 週演進、階段邊界
- `docs/WBS.md` —— 工作分解：FE-C / FE-W / FE-R / FE-P / FE-Q / FE-S
