# 前端工作分解（完整版）

> **WBS = Work Breakdown Structure（工作分解結構）** ——
> 把產品目標拆成一條一條可以認領的工作項目。

**這份不是規格。** 規格在 `openspec/changes/<change>/`，由 `/opsx:propose` 產生。
開 change 的時候用這裡的 ID 命名（例如 `fe-w04-camera-controller`），
`progress.sh` 靠這個命名把 change 對回工作項目。

產品與場景的「為什麼」在 `docs/ROADMAP.md`，這裡只有「做什麼」。

---

## 怎麼讀這張表

| 欄 | 意思 |
|---|---|
| **ID** | 工作項目編號。change id 要以它開頭（小寫） |
| **項目** | 模組名稱 |
| **工作** | 一條可以認領的工作 |
| **週** | **目前核准的相對執行順序，不是日期承諾。** 同一週內以表格順序或明示的依賴決定先後。寫 `—` 代表**沒有排程**（等裁決或被擋住），它不計入「未開始」 |
| **點** | 估點 |
| **依賴** | `⚠️後端缺` 代表**後端現在沒有這個能力**，做不下去。詳見 FE-I |
| **標記** | 人為決定，見下 |

### 狀態是算出來的，不是寫出來的

Excel 的 Status 下拉選單有十個值。它們不是同一種東西：

| 類 | 值 | 誰決定 | 放哪 |
|---|---|---|---|
| **事實** | `Done` / `On-going` / `Next-going` / `Debug` | git + OpenSpec + CI | **`progress.sh` 算的，沒有人手寫** |
| **意圖** | `Cancelled` / `Pending` / `TBD` / `Delay` / `Alarm` | 人 | 本表 `標記` 欄，**必須附理由** |
| **屬性** | `Regular` | — | 常態性工作，沒有完成點 |

為什麼要拆：**手寫的狀態一定會漂。** 這個 repo 一天之內漂過三次
（見 `docs/DECISIONS.md`）。可以從 git 與 OpenSpec 推導的，就不要讓人來寫；
推導不出來的（「這件事我們決定不做了」），機器永遠猜不到，才由人寫 —— 而且要寫理由。

```bash
bash .github/scripts/progress.sh            # 有動靜的
bash .github/scripts/progress.sh --all      # 連沒開始的
bash .github/scripts/progress.sh --week W1
bash .github/scripts/progress.sh --blocked  # 現在做不了的，以及被什麼擋住
bash .github/scripts/progress.sh --check    # 有規則違規就以非零結束
```

### 這些規則是機器在驗的，不是建議

**規範不會擋住任何人。** 所以下面這些在 `--check` 裡是會紅的：

| 不變量 | 為什麼 |
|---|---|
| 標記一定是 `標記｜理由` | 沒有理由的標記，六個月後沒有人敢刪它 |
| 不認得的標記要報 | 打錯字的標記等於沒有標記 |
| 互斥的處置不得同時出現 | **不可以靜默挑一個** —— 那就是「兩份紀錄打架時自己選一邊信」 |
| 缺口要有 `決策≤Wn` 與 `【沒答案就】…` | 沒有 fallback 的缺口，會變成下游偷偷假設一個還不存在的能力 |
| 工作的最早週次**必須嚴格晚於**它依賴的缺口決策期限 | 排 W4、而依賴的裁決「最晚 W4」，那不是排程，是碰運氣 |

`決策≤Wn` 是**決策期限**，不是後端的交付估時 —— 兩者不衝突。

### 標記的意思

寫法固定是 **`標記｜理由`**。沒有理由的標記等於沒有標記 ——
六個月後沒有人敢刪它，它就永遠留在那裡。

**四個互斥的處置**（一列最多一個）：

| 標記 | 進入條件 | 什麼時候可以拿掉 |
|---|---|---|
| `TBD` | **要不要做**還沒決定 | 產品拍板之後 |
| `Pending` | 決定要做，但在等一件具體的事 | 那件事發生了 |
| `Cancelled` | 決定不做 | 重新裁決之後（要在 PR 說明理由） |
| `Regular` | 常態性工作，**沒有完成點** | 不適用 |

**一個可並存的風險訊號**：

| 標記 | 意思 | 寫法 |
|---|---|---|
| `Alarm` | 有風險、或會擋住別的東西。**它不是處置**，可以跟上面任一個並存 | `Alarm＋Pending｜理由` |

兩條規則：

- **`Cancelled` 的列不刪。** 「考慮過並決定不做」跟「沒想到」是完全不同的兩件事，
  刪掉之後沒有人分得出來
- **`Cancelled` 跟「已封存」打架的時候，`progress.sh` 會報「矛盾」而不是挑一邊信。**
  一個標成不做的項目卻有 change 封存了，代表兩份紀錄有一份是錯的 —— 去改，不要無視
---

## BE-G 後端銜接清單

> **這一組不擋任何前端工作。**
>
> 前端有自己的後端（`FE-D`）—— 功能先做完，之後再銜接。
> 所以下面每一項不是「我們被卡住了」，是**「這一項我們自己先做了，
> 之後要跟後端對齊什麼」**。
>
> 沒有週次也沒有點數，因為**銜接的時間不由前端決定**。
> 每一項附：需要什麼、最晚什麼時候要對齊（再晚就會累積回頭成本）、
> 對不上的話前端怎麼降級。
>
> ⚠️ **`FE-D06` 會自動產生真正的銜接清單**（本地後端有、真後端沒有的操作）。
> 下面這份是人寫的、給後端讀的版本 —— **兩份對不起來的時候，信機器產的那份。**
>
> `BE-拒` 是後端 `CLAUDE.md`〈不要實作的功能〉明文排除的。
> 我們照樣可以在本地做出來，但**那種功能上不了線** —— 要嘛翻後端的決策，
> 要嘛接受它只存在於本地。**這件事要現在講清楚，不要做完才發現。**

| 阻塞類型 | 意思 | 該做什麼 |
|---|---|---|
| **待銜接** | 我們在本地後端自己做了，之後要跟真後端對齊 | 照常排週次做，並把需求送去後端 |
| **後端行為有誤** | 後端已經有這個意圖，但實際行為不對 | 這是 bug 不是需求，回報時要指到行為而不是端點 |
| `BE-拒` | 後端 `CLAUDE.md`〈不要實作的功能〉**明文排除** | 本地做得出來，但**上不了線**。見下面〈`BE-拒` 不能一直躺著〉 |
| `待裁決` | 產品語意還沒定 | 人要拍板，不是工程問題 |
| `外部` | 外部服務／資產 | — |

**沒有一種類型會讓前端停下來。** 前端有自己的後端，功能先做完。
週次的意義是「我們什麼時候做」，同時也是**最晚什麼時候要跟後端對齊** ——
再晚，累積的回頭成本會超過等待的成本。

**每一項都要有「最晚什麼時候要有答案」與「沒答案怎麼辦」。**
那個日期是**決策期限**，不是後端的交付估時 —— 兩者不衝突。
沒有 fallback 的缺口，會變成前端偷偷假設一個還不存在的能力。

### `BE-拒` 不能一直躺著

被明文拒絕的東西留在 backlog 裡只會被反覆重提。每一條 `BE-拒` 最後都要收斂成三者之一：

1. **刪掉需求** —— 產品不要這個了
2. **前端降級** —— 用做得到的方式提供一個較弱但誠實的版本（**不可以假裝是原本那個**）
3. **重新裁決** —— 拿著具體理由去翻後端的產品決策

> ⚠️ **後端的端點清單凍結在 `tests/test_contract.py` 的 `EXPECTED`，多一個少一個都會紅。**
> 所以「請後端加一個端點」不是舉手之勞，是動合約。

> **「這個缺口擋住哪些項目」不寫在這裡** —— `progress.sh` 從各項目的
> `阻塞` 欄反推，並且依「解鎖幾項」排序。手寫一份反向清單，
> 是同一件事寫在兩個地方。
>
> ```bash
> bash .github/scripts/progress.sh          # 最後一段就是「缺口擋住了什麼」
> ```

