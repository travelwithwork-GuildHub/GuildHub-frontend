## Context

- 今天的 DOM 視覺：`src/app/globals.css` 的 `@theme` 有 8 個色票、3 個字級、2 個間距（`FE-X01`，註解自己說是暫定）；
  `src/design/controls.ts` 有 `PRIMARY`／`SECONDARY`／`FIELD`／`FIELD_LABEL`／`FORM`／`CHECK_ROW` 六個字串常數（`FE-X13`）；
  `src/design/layers.ts` 五個堆疊層（型別受限）。沒有圓角、陰影、動態時長、字體堆疊的 token。
- 阻斷式面板都裝在 `src/panel/PanelShell.tsx`（`FE-A04` D1 抽出來的殼）：`<section>` 絕對定位在右側、寬 `min(26rem, 100vw − 2rem)`、
  標題列＝`h2`＋關閉鈕、覆蓋層是蓋在內側的一個 `div`（內容標 `inert`）。三個 provider（`ListPanelProvider`、`InboxPanelProvider`、
  `ProfilePanelProvider`）各自管自己的開關，**彼此不知道對方開著**；唯一的跨面板規則是「從名片寄信：看板關、收件匣開」（`FE-K01-S02`），
  寫死在那一條路上。
- 非阻斷的表面：`FirstEntryNotice`（`layer('panel')`、`pointer-events-none` 外層）、`SceneChatHud`（`layer('hud')`、左下）、
  `InteractionPrompt`（下方正中）、`AvatarPicker`（彈出層，`FE-X06-S14`～`S17`）。
- `ui-ux-pro-max --design-system`（"3D virtual office guild collaboration workspace project board chat panels professional clean"）
  給的方向：**Minimalism & Swiss**（clean、spacious、high contrast、grid-based、sans-serif）、中性灰階＋一個飽和的強調色、
  Inter 字體、subtle hover 200–250ms、sharp shadows、避免 AI 紫粉漸層。`--domain style` 對「毛玻璃蓋在 canvas 上」的答案是
  glassmorphism（accessibility risk: conditional）。它是建議，取捨在下面。
- 截圖（`/world` 訪客按 E 開看板）：訪客提示、看板、聊天框三個同時在畫面上；看板的關閉在右上、提示的「先四處看看」是一行字、
  聊天框的「送出」是一顆跟「建立我的身分」一樣大的藍鈕 —— **畫面上有三個主要動作**。

## Decisions

### D1｜字體：系統字體堆疊，不載 webfont

`ui-ux-pro-max` 推 Inter。三個理由不載：
1. **效能**：使用者明說「不要讓使用者覺得卡或讀取很慢」（`FE-X15`）。Inter latin 四個字重 ≈ 100 KB；而畫面上八成是中文，
   Inter 只管數字與英文，CJK 仍然落到系統字體 —— 花 100 KB 換數字的樣子。
2. **離線 build**：`next/font/google` 在 build 時下載，CI 或本機斷網就紅；`next/font/local` 要把二進位放進 repo（`vendor/` 只准文字）。
3. **截圖的問題不在字體**：截圖已經是 PingFang，難看的是層次、間距、顏色與三個浮層 —— 換字體不會修這些。

堆疊（一個 token `--font-sans`）：`ui-sans-serif, system-ui, "SF Pro Text", "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`。
**代價**：Mac／Windows／Linux 看起來不完全一樣；demo 機是 Mac，那是 SF Pro。要換成 webfont 的話重開 spec PR，`S02` 的第三行要改。

### D2｜面板不透明，不做毛玻璃

毛玻璃（`backdrop-filter: blur`）蓋在 3D canvas 上：(a) 文字對比取決於底下的世界畫什麼，判準要對每個場景、每個機位量，
而且會隨玩家走動變；(b) `backdrop-filter` 逼瀏覽器每一幀重合成 canvas 底下那一塊，`FE-O12` 的 FPS 預算會先被它吃掉。
不透明底＋`3:1` 的邊界＋一層陰影，對比可以量一次、跟世界無關。**代價**：面板蓋住的那一塊世界完全看不到 ——
但那本來就是「阻斷式」的意思（世界鎖著）。

### D3｜一次一個阻斷式面板：協調者持有「掛載中的面板」，讓位是兩個同步函式，拒絕有回饋

三個 provider 互不知道對方，所以「開第二個關第一個」要有一個共同的持有者。第一版寫的是「呼叫既有的 `onCloseRequest()`、看它接不接受」——
兩個審查者同時指出那條路走不通：`onCloseRequest` 是 `() => void`，接受／拒絕沒有回傳；「有未儲存的修改要先問」是非同步的人類決策；
React 的 state 更新也不同步 —— `claim()` 不可能同步知道結果。所以改成：

