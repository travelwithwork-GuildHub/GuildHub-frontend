## Purpose

DOM 那一半的介面（登入頁、首次進入、標題列、看板與詳情、收件匣、名片、聊天框、確認視窗）
要看得出**層次**與**下一步**：文字有五級、表面有三層、控制項有三級而且每個操作區至多一個主要動作；
同一時間只開一個阻斷式面板，非阻斷的提示讓位。每一條都給一個在瀏覽器裡量得到的門檻，或一個靜態掃描得到的形狀 ——
這份規格不寫「好看」，寫的是「不對的實作會在哪一條紅」；量不到的（陰影好不好看）明說留給截圖 review。
3D 那一半不在這裡（`world-design-system`）。

## Applicability

權限：不適用 —— 本 change 不做授權判斷（哪些人看得到哪些動作由各功能的規格決定；這裡只管它們長什麼樣、同時開幾個）
併發：適用 —— 同一次事件裡兩個 provider 都要開面板；持有面板送出中收到讓位要求；上一頁要求重開看板時另一個面板正在送出
持久資料相容性：不適用 —— 不讀寫任何持久資料；訪客提示「關掉了不落地、走完了才落地」照 `first-entry` 既有規則，暫時讓位 SHALL NOT 動它
失敗路徑：適用 —— 送出中或有未儲存修改的面板拒絕讓位（要有回饋）、上一頁被拒時網址要回到實際狀態、`prefers-reduced-motion` 下動態歸零、色碼與任意值被掃到、判準拿到空字串（jsdom 沒有樣式）時 SHALL 紅
測試連到什麼：jsdom 判準不連任何外部服務；真瀏覽器判準連**本機自起**的 `next start`＋`internal` 資料層（真的 Route Handler、真的 Postgres），`/api/*` 之外的東西用 `page.route` 偽造。不連任何團隊共用的位址。

## 名詞

- **表面（surface）**：使用者一次看到、有自己標題的區域。點名的表面：`/login` 頁、世界裡的訪客提示、金鑰交接、標題列、
  看板清單（案件／人才）、看板詳情（案件／人才）、收件匣清單、收件匣對話、我的名片、場景聊天框、房間密碼視窗、結案確認、放棄修改確認。
- **操作區**：一個表面裡**同一狀態下**一組一起被看的動作 —— 一個表單、一個面板畫面的動作列、一個確認視窗。`/login` 有三個操作區
  （暱稱、金鑰、帳號），其餘表面各一個。
- **阻斷式面板**：裝在 `PanelShell` 裡、持世界命令鎖的表面（看板、收件匣、我的名片）。
- **子畫面**：換掉面板的標題列與內容、但仍是同一個面板的畫面（看板詳情、收件匣對話）—— 不是視窗、沒有遮罩。
- **確認視窗**：蓋在面板內容上的小視窗（結案確認、放棄修改確認），有遮罩。
- **世界上的視窗**：不在面板裡、直接蓋在世界上的阻斷式視窗（房間密碼）。
- **非阻斷的提示**：不鎖世界的表面（訪客提示、場景聊天框、互動提示、換角色彈出層）。
- **量法**：顏色一律畫到 canvas 再讀（`control-affordance` 的 M1），對比度照 WCAG 2.1 相對亮度算；尺寸讀 `getBoundingClientRect()`、
  樣式讀 `getComputedStyle()`。**視窗 1280×720**，另在 **1024×640**（`scene-chat-ui` 既有的第二個 viewport）跑一次結構類的判準。
- **層級標記**：三級控制項與五級文字各由**唯一的共用常數**帶出一個 `data-*` 屬性（`data-tier`、`data-text`）；判準數的是屬性，
  不比 class 字串。屬性只能來自常數（`S01` 掃描裡 `data-tier=`／`data-text=` 的字面值也算違規）。

## ADDED Requirements

### Requirement: 每一類視覺 token 單一來源，而且 DOM 元件只從 token 取值

