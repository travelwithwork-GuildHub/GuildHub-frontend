# CONTEXT

GuildHub 的 domain 詞彙與背景。**穩定之後才寫進來** —— 這裡不是草稿區。
還在爭論的東西放 change 的「未決問題」，不要放這裡。

## 這個專案是什麼

GuildHub 的前端。有空間感的自由工作者／專案媒合平台：使用者以 Avatar 進入世界，
在不同場景發案、接案、找人才、組隊、工作與社交。

後端是 FastAPI，另一個 repository。本 repo 不落 DB、不做認證判斷 ——
所有持久資料與授權由後端負責。

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
- **移動限 X/Z 平面**（FE-W02）。3D rendering + 2D gameplay logic。
- **不自建音視訊。** Meeting 是外部 URL。
- **GuildHub 管人與入口，不重做 GitHub / Figma / Notion。**
- **外部 GLB 預設不排入 MVP 工時**（FE-W16）。只有程式生成成本過高才用，
  且需符合統一色票與風格。
- **階段邊界**：MVP（W1–W5）不再塞新功能；W11–W12 **不做 MMORPG 化**。

## 詳細規劃

- `docs/ROADMAP.md` —— 場景設計、功能地圖、12 週演進、階段邊界
- `docs/WBS.md` —— 工作分解：FE-C / FE-W / FE-R / FE-P / FE-Q / FE-S