- **持有者由殼登記**：`PanelShell` 掛載時向協調者登記 `{ id, canYield, yield }`，卸載時釋放（effect cleanup；同 id 重複登記冪等，Strict Mode 兩次掛載安全）。
  「掛載中的阻斷式面板 ≤ 1」因此是協調者**看得到**的事實（登記表的大小），不是各 provider 的 `open` 旗標各自宣稱。
- **`canYield(): boolean` 同步**：每個面板今天就同步知道自己能不能立刻關 —— 送出中（`busy` ref）、名片有未儲存的修改（dirty）→ `false`。
  讓位**不替使用者回答**「要放棄修改嗎」：那是非同步的問題，讓位直接算拒絕（`S14` 第三段）。
- **`yield(): void` 同步**：確定關閉，走 provider 既有的關閉路徑（看板的網址退照舊），但**不把焦點還給開啟者**（`S13` 焦點只動一次）——
  今天 `ProfilePanelProvider` 在卸載後的 effect 裡還焦點，讓位時要跳過那一步（用一個「這次關閉是讓位」的旗標）。
- **請求同步**：provider 的 `openX()` 先 `coordinator.requestOpen()`：沒有持有者 → `true`；`canYield()` → `yield()` 後 `true`；否則 `false`
  並發一則 `role="status"` 的回饋（`toast` 層；文案不是契約）。呼叫端拿到 `false` 就不動自己的 state —— 不會先開再關、不閃。
  同一次事件裡的多個請求依呼叫順序處理（協調者的登記表是 ref，不是 state，所以同批次看得到前一個請求的結果）。
- **網址**：看板讓位走既有關閉路徑 → `PanelUrlSync` 照 `FE-B09` 退網址。上一頁／下一頁的 `restore` 也經過 `requestOpen()`；被拒 → `replaceState` 改回實際狀態
  （`FE-B09-S05` canonical 的同一招）、不動畫面（`S17`）。收件匣與名片不進網址（那是 `FE-B09` 的規格變更，不做）。

非阻斷的表面（訪客提示、聊天框、彈出層）**只讀**協調者（`useBlockingPanelOpen(): boolean`，從登記表推導），不登記。
為什麼不做成「路由決定開哪個」：見 ADR 0011 選項 B。**代價**：多一個 context、殼多兩個 prop（`canYield`、`onYield`）、provider 開面板多一次同步請求。
**Supersedes**: 無。ADR：`docs/adr/0011-one-blocking-panel-at-a-time.md`。

### D4｜三級控制項仍然是字串常數；「至多一個主要動作」以操作區為單位、由判準守

`FE-X13` 兩個審查者共同的警告：不要長出帶 API 的元件庫。所以 `PRIMARY`／`SECONDARY`／`TERTIARY`（新增）／`FIELD` 仍然是字串常數，
呼叫端自己選；常數帶 `data-tier`，判準數屬性不比 class。

第一版寫「每個表面恰好一個啟用中的主要動作，而且是下一步」—— 兩個審查者都指出這是最可能做錯的決定：`/login` 三個表單是三個意圖、
送出中／載入中／權限阻擋的畫面合理地沒有前進動作、結案確認的「取消是主要」證明主要其實是「推薦」不是「下一步」。改成：
**以操作區（一個表單、一個面板畫面的動作列、一個確認視窗）為單位，同一狀態下至多一個；有明確的前進動作時它是主要；
關閉／返回／取消不為了湊數升級；零個合法**（`S09` 逐操作區列出期望）。`/login` 三個表單各自可以有主要動作，暱稱那條靠版面順序與標題層次領先，
不靠降級別人的按鈕。「主要＝推薦的前進動作」在確認視窗上就是安全的那一個（取消），跟 `FE-J04` 一致。
「唯一」由判準守、不由執行期擋 —— 執行期擋的話第二個主要動作會靜默降級，畫面看起來對、程式碼是錯的。

### D5｜聊天框「收成一行」只讀協調者，不碰 transport 與記憶體

`SceneChatHud` 讀 `useBlockingPanelOpen()`：`true` 時只畫一行（區域名稱＋期間新到的數）；`log` 照舊由 `SceneChatProvider` 持有，
所以展開時訊息都在（`S16`）。「期間新到的數」＝收起時記下 `log.length`，之後 `log.length − 那個數`（換場景清空時歸零）。
收起狀態沒有輸入框，所以世界鎖不可能由它持有。捲動位置：收起時列表卸載會丟 `scrollTop`，所以收起前記下「在不在底部」與 `scrollTop`，展開後在 layout effect 裡還原（在底部 → 捲到底；不在 → 還原 `scrollTop`，有新的就亮「回到最新」）—— `scene-chat-ui` S11／S12 的狀態跨過收起／展開（`S16` 第三段）。**代價**：面板開著時看不到訊息內容 —— 但面板開著時世界本來就鎖著，
而且那正是使用者說的「混亂」。

### D6｜token 的值：Minimalism & Swiss 的中性灰階＋一個強調色，值在實作量出來