延伸 `app-shell` 的〈DOM design token 的單一事實來源〉：token 的類別 SHALL 是**色票、字級刻度、間距刻度、圓角、陰影、動態時長、字體堆疊**七類，
每一類單一來源，定義只在 token 定義檔。`src/**` 下 token 定義檔以外的任何 `.tsx`／`.ts`／`.css` SHALL NOT 出現：
色碼字面值（`#rgb`、`#rrggbb(aa)`、`0xrrggbb`、`rgb(`、`hsl(`、`oklch(`、`color-mix(`）、`font-family`、
以及 Tailwind 的任意值 class（`bg-[`、`text-[`、`border-[`、`ring-[`、`shadow-[`、`rounded-[`、`duration-[`、`font-[`、`z-[`）、
以及 `data-tier=`／`data-text=` 的字面值。唯一的例外是帶 `dom-token-allow: <理由>` 註解的那一行，理由 SHALL NOT 是空的；
豁免的總數 SHALL 寫在判準裡當上限（新增豁免要改判準，會被 review 看到）。
字體堆疊 SHALL 只有一份，SHALL 包含至少一個繁體中文字體家族名稱（沒有的話 CJK 會落到瀏覽器預設的襯線字），
而且 SHALL NOT 載入任何 webfont。

#### Scenario: [FE-X16-S01] 字面值與任意值被掃到、豁免要有理由且有上限

- **WHEN** 掃描 `src/**`（token 定義檔除外）
- **THEN** 找到的違規 SHALL 是零個，帶理由的豁免數 SHALL `≤` 判準裡寫的上限
- **AND WHEN** 把六段假輸入各餵一次：`background: #fff`、`rgb(0 0 0)`、`className="rounded-[8px]"`、`font-family: Inter`、`data-tier="primary"`、
  一行 `dom-token-allow:` 後面沒有理由
- **THEN** 六段 SHALL 各被列出來（判準本身不是恆真）

#### Scenario: [FE-X16-S02] 字體堆疊一份、含繁中、零字型請求

- **WHEN** 在真瀏覽器讀 `body`、面板標題、卡片標題、按鈕與輸入框的 `font-family`
- **THEN** 五者 SHALL 完全相同，且含至少一個繁體中文字體家族名稱
- **AND** 該次頁面載入的請求裡 SHALL NOT 有 `.woff`／`.woff2`／`.ttf`／`.otf`
- **AND** `S01` 的掃描 SHALL 保證 `font-family` 只出現在 token 定義檔（來源唯一由 `S01` 守，這裡守結果）

### Requirement: 文字有五級層次，每個表面必備的層級各自規定，而且每一級都讀得清楚

字級刻度 SHALL 有五級：**頁面標題 > 面板標題 > 條目標題 > 內文 ≥ 說明文字**（`data-text` 分別是 `display`／`title`／`heading`／`body`／`caption`；
內文是預設，不標）。內文 SHALL `≥ 16px`、行高 `≥ 1.5`；說明文字 SHALL `≥ 13px`；面板標題 SHALL `≥ 1.25 ×` 內文；頁面標題 SHALL `≥ 1.5 ×` 內文。
每個表面必備的層級：`/login`＝頁面標題＋內文＋說明；訪客提示＝面板標題＋內文；看板清單＝面板標題＋條目標題＋內文＋說明；
看板詳情＝面板標題＋內文＋說明；收件匣對話＝面板標題＋內文＋說明；我的名片＝面板標題＋內文。
內文、說明文字、危險色文字（`role="alert"` 裡的）對它們**實際合成後**的背景，對比度 SHALL `≥ 4.5:1`（WCAG 2.1 SC 1.4.3）；
`disabled` 的控制項與 hover 中的狀態不在這條裡。

#### Scenario: [FE-X16-S03] 五級字級在每個表面上都成立、必備的層級都在

- **WHEN** 在真瀏覽器打開 `/login`、訪客提示、看板清單、看板詳情、收件匣對話、我的名片，量**該表面上每一個**帶層級標記的元素與每一個 `p`
- **THEN** 該表面必備的層級 SHALL 各至少有一個元素
- **AND** 同一表面上任兩個不同層級的元素，字級 SHALL 照 頁面標題 > 面板標題 > 條目標題 > 內文 ≥ 說明文字 的順序
- **AND** 每一個內文元素 `≥ 16px` 且行高 `≥ 1.5`、每一個說明文字 `≥ 13px`

