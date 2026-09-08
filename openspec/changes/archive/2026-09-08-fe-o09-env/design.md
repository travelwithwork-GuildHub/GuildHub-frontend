## Context

動機見 `proposal.md`〈Why〉。這裡只放會影響取捨的現況與量測。

**現況**：`src/` 底下沒有任何一處讀 `process.env`，沒有 `.env` 範本。
`next.config.ts` 只有 `agentRules: false` 與 `/` → `/world` 的轉址。

**量到的事**（從跑起來的後端、`app/main.py`，以及 Next.js 官方文件）：

| # | 事實 | 影響 |
|---|---|---|
| 1 | WS 端點是 `/ws`，`scene` 預設 `lobby`，另有 `token` 查詢參數 | 設定只放 base URL，`scene`／`token` 是 `FE-R01` 的事 |
| 2 | `_identify` 在沒有 session 時走匿名路徑，**每次連線發一個新的 `uuid4`** | 漏帶 cookie 不會失敗，會安靜地變成另一個人。**但這一刀證明不了 cookie 有沒有送到** —— 那是 `FE-R01` |
| 3 | 握手被拒時客戶端看到 `close code=1006`、`reason=""`、`wasClean=false`；「不合法 scene」「room 沒帶 token」「路徑不存在」三種**事件序列一模一樣** | 協定寫錯留到連線時才發現的話，它會混進一堆長得一樣的失敗裡 → D5 |
| 4 | `NEXT_PUBLIC_*` 在建置時被**靜態替換**成字面值 | 瀏覽器裡沒有真正的 `process.env` → D2 |
| 5 | **計算屬性存取（`process.env[name]`）與先指派再取用（`const e = process.env; e.X`）不會被替換** | 在瀏覽器裡得到 `undefined`，**沒有任何錯誤訊息** → D4 |
| 6 | **沒有 `NEXT_PUBLIC_` 前綴的變數在 client bundle 裡被替換成空字串**，不是 `undefined` | 用 `=== undefined` 判缺席會漏掉它 → D3 |

第 4–6 條出自 Next.js 官方文件的〈Environment Variables〉，
是這份設計三個決定的直接來源。

## Goals / Non-Goals

範圍邊界見 `proposal.md`〈不做什麼〉。設計層級再補：

**Goals**
- 讓「錯誤的設定」在**離錯誤最近的地方**失敗，而不是在連線時。
- 讓本機開發不需要任何設定就能跑起來，同時讓**部署出去的版本不可能**安靜退回本機。

**Non-Goals**
- 不做設定的熱重載。`NEXT_PUBLIC_*` 在建置時就凍結，做熱重載是假的。
- 不驗位址「連得上」。那需要發請求，屬於 `FE-O02`／`FE-R01`，而且 CI 不提供服務。
- 不宣稱 WebSocket 的 cookie 會送到。那要實測，是 `FE-R01`。

## Decisions

### D1. 用 `NEXT_PUBLIC_` 前綴，代價是值會被看見

位址要在**瀏覽器端**用得到，所以必須是 `NEXT_PUBLIC_*`。

**代價要寫明**：這些值會被**編進 bundle**，任何人打開 DevTools 都看得到。
所以這裡**只能放位址，不能放任何密鑰**。這不是遺漏，是這個前綴的定義。

考慮過改用 Route Handler 轉發、讓瀏覽器只看得到同源位址 —— 否決：
那等於在 W1 就做一層 proxy，而 `FE-O02` 的 adapter 切換還沒定案。

### D2. 匯出函式，但要誠實說明它在瀏覽器裡是什麼

設定模組匯出**函式**，不是模組載入時就算好的常數。

在 Node（伺服器端、測試）裡，函式每次呼叫都真的重讀 `process.env` ——
這讓「缺變數要拋錯」的測試可以直接改環境變數再呼叫，
不必靠 `vi.resetModules()` ＋ 動態 import（那種測試寫錯時會**安靜地測到快取**）。

**在瀏覽器裡不是這樣**：`NEXT_PUBLIC_*` 已經被替換成字面值，
函式每次呼叫讀到的是同一個常數。**這不影響正確性，但不要把它寫成
「執行期可變」** —— 它不是。

呼叫成本：預期只在啟動路徑上呼叫幾次。若之後變成熱路徑，再量測並快取。