| ID | 缺口 | 證據與在有答案之前怎麼辦 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| BE-G01 | **身分無法跨裝置恢復** | `POST /api/login` 每次都 `uuid4()` 新建一張名片（`app/api/auth.py:14`）—— 同一個暱稱登入兩次是兩個人；身分只活在 session cookie，清 cookie 或換裝置就永久失去專案與訊息。`CLAUDE.md` 又明文排除 OAuth／第三方登入、帳號刪除、資料匯出。**W12 的回訪／最近專案／未讀全部不成立**，前端不要承諾 —— **最晚 W2 開工前要答案。** 沒答案就照 (c) 走：接受「每次都是新的人」，把回訪相關項目全部標 `Cancelled` 並寫明原因。 **【沒答案就】**接受「每次都是新的人」，把回訪相關項目全部標 `Cancelled` 並寫明原因。 | 決策≤W1 | — | 待銜接 + `BE-拒` | Alarm｜它決定 W2 之後的所有範圍 |
| BE-G02 | **世界裡每個人的名字都是「訪客」** | `app/main.py:79` 回 `session.get("name") or "訪客"`，但 `session["name"]` 在整個後端**從來沒有被設定過**（`auth.py:27` 只設 `user_id`）。FE-W09「顯示 Display Name」做出來會全部一樣，**看起來像前端壞了** —— **最晚 W3 開工前要答案。** 沒答案的 fallback：世界裡不顯示名字（只顯示狀態），**不要顯示一堆「訪客」**。 **【沒答案就】**世界裡不顯示名字，只顯示狀態 —— **不要顯示一整片「訪客」**。 | 決策≤W1 | — | 後端行為有誤 | Alarm｜FE-W09 現在做出來會全部顯示「訪客」 |
| BE-G03 | **遠端玩家一律 avatar 0** | `manager.py:91` 呼叫 `presence.join()` 時沒傳 avatar，`presence.py:45` 預設 `0`。就算前端把外觀做完，別人看到的還是同一隻 **【沒答案就】**固定預設角色，**不做角色選擇 UI** —— 做了別人也看不到。 | 決策≤W1 | — | 待銜接 | Pending｜等後端把 `avatar_id` 帶進 presence |
| BE-G04 | **`avatar_id` 的語意是「角色圖索引」，不是六維編碼欄位** | `API-前端整合指南.md:185`「smallint，前端據此挑角色圖」。把它當成 6 維 × 各 4 種的位元編碼，是**重新詮釋一個已經有語意的欄位**。MVP 先做**預設角色 N 選 1** —— **最晚 W2 開工前要答案。** 沒答案就做預設角色 N 選 1，並且**不宣稱多人可見的角色選擇已完成**。 **【沒答案就】**做預設角色 N 選 1，並且**不宣稱多人可見的角色選擇已完成**。 | 決策≤W1 | — | `待裁決` | TBD｜要不要六維外觀還沒裁決 |
| BE-G05 | **沒有搜尋與篩選** | `profiles.py:16` docstring 明寫「只做翻頁，不做搜尋與篩選」；`projects.py:92` 只能用 `status` 篩。`PAGE_SIZE=20`，**沒有 total／`has_more`**，也沒有穩定排序的第二鍵。前端只能過濾**已載入的那 20 筆** —— **不可以叫它搜尋**，符合條件的人可能在下一頁，那是假陰性 —— **最晚 W2 開工前要答案。** 沒答案就把介面誠實地叫「瀏覽」，不放搜尋框。 **【沒答案就】**介面誠實地叫「瀏覽」，**不放搜尋框**。 | 決策≤W1 | — | 待銜接 | Alarm｜這是 Marketplace 的核心價值 |
| BE-G06 | **沒有標記已讀的端點** | `read_at` 在回傳裡，但 `messages.py` 只有 POST / GET，沒有任何端點寫得到它。只能做 session-local 的「本次看過」，重整就沒了 —— **不是可靠的未讀** **【沒答案就】**不做未讀，Inbox 只有清單與詳情。 | 決策≤W1 | — | 待銜接 | Pending｜等後端提供寫得到 `read_at` 的端點 |
| BE-G07 | **沒有釋放座位的端點** | `seats.py:29`「已於 WBS v0.2 砍除」；`test_contract.py` 的 `FORBIDDEN` 明列 DELETE。只有結案會整批清座位 | — | — | `BE-拒` | Cancelled｜「Owner Release Seat」不做 |
| BE-G08 | **沒有訪客唯讀模式** | `CLAUDE.md`〈不要實作的功能〉：「訪客唯讀模式與相關 gate」。Guest 只能是 UI 上的說明，**不是權限邊界** —— 純前端禁用按鈕擋不住任何人 | — | — | `BE-拒` | Cancelled｜FE-Q04 不做 |
| BE-G09 | **scene 只有 `lobby` 與 `room:{id}`** | `scenes.py:11`，而且一條連線只屬於一個 scene，切場景＝關掉重開。**先裁決用詞**：Marketplace／Office 要的是「視覺分區」（前端可做）還是「有獨立 Presence、隔音、各自 online count 的伺服器 scene」（後端不支援）。**同一個詞混用會讓 W4 之後整組規劃失真** —— **最晚 W4 開工前要答案。** 沒答案就一律做成 `lobby` 的視覺分區，並在 CONTEXT 寫明 online count 是全世界的。 **【沒答案就】**一律做成 `lobby` 的視覺分區，並在 `CONTEXT.md` 寫明 online count 是全世界的。 | 決策≤W3 | — | 待銜接 + `待裁決` | Alarm｜擋住 FE-S02/03/04/10/12 |
| BE-G10 | **沒有 team／role／application／invitation 任何模型** | `form-team`（`projects.py:132`）只是把 project 改成 active 並產生房間密碼。`deps.py:23` 明定「不做成員制，只有發起人與其他人兩種身分」。W7–W9 **不是少一顆按鈕，是整個 domain model 不存在** **【沒答案就】**接案維持「寄信給發起人」，不做組隊。 | 決策≤W5 | — | 待銜接 | TBD｜要不要做組隊還沒裁決，而且後端明定「不做成員制」 |
| BE-G11 | **沒有新訊息通知** | `protocol.py` 裡只有場景 chat。只能輪詢 `GET /api/messages`，但沒有增量游標、收發混在同一份清單、又沒有已讀 mutation **【沒答案就】**不做通知，並在 UI 明說「狀態變化要自己重新整理」。 | 決策≤W3 | — | 待銜接 | Pending｜等後端加通知訊息，或改用輪詢 |
| BE-G12 | **沒有 Project Resources / Meeting URL 欄位** | `sql/001_schema.sql` 的 projects 表沒有。FE-P12 與 FE-S08 **首先是資料來源不存在**，不是 UI 問題 **【沒答案就】**Meeting 與 Project Resources 都不做。 | 決策≤W3 | — | 待銜接 | Pending｜等後端加欄位 |
| BE-G13 | **沒有 Events 模型** | 同上。W11 社群活動整個沒有地基 **【沒答案就】**不做社群活動。 | 決策≤W10 | — | 待銜接 | TBD｜社群活動要不要做還沒裁決 |
| BE-G14 | **沒有 Personal Desk / Looking For 欄位** | 同上。W6–W7 同上 **【沒答案就】**不做 Personal Desk 與 Looking For。 | 決策≤W5 | — | 待銜接 | TBD｜工作桌與媒合訊號要不要做還沒裁決 |
| BE-G15 | **沒有 moderation／封鎖／檢舉／admin** | `CLAUDE.md`：「任何 `/api/admin/*`」。陌生人可以無限寄信與聊天，而且**沒有任何處置管道** | — | — | `BE-拒` | Cancelled｜要翻案得先翻後端的產品決策 |
| BE-G16 | **沒有 rate limit；chat 沒有長度限制** | `protocol.py` 的 `ChatIn.body: str` 無限制；廣播是逐連線 `await`。前端自己節流，但那只擋住守規矩的人 | — | — | 待銜接 | Alarm｜洗版沒有任何東西擋得住 |
| BE-G17 | **「任何形式的活動追蹤——永久不做」** | `CLAUDE.md`。可觀測性**只能做技術 telemetry**（錯誤、FPS、斷線率），**不能做使用者行為 analytics**。兩者不要混在同一個提案裡 | — | — | `BE-拒` | Cancelled｜只限行為 analytics |
| BE-G18 | **點數、金流、置頂、付費曝光** | `CLAUDE.md`。媒合平台常見的信任／履約機制在這個產品裡是**已經決定不做**，不是漏掉。記在這裡以免有人再提一次 | — | — | `BE-拒` | Cancelled｜後端明文排除，記在這裡以免有人再提一次 |
| BE-G19 | **貼文到期沒有排程** | `CLAUDE.md`「貼文到期提醒、續期、自動下架排程」。過期只是查詢查不到（`projects.py:92`）。前端要自己算「快到期了」，而且**不會有提醒** | — | — | `BE-拒` | Cancelled｜提醒與續期不做 |
| BE-G20 | **沒有任何金額欄位** | 後端 `CLAUDE.md` 排除「點數、金流、置頂、付費曝光」。**但「預算欄位」跟「金流」是兩件事**，被混在一起排除了：預算揭露（媒合條件）／報價議價（協商）／收付款託管（金融）是三個層次。**這個產品不做金流**，但前兩層是接案流程的一部分 —— 案子沒有預算、應徵沒有報價，發案者跟接案者無從判斷要不要談 —— **【沒答案就】**案件不顯示預算、應徵不填報價，並在 UI 明說「價格請私下談」，不要假裝這個維度不存在。 | 決策≤W5 | — | `待裁決` | Alarm｜只要欄位，不要金流 |
| BE-G21 | **專案沒有時間欄位** | `hours_per_week` 只描述人才供給，沒有描述專案需求。缺開始日、期程或截止日、每週投入需求、時區與同步時段、緊急程度、一次性或長期 —— **【沒答案就】**時間全部寫在 `body` 純文字裡，接受它搜尋不到也比對不了。 | 決策≤W5 | — | 待銜接 | Pending｜等後端 |
| BE-G22 | **生命週期沒有拆開** | `recruiting → active → closed` 把「停止招募」和「專案完成」混成同一條線。要拆成招募狀態（招募中／暫停／已補滿／取消）× 執行狀態（準備中／進行中／待驗收／已完成／中止）。**不拆的話算不出完成紀錄，信任訊號整層做不了** —— **【沒答案就】**不做任何完成紀錄與聲譽功能，並明說平台不累積合作歷史。 | 決策≤W5 | — | 待銜接 | Alarm｜它擋住整個 FE-T |
| BE-G23 | **沒有訂閱與收藏** | 收藏案件／人才、儲存搜尋條件、狀態變化推送都沒有資料可以掛 —— **【沒答案就】**不做回訪功能，接受使用者只在主動想起時才回來。 | 決策≤W10 | — | 待銜接 | Pending｜等後端 |
| BE-G24 | **沒有合作紀錄與聲譽** | 已加入／已完成的專案數、準時或中途退出、合作時間長度、回覆率、帳號年齡 —— 一個都沒有。它依賴 BE-G22 先拆開生命週期 —— **【沒答案就】**不做任何信任訊號，並接受「每一次媒合都要從零開始相信陌生人」。 | 決策≤W9 | — | 待銜接 | Alarm｜這是媒合平台的核心 |
| BE-G25 | **沒有外部帳號驗證** | 後端排除 OAuth，理由是「匿名暱稱登入即可」——但 OAuth 在這裡的產品價值**不是省一次密碼，是證明某個外部身分屬於我**（已驗證的 GitHub／Figma／LinkedIn）。這兩個是不同的提案 —— **【沒答案就】**profile 上的外部連結一律標示「未驗證」，不要讓它看起來像是被證實過的。 | 決策≤W8 | — | `待裁決` | TBD｜要做就得先翻後端的產品決策 |
| BE-G26 | **沒有聯絡邊界設定** | 誰可以私訊我、是否接受邀請、狀態對誰可見、離線是否接收通知 —— 全部沒有。**空間產品會放大接近感，邊界感要比普通網站更強** —— **【沒答案就】**所有人都能私訊所有人，並在 UI 明說這件事，讓使用者自己決定要不要填 profile。 | 決策≤W6 | — | 待銜接 | Alarm｜陌生人可以無限私訊，使用者沒有任何自保手段 |
| BE-G27 | **沒有公開活動物件** | 「某團隊正在開招募說明」「某桌在找設計師」「某人開放 portfolio review」——空間裡沒有任何**正在發生、可旁觀、可加入**的東西。**沒有這個，3D 就只是一條很貴的導覽列** —— **【沒答案就】**接受 3D 只提供品牌與情緒價值，**並且不要再宣稱它是產品機制**。 | 決策≤W3 | — | 待銜接 | Alarm｜它決定 3D 這條路成不成立 |
---