#### Scenario: [FE-X16-S04] 文字對比度，空字串要紅

- **WHEN** 在同六個表面上，量每一個內文、說明文字與 `role="alert"` 裡的文字，對其實際合成後的背景
- **THEN** 每一個 SHALL `≥ 4.5:1`
- **AND WHEN** 判準拿到的顏色是空字串或解析不出來
- **THEN** 判準 SHALL 紅，MUST NOT 把它算成通過

### Requirement: 表面有三層：世界、面板、視窗

阻斷式面板與世界上的視窗 SHALL 有**不透明**的底（合成後 alpha `= 1`）、一圈邊界（對頁面底色 `surface` `≥ 3:1`，量法同 `control-affordance`）、
與一層陰影。陰影只驗**存在且來自陰影 token**（`S01` 守來源、`S05` 守存在）—— 它在 3D 底上好不好看沒有數字門檻，留給截圖 review。
面板 SHALL NOT 把世界變暗（面板不是視窗；世界鎖著但看得到）。確認視窗與世界上的視窗 SHALL 有一層遮罩蓋住它們擋住的東西
（面板內容區、或世界區），遮罩合成後 alpha 在 `[0.3, 0.6]`；被遮的那一層 SHALL 是 `inert`。子畫面沒有遮罩。

#### Scenario: [FE-X16-S05] 面板與世界上的視窗：底是實的、有邊界、有陰影；面板不把世界變暗

- **WHEN** 分別開看板、收件匣、我的名片、房間密碼視窗，量它們的背景、邊界與陰影
- **THEN** 背景合成後 alpha SHALL `= 1`；邊界對 `surface` SHALL `≥ 3:1`；`box-shadow` SHALL NOT 是 `none`，且陰影的顏色 alpha `> 0`
- **AND** 看板開著時，世界區上 SHALL NOT 有任何蓋住世界的遮罩元素（面板以外、alpha `> 0` 且覆蓋世界區的元素數是零）

#### Scenario: [FE-X16-S06] 確認視窗與世界上的視窗有遮罩，子畫面沒有

- **WHEN** 在案件詳情開結案確認、在名片改了字之後按關閉（放棄修改確認）、在門前開密碼視窗
- **THEN** 各 SHALL 有一層遮罩蓋住被擋的那一層（面板內容區／世界區），合成後 alpha 在 `[0.3, 0.6]`，被遮的那一層是 `inert`
- **AND WHEN** 視窗關了
- **THEN** 遮罩 SHALL 不在
- **AND WHEN** 在看板清單開一筆詳情
- **THEN** SHALL NOT 有遮罩（子畫面）

### Requirement: 每一個阻斷式面板的解剖一致

阻斷式面板 SHALL 由上而下是：**標題列 → 內容區**，標題列在捲動容器**外面**。標題列 SHALL 是面板裡第一個區塊，內含（由左到右）
**返回**（只在子畫面裡）、**標題**、**關閉**；關閉 SHALL 是標題列裡最後一個可聚焦的元素，返回 SHALL 是第一個。
內容溢出時 SHALL 由內容區捲動（面板高度 `≤` 視窗高度），捲到底標題列仍然完整在視窗裡。所有阻斷式面板 SHALL 同寬（一個 token）。
子畫面 SHALL 換掉標題、加上返回，關閉留在原位。

#### Scenario: [FE-X16-S07] 標題列的三個位置、同寬

- **WHEN** 開看板清單、看板詳情、收件匣清單、收件匣對話、我的名片（1280×720 與 1024×640 各一次）
- **THEN** 每一個面板的第一個區塊 SHALL 是標題列，裡面有標題
- **AND** 關閉 SHALL 是標題列裡最後一個可聚焦的元素，五個面板的關閉 rect SHALL 相同（誤差 `≤ 1px`）
- **AND** 看板詳情與收件匣對話的標題列裡 SHALL 有返回，且它是第一個可聚焦的元素；清單與名片 SHALL 沒有返回
- **AND** 五個面板的寬度 SHALL 相同

#### Scenario: [FE-X16-S08] 內容溢出時由內容區捲動、標題列不走

