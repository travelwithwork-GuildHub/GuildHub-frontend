## Purpose

DOM 那一半的介面（登入頁、首次進入、標題列、看板與詳情、收件匣、名片、聊天框、確認視窗）
要看得出**層次**與**下一步**：文字有四級、表面有三層、控制項有三級而且每個表面同時只有一個主要動作；
同一時間只開一個阻斷式面板，非阻斷的提示讓位。每一條都給一個在瀏覽器裡量得到的門檻 ——
這份規格不寫「好看」，寫的是「不好看的實作會在哪一條紅」。3D 那一半不在這裡（`world-design-system`）。

## Applicability

權限：不適用 —— 本 change 不做授權判斷（哪些人看得到哪些動作由各功能的規格決定；這裡只管它們長什麼樣、同時開幾個）
併發：適用 —— 兩個 provider 同時要開面板、面板送出中收到「讓位」的要求
持久資料相容性：不適用 —— 不讀寫任何持久資料；訪客提示「關掉了不落地」照 `first-entry` 既有規則
失敗路徑：適用 —— 送出中的面板拒絕讓位、`prefers-reduced-motion` 下動態歸零、色碼字面值被掃到、判準拿到空字串（jsdom 沒有樣式）時 SHALL 紅不 SHALL 綠
測試連到什麼：jsdom 判準不連任何外部服務；真瀏覽器判準連**本機自起**的 `next start`＋`internal` 資料層（真的 Route Handler、真的 Postgres），`/api/*` 之外的東西用 `page.route` 偽造。不連任何團隊共用的位址。

## 名詞

- **表面（surface）**：一個使用者一次看到、有自己標題與動作的區域。這份規格點名的表面：`/login` 頁、
  世界裡的訪客提示、金鑰交接、標題列、看板清單（案件／人才）、看板詳情（案件／人才）、收件匣清單、
  收件匣對話、我的名片、房間密碼視窗、結案確認。
- **阻斷式面板**：裝在 `PanelShell` 裡、持世界命令鎖的表面（看板、收件匣、我的名片）。
- **非阻斷的提示**：不鎖世界的表面（訪客提示、場景聊天框、互動提示、換角色彈出層）。
- **量法**：顏色一律畫到 canvas 再讀（`control-affordance` 的 M1），對比度照 WCAG 2.1 的相對亮度算；
  尺寸與時長讀 `getComputedStyle()` 與 `getBoundingClientRect()`。**視窗 1280×720**。

## ADDED Requirements

### Requirement: 每一類視覺 token 單一來源，而且 DOM 元件只從 token 取值

延伸 `app-shell` 的〈DOM design token 的單一事實來源〉：token 的類別 SHALL 是**色票、字級刻度、間距刻度、
圓角、陰影、動態時長、字體堆疊**七類，每一類單一來源。`src/**` 下任何 `.tsx`／`.ts`／`.css` SHALL NOT 出現
色碼字面值（`#rgb`、`#rrggbb(aa)`、`0xrrggbb`、`rgb(`、`hsl(`、`oklch(`）—— 唯一的例外是 token 的定義檔本身，
以及帶豁免註解的那一行。字體堆疊 SHALL 只有一份，而且 SHALL 包含至少一個繁體中文字體家族名稱
（沒有的話 CJK 會落到瀏覽器預設的襯線字）。

#### Scenario: [FE-X16-S01] 色碼字面值被掃到

- **WHEN** 掃描 `src/**` 的原始碼（token 定義檔除外）
- **THEN** 找到的色碼字面值 SHALL 是零個
- **AND WHEN** 把一段含 `background: #fff` 的假輸入餵給同一個掃描
- **THEN** 它 SHALL 被列出來（判準本身不是恆真）

#### Scenario: [FE-X16-S02] 字體堆疊只有一份且涵蓋繁中

- **WHEN** 在真瀏覽器讀 `body`、面板標題、卡片標題、按鈕與輸入框的 `font-family`
- **THEN** 五者 SHALL 完全相同
- **AND** 該字串 SHALL 含至少一個繁體中文字體家族名稱
- **AND** 該次頁面載入 SHALL NOT 發出任何字型檔請求（`.woff`／`.woff2`／`.ttf`／`.otf`）

### Requirement: 文字有四級層次，而且每一級都讀得清楚

