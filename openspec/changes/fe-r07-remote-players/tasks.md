# Tasks

兩個 `feat/` slice：

- `feat/fe-r07-remote-players--store` —— 1、2 節（純資料，不碰 React）
- `feat/fe-r07-remote-players--render` —— 3、4、5 節

## 1. 前置

- [ ] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-r07-remote-players/` 確認
- [ ] 1.2 確認訊息形狀從 `api-contract`、座標換算從 `world-coordinates`、角色從 `world-player` 來，**三份都不改**；`git diff --stat` 的檔案清單當證據

## 2. 狀態（Requirement：兩個容器／snapshot／presence／pos）

- [ ] 2.1 建立兩個容器：名單（`id` → 身分）與動態（`id` → 座標與朝向），**動態只存在 ref 裡**（design 的 D1）
- [ ] 2.2 `snapshot` 重建整份名單與動態，**排除自己**，初始座標取自 `snapshot`；驗證 `FE-R07-S02`／`S03` 通過
- [ ] 2.3 `presence` 在同一則裡處理 join 與 leave；驗證 `FE-R07-S04` 通過
- [ ] 2.4 `removeRemote(id)` 做成原子操作，兩個容器一起清，**註解寫明之後新增的狀態都要加進來**（D5）
- [ ] 2.5 不合常理的 `presence`（leave 不存在的、join 重複的、join 自己）不得造成錯誤；驗證 `FE-R07-S05` 通過
- [ ] 2.6 `pos` 只更新已知的人，未知 id 忽略且不建立；座標在**寫入時**換算成世界座標（D2）；驗證 `FE-R07-S06` 通過
- [ ] 2.7 收到位置更新時名單物件**不得被換掉**；驗證 `FE-R07-S01` 通過
- [ ] 2.8 **負向驗證**：把「排除自己」拿掉，確認 `S02` 變紅；還原
- [ ] 2.9 **負向驗證**：把 `leave` 改成只清名單不清動態，確認 `S04` 變紅；還原
- [ ] 2.10 **負向驗證**：把 `pos` 改成「未知 id 就建立一個新的人」，確認 `S06` 變紅；還原

## 3. 渲染（Requirement：名單上的每個人都在畫面上有一個角色）

- [ ] 3.1 一個遠端角色元件：只接收穩定的 `id`，**不接收座標或朝向當 props**；在 render loop 裡讀動態資料並寫進 transform
- [ ] 3.2 寫入 transform 之前確認角色物件還在（卸載與 render loop 的競態）
- [ ] 3.3 重複使用 `world-player` 的 Chibi 角色，**不改它**
- [ ] 3.4 父層統一收訊息、更新兩個容器；**子元件不得各自訂閱**（D3）
- [ ] 3.5 驗證 `FE-R07-S07`（名單改變時角色增減）與 `FE-R07-S08`（位置來自動態資料且過程沒有 React 重繪）通過
- [ ] 3.6 **負向驗證**：把座標改成用 props 傳，確認 `S08` 的「沒有 React 重繪」變紅；還原

## 4. 接上畫面

- [ ] 4.1 把遠端玩家接進 `/world`：連線、收訊息、渲染
- [ ] 4.2 **人工驗證**：起後端與 dev server，開兩個分頁，確認**兩邊都看得到對方**。貼截圖或逐步描述
- [ ] 4.3 **人工驗證**：關掉其中一個分頁，確認另一邊的角色消失
- [ ] 4.4 **照實記錄跳格**：遠端角色每 100ms 跳一格。錄下來或描述清楚 —— 那是 `FE-R08` 的輸入，不是缺陷

## 5. 完成前的驗證

- [ ] 5.1 `openspec validate fe-r07-remote-players --strict` 通過，貼輸出
- [ ] 5.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 5.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 5.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 寫在 `it` 標題上**
- [ ] 5.5 確認這一刀**沒有做插值、沒有做朝向轉場、沒有送任何位置** —— `git diff --stat` 的檔案清單當證據
