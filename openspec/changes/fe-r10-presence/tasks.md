## 1. 規格閘門

- [ ] 1.1 規格已在 PR 上談定並合併進 `main`；以 `openspec validate fe-r10-presence --strict` 通過及 main 上存在本 change 為驗證，未完成前不得寫產品程式碼

## 2. 遠端狀態文字

- [ ] 2.1 先為 `FE-R10-S01`／`S02` 寫失敗測試，證明 snapshot 與 presence.join 的 `st` 目前會被丟掉
- [ ] 2.2 將狀態文字納入低頻 roster identity，讓 `FE-R10-S01`／`S02` 通過，並確認既有 `FE-R07`／`FE-R08` 測試仍綠
- [ ] 2.3 先為 `FE-R10-S03`／`S04` 寫失敗測試，涵蓋指定玩家更新、相同文字不重繪、未知 id 與自己的 id 不建立鬼影
- [ ] 2.4 處理已驗證的 `status` 訊息並把回傳語意改為低頻 Presence view 是否改變；以 `FE-R10-S03`／`S04` 通過及 `pos` 仍不觸發 roster 重繪驗證
- [ ] 2.5 先為 `FE-R10-S05`／`S06` 寫清理測試，直接驗證 leave 與新 snapshot 後舊狀態不可再讀
- [ ] 2.6 完成 leave／snapshot 的狀態清理，讓 `FE-R10-S05`／`S06` 通過，並確認其他玩家的 identity 與 motion 不受影響
- [ ] 2.7 先為 `FE-R10-S11` 寫失敗測試，證明目前重複 join 會忽略已在名單的 id 的 payload；改為以新 `st` 更新該 id 的 identity，同時驗證不新增名單筆數、不改變在線人數，且其他玩家不受影響

## 3. 目前 scene 的在線人數

- [ ] 3.1 先為 `FE-R10-S07`／`S08` 寫失敗測試，證明初始人數包含自己，新 id 會增加、同一 id 的重複 join 不會增加，且只有有效 leave 會減少人數
- [ ] 3.2 以 snapshot-ready 與遠端 roster 推導 distinct player id 數 `roster.size + 1`，讓 `FE-R10-S07`／`S08` 通過，不新增獨立累加器
- [ ] 3.3 先為 `FE-R10-S09` 寫失敗測試，涵蓋卸載、換連線以及新 snapshot 到達前不顯示任何人數數字
- [ ] 3.4 以穩定 callback 把低頻人數送到 Canvas 外的 DOM 顯示，讓 `FE-R10-S09` 通過，並驗證單純更新人數不會建立新的 WebSocket client generation

## 4. 雙瀏覽器姓名驗收

- [ ] 4.1 確認 `FE-W08` 的姓名渲染能力已合併；以 main 上的規格與產品碼能在遠端角色旁顯示 `RemoteIdentity.name` 為證據，未滿足時本節維持未完成
- [ ] 4.2 為 `FE-R10-S10` 建立兩個隔離 cookie 的 browser context，測試只啟動並連到當次 loopback 前端、可拋棄後端與測試資料庫，不使用團隊共用環境
- [ ] 4.3 跑 `FE-R10-S10`：兩個瀏覽器各建立不同姓名並進入同一 scene，雙方都在對方角色旁看到正確姓名；保存可重跑的 E2E 與驗證輸出

## 5. 收尾驗證

- [ ] 5.1 執行 lint、typecheck、完整單元測試與適用的 integration／E2E；記錄通過數量，並逐條對照 `FE-R10-S01`–`S11` 都有非恆真的證據
- [ ] 5.2 對狀態更新、在線人數與姓名驗收各做至少一個反向突變，確認對應測試真的變紅；還原後重跑相關測試為綠
