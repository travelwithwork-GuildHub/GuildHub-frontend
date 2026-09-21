## Why

`FE-R07` 已經讓遠端玩家依 `snapshot` 與 `presence` 進出畫面，但前端目前丟掉
`Player.st`、忽略後續的 `status` 訊息，也沒有顯示目前 scene 的在線人數。
如果現在不補上，W3 的 Presence 只能回答「角色在動」，不能正確呈現誰在線、目前
狀態為何；而且離場後殘留狀態、兩個真實身分能否互見姓名，都沒有端到端證據。

## What Changes

- 讓遠端玩家狀態從 `snapshot`／`presence.join` 建立，並由後續 `status` 訊息更新。
- `presence.leave` 與整份 `snapshot` 重建時，同步清除不再在線玩家的狀態，避免同一
  `id` 再出現時讀到舊值。
- 提供目前 WebSocket scene 的在線人數：以不同 player／user id 去重，
  包含自己；同一 id 的多條 WebSocket 連線仍只算一人。
- 補上兩個獨立瀏覽器各登入不同身分、互相看見對方姓名的整合驗收；姓名的實際
  渲染能力仍由 `FE-W08` 提供，本 change 不重做角色標籤。
- 不改後端 schema、REST API 或 WebSocket 協定，沿用既有的 `Player.st`、`status`、
  `snapshot` 與 `presence` payload。

### Non-goals

- 不做自己的狀態輸入、快捷狀態、12 字輸入限制或清除操作；那是 `FE-K05`。
- 不實作 Display Name／Status 的角色旁視覺元件；那是 `FE-W08`。本 change 只提供
  資料與負責跨瀏覽器驗收。
- 不做聊天、重連、斷線提示、跨 scene 導覽或歷史在線紀錄；分別屬於 `FE-R11`、
  `FE-R12`、`FE-V`，而歷史活動追蹤不在產品範圍。
- 不顯示 WebSocket connection 數量；現有 `snapshot`／`presence` 不攜帶
  connection 身分或計數，要支援必須另改後端協定。
- 不把 Presence 寫入資料庫，也不增加新的 REST 端點或 WebSocket 訊息。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `remote-players`：遠端名單增加狀態文字的建立、差量更新與離場清理；目前 scene
  提供包含自己的在線人數，並增加兩個獨立登入身分互見姓名的整合驗收。

## Impact

- 主要影響 `src/realtime/remotePlayers.ts` 與 `src/world/RemoteWorld.tsx` 的低頻
  Presence 狀態，以及承接在線人數的 DOM 顯示位置。
- `src/api/contract/ws.ts` 的現有型別已涵蓋所需 payload，不需要改協定。
- 沿用 `FE-R07` 的名單／動態分層；位置等高頻資料仍不進 React。
- 姓名的最終畫面驗收依賴 `FE-W08`，自己的狀態設定 UI 依賴 `FE-K05`，但 Presence
  狀態處理與在線人數可先獨立完成。
