## Context

動機見 `proposal.md`。目前 `RemotePlayersState` 只有 `roster` 與 `motion`；
`RemoteIdentity` 保留 `id`／`name`／`av`，刻意丟掉 snapshot 的 `st`，而
`applyMessage` 對 `status` 不做處理。`RemoteWorld` 只在名單身分改變時讓 React
重繪，位置樣本則留在可就地修改的 Map。

後端的 snapshot 包含自己，前端 roster 則依既有規格排除自己。後端沒有另外廣播
online-count 訊息。`RemoteWorld` 掛在 R3F Canvas 內，使用者可見的在線人數必須由
Canvas 外的 DOM 呈現，不能直接在 Three tree 裡插入 DOM。

## Goals / Non-Goals

**Goals:**

- 在不破壞高頻位置資料分層的前提下，讓低頻的狀態文字可觸發正確的 React 更新。
- 由已存在的權威 roster 推導在線人數，不建立會與 roster 漂移的第二份計數真相。
- 讓 Canvas 內的 Presence 資料能以低頻、穩定的介面供 Canvas 外 DOM 顯示。

**Non-Goals:**

- 不為狀態文字建立外部 store、事件總線或新的狀態管理抽象。
- 不決定 `FE-W08` 的姓名／狀態標籤如何投影與排版，也不實作 `FE-K05` 的輸入 UI。
- 不為測試暴露只在測試環境存在的畫面或端點。

## Decisions

### D1：狀態文字放進 `RemoteIdentity`，不建立第三個 per-player 容器

狀態文字是低頻資料，而且它的可見結果需要 React 更新，因此與 `name`／`av` 一樣
放在 roster entry。收到有效 `status` 時，建立新的 entry 與新的 roster Map；值沒有
變化時保留原身分，不觸發重繪。`presence.join` 的 `st` 同樣是權威值：
即使 id 已在名單裡，也要以 payload 取代舊狀態；只有值真的不同時才換 entry。

代價是一次狀態更新會讓承載遠端名單的 React 子樹協調一次。這符合資料頻率：位置是
40 人 × 10 Hz，狀態是使用者偶爾操作。替狀態另建 ref Map 雖可避免協調，但標籤仍需
另一套訂閱才能更新，也讓 leave 多一個容易忘記清除的容器，因此不採用。

### D2：在線人數是 snapshot 已就緒後的 distinct player id 數

初始 snapshot 是 Presence 的權威基準，而且依既有協定包含自己；遠端 roster 又保證
只含不同的其他玩家。因此 snapshot 就緒後的在線人數為 `roster.size + 1`。
這個公式是實作推導，產品定義則是「權威 Presence 名單裡不同 player／
user id 的數量，包含自己」。同一 user id 的多條連線只算一人；匿名連線
因後端各自發給不同 id，所以各自計一人。

WebSocket 的 `snapshot`／`presence` 只以 user id 為鍵，不攜帶 connection 身分
或 connection count；在不改後端協定的前提下，connection 數對前端不可觀測，
不是可以另選的計數定義。後端 `SceneRegistry.online_count()` 雖然計算連線數，
但它只提供專案房門的 REST 輪詢資料，沒有進入目前 world 連線的 payload。

另保留一個「是否已有初始 snapshot」的低頻狀態，用來區分尚未取得基準線與真的只有
一人。卸載或換連線時先回到未就緒，未就緒時不顯示任何人數數字，
避免把 0 或上一條連線的數字誤當成目前值。

不採用獨立累加器：它需要對重複 join、未知 leave、snapshot 重建及卸載各自校正，
最後會成為一份可能與 roster 漂移的真相。

### D3：`applyMessage` 的回傳語意擴成「低頻 Presence view 是否改變」

目前布林回傳值實際被 `RemoteWorld` 用來決定是否 `setRoster`，但名稱與註解把它描述成
「名單成員是否改變」。`status` 不改成員卻必須重繪，所以實作階段要把這份契約改成
「roster 的可觀察低頻資料是否換了」。`pos` 仍永遠回 false。

