# `FE-K04` 場景 chat UI —— 設計

事實來源：`FE-R11` 已合併的 `src/realtime/SceneChatProvider.tsx`（`useSceneChat(): { log, send }`；`log` 是 committed 場景的
`ChatRecord[]`，每筆 `{ id, name, body, truncated }`；`send(ChatIn)` 沒連線拋一般 `Error`、連線沒 `ready` 拋 `RealtimeError`、socket 拋就原樣拋）、
`src/world/interaction/EditableFocusLock.tsx`（文字輸入框有焦點就持世界命令鎖）、`src/world/interaction/escapeLayers.ts`（Escape 層級）、
`WorldCanvas` 的 `[data-focus-anchor="world"]` 與 `layer('hud')`、`openspec/specs/output-safety/spec.md`（具名文字元件）、
`src/forms/`（`form-conventions`：一個表單一個 `role="alert"`、在送出控制之前、取得焦點）。

## D1｜Chat 是可旁觀的非阻斷 DOM HUD，不是面板

放在 `WorldCanvas` 的焦點錨容器裡、`layer('hud')`，跟 `InteractionPrompt`、門標籤同一層；不是 `PanelShell`（那會持世界命令鎖、Escape 層級、focus trap），也不掛成 `useEscapeLayer` 的一層（常駐的東西掛成層會永遠是最上層，`FE-X06` 的「Escape 關最上層」就壞了）；
Escape 在輸入框裡由 textarea 自己的 `onKeyDown` 處理。版面上避開 `InteractionPrompt` 的位置（提示在畫面下方中央；chat 區靠一側、有最大高度、內部捲動）。
只看不鎖：走路、按 E 開門、看板都照常。焦點進輸入框才鎖（既有 `EditableFocusLock`，不另發明一把）；Escape 在輸入框裡是「離開輸入框、焦點回世界錨」，
不是關掉 HUD（HUD 沒有關閉狀態 —— 收合是版面問題，量過再說，見待答）。
代價：螢幕同時承載世界與 chat；用 responsive CSS 處理寬度與行數，不把 chat 變成另一個全頁面板。

## D2｜列表是專用的 append-only 容器；空狀態自己給，不擴充 `FE-X04`

不用 `ListPanel`：chat 沒有分頁、total、has_more、request identity；`FE-X04` 的五種空狀態是給「有後端查詢」的清單的，chat 的空只代表
「這一頁還沒收到」—— 不能說「沒有歷史」（後端根本沒有歷史可查）、不能說「沒人講過話」（refresh 之前可能有）。控制項、字體、色票沿用 `@/design/controls`。
`truncated` 的那一則要看得出來（`FE-R11` 把 2000 code point 的保存預算交給 UI 說明）—— 標記是 UI 的字，不進規格；UI 不自己截、不顯示截斷前的內容（那是 transport 的事）。
空狀態的字：說「這一頁還沒收到訊息」這一類，不說「沒有歷史」「沒有人講過話」—— 前者是事實，後者是後端沒有的資訊；文案由 PR review 守，不進規格。

## D3｜輸入原值送出，只擋全空白；沒有上限

`FE-R11` 定了：`LIMITS.chatBody = {0, UNBOUNDED}`、「全空白不送」是 K04 的送出規則。所以：`body.trim()` 為空就不送（並讓人知道要輸入內容），
否則送**原字串**（含首尾空白，後端照收、別人照看）。不顯示剩餘字數、不用 `maxlength`、不套 Inbox 的 2000 —— 那會把後端沒有的限制偽裝成契約。

## D4｜清空輸入的時點是 transport 接受了 frame

`send()` 同步回來沒拋 → 清空輸入；拋（沒連線、沒 `ready`、socket 拋）→ 輸入保留、顯示受控的一句（`role="alert"`，`form-conventions`），不自動重送。
回聲前列表不出現自己的話（`FE-R11` D2）；send 成功但回聲沒來時輸入已清、列表沒出現 —— 忠實反映協定沒有 ack，不用本地插入掩蓋。
節流（`FE-X11`）之後包在 `send` 外面：被節流也是「沒交給 transport」→ 走同一條「保留輸入」的路。

## D5｜只在底部才跟著新訊息；往上讀不被搶

新訊息到達：使用者在列表底部附近 → 捲到最新；已往上讀 → 位置不動、出現「有新訊息」的控制，按了回到最新。
「底部附近」的像素閾值要在真瀏覽器量（行高、捲動慣性），不寫進 Requirement；Requirement 只寫可觀察結果。

## D6｜使用者字串只做文字節點

`name`／`body` 直接當 React 文字節點；不用 Markdown／HTML parser、`dangerouslySetInnerHTML`、網址自動連結（`output-safety` 的 lint 本來就擋 `dangerouslySetInnerHTML`）。
`output-safety`〈使用者提供的字串以文字呈現（具名元件）〉多列 chat 的兩個節點，讓既有的逐欄判準涵蓋它。

## 待答問題

- HUD 的寬、高、行數與桌面斷點：真瀏覽器量，不進 Requirement。
- 「底部附近」的閾值：實作時量行高；量出來若改變了 Scenario 的可觀察結果，重開 spec PR。
- HUD 要不要能收合：先常駐；量了覺得擋到世界再談（收合狀態的持久化又是另一條規格）。
- 100 筆全畫的效能：先全畫；`render-budget` 的 e2e 量了不夠再談虛擬化。