規格只約束門檻（`4.5:1`、`3:1`、`≥ 16px`⋯⋯），不約束值 —— 跟 `FE-X13` 同一條理由（值寫進規格就變成沒經過決定的永久契約）。
方向：底 `surface`（近白冷灰）、面板 `surface-raised`（白）、文字 `ink`（深灰藍）、`ink-muted`（中灰、對白 `≥ 4.5:1`）、
`accent`（一個飽和色；主要按鈕填色，**白字對它 `≥ 4.5:1`** —— 今天的 accent 對白只有 4.09:1，要降亮度）、`danger`、`line`（分隔）、
`control-edge`（`3:1`，不動）、新增 `scrim`（黑、alpha 在 `[0.3, 0.6]`）與 `focus`（焦點環，對 surface 與 surface-raised 都 `≥ 3:1`）。
圓角兩級（控制項、面板）、陰影兩級（面板、視窗）、動態時長一個（`--motion`，reduce 時 `0ms`）。

**待答（實作量）**：accent 降到哪個 L 值才對白 `≥ 4.5:1` 又不變泥；`ink-muted` 對 `surface` 與 `surface-raised` 同時 `≥ 4.5:1` 的 L；
陰影在 3D 底上看不看得出來（可能要比 Swiss 的「sharp」重一點）。量出來若動到任何 Scenario 的門檻 → 重開 spec PR。

### D7｜判準：真瀏覽器量、jsdom 守結構

- 對比、字級、尺寸、時長、alpha、rect：只有真瀏覽器算得出來（jsdom 不載 CSS，`getComputedStyle` 回空字串 → `S04` 明寫空字串要紅）。
  新 `tests/e2e/dom-visual.mjs`，沿用 `control-contrast.mjs` 的量法（畫到 canvas 讀 pixel）。跑法同 `FE-J04`：`next start`＋`internal`。
- 結構（標題列順序、返回／關閉位置、一次一個面板、提示讓位、聊天收起、主要動作計數）：jsdom 判準，`tests/dom-visual-*.test.tsx`。
  `S09` 的「至多一個」用 `data-tier="primary"` 這種**由常數帶出來**的屬性數（常數是唯一來源，屬性跟著它走；判準不比 class 字串）。
- 突變（tasks 第 6 節）：拿掉 token → `S01`／`S03`／`S05` 紅；協調者不 `yield()` 就開 → `S13` 紅；`canYield` 恆真 → `S14` 紅；讓位時還焦點給開啟者 → `S13` 焦點只動一次紅；上一頁被拒不 `replaceState` → `S17` 紅；
  聊天框不讀協調者 → `S16` 紅；把 `reduce` 的 media query 拿掉 → `S12` 紅；`PanelShell` 的 `<header>` 留在捲動容器裡 → `S08` 紅（Gemini 抓到 tasks 第一版把 overflow 加在含標題列的容器上）。

### D8｜效能預算：零新靜態請求、JS `≤ +4 KB`、CSS `≤ +6 KB`（gzip）、基線固定

估：協調者 context ≈ 1 KB、聊天收起 ≈ 0.5 KB、`PanelShell` 解剖 ≈ 0.5 KB、各表面換常數 ≈ 0.5 KB；Tailwind 只產用到的 class，
新 token 與三級控制項 ≈ 2–4 KB CSS。基線＝這份規格合併時 `main` 的 SHA（寫進 tasks 1.3），量法寫在 Requirement 裡（build manifest 的 `/world` 入口 chunk 各自 gzip 加總；同一 lockfile 與 Node）；裁決只在最後一片合併前對基線做一次，每片的數字是觀察（`FE-J04` 的量法：`--reveal` 163,149 → 163,853 B gz）。請求清單在真瀏覽器記（不含 `/api/*` 與 WS），前後相同。

## 待答問題

- `S19` 標題列與面板的幾何：面板掛在 `WorldCanvas` 的 `relative h-full w-full` 容器裡，那個容器在標題列**下方**的世界區（`src/app/world/page.tsx`：標題列 `div` → `OtherTabNotice` → `SceneNotices` → 世界區 `div.relative`），所以面板的 `absolute top-gutter` 是相對世界區，不會蓋到標題列。判準仍量 rect 不相交，因為這是版面沒有測試守著的假設。
- `S07` 五個面板寬度相同：今天名片面板是不是也用 `PanelShell` 的寬 —— 是（`ProfilePanel` 用殼）。`AvatarPicker` 是彈出層不算。
- `S19` 房間裡的標題列多「回到 Guild Hall」：品牌＋身分＋收件匣＋換角色＋回大廳＝5，剛好在上限；`FE-K05` 的狀態入口進來就要合併某個 —— 記在 `FE-K05` 的規格。
- 陰影與 3D 底的可辨識度沒有數字門檻（`box-shadow ≠ none` 只是存在性）—— 用截圖對，不進 CI。