- **WHEN** 看板清單的內容高度超過面板可用高度（例：載入三頁、30 筆）
- **THEN** 面板高度 SHALL `≤` 視窗高度；內容區 `scrollHeight > clientHeight`；文件本身 SHALL NOT 可捲（`document.scrollingElement.scrollHeight ≤ clientHeight`）
- **AND WHEN** 內容區捲到底
- **THEN** 標題列與關閉的 rect SHALL 仍完整在視窗裡，且標題列 SHALL 在捲動容器之外（`scrollContainer.contains(header) === false`）

### Requirement: 控制項分三級，每個操作區至多一個主要動作，主要動作是推薦的前進動作

控制項 SHALL 分**主要**（填色）、**次要**（邊框）、**文字**（無填色無邊框，文字色等於主要級的填色）三級，
`data-tier` 分別是 `primary`／`secondary`／`tertiary`。主要級的填色對所在表面 `≥ 3:1`、次要級的邊界 `≥ 3:1`（`control-affordance` 既有），
文字級的文字色 SHALL 與主要級**靜止、啟用**狀態的填色相同（讀得出它是可按的，而且跟內文不同色）；比較基準是同一份主要級常數在該表面上任一靜止、啟用的主要按鈕，該表面沒有時以 `/login` 暱稱表單的主要按鈕為基準；兩邊都畫到 canvas 讀 RGBA 再比。
**每個操作區在同一狀態下，可見且啟用的主要動作 SHALL `≤ 1`**；有明確的前進動作時它 SHALL 是主要；關閉、返回、取消、送出中、載入中、
權限阻擋、錯誤狀態 SHALL NOT 為了湊一個而升級 —— 零個是合法的。確認視窗的主要動作是安全的那一個（取消），`project-lifecycle` 已談定。
場景聊天框是非阻斷的表面，它的送出 SHALL 是次要（不跟面板的主要動作搶）。
所有按鈕與文字輸入框的高度 SHALL `≥ 40px`。鍵盤焦點 SHALL 有可見的焦點環：寬度 `≥ 2px`、對所在表面 `≥ 3:1`；
指標移到啟用中的按鈕上時背景或邊界色 SHALL 跟靜止時不同。

#### Scenario: [FE-X16-S09] 每個操作區至多一個主要動作，列出的狀態裡它是那一個

- **WHEN** 依序看這些操作區：`/login` 的暱稱表單／金鑰表單／帳號表單、訪客提示、金鑰交接（複製前／複製後）、
  owner 案件詳情（招募中／已成軍／密碼呈現中／送出中）、非 owner 案件詳情、收件匣對話、我的名片（沒改／改了）、結案確認、場景聊天框
- **THEN** 每一個操作區裡 `data-tier="primary"` 且可見且啟用的元素 SHALL `≤ 1`
- **AND** 有主要動作的操作區，它 SHALL 分別是：進入世界／用金鑰回來／登入或註冊（依分頁）／建立我的身分／複製鑰匙→進入世界／
  成軍／結案／複製密碼／（送出中：零個）／私訊發案者／送出／儲存（沒改：零個，`disabled` 不算）／取消；場景聊天框 SHALL 是零個
- **AND** 金鑰交接複製後「複製鑰匙」SHALL 不再是主要；密碼呈現中「寄給隊員」SHALL 是次要

#### Scenario: [FE-X16-S10] 三級可區分、每一個按鈕都有焦點環與 hover

- **WHEN** 在點名的表面上找出每一個 `data-tier` 的按鈕
- **THEN** 每一個主要級的填色對所在表面 `≥ 3:1`；每一個次要級的邊界 `≥ 3:1` 且沒有填色（背景 alpha `= 0` 或等於表面色）；
  每一個文字級沒有邊界、沒有填色、文字色（RGBA）等於基準主要按鈕靜止、啟用時的填色
- **AND WHEN** 用鍵盤把焦點依序移到該表面上**每一個**按鈕與輸入框
- **THEN** 每一個的焦點環寬度 SHALL `≥ 2px`、對所在表面 `≥ 3:1`
- **AND WHEN** 指標依序移到**每一個**啟用中的按鈕上
- **THEN** 每一個的背景或邊界色 SHALL 跟靜止時不同