### D3. 缺席的判準是 falsy，不是 `=== undefined`

沒有 `NEXT_PUBLIC_` 前綴的變數在 client bundle 裡**被替換成空字串**。
所以有人把 `NEXT_PUBLIC_GUILDHUB_WS` 誤打成 `GUILDHUB_WS` 時，
拿到的是 `''` 而不是 `undefined`。

用 `=== undefined` 判缺席會讓那個空字串**一路通過**，然後在
`new URL('')` 或 `new WebSocket('')` 的時候才炸，而那時已經離錯誤很遠了。

### D4. lint 擋兩件事，不是一件

`eslint.config.mjs` 已經有一組「元件裡不准出現 `fetch`」的規則。這一條用同樣的形狀，
但要擋**兩件**：

1. **設定模組以外讀 `process.env`** —— `no-restricted-properties`
2. **任何地方用計算屬性讀 `process.env`** —— `no-restricted-syntax`，
   比對 `MemberExpression[computed=true]` 且物件是 `process.env`

第 2 條是這份設計裡**唯一擋得住「靜默 `undefined`」的機制**。少了它，
只要有人在設定模組裡寫一個變數名稱查表（那是很自然的重構），
整個設定在瀏覽器裡就全部變成 `undefined`，而且測試全綠 ——
因為測試跑在 Node 裡，那裡的 `process.env` 是真的。

**這一點要寫進註解**：這個 bug **在單元測試裡永遠重現不了**。

**例外的 glob 要精確。** 既有的 no-fetch 規則踩過一個洞：放寬的 glob
會讓 `src/components/src/api/*` 也被當成例外。所以例外用完整路徑。

### D5. 協定在讀設定時就驗

理由是量到的事實 #3：協定寫錯的錯誤如果留到連線時才出現，
它跟「後端沒開」「路徑打錯」「握手被拒」長得一模一樣（都是 `1006` 加空 reason）。
**在設定層驗，錯誤訊息才能說出真正的原因。**

### D6. 環境代號缺席時用建置模式當守門員

`NODE_ENV` 講的是**建置模式**，不是部署目標 —— preview 站的 `NODE_ENV`
也是 `production`，但它該連的後端跟正式站不同。所以環境代號是一個獨立的變數。

但**「缺席就當本機」是一個洞**（兩位審查者各自獨立指出）：部署時漏設環境代號，
程式根本不會進入 production 分支，而是**合法地**取 `localhost` 預設值 ——
那正是這份規格宣稱要防的事。

所以缺席時看建置模式：`NODE_ENV === 'production'` 而環境代號缺席 → 拋錯；
不是 production 才可以視為本機。這樣 `next dev` 零設定照樣跑得起來，
而 `next build` 出來的東西沒有明確的環境代號就起不來。

**未列舉的代號一律拋錯**，不是退回本機 —— 打錯字的正式站會安靜地連到 localhost。

## Risks / Trade-offs

- **`NEXT_PUBLIC_*` 會進 bundle** → 已在 D1 寫明。緩解是規格明文「只放位址」，
  加上 review。**沒有機器擋得住有人把密鑰放進去。**
- **lint 擋得住 `process.env`，擋不住有人把位址寫死成字面值** → 這條沒有機器解。
  `FE-O02`／`FE-R01` 的 review 要看。
- **計算屬性那條 lint 規則是靠語法比對，不是型別分析** → `globalThis.process.env[x]`
  之類的寫法繞得過去。**這一點不要高估**：它擋的是自然重構會產生的那一種寫法，
  不是刻意繞過。
- **`.env.example` 會跟實際需要的變數漂開** → 沒有機器對。緩解是錯誤訊息帶變數名稱。
- **這一刀驗不到「位址真的連得上」，也驗不到 WebSocket 的 cookie 有沒有送到** →
  刻意的。前者第一次真的連上是 `FE-R01`；後者要在瀏覽器裡實測，同樣是 `FE-R01`。

## Open Questions

- preview 環境要連哪一份後端（真後端還是每個 preview 一份可拋棄的）？
  那是 `FE-O14`（W5）的部署決定。這一刀只要求「preview 沒有預設值，缺了就失敗」，
  不影響本 change 的形狀。
