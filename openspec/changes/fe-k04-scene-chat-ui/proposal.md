## Why

`docs/WBS.md` 的 `FE-K04`：「場景 chat：Lobby / Room chat UI、訊息列表、輸入框；場景切換清理。不落 DB，refresh 清空」（W3）。

傳輸層已經在 `FE-R11`（`scene-chat-transport`，#434／#435／#436）談定並做完：`useSceneChat()` 交出目前 committed 場景的記憶體（最多 100 筆、
單則保存預算 2000 code point、`truncated` 標記）與只收 `ChatIn` 的 `send`；自己的話只在伺服器回聲後出現；committed 場景換了才清、
過場失敗退回不清、舊連線晚到不收。**沒有任何人看得到它。**

**不做會怎樣**：`FE-R11` 只有程式介面，使用者無法參與交談；`FE-R11` 的 `S05`（refresh 後沒有歷史）明寫「e2e 隨 `FE-K04` 的 UI 一起跑」，
沒有 UI 就沒有可觀察形式，`FE-R11` 封存不了。臨時用阻斷式 `PanelShell` 做的話，聊天期間世界移動會被鎖住 —— 那是「走過去按 E 開面板」的
那種 3D（`CONTEXT.md`〈3D 憑什麼存在〉明說要的是**可旁觀、可漸進加入**）。UI 自己做本地回聲會讓自己的話出現兩次；UI 自己保存歷史會跟
「不落地」矛盾；為了格式化 chat 而引入 HTML 會打開 `output-safety` 擋著的門。

## What Changes

- 新增 capability `scene-chat-ui`：
  - 世界畫面上一個**非阻斷**的 DOM chat 區（HUD）：不走近物件、不按 E、不開面板就看得到目前 committed 場景的近期訊息；
    只看不鎖世界移動；焦點在輸入框裡時打字不是走路（既有 `EditableFocusLock`），Escape 離開輸入框、焦點回世界錨
  - 訊息列表：依接收順序、顯示發言者與 body；`name`／`body` 只以文字節點呈現；被保存層截斷的那一則看得出來；沒有訊息時有可辨識的空狀態，
    但不宣稱「沒有歷史」或「沒人講過話」
  - 輸入與送出：全空白不送（trim 後至少一個 code point），非空白**原字串**送出（不 trim）；沒有 `maxlength`、不套 Inbox 的 2000 上限；
    只有 transport 接受了才清空輸入；沒 ready／transport 拋錯時輸入保留、使用者能辨識沒送出去；回聲前列表不出現自己的話
  - 場景：committed 場景換了列表就是新場景的；過場失敗退回原場景訊息還在；refresh 後是空的（這就是 `FE-R11-S05` 的可觀察形式）
  - 捲動：在底部就跟著最新；往上讀時不被拉回底、能辨識有新訊息並回到最新
- MODIFIED `output-safety`〈使用者提供的字串以文字呈現（具名元件）〉：加 chat 列表每一列的 `name`／`body` 節點
- 不改 `FE-R11` 的任何 Scenario、不改 WebSocket 契約、不新增 REST

## Non-goals

- 不做 3D 頭上氣泡、world-space text、走近／按 E 才能開的 chat。
- 不做 Markdown、富文字、網址自動連結、附件、emoji picker。
- 不做私訊、Inbox、持久歷史、未讀數、時間戳（協定沒有）。
- 不做節流（`FE-X11`）：本 change 的送出路徑要能被它包住，但送出間隔在這裡不設限。
- 不做 moderation、封鎖、檢舉、rate limit（`BE-G15`／`BE-G16`）。
- 不用 `ListPanel`（沒有分頁、total、has_more）；不擴充 `FE-X04` 的五種空狀態。
- 不做行動裝置的專屬版面（`FE-X08` 的裝置政策）；不做訊息虛擬化（100 筆先全畫，量了不夠再說）。
- 不做 `FE-R10`、`FE-J14`。