## FE-D 資料層與本地後端

> **不要等後端。** 前端自己蓋一個能跑完整流程的後端，功能先做完，之後再銜接。
>
> 這是 L3 講義那兩個東西的組合：
>
> | | 是什麼 | 這裡怎麼用 |
> |---|---|---|
> | **MockDB** | 模擬外部系統的**回應格式**，不需要真資料庫 | 真的 GuildHub 後端就是那個外部系統 |
> | **TestDB** | 自己系統專用的**可拋棄資料庫** | 本地後端要有真的持久化，否則跑不完整個應徵流程 |
>
> 所以本地後端不是「假資料」——它是**一個真的、可拋棄的後端**：
> Next.js Route Handlers ＋ 一個丟掉也沒關係的資料庫。
>
> ### 這件事唯一的危險
>
> **本地後端什麼都做得到，於是前端會養成真後端永遠滿足不了的期待。**
>
> 防這件事的機制只有一個：**一份契約，兩個實作，同一組測試跑兩邊。**
> 本地後端過了但真後端過不了的那些，就是要跟後端談的清單 —— 而且是**算出來的**，
> 不是誰記得寫下來的。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-D01 | 資料層契約 | 用 Zod 定義**每一個操作**的輸入與輸出，放在 `src/api/contract/`。**這是唯一的真實來源** —— 兩個 adapter 都要滿足它 | W1 | 5 | | |
| | | 已經存在的那一半直接用產的：`npx openapi-typescript` 從真後端的 `/openapi.json` 產型別，契約要跟它對得起來 | W1 | 3 | | |
| | | WS 的部分依 `protocol.py` 手寫（沒有 OpenAPI），並標明對應到哪一段 | W1 | 3 | | |
| FE-D02 | Adapter 切換 | 環境變數決定連哪一個：`local`（自己的 Route Handlers）或 `guildhub`（真後端）。**元件不知道自己連的是誰** | W1 | 4 | | |
| | | **所有資料存取只走 `src/api/`。** 元件裡不准出現 `fetch`——散在各處的話，之後換後端是重寫不是切換 | W1 | 3 | | Alarm｜這條破了，整個 FE-D 就白做 |
| | | 兩個 adapter 的錯誤要對映到同一組語彙（見 FE-I04），否則 UI 會依賴本地後端特有的錯誤形狀 | W2 | 4 | | |
| FE-D03 | 本地後端 | Next.js Route Handlers 實作契約的每一個操作。**先做完媒合閉環需要的那些**（application、offer、生命週期），那正是真後端還沒有的 | W2 | 8 | | |
| | | 本地的即時層替身：WS 或 SSE，訊息格式**照 `protocol.py`**，不要自己發明 | W2 | 6 | | |
| | | 真後端已經有的操作，本地版要**刻意複製它的怪癖**：狀態超過 12 字靜默丟棄、自己的 move 會廣播回自己、握手失敗不給 err。**本地版比真後端好用，就是在製造假象** | W2 | 5 | | Alarm｜本地版比真後端好用，就是在製造假象 |
| FE-D04 | 可拋棄的資料庫 | Docker 起一個 Postgres（或 SQLite，看啟動成本），schema 對齊真後端的 `sql/001_schema.sql`，新增的表另外標明 | W2 | 5 | | |
| | | `seed` 與 `reset`：一個指令回到乾淨狀態。**Demo 與開發用不同的 seed** | W2 | 4 | | |
| | | **測試用另一個資料庫，不動開發資料。** L3 那條教訓：AI 寫的測試會污染 DB、洗掉 audit log，跑越多次越亂 | W2 | 4 | | Alarm｜不做這條，開發資料遲早被測試洗掉 |
| FE-D05 | 契約測試跑兩邊 | 同一組測試，對 `local` 與 `guildhub` 各跑一次。**這是唯一能防止本地後端漂走的東西** | W2 | 6 | | |
| | | 邊界成對驗（`max` 接受、`max+1` 拒絕）、Unicode 長度單位、`null` 與缺欄、拒絕後不得部分寫入 | W2 | 5 | | |
| | | CI 只跑 `local`（跑得動）；`guildhub` 那一輪在本機跑，**而且只准打自己 `./run.sh` 起的後端** | W2 | 3 | | |
| FE-D06 | 銜接清單 | **自動產生**：本地後端實作了、真後端沒有的操作。那份清單就是要跟後端談的東西 | W3 | 5 | | |
| | | 每一項附上「我們怎麼用它」與「本地版的行為是什麼」，讓後端知道要對齊什麼 | W3 | 4 | | |
| | | **不要手寫這份清單。** 手寫的會漂，而漂掉的方向永遠是「以為後端有、其實沒有」 | W3 | 2 | | |
| FE-D07 | 切換演練 | 定期把 adapter 切到 `guildhub` 跑一次，看壞在哪。**留到最後才第一次接，一定會炸** | W5 | 4 | | |
| | | 部分銜接：已經對齊的操作走真後端，還沒有的走本地。**這是真正上線的路徑，不是全有全無** | W9 | 6 | | |

---

## FE-I 整合工程

> **前端自己交付得了的整合工作。**
> 「後端沒有這個能力」不在這裡，在 `BE-G` —— 那些的完成時間不由我們控制。
>
> 真實來源：`http://localhost:8000/docs`（REST，自動產生）與
> `GuildHub-backend/app/realtime/protocol.py`（WS，手寫，它就是規格本身）。
> **不要在本 repo 複述後端的欄位定義**（`docs/adr/0001-backend-contract.md`）。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-I01 | 型別產生 | `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`；產物進版控；PR 註明用哪個後端 commit 產的 | W1 | 2 | | |
| FE-I02 | WS 型別 | 依 `protocol.py` 定義 Zod discriminated union，**標明對應到哪一段**。未知的 `t` 要明顯失敗 | W1 | 3 | | |
| FE-I03 | Cookie 與跨源 | 身分走 session cookie，後端 `allow_credentials=True`、`CORS_ORIGINS` 預設含 `localhost:3000`。所有 fetch 帶 credentials；**WS 握手也靠同一個 cookie** | W1 | 2 | | |
| | | 前後端不同網域部署時的 SameSite / Secure | W13–W16 | 2 | | |
| FE-I04 | 錯誤語彙 | 401 / 403 / 404 / 409 / 422 / 500 與**資料庫錯誤**各自的 UI 呈現 | W2 | 3 | | |
| | | WS：**握手失敗直接 close 1008，不給 `err`**；不合法訊息**一律靜默丟棄** | W2 | 2 | | |
| FE-I05 | 邊界值前置驗證 | 後端**刻意不在應用層驗長度**，超長的錯誤是資料庫錯誤。前端要擋：`display_name` 1–20、`bio` ≤300、訊息 `body` 1–2000、`seat_index` 0–7、狀態文字 ≤12 | W2 | 3 | | |
| | | `projects.title` / `body`、`skills` 的數量與長度**後端完全沒有上限** —— 前端自己訂並記在規格裡 | W2 | 2 | | |
| FE-I06 | 合約漂移偵測 | **不做手抄的常數表**（會漂，而且違反 ADR 0001）。改成**契約測試**：把複述變成可執行的斷言 | W2 | 3 | | |
| | | **邊界一定要成對測。** 只送「超長」抓不到收緊：上限從 20 改成 10，送 21 仍被拒，測試照樣綠。每個限制要驗 `max` **接受**、`max+1` **拒絕**；數值範圍再加 `min-1` 拒絕、`min` 接受 | W2 | 5 | | Alarm｜只測單邊等於沒測 |
| | | 還要涵蓋：空字串與純空白、**Unicode 長度單位到底是字元／code point／byte**、`null` 與缺欄、型別強制轉換、回應的 status 與 error shape、**被拒絕後不得有部分寫入** | W2 | 5 | | |
| | | WS 協定的契約測試：未知 `t`、浮點座標、超長狀態文字、靜止時封包數為 0 | W2 | 4 | | |
| | | 後端改了 `protocol.py` 或 schema 的時候，前端怎麼發現 | W2 | 3 | | |
| FE-I07 | 限制值的來源 | **契約測試只偵測漂移，不把數字交給 UI。** maxlength、剩餘字數、送出鈕禁用都需要真的拿到那些數字 —— 沒有明確來源，最後一定有人在元件裡再寫一次 20／300／2000 | W2 | 2 | | Alarm｜這是最容易復發的一種重複 |
| | | 取值優先序：① OpenAPI 有宣告 `maxLength`／`minimum`／`maximum` 就用產的 ② 沒宣告的話，集中在**單一個 adapter 常數模組**，元件不得自己寫數字 ③ 那個模組由 FE-I06 的契約測試盯著 | W2 | 4 | | |
| | | 誠實地寫下來：這**沒有消除複述**，只是把複述收斂到一個會被測試打臉的地方 | W2 | 1 | | |
---

## FE-C 基礎架構