#### Scenario: [FE-X16-S11] 按鈕與輸入框的高度

- **WHEN** 量點名的表面上所有可見的按鈕與文字輸入框
- **THEN** 每一個的高度 SHALL `≥ 40px`

### Requirement: 動態有一個時長、尊重減少動態、不動寬高

過渡時長 SHALL 來自同一個 token（`S01` 守來源），值在 `[120ms, 300ms]`。`prefers-reduced-motion: reduce` 時，
所有 `transition-duration` 與 `animation-duration` SHALL 是 `0s`。面板出現 SHALL NOT 對 `width`／`height` 做過渡或動畫
（`transition-property` SHALL NOT 是 `all`、SHALL NOT 含 `width`／`height`；`animation-name` SHALL 是 `none` 或其 keyframes 不含寬高）。

#### Scenario: [FE-X16-S12] 每一個按鈕的時長、reduce 歸零、面板不動寬高

- **WHEN** 量點名的表面上**每一個**按鈕與每一個阻斷式面板的 `transition-duration`
- **THEN** 有過渡的每一個 SHALL 在 `[120ms, 300ms]`，且全部相等
- **AND WHEN** 以 `prefers-reduced-motion: reduce` 重新載入並重量
- **THEN** 每一個 `transition-duration` 與 `animation-duration` SHALL 是 `0s`
- **AND** 面板的 `transition-property` SHALL NOT 是 `all` 也 SHALL NOT 含 `width`／`height`

### Requirement: 同一時間只有一個阻斷式面板；讓位有協定；非阻斷的提示讓位

**持有者**：掛載中的阻斷式面板，由殼向協調者登記；登記帶兩個**同步**函式 `canYield(): boolean`（送出中或有未儲存的修改 → `false`）
與 `yield(): void`（確定關閉，**不**把焦點還給開啟者）。卸載即釋放；同 id 重複登記冪等。
**請求**：要開一個阻斷式面板之前 SHALL 先向協調者請求 `requestOpen(id)`，協調者**同步、原子地**處理：已有別的 id 的**保留**（下面）→ 拒絕；
沒有持有者 → 保留給 `id` 並回 `true`；持有者 `canYield()` 為 `true` → 先 `yield()`、保留給 `id`、回 `true`；為 `false` → **拒絕**：不開、持有者留著、
觸發它的控制保持焦點、畫面 SHALL 有可見的回饋（`role="status"`，內容不是契約）。**保留**在 `id` 的殼登記時解除；請求成功的 provider SHALL 在同一次事件裡
把自己設成開（保留不會懸空）。同一次事件裡的第二個請求因為保留而被拒（不看 React 何時 commit）。任一時刻掛載中的阻斷式面板 SHALL `≤ 1`。
**讓位後的焦點**：從觸發到穩定，記錄每一次 `focusin` 的目標，被讓位面板的開啟者（世界焦點錨、或開它的按鈕）SHALL NOT 出現在序列裡，
`body` SHALL NOT 出現在序列裡；最後 `document.activeElement` 在新面板內（新面板自己的取焦規則）。
**網址**：看板在網址裡（`deep-link`）。看板讓位 SHALL 走它既有的關閉路徑（網址跟著退：`history.go(-1)`，帶 `panel` 的那一筆留在**前進**紀錄裡）；
上一頁／下一頁要求重開看板 SHALL 也經過協調者，被拒絕時網址 SHALL 以 `replaceState` 把**目前這一筆**改成實際狀態（跟 `deep-link` 的 canonical 同一種處理），
SHALL NOT `pushState`，畫面 SHALL NOT 換。
**非阻斷的表面**：面板開著時訪客提示 SHALL 不顯示，面板關了、提示還沒被關掉或走完就回來，讓位 SHALL NOT 重設它的「關掉了」與「走完了」；
場景聊天框 SHALL 收成一行（區域仍在、只剩區域名稱與「面板開著期間新到的訊息數」，沒有列表與輸入框），面板關了展開回來，
記憶體與捲動位置照舊：收起前在底部 → 展開後在底部；收起前往上讀 → 展開後位置不動、有新的就顯示「回到最新」（`scene-chat-ui` 的兩條照舊）；
成功開啟任一阻斷式面板時換角色彈出層 SHALL 關（`keyboard-focus` 的「按 E 開面板」擴到所有入口）；請求被拒時照 `keyboard-focus` 既有的「焦點離開就關」——
按了別的入口焦點就離開了它，所以它也關；這份不在那條上加例外。

