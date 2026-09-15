## 1. 規格閘門

- [x] 1.1 規格已在 PR 上談定並合併進 `main`；以 `openspec validate fe-r10-presence --strict` 通過及 main 上存在本 change 為驗證，未完成前不得寫產品程式碼
      —— PR #293 於 2026-09-11T17:24Z 合併；`validate --strict` → `Change 'fe-r10-presence' is valid`；
      `check-pr-branch.sh main feat/fe-r10-presence--status` → `✓ 實作階段：fe-r10-presence（規格已在 main 上）`

## 2. 遠端狀態文字

- [x] 2.1 先為 `FE-R10-S01`／`S02` 寫失敗測試，證明 snapshot 與 presence.join 的 `st` 目前會被丟掉
      —— 實作前 R10 的 7 條測試是 **6 紅 1 綠**（#405 審查後更正；原文「六條全紅」不精確）。
      S01／S02 紅在 `st` 被丟掉
- [x] 2.2 將狀態文字納入低頻 roster identity，讓 `FE-R10-S01`／`S02` 通過，並確認既有 `FE-R07`／`FE-R08` 測試仍綠
      —— `RemoteIdentity.st`；`remote-players`（22）與 `remote-players-render` 全綠。突變「`identityOf` 丟掉 st」→ S01／S02 紅
- [x] 2.3 先為 `FE-R10-S03`／`S04` 寫失敗測試，涵蓋指定玩家更新、相同文字不重繪、未知 id 與自己的 id 不建立鬼影
      —— ⚠️ 不是每一條都能先紅：「相同文字不換名單」實作前本來就綠（舊程式忽略 `status`），它守的是實作後不退化，
      靠突變「相同文字也換 Map」證明；S04 實作前紅在最後的 `st` 斷言，「不建立鬼影」那半由突變證明
- [x] 2.4 處理已驗證的 `status` 訊息並把回傳語意改為低頻 Presence view 是否改變；以 `FE-R10-S03`／`S04` 通過及 `pos` 仍不觸發 roster 重繪驗證
      —— `FE-R07-S01` 仍綠（pos 回 false、名單物件不換）。突變：未知 id 建立新的人 → S04 紅；
      相同文字也換 Map → S03 紅；改到所有人 → S03 紅；改了卻回 false → S03 紅。
      #405 合併後審查補的判準（`fix/fe-r10-presence--status-tests`）：就地改舊物件不換 Map、換 Map 但沿用被改過的物件、
      丟掉 name／av、把 name 改掉、status 做 trim、截成 2 字 → S03 紅；未知 id 清空所有人樣本 → S04 紅；
      snapshot／join 做 trim → S01／S02 紅（改用 12 個 code point、前後有空白的文字）
- [x] 2.5 先為 `FE-R10-S05`／`S06` 寫清理測試，直接驗證 leave 與新 snapshot 後舊狀態不可再讀
      —— S05 直接斷言 leave 之後名單裡沒有他（不靠「再加入之後是空白」，`FE-R08-S11` 的教訓）
- [x] 2.6 完成 leave／snapshot 的狀態清理，讓 `FE-R10-S05`／`S06` 通過，並確認其他玩家的 identity 與 motion 不受影響
      —— 狀態放在名單項目裡，leave 移除項目即清掉（design D1）。突變：snapshot 合併舊 st → S06 紅；
      leave 不移除名單項目 → S05 與 `FE-R07-S04` 紅；leave 連帶換掉其他人的身分物件 → S05 紅
- [x] 2.7 先為 `FE-R10-S11` 寫失敗測試，證明目前重複 join 會忽略已在名單的 id 的 payload；改為以新 `st` 更新該 id 的 identity，同時驗證不新增名單筆數、不改變在線人數，且其他玩家不受影響
      —— 實作前紅在「狀態真的變了 —— 呼叫端要重繪」（`st` 被忽略）。只刷新 `st`；`name`／`av` 規格沒寫，維持原行為。
      突變：重複 join 忽略 st → S11 紅；內容相同也換 Map → S11 紅；
      套用 #405 審查的突變類型：就地改舊物件不換 Map、換 Map 但沿用被改過的物件、刷新時丟掉 name／av、刷新時 trim → S11 紅。
      「刷新時改用 join 帶來的 name」刻意不釘（規格只要求 `st`，測試讓 payload 的 name／av 與原本相同）