考慮過另加 status callback，但那會讓同一則 WebSocket 訊息走兩條更新路徑，也讓
snapshot／join 與 status 對同一份資料有兩個入口，因此不採用。

### D4：在線人數以穩定 callback 從 Canvas 內送到 `WorldCanvas` 的 DOM 層

`WorldCanvas` 持有顯示用的 `number | null`；傳給 `RemoteWorld` 的 callback 必須以
`useCallback` 保持身分穩定，避免成為 effect 依賴後造成每次重繪都重新連線。
`RemoteWorld` 只在 snapshot、有效 join／leave 或卸載時通知，人數不經 render loop。

不把 DOM 放進 R3F tree，也不導入 Drei `Html`；這遵守專案既有的「3D 負責空間，DOM
負責資訊」分界，並沿用門標籤已採用的 Canvas 外 DOM 形狀。

### D5：姓名驗收等待真實 `FE-W08` 能力，不做替身

雙瀏覽器測試使用兩個隔離 cookie 的 browser context、真實前端、當次本機後端與測試
資料庫。測試以遠端角色旁實際可見的姓名為判準。`FE-W08` 尚未合併時，task 保留未完成
並明列阻塞；不加隱藏 DOM、測試 id 專用標籤或只檢查 state 的替代驗收。

這會讓 change 的資料處理與在線人數可以先合併，但整個 `FE-R10` 在依賴完成前不能封存。
好處是驗收證明使用者真的看得到，而不是只證明資料曾經到達某個內部物件。

## 規格審查紀錄

| 輪次 | 發現 | 收斂 |
|---|---|---|
| Claude 首審 | WS payload 沒有 connection 身分或計數；snapshot 前狀態未定義 | 在線人數採 distinct player id；snapshot 前不顯示數字 |
| Codex 交叉檢查 | 後端重複 join 會重設 `st`，前端原行為卻保留舊值 | 新增 `FE-R10-S11`，刷新狀態但不增加人數 |
| Claude 再審 | 確認 S11 與既有 R07／R08 相容；跨 scene 覆寫是另一個後端問題 | S11 納入 R10；跨 scene 風險留給 `BE-G31` |

## Risks / Trade-offs

- [Risk] `FE-W08` 的標籤資料介面與 roster 形狀不同 → 以已合併的 FE-R10 roster 為輸入
  真相；若 W08 需要改產品義務，另開 spec PR，不在實作分支回改本規格。
- [Risk] callback 身分不穩造成 WebSocket 反覆重連 → `WorldCanvas` 使用穩定 callback，
  並以測試證明單純人數重繪不會換掉 client generation。
- [Risk] 把「尚未就緒」誤顯示成 0 人 → view model 使用 `null` 區分，並依
  Requirement 在 snapshot 到達前不顯示任何人數數字。
- [Risk] 同一 user id 跨裝置連進不同 scene 時，後端全域 `PresenceStore`
  會以後一個 `Player` 覆寫前一個 → 這是 `BE-G31` 同一根因的後端資料
  正確性缺陷；前端只能依收到的權威 payload 計數，本 change 不嘗試推測或修正。
- [Risk] status 更新整份 roster Map 造成不必要重繪 → 相同文字不換 Map；這仍是低頻
  事件，不為它增加外部 store 的長期複雜度。

## Migration Plan

1. 先擴充純狀態處理與單元測試；既有呼叫端在沒有 status 時行為不變。
2. 再接上 snapshot-ready 與 Canvas 外在線人數 DOM；沒有新協定或部署順序要求。
3. `FE-W08` 合併後補跑雙瀏覽器姓名驗收，才勾完最後 task 並封存。

回滾時可移除新增的低頻欄位與 DOM 顯示，不涉及持久資料、後端或資料遷移。