#### Scenario: [FE-X16-S13] 開第二個面板會關第一個、焦點只動一次、網址跟著退

- **WHEN** 看板清單開著（網址有 `panel`），按標題列的收件匣
- **THEN** 看板 SHALL 關、收件匣 SHALL 開、掛載中的阻斷式面板恰好一個、`document.activeElement` 在收件匣內、網址 SHALL NOT 再有 `panel`
- **AND** 從按下到穩定的 `focusin` 序列裡 SHALL NOT 出現世界焦點錨（看板的開啟者）也 SHALL NOT 出現 `body`
- **AND WHEN** 收件匣開著，按標題列的我的名片
- **THEN** 收件匣 SHALL 關、名片 SHALL 開
- **AND WHEN** 名片開著，按標題列的收件匣
- **THEN** 名片 SHALL 關、收件匣 SHALL 開
- **AND WHEN** 人才詳情裡按寄信（`inbox` 既有的路）
- **THEN** 結果 SHALL 跟上面同一種：看板關、收件匣開、焦點在收件匣內

#### Scenario: [FE-X16-S14] 送出中或有未儲存修改的面板拒絕讓位，有回饋，回來後接受

- **WHEN** owner 在案件詳情按了成軍、回應還沒回來，此時按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、詳情 SHALL 留著、焦點 SHALL 在收件匣按鈕上、畫面 SHALL 有一個 `role="status"` 的回饋
- **AND WHEN** 回應回來了，再按一次收件匣
- **THEN** 看板 SHALL 關、收件匣 SHALL 開
- **AND WHEN** 我的名片改了字沒存，按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、名片 SHALL 留著、改的字 SHALL 還在、SHALL NOT 出現放棄修改確認（讓位不替使用者按下那個問題）、焦點 SHALL 在收件匣按鈕上、SHALL 有一個 `role="status"` 的回饋

#### Scenario: [FE-X16-S15] 訪客提示讓位、面板關了回來、不重設它的狀態

- **WHEN** 訪客進世界（提示顯示中）走到看板前按 E
- **THEN** 提示 SHALL 不在畫面上、看板開著
- **AND WHEN** 關掉看板
- **THEN** 提示 SHALL 回來
- **AND WHEN** 訪客先關掉提示再開看板、再關看板
- **THEN** 提示 SHALL NOT 回來
- **AND WHEN** 訪客在提示裡走完首次進入（已登入）之後開看板、關看板
- **THEN** 提示 SHALL NOT 回來

#### Scenario: [FE-X16-S16] 聊天框收成一行、關了展開、訊息與捲動位置沒丟、不持鎖

- **WHEN** 聊天框在底部，看板開著，期間收到 3 則場景訊息
- **THEN** 聊天框 SHALL 是一行（區域仍在、沒有列表、沒有輸入框），那一行顯示 `3`；世界鎖 SHALL NOT 由聊天框持有
- **AND WHEN** 關掉看板
- **THEN** 聊天框 SHALL 展開，列表裡有那 3 則、輸入框在、捲動在底部（最後一列完整可見）
- **AND WHEN** 聊天框往上讀著（不在底部）時開看板、期間收到 2 則、關看板
- **THEN** 展開後 `scrollTop` 跟收起前的差 SHALL `≤ 1px`、SHALL 顯示「回到最新」的控制、列表裡有那 2 則

#### Scenario: [FE-X16-S17] 下一頁要求重開看板：持有者接受就開、拒絕就把那一筆改回來