> Next.js / TypeScript / TanStack Query / Zustand / Zod / Session
> W1–W2｜建立所有前端模組共用基礎

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-C01 | AppShell | Next.js + TypeScript 專案骨架與 `/world` 路由（World 以 Client Component 載入） | W1 | 3 | | |
| | | 全域 Layout / Provider（QueryClient、Store、Error Boundary） | W1 | 3 | | |
| | | Tailwind CSS 與 DOM UI Design Token | W1 | 2 | | |
| FE-C06 | 環境設定 | 後端 REST / WS 位址、環境變數規範、local / preview / prod 分離。**預設只連本機自己起的後端** | W1 | 2 | | |
| FE-C02 | APIClient | REST client；統一 baseURL / headers / **`credentials: 'include'`** / error handling | W2 | 3 | | |
| | | Profile / Project / Message / Room / Seat API modules，建在 FE-I01 產出的型別上 | W2 | 5 | | |
| FE-C03 | Schema | Profile / Project / Message / Room / Avatar Zod schemas | W2 | 4 | | |
| | | ClientMessage / ServerMessage discriminated union | W1 | 4 | | |
| | | API Error schema 與 safeParse 錯誤處理 | W2 | 2 | | |
| FE-C04 | StateManagement | TanStack Query Provider / Query Keys 規範 | W2 | 2 | | |
| | | `ui.store` / `world.store` / `interaction.store` / `avatar.store`（高頻 position / animation **不寫入 Zustand**） | W1–W2 | 4 | | |
| | | **Cache invalidation 規則**：發案、成軍、結案、認領座位之後哪些 query 要失效 | W2 | 3 | | |
| FE-C05 | Session | 匿名暱稱登入與 Session 保存 | W2 | 3 | | |
| | | 重整恢復 Session；logout；**session 過期**與 cookie 被清除後的行為 | W2 | 4 | BE-G01 待銜接 | Alarm｜清 cookie 等於永久失去身分 |
| FE-C07 | 路由與深連結 | DOM 路由與面板開關的關係；重新整理要回到同一個地方；分享一個專案的連結 | W2 | 4 | | |

**所有 API / WebSocket 外部資料皆以 Zod 驗證。**

---

## FE-W 3D 空間

> React Three Fiber / Three.js / Drei / Rapier / Procedural Stylized 3D

### W1 技術 Spike —— 先以程式化幾何驗證移動、視角、碰撞、互動與多人呈現

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-W01 | WorldCanvas | R3F Canvas、Renderer、Lighting、Soft Shadow、Resize | W1 | 4 | | |
| | | Suspense / World Loading fallback 與資源清理 | W1 | 2 | | |
| FE-W17 | 座標系對映 | **3D 世界座標 ↔ 協定的整數像素 `x`／`y`**：單位、原點、取整策略、往返誤差不得累積。朝向要對映到 **0–3 離散 `f`**，不是角度 | W1 | 4 | | Alarm｜W1 就會踩到，對錯了整個即時層都是歪的 |
| FE-W02 | LocalPlayer | 程式化 Chibi Player prototype 與 WASD / 方向鍵輸入 | W1 | 4 | | |
| | | 平面移動、朝向、速度限制（3D rendering + 2D gameplay logic） | W1 | 4 | | |
| | | Idle / Walk 程式動畫 prototype（bounce / arm-leg swing） | W1 | 3 | | |
| FE-W03 | Physics | Rapier Player / Ground / Wall / Static Object Collider | W1 | 5 | | |
| | | World Bounds、穿牆防護、Trigger / Sensor 基礎元件 | W1 | 4 | | |
| FE-W04 | CameraController | 固定 Orthographic Elevated Camera（固定角度／距離，**不給玩家自由旋轉**） | W1 | 3 | | |
| | | Camera follow + smoothing；Resize 維持構圖 | W1 | 3 | | |
| FE-W05 | SpatialInteraction | Interactable contract 與 Interaction Range 判定 | W1 | 4 | | |
| | | 顯示 E 互動提示；避免同時觸發多個物件 | W1 | 3 | | |
| | | `interactionTarget` → React DOM Panel / Modal（**3D 負責空間，DOM 負責產品操作**） | W1 | 3 | | |
| FE-W18 | 資源生命週期 | 場景切換時 geometry / material / texture 的釋放；**重複進出十次記憶體不得成長**（可量測的驗收） | W1 | 3 | | |
| | | 場景切換時 Rapier world 與 R3F tree 的拆除順序 | W4 | 3 | | |

### W2–W3 角色

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-W09 | ProceduralAvatar | Head / Hair / Body / Arms / Legs 模組化 Chibi Avatar | W2–W3 | 6 | | |
| | | Idle / Walk 程式動畫正式版，Local / Remote 共用 | W3 | 4 | | |
| | | 顯示 Display Name / Status | W3 | 2 | BE-G02 待銜接 | Alarm｜目前每個人的名字都會是「訪客」 |
| | | Body / Hair / Outfit / Skin / Color variation 系統 | W3 | 5 | BE-G04 `待裁決` | TBD｜`avatar_id` 是角色圖索引，不是六維編碼欄位 |
| FE-W10 | AvatarCreator | 首次登入的角色選擇流程 —— **MVP 先做預設角色 N 選 1** | W2 | 4 | | |
| | | R3F Avatar 即時 Preview | W2 | 4 | | |
| | | 六維外觀（Body / Hair / HairColor / Outfit / OutfitColor / Skin）與編碼 | — | — | BE-G03、BE-G04 | TBD｜遠端一律 avatar 0，做完別人也看不到 |

### W3 GuildHub 3D Design System —— 以程式化元件統一 Toy-like / Chibi 風格

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-W06 | WorldDesignSystem | 3D 色票、材質、比例、圓角、Outline、Shadow 規範（**所有場景元件只能用統一 tokens**） | W3 | 4 | | |
| | | RoundedBox / Capsule / Sphere / Cylinder 基礎 Primitive | W3 | 4 | | |
| | | 共用 StylizedMaterial / Outline / Shadow conventions | W3 | 3 | | |
| FE-W07 | EnvironmentComponents | Floor / Wall / Carpet / Platform | W3 | 4 | | |
| | | Desk / Chair / Shelf / Plant / Lamp / Sign | W3 | 6 | | |
| | | GuildBanner / ProjectBoard / TalentBoard / Door 視覺元件 | W3 | 5 | | |
| FE-W08 | GuildHallScene | 用程式化元件組出 Guild Hall（**不依賴完整外部場景模型**） | W3 | 6 | | |
| | | spawn、Project Board、Talent Board、社交區與 Corridor 配置 | W3 | 5 | | |
| | | 簡化 Collider 與固定 Camera 構圖驗證 | W3 | 3 | | |
| FE-W11 | ProjectBoardObject | 程式化 3D Project Board 與 Interaction Range | W3 | 2 | | |
| | | 互動後開啟 ProjectBoard React UI | W3 | 2 | | |
| FE-W12 | TalentBoardObject | 程式化 3D Talent Board 並接 SpatialInteraction | W3 | 2 | | |

### W4 專案空間

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-W13 | ProjectDoor | 依 `GET /api/rooms` 程式生成 Door；顯示 Project Name / Online Count | W4 | 4 | | |
| | | Door interaction → Room Password UI | W4 | 2 | | |
| FE-W14 | ProjectRoomScene | 用共用 3D Design System 組出 Project Room | W4 | 5 | | |
| | | Room spawn / collision / desk layout | W4 | 4 | | |
| | | Guild Hall ↔ Project Room 轉場（**切場景＝WS 關掉重開**） | W4 | 4 | | |
| FE-W15 | SeatObject | 程式化 Seat Object 與 available / occupied 狀態 | W4 | 3 | | |
| | | Seat interaction 與 API 結果同步 3D 狀態 | W4 | 3 | | |

### 視覺與資產

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-W19 | 渲染預算 | 遠端角色的 instancing / LOD / 簡化。**40 人同畫面是架構決定，不是收尾優化** | W5 | 6 | | |
| FE-W20 | VisualPolish | 統一 Chibi / Toy-like 的色彩、圓角、Outline、Shadow | W5 | 4 | | |
| | | 固定 Camera 下調整 Guild Hall 構圖與可讀性 | W5 | 3 | | |
| | | Avatar 外觀組合視覺檢查，避免穿模與色彩衝突 | W5 | 3 | | |
| FE-W21 | 資產管線 | 紋理尺寸、壓縮、授權、快取、版本與 fallback | W5 | 4 | | |
| FE-W16 | ExternalAssetFallback | 外部 GLB 使用規則：僅特殊物件、需符合色票與風格 | W3 | 1 | | |
| | | 必要時以 Blender 簡化／改材質後導入 | W3–W5 | 0 | | Pending｜預設不排入 MVP 工時 |
---

## FE-R 即時協作

