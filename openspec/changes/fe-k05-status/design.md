## Context

協定（`protocol.py`）：客戶端 `{"t":"status","text"}`；伺服器 `set_status_text` 驗 12 字（超過 `ValueError` → **`continue`，丟棄不回錯**），
然後 `broadcast(scene, status_out(user_id, text))` 給整個 scene **含自己**；`snapshot` 的每個人帶 `st`；`join` 建新的 `Player`（`st=""`）。
前端：`src/api/contract/ws.ts` 已有 `StatusIn`（`z.string().max(LIMITS.statusText.max)`）、`StatusOut`；`remotePlayers.ts` 已把 `snapshot.st` 與 `status` 訊息放進名單（`RemoteIdentity.st`）；
`NameTags.tsx` 畫名字（176×28、`-translate-y-full` 底邊對錨點，位置由 `RemotePlayer` 每幀寫 `transform`）。
送出的口：`FE-R11` 的 `sceneChatStore`／`SceneChatPort` —— `RemoteWorld` 每建一條連線 `attach(send, wsScene)` 一次，模組拿不到 client、沒 ready 就拋。

## Decisions

### D1｜狀態的送出走跟 chat 同一種「注入的窄介面」，另開一個 store，不塞進 chat 的

`src/realtime/statusStore.ts`：`{ text, phase, port: { attach(send: (input: StatusIn) => void) → { detach } }, set(text), clear(), subscribe/getSnapshot }`。
`RemoteWorld` 在建連線的同一處多 `attach` 一次（`client.send(JSON.stringify(input))`），**`attach` 時若 `text !== ''` 立刻送一次**（S04 的重送 —— `attach` 發生在 ready 之後，跟 chat 的 `link` 同一個時點）。
不併進 `sceneChatStore`：chat 的清空規則（committed 場景變了才清）跟狀態相反（狀態**跨場景要留**），硬併會讓兩套規則互相打架。
代價：`RemoteWorld` 多一個 prop、`WorldCanvas` 多拿一個 port。

### D2｜「目前狀態」以伺服器回聲為準，送出中只是 pending

跟 chat 的 D2 同一個理由：回聲是伺服器真的收下的證據（超長被靜默丟掉就沒有回聲）。`status` 訊息的 `id === me` 時**不進名單**（既有規則），
改為交給 `statusStore.confirm(text)`；分流在 `RemoteWorld` 收訊息那一處（跟 `chat` 分流同一行的旁邊）。
pending 沒等到回聲（理論上只有超長會這樣，而前端已擋）—— 不設逾時，控制停在送出中直到下一次操作；design 的待答問題記著，e2e 量得到再說。

### D3｜狀態文字是名字牌節點的 children，往上長，不動 176×28 的名字盒

`NameTags` 每塊牌子裡多一個 `absolute bottom-full left-0 w-full` 的狀態節點（單行、截字、`CAPTION` 字級、比名字淡）；
牌子節點本身的 `width/height/translate` 不變，所以 `FE-W08-S04`／`S07` 的量法（`getBoundingClientRect` 的名字盒）與真瀏覽器 e2e（`name-tags.mjs`）不變。
`RemoteIdentity.st` 變 → `roster` 換 Map → `NameTags` 重繪（低頻，正確）；位置照舊由 `RemotePlayer` 寫 `transform`（`S05` 的「不經 React」仍成立）。
代價：狀態在名字**上方**，離頭頂更遠一點（`NAME_TAG_ANCHOR_Y` 不動）；截圖看。

### D4｜長度用 `String.length`，比後端嚴

後端用 Python `len`（code point）；契約 `StatusIn` 用 zod `.max(12)`（UTF-16 單位）。前端控制與剩餘字數都用 `String.length`：
跟契約同一把尺、且**永遠不會送出後端會丟的東西**（emoji 一個算 2，比後端少放進去，可接受）。不另造第三把尺。

### D5｜快捷狀態是常數、放哪裡是 `ui-ux-pro-max` 先問

`src/status/quickStatuses.ts`：四個（「趕工中」「找人聊聊」「開會中」「休息一下」）—— 不進契約、不進規格（`config.yaml` 的文案規則）。
控制放在 HUD 哪裡（在線數旁邊、聊天 HUD 上方、標題列）實作前問 `ui-ux-pro-max`，截圖貼 PR；不鎖世界（只在自由輸入有焦點時鎖，`EditableFocusLock`）。

### D6｜效能

零新請求、零新 socket；每次設狀態一則 WS 訊息（≤ 12 字）；名字牌多一個節點只在 `st` 非空時掛；world chunk 預期 +1.5 KB gz 以內，量前後差貼 PR。

## 待答問題

- pending 沒回聲要不要逾時（多久）—— e2e 量不到的話就不設。
- 狀態在名字上方會不會跟 `FE-W08` 的「畫面外不呈現」（`overflow-hidden` 裁）互動出半截：截圖看，有就改成往下長並回來改 D3（要重開 spec PR，因為 S05 的「不改牌子的尺」會受影響）。

## Risks

- 自己的回聲靠 `id === me`：`me` 從 `hello.you` 來（`FE-R05`），身分換了（同分頁換人）要跟著換 —— `attach` 綁在連線上，換人一定換連線，沒事。
- 後端未來加「超長回錯」（`err`）：前端已擋在 12，不會踩到。
