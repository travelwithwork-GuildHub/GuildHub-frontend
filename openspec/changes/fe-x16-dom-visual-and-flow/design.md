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

### D3｜一次一個阻斷式面板：一個協調者，provider 向它登記

三個 provider 互不知道對方，所以「開第二個關第一個」要有一個**共同的持有者**。做法：`src/panel/BlockingPanelCoordinator.tsx`
提供 `useBlockingPanel(id, { open, onCloseRequest })`：provider 開面板時 `claim(id)`，協調者對目前持有者呼叫它的 `onCloseRequest()` ——
**這是既有的「關閉是意圖」語意**（`PanelShell` 的註解）：持有者可以拒絕（送出中、未儲存要先問）。拒絕時 `claim` 回 `false`，呼叫端不開。
`FE-K01-S02`「從名片寄信：看板關、收件匣開」改走協調者，不再是特例。

非阻斷的表面**讀**協調者（`useBlockingPanelOpen(): boolean`）決定要不要讓位；它們不登記（登記了就會被當成阻斷式、被關掉）。

為什麼不做成「路由決定開哪個」：`PanelUrlSync` 只同步看板（`FE-B09`），收件匣與名片不在網址裡，而把它們塞進網址是 `FE-B09` 的規格變更。
**代價**：多一個 context；provider 的開面板路徑多一次同步的 `claim`。**Supersedes**: 無（`fe-k01-inbox` 的「看板關」是實作細節，不是決策）。
ADR：`docs/adr/0011-one-blocking-panel-at-a-time.md`。

### D4｜三級控制項仍然是字串常數；「唯一主要動作」由判準守，不由執行期擋

`FE-X13` 兩個審查者共同的警告：不要長出帶 API 的元件庫。所以：`PRIMARY`／`SECONDARY`／`TERTIARY`（新增）／`FIELD` 仍然是字串，
呼叫端自己選。「每個表面恰好一個啟用中的主要動作」是**判準**（`S09` 逐表面數），不是執行期的 registry ——
執行期擋的話，第二個主要動作會靜默降級，畫面看起來對、程式碼是錯的。

「下一步」的動態切換（複製前主要動作是複製、複製後是進入世界）由呼叫端依狀態換常數，不是常數自己有狀態。
確認視窗（結案）維持既有的「取消是主要、確認是次要」（安全預設；`FE-J04` 已談定），不改成紅色主要動作 —— 那是視覺變更以外的行為變更。

`/login` 今天有三個 `PRIMARY`（進入世界、帳號登入、註冊）—— 改成只有暱稱那條是主要，帳號那一塊是次要。
**代價**：帳號登入的人多看一眼；demo 的路是暱稱。

### D5｜聊天框「收成一行」只讀協調者，不碰 transport 與記憶體

`SceneChatHud` 讀 `useBlockingPanelOpen()`：`true` 時只畫一行（區域名稱＋期間新到的數）；`log` 照舊由 `SceneChatProvider` 持有，
所以展開時訊息都在（`S16`）。「期間新到的數」＝收起時記下 `log.length`，之後 `log.length − 那個數`（換場景清空時歸零）。
收起狀態沒有輸入框，所以世界鎖不可能由它持有。**代價**：面板開著時看不到訊息內容 —— 但面板開著時世界本來就鎖著，
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
  `S09` 的「恰好一個」用 `data-tier="primary"` 這種**由常數帶出來**的屬性數（常數是唯一來源，屬性跟著它走；判準不比 class 字串）。
- 突變（tasks 第 6 節）：拿掉 token → `S01`／`S03`／`S05` 紅；協調者不呼叫 `onCloseRequest` → `S13` 紅；拒絕不回 `false` → `S14` 紅；
  聊天框不讀協調者 → `S16` 紅；把 `reduce` 的 media query 拿掉 → `S12` 紅。

### D8｜效能預算：零新請求、JS `≤ +4 KB`、CSS `≤ +6 KB`（gzip）

估：協調者 context ≈ 1 KB、聊天收起 ≈ 0.5 KB、`PanelShell` 解剖 ≈ 0.5 KB、各表面換常數 ≈ 0.5 KB；Tailwind 只產用到的 class，
新 token 與三級控制項 ≈ 2–4 KB CSS。基線在第一片實作 PR 量（`FE-J04` 的量法：`--reveal` 163,149 → 163,853 B gz）。

## 待答問題

- `S07` 五個面板寬度相同：今天名片面板是不是也用 `PanelShell` 的寬 —— 是（`ProfilePanel` 用殼）。`AvatarPicker` 是彈出層不算。
- `S17` 房間裡的標題列多「回到 Guild Hall」：品牌＋身分＋收件匣＋換角色＋回大廳＝5，剛好在上限；`FE-K05` 的狀態入口進來就要合併某個 —— 記在 `FE-K05` 的規格。
- 陰影與 3D 底的可辨識度沒有數字門檻（`box-shadow ≠ none` 只是存在性）—— 用截圖對，不進 CI。