> Native WebSocket / Presence / Position Sync / Interpolation / Chat
> **W1 Go / No-Go：40 個真實 R3F Browser 的 E2E**
>
> 大廳的 WS **不需要登入、不需要資料庫**，`./run.sh` 起來就連得上 ——
> 所以這一組可以最早開工，也是**唯一完全不受後端缺口影響**的一組。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-R01 | RealtimeClient | WebSocket connection / handshake / connection state | W1 | 4 | | |
| | | 加入 / 離開 scene、disconnect cleanup | W1 | 3 | | |
| | | 連線保活。**協定裡沒有 heartbeat 訊息，而且靜止時整則 `pos` 不送 —— 不能拿它當心跳** | W1–W5 | 4 | | Alarm｜原本規劃寫的 heartbeat 在協定裡不存在 |
| FE-R02 | RealtimeProtocol | Zod 驗證 `hello` / `snapshot` / `pos` / `presence` / `status` / `chat` / `err` | W1 | 4 | | |
| | | 未知 `t` 與不合法 payload：**明顯失敗，不得靜默忽略** | W3 | 3 | | |
| FE-R03 | PositionSync | Local Player 取樣與 ≤10 Hz 送出；**整數像素**，浮點會讓整則訊息被丟棄 | W1 | 4 | | |
| | | 靜止停止送 position；scene 切換停止舊同步 | W1 | 2 | | |
| FE-R09 | 本地回聲 | **自己的 `move` 會原路廣播回自己**（後端不做逐人過濾）。以本地預測為準，收到自己的 id 就忽略 | W1 | 3 | | |
| FE-R11 | 送出節流 | 10 Hz 的節流實作；**頁籤切到背景時 rAF 會停**，決定要斷線還是降頻 | W1 | 3 | | |
| FE-R13 | 多分頁語意 | 同一個人開兩頁是**兩條連線**，位置會互相覆寫；Presence 只在最後一條離開時消失（`manager.py:109`）。**行為目前未定義** | W1 | 3 | | Alarm｜多分頁時位置互相覆寫的行為未定義 |
| FE-R04 | RemotePlayers | `snapshot` 建立 Remote Players；`presence` 的 join / leave lifecycle | W1 | 4 | | |
| | | `pos` 更新 target state；Remote Avatar 共用同一套 ProceduralAvatar | W1–W3 | 3 | | |
| FE-R05 | Interpolation | previous / target；10 Hz network → 60 FPS render，遠端角色**無明顯跳格** | W1 | 6 | | |
| | | jitter / 缺包 / teleport threshold。**朝向 `f` 是離散的，做 facing transition，不是角度插值** | W1 | 4 | | |
| FE-R06 | BrowserLoadTest | 40 個真實 Chromium / R3F Browser E2E（**不是 WebSocket fake client**） | W1 | 6 | | |
| | | 單一 Browser 同畫面渲染 39 個 Remote Players，記錄 FPS / CPU / GPU / Memory | W1 | 4 | | |
| | | 另跑 40 WebSocket client network baseline，區分 Server／Protocol 與 Browser Rendering 問題 | W1 | 2 | | |
| | | **只准打自己本機起的後端。** 後端已有 `tools/run_swarm.py --n 40 --seconds 300` 可直接調插值，`--n 5 --idle` 驗證靜止時封包數為 0 | W1 | 1 | | |
| FE-R07 | Presence | Online snapshot / player status / offline cleanup | W3 | 3 | | |
| | | 狀態文字 **12 字上限**（超過後端靜默丟棄，舊狀態不變 → 前端一定要擋）與 Online Count | W3 | 3 | | |
| FE-R08 | RealtimeChat | Lobby / Room scene chat 送收 | W3–W4 | 4 | | |
| | | Client memory 保留近期訊息；Refresh 後清空（**刻意的，不是還沒做**） | W3 | 2 | | |
| FE-R10 | 斷線與復原 | 重連後重新握手、重建 snapshot、**清掉舊的 remote players 避免鬼影**；指數退避與 jitter | W5 | 5 | | |
| | | **重連後自己的位置會回到 (0,0)**（`presence.py:16`），狀態文字被清空 —— 要重送 | W5 | 3 | | |
| | | 使用者看得見的連線狀態；**握手失敗只會被 close 1008，沒有 `err`**，UI 要能解釋 | W5 | 3 | | |
| | | room token **8 小時 TTL** 過期後要重新 `/enter` | W5 | 2 | | |

---

## FE-P 產品功能

> Onboarding / Profile / Boards / Projects / Inbox / Room
> **3D 關掉時，產品核心流程仍然要能用。**

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-P01 | Onboarding | 第一次登入：暱稱 → 角色選擇 → 進入 Guild Hall | W2 | 4 | | |
| | | 已建立過的使用者直接恢復設定 | W2 | 2 | BE-G01 待銜接 | Alarm｜換裝置就恢復不了 |
| FE-P02 | Profile | Profile 顯示／編輯：Display Name、Skills、Hours、Bio | W2 | 5 | | |
| | | 顯示／更新 Avatar | W2 | 3 | | |
| | | React Hook Form + Zod validation + API update | W2 | 3 | | |
| FE-P03 | BoardShell | 共用 Panel Layout、列表、**offset 翻頁**（`PAGE_SIZE=20`，沒有 total／`has_more`） | W2 | 5 | | |
| | | Detail、Loading、Error、Close / Escape | W2 | 4 | | |
| | | 搜尋與篩選 | — | — | BE-G05 待銜接 | Pending｜只能過濾已載入的 20 筆，**不可以叫它搜尋** |
| FE-P14 | 表單一致性 | 所有欄位的前置驗證、送出中／失敗／重試、樂觀更新的回滾、**double-submit 防護** | W2 | 5 | | |
| FE-P04 | ProjectBoard | 讀取 recruiting projects、Project Card / Detail / needed skills | W2 | 4 | | |
| | | 聯絡發起人與發案入口 | W2 | 2 | | |
| FE-P05 | TalentBoard | 讀取 profiles、Talent Card / Detail | W2 | 4 | | Pending｜後端沒有篩選能力 |
| | | 聯絡人才 | W2 | 1 | | |
| | | Skills filter / Available Hours 篩選 | — | — | BE-G05 待銜接 | Pending｜後端只有翻頁，篩不了 |
| FE-P06 | ProjectManagement | Create Project / Project Detail / Status 顯示 | W2 | 4 | | |
| | | 成軍：**強制設定 Room Password**（`form-team` 一個動作完成） | W4 | 3 | | |
| FE-P15 | 生命週期規則 | `expires_at` 預設 7 天。**過期只是查不到，沒有排程也不會提醒**。顯示、時區、快到期提示 | W4 | 4 | | |
| | | 邊界行為：過期的能不能成軍、`closed` 的能不能 `enter`、重複 close / form-team | W4 | 3 | | |
| | | `recruiting → active → closed` 的 UI 一致性。**別人改了狀態我不會收到通知** | W4 | 3 | BE-G11 待銜接 | |
| FE-P07 | Inbox | Inbox List / Message Detail / Send Message | W2 | 5 | | |
| | | 資訊架構：**收件與寄件混在同一份清單**、對話分組、對方名稱解析、分頁交錯 | W2 | 4 | | |
| | | **不可 Edit / Delete**（immutable，後端明文排除） | W2 | 1 | | |
| | | Read / Unread 與未讀數 | — | — | BE-G06 待銜接 | Pending｜沒有寫得到 `read_at` 的端點 |
| FE-P08 | StatusControl | 快捷狀態、自由輸入、**12 字硬限制**、清除狀態 | W3 | 3 | | |
| | | 透過 WebSocket 同步 Status | W3 | 2 | | |
| FE-P09 | ChatPanel | Lobby / Room Chat UI、訊息列表、輸入框 | W3–W4 | 4 | | |
| | | 場景切換清理 Chat | W4 | 1 | | |
| FE-P10 | RoomAccess | Password Modal、錯誤回饋、取得 room token | W4 | 4 | | |
| | | 進入／離開 Project Room | W4 | 2 | | |
| FE-P11 | SeatManagement | Seat List / Claim Seat / Occupied State（`seat_index` 0–7，一人一格） | W4 | 4 | | |
| | | 處理 Seat Conflict | W4 | 2 | | |
| | | Owner Release Seat / 離開時釋放 | — | — | BE-G07 `BE-拒` | Cancelled｜後端明文砍除，不是漏做 |
| FE-P12 | MeetingLink | 顯示外部 Meeting URL 並開啟（**不自建視訊**） | — | — |  | Cancelled｜併入 FE-M09 的洽談（約時間用外部 Meeting URL） |
| FE-P16 | 應徵流程 | 結構化應徵（apply → accept），取代「寄信給發起人」 | — | — |  | Cancelled｜由 FE-M04 應徵取代，而且做得更完整 |
| FE-P17 | 身分正式化 | 讓使用者換裝置後還能是同一個人 | — | — |  | Cancelled｜由 FE-T03 持續身分取代 |
| FE-P18 | 通知 | 新訊息、專案狀態變化 | — | — |  | Cancelled｜由 FE-M16 訂閱與回訪取代 |
---

## FE-M 接案與發案的完整流程

> **這一組是整份規劃原本最大的空白。**
>
> 原本的「接案」只有一個動作：**寄站內信給發起人**。
> 那不是媒合流程，那是陌生人私訊 —— 發案者收到二十封信，
> 無法比較、無法追蹤誰申請了哪個角色，也沒有任何結果狀態。
>
> 下面把兩邊的完整操作流程拆開來。**接案者九步、發案者五步**，
> 兩邊在第六步之後合流。

```
接案者   發現 → 看詳情 → 應徵 → 追蹤 → 洽談 → 收 offer → 加入 → 合作 → 結束
發案者   開案 →              收應徵 → 篩選 → 洽談 → 發 offer → 成軍 → 管理 → 結案
```

