## Why

**後端不做逐人過濾。** 送出 `move` 之後，自己的位置會原路廣播回自己 ——
量過的，不是文件上的說法：

```
送  {"t":"move","x":320,"y":640,"f":2}
收  {"t":"pos","p":[["u-same",320,640,2]]}      ← 自己的 id
```

現在的實作**已經不會**因此長出一個跟著自己走的分身，但那是**結構性的副作用**，
不是有人決定過的事：`snapshot` 與 `presence.join` 都濾掉自己的 id，
所以自己永遠不在遠端玩家名單裡；而 `pos` 只更新名單裡已經有的人。

**沒有任何一條測試指名在測這件事。** 於是：

- 下一個人重構「名單怎麼建立」時，不會知道自己踩掉了什麼
- 而踩掉之後的症狀是**畫面上多一個跟你重疊、而且跟著你走的分身**，
  不是錯誤訊息 —— 在單人測試時甚至看不出來（只有一個角色的話，
  分身跟本人完全重合）

`FE-R07-S06` 那條「忽略不認識的 id」用的是一個叫 `ghost` 的假 id。
自己在結構上跟 `ghost` 是同一件事，所以它**順便**涵蓋了自我回聲 ——
但「順便涵蓋」跟「有一條測試釘住」是兩件事，而前者會在重構時安靜消失。

## What Changes

- **不改任何正式碼。** 目前的行為是對的
- 把「自己永遠不會成為遠端玩家」寫成一條**指名的 Requirement**，
  並寫清楚它是**結構性保證**（自己進不了名單），不是一個 `if (id === self) skip` 的過濾器
- 補三條指名的 Scenario：自我回聲被忽略、`selfId` 必須早於 `snapshot` 就緒、
  以及自我回聲不影響同一則訊息裡其他人的更新
- 寫明 `selfId` **MUST NOT 放進 React state**：它要在處理訊息的當下同步讀得到

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `remote-players`: 新增一條 Requirement「自己永遠不會出現在遠端玩家裡」，
  把目前只是結構性副作用的保證變成有測試釘住的約定

## Impact

- 規格：`openspec/specs/remote-players/spec.md` 增加一條 Requirement
- 測試：`tests/remote-players.test.ts` 增加三條指名的 Scenario
- 正式碼：**沒有變更**。`src/realtime/remotePlayers.ts` 與 `src/realtime/client.ts`
  現有行為即為規格所述