字級刻度 SHALL 至少有四級：**頁面標題 > 面板標題 > 條目標題 > 內文 ≥ 說明文字**。內文 SHALL `≥ 16px`、
行高 `≥ 1.5`；說明文字 SHALL `≥ 13px`；面板標題 SHALL `≥ 1.25 ×` 內文；頁面標題 SHALL `≥ 1.5 ×` 內文。
內文、說明文字（淡色）與危險色文字對它們所在的表面，對比度 SHALL `≥ 4.5:1`（WCAG 2.1 SC 1.4.3）。

#### Scenario: [FE-X16-S03] 四級字級在每個表面上都成立

- **WHEN** 在真瀏覽器打開看板清單、看板詳情、收件匣對話、`/login`、訪客提示
- **THEN** 每個表面上量到的 頁面標題 > 面板標題 > 條目標題 > 內文 ≥ 說明文字 SHALL 嚴格成立（該表面沒有的那一級跳過）
- **AND** 內文 `≥ 16px` 且行高 `≥ 1.5`、說明文字 `≥ 13px`

#### Scenario: [FE-X16-S04] 文字對比度

- **WHEN** 量每個表面上的內文、淡色說明文字、危險色文字，對其**實際合成後**的背景
- **THEN** 三者 SHALL 各 `≥ 4.5:1`
- **AND WHEN** 判準拿到的顏色是空字串（沒有樣式）
- **THEN** 判準 SHALL 紅，MUST NOT 把空字串算成通過

### Requirement: 表面有三層：世界、面板、面板上的視窗

浮在世界上的阻斷式面板 SHALL 有**不透明**的底（合成後 alpha `= 1`）、一圈邊界與一層陰影 ——
世界底下畫什麼，面板上的文字都不受影響（毛玻璃不做，理由在 design 的 `D2`）。
蓋在面板上的視窗（詳情、確認、密碼）SHALL 有一層遮罩蓋住面板的內容區，遮罩的 alpha SHALL 在 `0.3` 到 `0.6` 之間 ——
看得出底下還有東西、也看得出現在不能碰它。

#### Scenario: [FE-X16-S05] 面板的底是實的、有邊界、有陰影

- **WHEN** 開任一阻斷式面板，量它的背景、邊界與陰影
- **THEN** 背景合成後 alpha SHALL `= 1`
- **AND** 邊界對世界底色 SHALL `≥ 3:1`（沿用 `control-affordance` 的門檻）
- **AND** `box-shadow` SHALL NOT 是 `none`

#### Scenario: [FE-X16-S06] 面板上的視窗有遮罩

- **WHEN** 在看板清單裡開一筆詳情、在詳情裡開結案確認、在門前開密碼視窗
- **THEN** 面板的內容區上方 SHALL 有一層遮罩，合成後 alpha 在 `[0.3, 0.6]`
- **AND** 遮罩底下的內容區 SHALL 是 `inert`（沿用 `list-panel`／`project-directory` 既有規則）
- **AND WHEN** 視窗關了
- **THEN** 遮罩 SHALL 不在

### Requirement: 每一個阻斷式面板的解剖一致

阻斷式面板 SHALL 由上而下是：**標題列 → 內容區**。標題列 SHALL 是面板裡第一個區塊，內含
（由左到右）**返回**（只在子畫面裡）、**標題**、**關閉**；關閉 SHALL 是標題列裡最後一個可聚焦的元素，
返回 SHALL 是第一個。內容區 SHALL 自己捲動（面板高度 SHALL NOT 超過視窗），捲到底標題列仍然在視窗裡。
所有阻斷式面板 SHALL 是同一個寬度（一個 token）。子畫面（詳情、對話）SHALL 換掉標題、加上返回，
關閉留在原位 —— 使用者不用重新找按鈕。

#### Scenario: [FE-X16-S07] 標題列的三個位置

- **WHEN** 開看板清單、看板詳情、收件匣清單、收件匣對話、我的名片
- **THEN** 每一個面板的第一個區塊 SHALL 是標題列，裡面有一個標題
- **AND** 關閉 SHALL 是標題列裡最後一個可聚焦的元素，五個面板的關閉在視窗裡的位置 SHALL 相同（誤差 `≤ 1px`）
- **AND** 看板詳情與收件匣對話的標題列裡 SHALL 有返回，且它是第一個可聚焦的元素；清單與名片 SHALL 沒有返回
- **AND** 五個面板量到的寬度 SHALL 相同