### 接案者這一側

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-M01 | 發現案件 | 進入點有五種，都要通：Marketplace 看板、Guild Hall 的熱門／缺人、技能場景推薦、**公開招募活動**（走過去旁聽）、分享的連結直接進 | W6 | 4 | | |
| FE-M02 | 案件列表 | 卡片要能一眼判斷：標題、需求技能、**還缺哪些角色**、預算範圍、期程、發案者、剩幾天到期、已幾人應徵 | W6 | 5 | 待銜接 | |
| | | 排序（最新／即將到期／符合度）與篩選（技能、每週工時、可開始時間、時區、預算範圍、角色類型） | W6 | 5 | BE-G05 待銜接 | |
| | | **我的匹配度徽章**：技能符合 3/4、工時符合、時區重疊。可解釋，不是演算法分數 | W7 | 4 | BE-G21 待銜接 | |
| | | 五種空狀態分開處理：首次無資料／篩選無結果／翻到底／載入失敗且無快取／權限阻擋 | W6 | 3 | | |
| FE-M03 | 案件詳情 | 描述、需求技能、**Open Roles**（每個角色的職責／技能／每週工時／報酬形式） | W6 | 5 | BE-G10 待銜接 | |
| | | 期程：開始日、預計長度、每週工時、需要的時區重疊 | W6 | 3 | BE-G21 待銜接 | |
| | | **發案者資訊**：帳號年齡、發過幾個案子、回覆率、平均回覆時間、目前團隊。陌生人憑什麼相信他 | W10 | 4 | BE-G24 待銜接 | |
| | | 目前狀況：已有幾人應徵、哪些角色已補滿、招募是否暫停 | W6 | 3 | BE-G22 待銜接 | |
| | | 動作列：應徵、收藏、分享、聯絡發起人、檢舉 | W6 | 3 | | |
| FE-M04 | 應徵 | **對一個 Open Role 應徵，不是對整個專案。** 選角色 → 填報價 → 可投入時間與可開始日 → 簡短提案 → 附作品連結 | W6 | 6 | BE-G10 待銜接 | |
| | | 送出前預覽；**同一個角色只能有一份有效申請**（重複送出要擋，而且要說清楚為什麼） | W6 | 3 | | |
| | | 報價：固定總價／時薪／志願／待議，含幣別。**只是欄位，不接金流** | W6 | 3 | BE-G20 待銜接 | |
| | | 作品連結要驗證 URL scheme 並標示「未驗證」——不要讓它看起來像被證實過 | W6 | 2 | | |
| FE-M05 | 我的應徵 | 列表：案子、角色、狀態、送出時間、最後更新。**這是接案者每天會回來看的那一頁** | W7 | 5 | BE-G10 待銜接 | |
| | | 七種狀態：待處理／已查看／邀請洽談／已接受／已婉拒／已撤回／**已逾期**。逾期**由時間推導**，不靠發案者手動設定 | W7 | 4 | BE-G10 待銜接 | |
| | | 未被接受前可撤回 | W7 | 2 | | |
| | | 被婉拒時顯示原因（若發案者有填）。**「已讀不回」是求職者最痛的事**，做不到強制回覆，至少讓逾期看得見 | W7 | 3 | | |

### 發案者這一側

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-M06 | 建立案件 | 標題、描述、需求技能，以及**逐個 Open Role**：名稱、職責、需要的技能、每週工時、報酬形式 | W6 | 6 | BE-G10 待銜接 | |
| | | 期程：開始日、預計長度、時區需求、緊急程度、一次性交付或長期 | W6 | 4 | BE-G21 待銜接 | |
| | | 預算範圍與計價方式；招募截止日 | W6 | 3 | BE-G20 待銜接 | |
| | | 草稿與發布分開。發布前預覽「別人會看到什麼」 | W6 | 3 | | |
| FE-M07 | 應徵者管理 | 應徵列表**依角色分組**、依匹配度排序。每筆顯示：應徵者、匹配度、報價、可投入時間、提案摘要 | W7 | 6 | BE-G10 待銜接 | |
| | | 動作：看 profile、邀請洽談、婉拒（可填原因）、標記待議。**批次婉拒** —— 二十封信不能一封一封回 | W7 | 5 | | |
| | | 開啟應徵時自動標記「已查看」，讓對方看得到 | W7 | 2 | | |
| FE-M08 | 招募狀態 | 招募中／暫停／已補滿／取消，各自的 UI 與後果（暫停時還能不能收應徵） | W7 | 4 | BE-G22 待銜接 | |

### 兩邊合流

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-M09 | 洽談 | **申請與成軍之間缺一整段。** 發案者邀請洽談後產生一個**綁在這份應徵上的對話串**（不是站內信 —— 站內信找不到脈絡） | W8 | 6 | BE-G10 待銜接 | |
| | | 可修訂條件：報價、工時、開始日、角色範圍。**雙方都看得到修訂歷史** | W8 | 5 | | |
| | | 約時間：外部 Meeting URL（不自建視訊），`rel="noopener noreferrer"` 與 scheme 白名單 | W8 | 2 | BE-G12 待銜接 | |
| FE-M10 | Offer 與接受 | 發案者發 offer：角色、合作期間、每週工時、報酬形式、開始日 | W8 | 5 | BE-G10 待銜接 | |
| | | 接案者接受／婉拒／提出修改。**雙方確認之後才成為團隊成員** —— 被加入不等於本人同意，否則 Team Formation 只是發起人單方面管理名單 | W8 | 5 | | |
| | | 接受後自動取得 Project Room 存取，不用再輸一次密碼 | W8 | 3 | | |
| FE-M11 | 生命週期拆開 | **「停止招募」和「專案完成」是兩件事。** 招募狀態（招募中／暫停／已補滿／取消）× 執行狀態（準備中／進行中／待驗收／已完成／中止）要分開 | W9 | 5 | BE-G22 待銜接 | Alarm｜不拆的話**算不出完成紀錄**，信任訊號整層做不了 |
| FE-M12 | 退出與失敗路徑 | 發案者取消、接案者退出、雙方同意中止、成員被移除（要有理由與紀錄）、長期無活動。**只有 `closed` 的話這些全部被算成同一種結果** | W9 | 5 | BE-G22 待銜接 | |
| FE-M13 | 團隊脈搏 | Project Room 現在只有外部連結，那是書籤不是工作脈絡。要能回答：團隊現在的目標、最近發生什麼、下一個里程碑、誰在做什麼、需要什麼協助、新成員怎麼快速進入狀況 | W9 | 6 | BE-G12 待銜接 | |
| | | **不做完整專案管理** —— 但沒有脈搏的話，Office 的 Presence 沒有可讀內容 | W9 | 3 | | |
| FE-M14 | 媒合意圖 | 進來的人此刻想做什麼：找案／找人／組隊做 side project／提供短期協助／只是交流。**`Looking For` 不該只是一段文字** —— 要結構化、可搜尋、可暫停，而且**會過期** | W7 | 5 | BE-G14 待銜接 | |
| FE-M15 | 市場有效期 | Marketplace 很容易累積殭屍內容。案件到期、招募需求定期確認、人才可用狀態過期、長期未回覆降權、「目前仍在招募」重新確認 | W10 | 5 | BE-G19 `BE-拒` | Alarm｜**對媒合產品來說「資料還有效嗎」比搜尋功能多寡更重要**，但後端排除了到期排程 |
| FE-M16 | 訂閱與回訪 | 收藏案件／人才、儲存搜尋條件、新案件符合條件、申請狀態更新、有人邀請或回覆、專案房有待辦。**先決定訂閱什麼，通知走 email／推播／站內之後再說** | W12 | 6 | BE-G23 待銜接 | |

---

## FE-T 信任與邊界

> 陌生人憑什麼相信你？**這是媒合平台的核心，而原本的規劃一個字都沒有。**
>
> 沒有這一層，每一次媒合都要從零開始相信陌生人 ——
> 平台不會隨著使用次數變得更有價值。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-T01 | 事實型聲譽 | **不先做五星評價。** 它容易失真、互相做人情、懲罰新手。先做可驗證的事實：已加入／已完成的專案數、準時完成或中途退出、合作時間長度、對方確認過的技能或貢獻、帳號年齡、回覆率與平均回覆時間 | W10 | 6 | BE-G24 待銜接 | |
| | | 在 Profile、Talent Card、案件詳情的發案者區塊都要顯示 —— **它要出現在做決定的那一刻，不是藏在個人頁裡** | W10 | 4 | | |
| FE-T02 | 作品與外部身分 | 作品集連結、GitHub／Figma／LinkedIn。**未驗證的一律標示「未驗證」** | W10 | 4 | | |
| | | 已驗證的外部帳號（要 OAuth，但**價值不是省一次密碼，是證明這個身分屬於我**） | W13–W16 | 5 | BE-G25 `BE-拒` | Pending｜後端排除 OAuth，要做得先翻那個決策 |
| FE-T03 | 持續身分 | **匿名或化名本身不是問題** —— 很多創作者社群靠持續化名運作。問題是**可以被任意冒充**。要的是唯一帳號、名稱歷史、帳號年齡 | W10 | 4 | BE-G01 待銜接 | Alarm｜目前每次登入都是新的人 |
| FE-T04 | 聯絡邊界 | 誰可以私訊我、是否接受邀請、是否允許陌生人靠近或聊天、狀態對誰可見、哪些專案關係可以公開、離線時是否接收通知 | W11 | 5 | BE-G26 待銜接 | |
| | | **空間產品會放大接近感，所以邊界感要比普通網站更強。** 這一項跟 FE-V05 的分級可見度是同一件事的兩面 | W11 | 3 | | |
| FE-T05 | 封鎖與檢舉 | 封鎖、靜音、檢舉、隱藏。**只要允許陌生人私訊、空間接近與即時聊天，這就是產品基本能力** | W11 | 5 | BE-G15 `BE-拒` | Alarm｜後端排除 `/api/admin/*`。**只有檢舉按鈕、沒有人能處置，等於沒有** |
| FE-T06 | 合作後回饋 | 雙向，且只在有明確合作結果之後開放（依賴 FE-M11 的生命週期拆分） | W12 | 4 | BE-G24 待銜接 | |

---

## FE-V 空間裡正在發生的事