## 3. 目前 scene 的在線人數

- [x] 3.1 先為 `FE-R10-S07`／`S08` 寫失敗測試，證明初始人數包含自己，新 id 會增加、同一 id 的重複 join 不會增加，且只有有效 leave 會減少人數
      —— `tests/online-count.test.tsx` 掛整個 `WorldCanvas`，`RemoteWorld → RealtimeClient → WebSocket` 是正式碼（只換全域 WebSocket）；
      實作前三條都紅在「畫面上沒有人數」。推導另有資料層測試（不掛 Scenario ID：THEN 是「顯示的」人數）
- [x] 3.2 以 snapshot-ready 與遠端 roster 推導 distinct player id 數 `roster.size + 1`，讓 `FE-R10-S07`／`S08` 通過，不新增獨立累加器
      —— `onlineCountOf`／`resetRemotePlayers`。突變：少了 +1、未就緒回 0、snapshot 沒設 ready、join 也設 ready → 紅
- [x] 3.3 先為 `FE-R10-S09` 寫失敗測試，涵蓋卸載、換連線以及新 snapshot 到達前不顯示任何人數數字
      —— 換場景（`FE-V01` 的 key 重掛）→ 等舊 close（`FE-V01-S18`）→ hello → 早到的 join → snapshot，每一步斷言畫面上沒有任何「N 人在線」。
      slice 2 審查後補：①「同一個元件換連線」路徑（`generation` 加一，state 沿用、不重掛）→ hello → 早到的 join，
      突變「cleanup 不清 ready 但直接通知 null」只有這條會紅；②「沒有人數」改成人數元素不存在，且「在線」前後都沒有數字，
      突變「null 時渲染『在線 0 人』」→ S07／S09 紅
- [x] 3.4 以穩定 callback 把低頻人數送到 Canvas 外的 DOM 顯示，讓 `FE-R10-S09` 通過，並驗證單純更新人數不會建立新的 WebSocket client generation
      —— `WorldCanvas` 直接傳 `useState` setter；`S08` 斷言整段只有一條 WebSocket。突變：inline 箭頭函式、cleanup 不通知、
      cleanup 不重設 ready、名單變動不通知、不渲染、顯示遠端數、多算十個人 → 紅。畫面過 ui-ux-pro-max（ux／react），
      截圖（dev server ＋ 偽造 REST／`/ws`）抓到文案在 800×600 被首次進入提示卡壓住 → 縮短並在窄於 md 時放左下角

## 4. 雙瀏覽器姓名驗收

- [ ] 4.1 確認 `FE-W08` 的姓名渲染能力已合併；以 main 上的規格與產品碼能在遠端角色旁顯示 `RemoteIdentity.name` 為證據，未滿足時本節維持未完成
- [ ] 4.2 為 `FE-R10-S10` 建立兩個隔離 cookie 的 browser context，測試只啟動並連到當次 loopback 前端、可拋棄後端與測試資料庫，不使用團隊共用環境
- [ ] 4.3 跑 `FE-R10-S10`：兩個瀏覽器各建立不同姓名並進入同一 scene，雙方都在對方角色旁看到正確姓名；保存可重跑的 E2E 與驗證輸出

## 5. 收尾驗證

- [ ] 5.1 執行 lint、typecheck、完整單元測試與適用的 integration／E2E；記錄通過數量，並逐條對照 `FE-R10-S01`–`S11` 都有非恆真的證據
- [ ] 5.2 對狀態更新、在線人數與姓名驗收各做至少一個反向突變，確認對應測試真的變紅；還原後重跑相關測試為綠