#### Scenario: [FE-X16-S08] 內容區自己捲動、標題列不走

- **WHEN** 看板清單有 30 筆（三頁翻完）
- **THEN** 面板的高度 SHALL `≤` 視窗高度
- **AND** 捲動發生在內容區（內容區的 `scrollHeight > clientHeight`），SHALL NOT 是整個文件在捲
- **AND WHEN** 內容區捲到底
- **THEN** 標題列與關閉的 rect SHALL 仍然完整在視窗裡

### Requirement: 控制項分三級，每個表面同時只有一個啟用中的主要動作

控制項 SHALL 分**主要**（填色）、**次要**（邊框）、**文字**（無填色無邊框，只靠顏色與底線／字重跟內文區隔）三級；
三級的靜止外觀 SHALL 兩兩可區分（`control-affordance` 的 `3:1` 對主要與次要繼續成立）。
每一個表面在任一時刻**可見且啟用**的主要動作 SHALL 恰好一個，而且它就是「下一步」：
還沒複製鑰匙之前主要動作是複製，複製成功之後主要動作變成進入世界；owner 的案件詳情主要動作是成軍（招募中）
或結案（已成軍）；非 owner 的是私訊發案者；密碼呈現時是複製密碼（寄給隊員是次要）。
所有按鈕與輸入框的高度 SHALL `≥ 40px`。鍵盤焦點 SHALL 有可見的焦點環：寬度 `≥ 2px`、對所在表面 `≥ 3:1`。
指標移到按鈕上時外觀 SHALL 改變（hover 態），改變 SHALL 有過渡（見〈動態〉）。

#### Scenario: [FE-X16-S09] 每個表面恰好一個啟用中的主要動作，而且它是下一步

- **WHEN** 依序打開 `/login`（初始）、訪客提示、金鑰交接（複製前／複製後）、owner 的案件詳情（招募中／已成軍／密碼呈現中）、
  非 owner 的案件詳情、收件匣對話、我的名片
- **THEN** 每一個表面上可見且啟用的主要動作 SHALL 恰好一個
- **AND** 它 SHALL 分別是：進入世界／建立我的身分／複製鑰匙→進入世界／成軍／結案／複製密碼／私訊發案者／送出／儲存
- **AND** 同一個表面上其他動作 SHALL 是次要或文字級

#### Scenario: [FE-X16-S10] 三級可區分、焦點環可見、hover 有變化

- **WHEN** 量同一表面上主要、次要、文字級各一個按鈕的靜止外觀
- **THEN** 三者的（背景、邊界、文字色）三元組 SHALL 兩兩不同
- **AND WHEN** 用鍵盤把焦點移到任一按鈕或輸入框
- **THEN** 焦點環寬度 SHALL `≥ 2px`、對所在表面 `≥ 3:1`
- **AND WHEN** 指標移到任一按鈕上
- **THEN** 它的背景或邊界色 SHALL 跟靜止時不同

#### Scenario: [FE-X16-S11] 按鈕與輸入框的高度

- **WHEN** 量每個表面上所有可見的按鈕與文字輸入框
- **THEN** 每一個的高度 SHALL `≥ 40px`

### Requirement: 動態有一個時長、尊重減少動態

hover／焦點／面板出現的過渡時長 SHALL 來自同一個 token，值在 `[120ms, 300ms]`。
使用者的系統設了 `prefers-reduced-motion: reduce` 時，所有過渡與動畫的時長 SHALL 是 `0ms`。
面板 SHALL NOT 用 `width`／`height` 做動畫（只准 `opacity`／`transform`）。

#### Scenario: [FE-X16-S12] 過渡時長與減少動態

- **WHEN** 量任一按鈕的 `transition-duration`
- **THEN** 它 SHALL 在 `[120ms, 300ms]`
- **AND WHEN** 以 `prefers-reduced-motion: reduce` 重新載入
- **THEN** 同一個按鈕的 `transition-duration` SHALL 是 `0s`
- **AND** 面板出現時的 `transition-property` SHALL NOT 含 `width` 或 `height`

### Requirement: 同一時間只有一個阻斷式面板；非阻斷的提示讓位