> **這一組回答的是「為什麼需要 3D」。**
>
> 空間**不能**提供普通網站技術上做不到的事 —— 列表網站也能顯示誰在線、
> 熱門案件與聊天室。空間能做的是把某些行為變得自然且低摩擦。
>
> 如果主要行為都是「走到一個物件、按 E、打開 DOM 面板」，
> **那 3D 就是一條很貴的導覽列。** 原本的規劃裡，它提供的正好就是那條導覽列。
>
> 空間唯一真正的優勢是這條鏈：
>
> ```
> 看見 → 靠近 → 旁聽 → 打招呼 → 正式申請
> ```
>
> **不必一開始就寄陌生私訊。** 這一組就是讓那條鏈成立的東西。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-V01 | 公開活動物件 | 空間裡要有**正在發生、可旁觀、可加入**的事：某團隊正在開 15 分鐘招募說明、某人開放 portfolio review、某桌正在找一位設計師、某技能區有 mentor office hour、某專案正在公開 demo、某工作桌標示「可打擾／歡迎加入」 | W11 | 6 | BE-G27 待銜接 | Alarm｜**沒有這一項，3D 就只是很貴的導覽列** |
| | | 活動的建立與結束：誰在辦、在哪、什麼時候開始、預計多久、可容納幾人 | W11 | 5 | BE-G27 待銜接 | |
| FE-V02 | 可旁觀 | 站在外圍就能知道「這裡在幹嘛」，不用先加入。旁觀者不計入參與者、不能發言（或只能提問） | W11 | 5 | BE-G27 待銜接 | |
| FE-V03 | 漸進式接近 | 看見 → 靠近（顯示更多資訊）→ 旁聽 → 打招呼 → 正式申請。**每一步都要能退回上一步**，不能一靠近就被拉進去 | W11 | 5 | BE-G27 待銜接 | |
| FE-V04 | 群體訊號 | 不能只呈現「在線人數」。要能回答：人在哪裡 → 為什麼聚集 → 這件事跟我有沒有關 → 我能不能旁觀 → 我怎麼低風險加入 | W11 | 5 | BE-G09、BE-G27 | Alarm｜**這條鏈不成立的話，Presence 只是裝飾** |
| FE-V05 | 分級可見度 | 「正在找 React 隊友」可以公開，「在某個保密專案工作」不行。呈現的是**經過同意、分級抽象**的活動，而且要有勿擾／只對隊友可見 | W11 | 5 | BE-G26 待銜接 | Alarm｜**空間可讀性必須跟隱私控制一起設計**，晚做要全部重來 |
| FE-V06 | 共享儀式 | 固定招募市集、demo day、office hours、配對時段、結案展示。**空間記憶** —— 使用者知道某類人與機會通常出現在哪裡 | W12 | 6 | BE-G13 待銜接 | |
| FE-V07 | 冷啟動 | 第一個使用者進來，世界是空的、Marketplace 是空的。降低傷害：預先策展的公開案件、固定時段的招募活動、展示非即時內容（近期活動、過往成果）、**先集中一個技能社群或一種案件類型**，不要攤薄 | W12 | 5 | | Alarm｜這是市場營運問題，不是做一個功能就解決 |
| | | **假人只能用於教學，不能冒充真人。** 空世界不該用假在線使用者掩飾 | W12 | 2 | | |

---

## FE-S 場景與產品擴充

> **先讀 BE-G09。** 「場景」這個詞在這裡有兩個意思，混用會讓整組規劃失真：
>
> | 用詞 | 意思 | 後端支不支援 |
> |---|---|---|
> | **視覺分區** | 同一個 `lobby` 裡走得到的不同區域，換的是地板、家具、React 面板 | **支援**（後端不用動） |
> | **伺服器 scene** | 有獨立 Presence、聊天隔音、各自 online count 的成員名單 | **只有 `lobby` 與 `room:{id}`** |
>
> 現在的 ROADMAP 描述的是後者，而後端只提供前者。**這件事要先裁決。**

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-S01 | SceneNavigation | Guild Hall ↔ Project Room 的切換架構（**這一組是真的伺服器 scene**：關掉舊連線、帶 room token 重開） | W4 | 5 | | |
| | | 入口、Transition、Loading、返回 Guild Hall | W4 | 4 | | |
| | | 切換時 WS 成員與 Presence 的同步；**多分頁時同一人是兩條連線**，位置會互相覆寫 | W4 | 4 | | Alarm｜行為未定義 |
| FE-S02 | MarketplaceScene | Marketplace 作為 **Guild Hall 內的視覺分區**與 Project／Talent 入口 | W4 | 5 | | Alarm｜先裁決 BE-G09 的用詞，否則做出來的東西名不符實 |
| FE-S03 | OfficeScene | Office 視覺分區、工作桌、座位、休息區配置 | W4 | 6 | | Alarm｜同上 |
| | | 查看附近成員的 Display Name / Status / Profile | W5 | 4 | BE-G02 | |
| FE-S04 | SkillSpaces | Developer Office / Design Studio / AI Lab | W13–W16 | 10 | BE-G09 待銜接 | Pending｜要有伺服器 scene 才做得出「同領域的人在這裡」，優先序低於媒合閉環 |
| FE-S05 | PersonalDesk | Office 工作桌 Claim / Leave | W13–W16 | 8 | BE-G14 待銜接 | Pending｜優先序低於媒合閉環 |
| FE-S06 | LookingFor | Available for Work / Hiring / 找什麼角色 | — | — |  | Cancelled｜由 FE-M14 媒合意圖取代（結構化、可暫停、會過期） |
| FE-S07 | TeamFormation | Founder / Team / Open Roles / 邀請 / 應徵 | — | — |  | Cancelled｜由 FE-M09 洽談與 FE-M10 Offer 取代 |
| FE-S08 | ProjectResources | GitHub / Figma / Notion / Drive / Meeting 外部連結 | W13–W16 | 5 | BE-G12 待銜接 | Pending｜FE-M13 團隊脈搏先做，資源看板之後再說 |
| FE-S09 | RoomPresence | Project Room 顯示在線成員與狀態（**這一項可以做** —— room 是真的 scene） | W9 | 5 | | |
| FE-S10 | SceneDiscovery | 世界導覽 / 場景地圖 / 快速移動 | W13–W16 | 5 |  | Pending｜世界導覽的優先序低於媒合閉環，往後挪 |
| | | 各場景 Online Count | — | — | BE-G09 待銜接 | Pending｜只有 `lobby` 與每個 room 有人數 |
| FE-S11 | CommunityEvents | 活動列表 / Detail / 類型 / Participants | W13–W16 | 12 | BE-G13 待銜接 | Pending｜社群活動的地基是 FE-V01 的公開活動物件，先做那個 |
| FE-S12 | EventSpace | Event Space / Stage / Audience Area | W13–W16 | 10 | BE-G09、BE-G13 | Pending｜同上 |
| FE-S13 | DiscoveryExperience | 新手導覽：發案 / 接案 / 找人 / 進 Room | W12 | 5 | | |
| | | 熱門案件 / 缺人 Project / 熱門場景 | — | — | BE-G05 待銜接 | Pending｜沒有排序或聚合的查詢 |
| | | 回訪入口：最近 Project / 最近場景 / 未讀 Inbox | — | — | BE-G01、BE-G06 | Cancelled｜**身分無法跨裝置恢復，回訪在後端層面不成立**。等 BE-G01 有結論再開 |

---

## FE-X 品質、安全與包容性

> **這一組不是「最後再做的橫向工作」。**
> 安全、無障礙、裝置降級、錯誤處理是**每一項功能的完成定義**（見 `AGENTS.md`）。
> `FE-X` 只放**共用機制**與**稽核**，不是把它們延後的地方。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-X01 | 錯誤處理機制 | REST / WS / Zod invalid payload 的統一錯誤狀態與呈現 | W2 | 4 | | |
| | | 握手失敗**只會被 close 1008，沒有 `err`**；不合法訊息**靜默丟棄** —— UI 要能解釋「送出去沒反應」 | W5 | 3 | | |
| | | Room password / Seat conflict / Network disconnected 的具體畫面 | W5 | 3 | | |
| FE-X02 | 輸入與輸出安全 | 危險面只有這幾個：`dangerouslySetInnerHTML`、Markdown／富文字、**URL scheme 白名單**、第三方嵌入。React 預設會 escape，一般文字不構成 XSS | W2 | 3 | | |
| | | 外開連結一律 `rel="noopener noreferrer"` | W4 | 1 | | |
| | | **Room token 存哪裡**（memory / sessionStorage / localStorage / URL）—— TTL 8 小時，放 URL 會進 access log | W4 | 3 | | Alarm｜決定錯了很難改回來 |
| | | CSRF 與 WS Origin 的威脅模型：REST 走 cookie session，而 lobby WS **不驗登入** | W5 | 3 | | |
| FE-X03 | 空狀態 | 五種分開處理：首次無資料／篩選無結果／翻到底／載入失敗且無快取／權限阻擋 | W2 | 4 | | |
| FE-X04 | 鍵盤與焦點 | **WASD 與輸入框會打架。** Modal、Escape、focus trap、螢幕閱讀器與 3D 輸入的焦點治理 | W2 | 5 | | Alarm｜晚做要改每一個面板 |
| FE-X05 | 無障礙 | DOM 面板的 aria、對比、鍵盤路徑。**3D 世界不承諾無障礙，但產品核心流程必須能純 DOM 完成** | W5 | 5 | | |
| FE-X06 | 裝置與降級 | 手機上 3D + WASD 不成立。決定：DOM-only 模式／虛擬搖桿／點地移動。**必須有結論** | W2 | 3 | | Alarm｜這是產品範圍決定，不是實作細節 |
| | | 實作選定的方案 | W13–W16 | 8 | | Pending｜等上面的決定 |
| FE-X07 | 相容矩陣 | WebGL2 偵測與友善提示、整合顯卡降級、**context lost**、`prefers-reduced-motion`、背景分頁節流、Safari / iOS | W5 | 5 | | |
| FE-X08 | 降級模式 | REST 活著但 WS 掛了／WS 活著但 DB 掛了／3D 掛了 —— 每一種的產品行為 | W5 | 4 | | |
| FE-X09 | 送出節流 | chat / status / 表單的前端節流。**後端沒有 rate limit**（BE-G16），所以這只擋得住守規矩的人 —— 要做，但不要當成防護 | W3 | 3 | | |
| FE-X10 | i18n | 文案抽出、語言切換、日期時間與時區格式化 | W13–W16 | 6 | | |
| FE-X11 | 隱私與內容政策 | 誰看得到 profile、資料保存多久、法律頁面 | W13–W16 | 4 | | |
| | | 帳號刪除與資料匯出 | — | — | `BE-拒` | Cancelled｜`CLAUDE.md` 明文排除 |
| FE-X12 | moderation | 封鎖、檢舉、隱藏 | — | — | BE-G15 `BE-拒` | Cancelled｜後端排除 `/api/admin/*`。**要翻案得先翻後端的產品決策** |
---

