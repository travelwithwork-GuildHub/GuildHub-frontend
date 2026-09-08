# Tasks

兩個 `feat/` slice：

- `feat/fe-r07-remote-players--store` —— 1、2 節（純資料，不碰 React）
- `feat/fe-r07-remote-players--render` —— 3、4、5 節

## 1. 前置

- [x] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-r07-remote-players/` 確認
- [x] 1.2 確認訊息形狀從 `api-contract`、座標換算從 `world-coordinates`、角色從 `world-player` 來，**三份都不改**；`git diff --stat` 的檔案清單當證據

## 2. 狀態（Requirement：兩個容器／snapshot／presence／pos）

- [x] 2.1 建立兩個容器：名單（`id` → 身分）與動態（`id` → 座標與朝向），**動態只存在 ref 裡**（design 的 D1）
- [x] 2.2 `snapshot` 重建整份名單與動態，**排除自己**，初始座標取自 `snapshot`；驗證 `FE-R07-S02`／`S03` 通過
- [x] 2.3 `presence` 在同一則裡處理 join 與 leave；驗證 `FE-R07-S04` 通過
- [x] 2.4 `removeRemote(id)` 做成原子操作，兩個容器一起清，**註解寫明之後新增的狀態都要加進來**（D5）
- [x] 2.5 不合常理的 `presence`（leave 不存在的、join 重複的、join 自己）不得造成錯誤；驗證 `FE-R07-S05` 通過
- [x] 2.6 `pos` 只更新已知的人，未知 id 忽略且不建立；座標在**寫入時**換算成世界座標（D2）；驗證 `FE-R07-S06` 通過
- [x] 2.7 收到位置更新時名單物件**不得被換掉**；驗證 `FE-R07-S01` 通過
- [x] 2.8 **負向驗證**：把「排除自己」拿掉，確認 `S02` 變紅；還原
- [x] 2.9 **負向驗證**：把 `leave` 改成只清名單不清動態，確認 `S04` 變紅；還原
- [x] 2.10 **負向驗證**：把 `pos` 改成「未知 id 就建立一個新的人」，確認 `S06` 變紅；還原

## 3. 渲染（Requirement：名單上的每個人都在畫面上有一個角色）

- [x] 3.1 一個遠端角色元件：只接收穩定的 `id`，**不接收座標或朝向當 props**；在 render loop 裡讀動態資料並寫進 transform
- [x] 3.2 寫入 transform 之前確認角色物件還在（卸載與 render loop 的競態）
- [x] 3.3 重複使用 `world-player` 的 Chibi 角色，**不改它**
- [x] 3.4 父層統一收訊息、更新兩個容器；**子元件不得各自訂閱**（D3）
- [x] 3.5 驗證 `FE-R07-S07`（名單改變時角色增減）與 `FE-R07-S08`（位置來自動態資料且過程沒有 React 重繪）通過
- [x] 3.6 **負向驗證**：把座標改成用 props 傳，確認 `S08` 的「沒有 React 重繪」變紅；還原

## 4. 接上畫面

- [x] 4.1 把遠端玩家接進 `/world`：連線、收訊息、渲染
- [x] 4.2 **兩邊看得到對方** —— 改成對真後端的整合測試，**不是人工看畫面**。

  `tests/remote-players-live.itest.ts`：兩個獨立的連線，各自跑完整的
  「連線 → 驗證 → 套用」路徑。斷言 A 的名單裡有 B、**沒有自己**，
  B 也看得到 A；B 移動之後 A 這邊的世界座標跟著更新成 `{x:4, z:3, f:2}`；
  過程中零則協定違規。

  ⚠️ **這驗不到「畫面上真的畫出來」。** 這台機器的瀏覽器自動化起不來
  （Chrome 兩次都 SIGTRAP）。渲染那一半由 `remote-players-render.test.tsx`
  用 R3F 的 test renderer 驗。兩者合起來涵蓋整條路徑，
  **但中間那一段接縫沒有機器在看** —— 要用眼睛確認的話：
  起後端與 `npm run dev`，開兩個分頁到 `/world`，一邊按方向鍵。
- [x] 4.3 離開之後角色消失 —— 同樣改成整合測試。
  B 關掉連線之後，A 的**名單與動態兩邊**都清掉了。
- [x] 4.4 **照實記錄跳格**。

  後端 `HZ = 10`（`protocol.py` 的常數，不可設定），所以位置每 **100 毫秒**
  才更新一次。這一刀直接把收到的座標寫進 transform，**中間沒有任何插值** ——
  在 60 FPS 下，每 6 個影格才換一次位置。

  ⚠️ **這不是缺陷，是這一刀的範圍。** 但**第一次看到的人會覺得壞了**，
  所以要講在前面。`FE-R08` 的輸入就是這個數字：要把 10 Hz 的離散樣本
  變成 60 FPS 的連續移動，需要 previous / target 兩個取樣點。

## 5. 完成前的驗證

- [ ] 5.1 `openspec validate fe-r07-remote-players --strict` 通過，貼輸出
- [ ] 5.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 5.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 5.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 寫在 `it` 標題上**
- [ ] 5.5 確認這一刀**沒有做插值、沒有做朝向轉場、沒有送任何位置** —— `git diff --stat` 的檔案清單當證據
