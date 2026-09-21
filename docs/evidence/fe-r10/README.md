# FE-R10 的瀏覽器證據

**這裡有兩組，來源完全不同，不要混在一起看。**

| 組 | 檔案 | 後端 | 腳本 |
|---|---|---|---|
| 在線人數（`S07`～`S09`） | `online-count-1280x720.png` | **全部偽造**（`page.route` ＋ `routeWebSocket`） | 一次性的，沒有進版控 |
| 兩個瀏覽器互見姓名（`S10`） | `two-browsers-jia.png`／`two-browsers-yi.png` | **真的本地後端 ＋ 可拋棄資料庫** | `tests/e2e/two-browsers-names.mjs`，**進版控、可重跑** |

## 兩個瀏覽器互見姓名（`FE-R10-S10`）

`two-browsers-jia.png`／`two-browsers-yi.png` 是 `tests/e2e/two-browsers-names.mjs` 跑完時兩邊各自的畫面。
**這一組沒有偽造任何東西**：兩個隔離 cookie 的 browser context 各自打同源的 `POST /api/login` 真的登入，
名字存進一個**只為這次建立、跑完可以直接 drop** 的資料庫；即時層是 `scripts/realtime-stub.ts`（`FE-O03`，
照 `protocol.py` 寫），它**解 cookie、查名片表**才知道那條連線叫什麼名字 —— 跟真後端 `auth.py` 同一條路。
前端從頭到尾沒有機會「知道」對方叫什麼，除非那個名字真的走完 DB → WS → snapshot → roster → 名字牌。

跑法與環境變數寫在腳本開頭。**名字帶每次執行才產生的亂數尾碼**，所以截圖上的名字每跑一次都不一樣 ——
那是刻意的：寫死的名字會讓腳本在一個殘留的資料庫上假綠。

**證明**：兩個真的登入身分在同一個 scene 裡，各自在對方的遠端角色頭上看到**對方的名字**（不是 fallback、不是自己的）；
順帶拍到「2 人在線」，所以這張圖同時是 `S07` 在真後端下的旁證。

**不證明**：真 GuildHub Python 後端的整合。即時層是替身（規格 design `D5` 要的是「當次本機後端與測試資料庫」，
不是「團隊共用的那一份」）。

---

## 在線人數（`FE-R10-S07`～`S09`）

本機 `pnpm run dev`（`NEXT_PUBLIC_APP_ENV=local`），用一次性的 Playwright 腳本拍的（沒有進版控）：
REST 用 `page.route` 回偽造的回應（`/api/me` 401、`/api/rooms` 空清單），`/ws` 用 `page.routeWebSocket`
偽造 —— 先送 `hello`，隔幾秒才送含自己與兩個遠端玩家的 `snapshot`。**不連任何後端，也不連任何團隊共用的位址。**

## ⚠️ 這張截圖證明什麼、不證明什麼

**證明**：人數元件在收到那份 `snapshot` 時長什麼樣、放在哪裡、跟世界上其他 DOM 元件有沒有重疊。

**不證明**：真 GuildHub 後端整合可用。人數算得對不對、未就緒時不顯示、換連線不留舊數字，
是 `tests/online-count.test.tsx`（`FE-R10-S07`～`S09`）與 `tests/remote-players.test.ts` 在證明，不是這張圖。

## 檔案

| 檔案 | 情況 |
|---|---|
| `online-count-1280x720.png` | 訪客、Guild Hall、snapshot 含自己＋兩個遠端玩家 —— 世界區塊左上角「3 人在線」；中間是首次進入的提示卡，兩者不重疊 |

## 沒有放進來的，以及為什麼

- **未就緒（snapshot 之前）**：畫面上什麼都沒有，截圖證明不了「沒有」—— 由 S09 的兩條路徑斷言。
- **窄視窗**：人數框一律在左上角。最早窄於 768px 時放左下角，合併後量到跟場景聊天（`FE-K04`，固定左下角）
  重疊 —— 640×480 下人數框整個被聊天區蓋住，改回一律左上角（`fix/fe-r10-presence--count-placement`）。

## 已知的折衷

- **文案從長改短**：最早是「這個場景有 3 人在線（含你）」，截圖量到在 800×600 被首次進入的提示卡壓住
  （框寬 211px、卡片置中約 370px）。縮成「N 人在線」後框寬約 91px。人數包含自己是規格的定義（S07），
  文字不另外寫「含你」—— 文案不是契約（`openspec/config.yaml` 的 specs 規則）。
- **窄於約 580px 的視窗**：首次進入的提示卡置中約 370px，會壓到人數框一角；那張卡只對訪客出現、可以關掉，讓它蓋在上面。
- **截圖時間**：在 `feat/fe-r10-presence--online-count` 接上 `FE-R11`／`FE-N08` 之前拍的。
  之後人數元件（`OnlineCount.tsx`）與它在 `WorldCanvas` 的位置沒有改；新進來的聊天與房間密碼視窗預設不顯示。