## FE-O 工程與交付

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-O01 | CI 補齊 | scaffold 之後**立刻**把 `Lint` / `Typecheck` / `Test` / `Build` 放回 `ci.yml`（檔案裡有註記） | W1 | 3 | | Alarm｜每晚一天，紅的東西就多一天沒人看見 |
| FE-O02 | 測試策略 | 單元 / component（Testing Library）/ E2E（Playwright）的分工與比重 | W1 | 4 | | |
| | | **測試環境隔離**：只准打自己 `./run.sh` 起的後端。一次 40 連線的壓測足以把共用實例的人全部踢下線 | W1 | 2 | | |
| | | 3D 怎麼測 —— 哪些行為值得 E2E，哪些只驗 store 與純函式 | W1 | 4 | | |
| FE-O03 | 契約測試 | **取代手抄的欄位上限表。** 對每個已知限制送超長輸入到本機後端，斷言它拒絕 —— 複述變成可執行的斷言，漂了會紅 | W2 | 5 | | |
| | | WS 協定的契約測試：未知 `t`、浮點座標、超長狀態文字 | W2 | 4 | | |
| FE-O04 | 假後端與測試資料 | 後端沒起來時前端能不能開發（後端有 `sql/002_seed.sql` 與 `tools/run_swarm.py`） | W2 | 4 | | |
| FE-O05 | 效能預算 | FPS、Draw Calls、Memory、WebSocket 流量的**數字目標**，超過就紅 | W5 | 4 | | |
| | | bundle size、首次載入、3D 初始化時間 | W5 | 3 | | |
| | | 40 Remote Avatar 的渲染優化與量測（與 FE-W19 成對） | W5 | 5 | | |
| FE-O06 | 視覺回歸 | 3D 畫面怎麼測 —— 截圖比對還是只測 DOM。**先決定，不要做一半** | W5 | 4 | | |
| FE-O07 | 部署與環境 | 部署在哪、preview 連哪個後端、環境變數注入 | W5 | 4 | | |
| FE-O08 | 技術可觀測性 | 前端錯誤回報、WS 斷線率、FPS 遙測。**只做技術 telemetry** —— 使用者行為追蹤被後端明文永久排除（BE-G17），兩者不要混在同一個提案裡 | W13–W16 | 6 | | |
| | | 使用者行為 analytics | — | — | `BE-拒` | Cancelled｜「任何形式的活動追蹤——永久不做」。**不要跟技術遙測混在同一個提案裡** |
| FE-O09 | 規模化 | `PAGE_SIZE=20` 的 offset 翻頁在資料變多時會慢且會漏；快取與預取策略 | W17–W20 | 6 | BE-G05 | Pending｜等後端提供更好的查詢 |
| FE-O10 | 文件與交接 | `CONTEXT.md` / ADR / 本表的維護節奏 | 常態 | — | | Regular｜常態維護，沒有完成點 |

---

## FE-Q 發表準備

> **一次性的發表準備，跟長期品質是兩種生命週期。**
> 長期品質在 `FE-X`，工程量測在 `FE-O`，3D 視覺收斂在 `FE-W`。

| ID | 項目 | 工作 | 週 | 點 | 阻塞 | 標記 |
|---|---|---|---|---|---|---|
| FE-Q01 | DemoBot | Local fake player：spawn / random wander / idle at board | W5 | 3 | | |
| | | Status rotation；**不進 DB、不送 WebSocket** | W5 | 2 | | |
| FE-Q02 | DemoFlow | Demo fake data、固定發表流程、Demo reset | W5 | 3 | | Alarm｜reset 可能動到正式資料 |
| | | **Demo 資料與正式資料的隔離** —— reset 會不會動到真的東西 | W5 | 2 | | Alarm｜發表當天最不想踩的地雷 |
| | | World 預載、異常 fallback、完整 E2E rehearsal | W5 | 4 | | |
| FE-Q03 | 發表前檢查 | 走完一次完整流程並留下 evidence（不是只說「已完成」） | W5 | 3 | | |
| FE-Q04 | GuestMode | Guest 可移動 / 看玩家 / 看板；限制發案 / 寄信 / 進房 | — | — | BE-G08 `BE-拒` | Cancelled｜後端明文排除「訪客唯讀模式與相關 gate」。前端禁用按鈕**不是權限邊界**，做了會給人虛假的安全感 |
---

## 里程碑：原本的 12 週，對上實際的後端

原本的 12 週演進寫在 `docs/ROADMAP.md`。**它是在後端存在之前寫的**，
所以這裡列的是「同樣的週次，實際交付得出什麼」。

驗收用**能力**，不用「第幾週看起來像什麼」。

| 週 | 原本說 | 實際交付得出的 | 差在哪 |
|---|---|---|---|
| **W1** | 世界技術成立 ＋ **資料層立起來** | 大廳 WS 不需登入不需資料庫，`./run.sh` 起來就能連，40 browser gate 可以真的跑。同時把**資料層契約**與 **adapter 切換**做好 —— 之後所有功能都建在它上面 | 無 |
| **W2** | **自己的後端能跑完整流程** | 本地 Route Handlers ＋ 可拋棄資料庫 ＋ seed／reset ＋ **契約測試跑兩邊**。加上登入、Profile、發案、瀏覽、寄信 | 無。**從這裡開始不用等後端** |
| **W3** | Guild Hall 成形 | **成立**，但世界裡每個人都叫「訪客」、都是同一隻 avatar | BE-G02、BE-G03 |
| **W4** | 世界開始分區 | **一半成立。** Project Room 是真的伺服器 scene，可以走通「發案→成軍→進房→坐下」。Marketplace / Office 只能是**視覺分區** | BE-G09 要先裁決用詞 |
| **W5** | MVP 可發表 | **成立**，但 Guest 模式取消 | BE-G08 `BE-拒` |
| **W6** | **接案流程成立** | 建立含 Open Roles 的案件、瀏覽、看詳情、**對某個角色應徵**（報價／可投入時間／提案）、發案者收到可比較的應徵列表 | 本地後端做 application 模型；銜接清單記 BE-G10 |
| **W7** | **兩邊都追得到進度** | 我的應徵（七種狀態、逾期由時間推導、可撤回）、應徵者管理（分組、排序、批次婉拒、已查看）、招募狀態、匹配度徽章、媒合意圖 | BE-G10、BE-G22 待銜接 |
| **W8** | **從應徵走到成軍** | 洽談（綁在應徵上的對話串、條件修訂歷史）、Offer 與雙方確認、接受後自動取得 Project Room 存取 | BE-G10 待銜接 |
| **W9** | **專案有生命週期** | 招募狀態 × 執行狀態拆開、退出與失敗路徑、團隊脈搏、Room Presence | **同時做部分銜接**（FE-D07）：已對齊的走真後端 |
| **W10** | **陌生人開始可以被判斷** | 事實型聲譽（完成數／準時或退出／回覆率／帳號年齡）、作品與外部身分、持續身分、市場有效期 | BE-G24 待銜接 |
| **W11** | **空間開始有事情發生** | 公開活動物件、可旁觀、漸進式接近、群體訊號、分級可見度、聯絡邊界、封鎖檢舉 | BE-G27 待銜接 ← 3D 的產品價值本身 |
| **W12** | **有理由回來** | 訂閱與狀態變化、共享儀式、冷啟動、新手導覽、合作後回饋 | BE-G23、BE-G13 待銜接 |

原本的 W6–W12 排的是 Skill Spaces、Personal Desk、Looking For、Team Formation、
世界導覽、社群活動。**那些被往後挪或被取代了**，理由是：

- **媒合閉環比第二批場景重要。** 沒有應徵與 offer，這個產品連「接案平台」都不算
- `Looking For` 被 `FE-M14 媒合意圖`取代（結構化、可暫停、會過期）
- `Team Formation` 被 `FE-M09 洽談` ＋ `FE-M10 Offer` 取代（原本的版本沒有雙方確認）
- Skill Spaces、世界導覽、社群活動往後挪到 W13 之後

### 這張表的意思

**沒有任何一項前端工作在等後端。** W1–W2 把資料層與本地後端立起來之後，
剩下的都是我們自己做得完的。

三件事同時進行：

1. **功能照排。** W6–W12 的媒合閉環全部建在本地後端上
2. **銜接是漸進的，不是全有全無。** `FE-D07` 從 W5 開始定期切到真後端跑一次，
   W9 開始部分銜接 —— **留到最後才第一次接，一定會炸**
3. **`FE-D06` 會自動產生銜接清單**，把它送去後端。
   `BE-拒` 那四條要另外談，因為那種功能**在本地做得出來，但上不了線**

> ⚠️ 這條路唯一的風險是：**本地後端什麼都做得到，於是我們會養成真後端
> 永遠滿足不了的期待。** 防它的只有一件事 ——
> **一份契約，兩個實作，同一組測試跑兩邊**（`FE-D01`、`FE-D05`）。
> 那組測試如果只跑本地，這整套就退化成「自己寫給自己看的假後端」。

> **「完整版」不等於把所有想得到的功能都排進週次。**
> 一個沒有資料來源、沒有授權規則、沒有生命週期、沒有後端 owner 的項目，
> 不是 todo，是**未決的產品提案**。把它標成 W7 或 W12，
> 只是把不確定性偽裝成計畫。

### 下一步（不用等後端）

- **W1 照原訂做。** 它不受任何後端缺口影響
- **同時把 `BE-G` 拿去跟後端對一次。** 它決定 W2 之後的所有範圍
- **`FE-X06` 裝置決定**與 **`BE-G09` 場景用詞裁決**這兩件，
  越晚做代價越大，而且都不需要寫程式