任一時刻掛載中的阻斷式面板 SHALL 至多一個。要開第二個時，系統 SHALL 先向第一個提出關閉要求；
第一個**接受**（不在送出中、沒有未儲存的修改要問）就關掉並開第二個；第一個**拒絕**（送出中）時第二個 SHALL NOT 開，
第一個 SHALL 留著。阻斷式面板開著時：訪客提示 SHALL 不顯示（面板關了、提示還沒被關掉或走完就回來）；
場景聊天框 SHALL 收成一行（只剩區域名稱與「面板開著期間新到的訊息數」），面板關了展開回來、記憶體照舊
（`scene-chat-ui` 的每一條不受影響）；換角色彈出層 SHALL 關（`keyboard-focus` 既有規則）。

#### Scenario: [FE-X16-S13] 開第二個面板會關第一個

- **WHEN** 看板清單開著，按標題列的收件匣
- **THEN** 看板 SHALL 關、收件匣 SHALL 開，掛載中的阻斷式面板恰好一個
- **AND WHEN** 收件匣開著，按標題列的我的名片
- **THEN** 收件匣 SHALL 關、名片 SHALL 開
- **AND WHEN** 名片開著，走到看板前按 E
- **THEN** 名片 SHALL 關、看板 SHALL 開

#### Scenario: [FE-X16-S14] 送出中的面板拒絕讓位

- **WHEN** owner 在案件詳情按了成軍、回應還沒回來，此時按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、詳情 SHALL 留著（`project-lifecycle` 的「送出中不可關」不被繞過）
- **AND WHEN** 回應回來了，再按一次收件匣
- **THEN** 看板 SHALL 關、收件匣 SHALL 開

#### Scenario: [FE-X16-S15] 訪客提示讓位、面板關了回來

- **WHEN** 訪客進世界（提示顯示中）走到看板前按 E
- **THEN** 提示 SHALL 不在畫面上、看板開著
- **AND WHEN** 關掉看板
- **THEN** 提示 SHALL 回來
- **AND WHEN** 訪客先關掉提示再開看板、再關看板
- **THEN** 提示 SHALL NOT 回來（`first-entry` 的關閉語意不變）

#### Scenario: [FE-X16-S16] 聊天框收成一行、關了展開、訊息沒丟

- **WHEN** 看板開著，期間收到 3 則場景訊息
- **THEN** 聊天框 SHALL 是一行（沒有列表、沒有輸入框），那一行 SHALL 顯示 `3`
- **AND WHEN** 關掉看板
- **THEN** 聊天框 SHALL 展開，列表裡 SHALL 有那 3 則，輸入框 SHALL 在
- **AND** 在一行狀態時 `keyboard-focus` 的世界鎖 SHALL NOT 由聊天框持有

### Requirement: 標題列是固定的導覽

標題列 SHALL 在每個世界畫面上都在同一位置，內容由左到右是：**品牌**，然後靠右一組**身分與入口**
（身分、收件匣、換角色、回大廳 —— 有哪些由各功能決定）。互動控制 SHALL `≤ 5` 個。標題列 SHALL NOT 被 3D 畫面或任何面板蓋住。

#### Scenario: [FE-X16-S17] 標題列的順序、數量與不被蓋住

- **WHEN** 分別以訪客、已登入在大廳、已登入在房間打開 `/world`
- **THEN** 標題列的第一個元素 SHALL 是品牌，其餘互動控制 SHALL 全部在品牌右側且 `≤ 5` 個
- **AND WHEN** 開任一阻斷式面板
- **THEN** 標題列裡每一個控制的 rect SHALL 不與面板的 rect 相交

### Requirement: 這一份對載入預算的影響有上限

這一份 SHALL NOT 讓 `/world` 多出任何網路請求（沒有 webfont、沒有圖檔）。相對於實作前的 `main`：
`/world` 的 client JS（gzip）增加 SHALL `≤ 4 KB`、CSS（gzip）增加 SHALL `≤ 6 KB`。

#### Scenario: [FE-X16-S18] 預算

- **WHEN** 分別對實作前後的 `next build` 量 `/world` 的 client JS 與 CSS（gzip）
- **THEN** 差值 SHALL 在上限內，而且真瀏覽器載入 `/world` 的請求清單裡 SHALL NOT 有字型或圖檔