- **WHEN** 從 `/world` 按 E 開看板（`pushState`）→ 按標題列的收件匣（看板讓位、`go(-1)` 回 `/world`）→ 按瀏覽器**下一頁**
- **THEN** 收件匣 SHALL 關、看板 SHALL 重開（`deep-link` 的下一頁語意）
- **AND WHEN** 同樣走到收件匣開著、收件匣對話正在送出中時按瀏覽器下一頁
- **THEN** 收件匣 SHALL 留著、看板 SHALL NOT 開、`history.replaceState` SHALL 被呼叫恰好一次且 `pushState` 零次（攔截兩者）、網址 SHALL 沒有 `panel`
- **AND WHEN** 之後再按上一頁
- **THEN** SHALL 回到原本的 `/world` 那一筆（沒有 `panel`），收件匣仍然開著（不在網址裡）

#### Scenario: [FE-X16-S18] 換角色彈出層：成功開面板就關、被拒也因焦點離開而關、草稿丟

- **WHEN** 換角色彈出層開著，按標題列的收件匣
- **THEN** 彈出層 SHALL 關、收件匣 SHALL 開
- **AND WHEN** 看板詳情送出中，換角色彈出層開著（有未套用的草稿），按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、彈出層 SHALL 關（焦點離開了它）、草稿 SHALL 丟（`keyboard-focus` 既有語意）、焦點在收件匣按鈕上

#### Scenario: [FE-X16-S21] 同一次事件裡兩個請求：第一個贏、第二個被拒

- **WHEN** 沒有面板開著，在同一次事件裡依序請求開看板、再請求開收件匣（兩個 provider 都還沒 commit）
- **THEN** 第一個 SHALL 得到 `true`、第二個 SHALL 得到 `false` 並有 `role="status"` 回饋；commit 後掛載中的阻斷式面板 SHALL 恰好一個且是看板
- **AND WHEN** 看板登記之後再請求開收件匣
- **THEN** 看板讓位、收件匣開（保留已在登記時解除）

### Requirement: 標題列是固定的導覽

標題列 SHALL 在每個世界畫面上同一位置（rect 相同），內容由左到右是：**品牌**，然後靠右一組**身分與入口**（有哪些由各功能決定）。
互動控制 SHALL `≤ 5` 個。標題列 SHALL NOT 被 3D 畫面或任何面板蓋住（面板掛在世界區裡，世界區在標題列下方）。

#### Scenario: [FE-X16-S19] 標題列的位置、順序、數量、不被蓋住

- **WHEN** 分別以訪客、已登入在大廳、已登入在房間打開 `/world`
- **THEN** 三次量到的標題列 rect SHALL 相同；第一個元素 SHALL 是品牌，其餘互動控制全部在品牌右側且 `≤ 5` 個
- **AND WHEN** 開任一阻斷式面板
- **THEN** 面板的 rect 與**整個標題列**的 rect 交集面積 SHALL 是 0（不只是控制）

### Requirement: 這一份對載入預算的影響有上限，量法固定

這一份 SHALL NOT 讓 `/world` 多出任何靜態資源請求（沒有 webfont、沒有圖檔、沒有新的 chunk 請求）。
相對於**固定的基線 commit**（這份規格合併時 `main` 的 SHA，寫在 tasks 裡）：`/world` 的 client JS（gzip）增加 SHALL `≤ 4 KB`、
CSS（gzip）增加 SHALL `≤ 6 KB`。量法：同一份 lockfile 與 Node 版本、`next build`、依 build manifest 的 `/world` 入口 chunk 各自 gzip 後加總；
裁決在最後一片合併前對基線量一次，每片的數字只是觀察。請求清單的量法：全新的 browser context、停用快取、冷載入 `/world` 到 canvas 出現；
每個請求記 `(resourceType, 路徑類別)`，路徑類別＝路徑去掉 `/_next/static/<buildId>/` 與 chunk 的 hash 後的字串；排除 `/api/*` 與 WebSocket；redirect 算一次；
兩次的 multiset SHALL 相同。

#### Scenario: [FE-X16-S20] 預算與請求

- **WHEN** 對基線與最後一片各做一次 `next build` 並量 `/world` 的 client JS 與 CSS（gzip）
- **THEN** 差值 SHALL 在上限內
- **AND WHEN** 依上面的量法對基線與最後一片各記一次請求清單
- **THEN** 兩個 multiset SHALL 相同，且 SHALL NOT 有 `font`／`image` 的 resourceType
