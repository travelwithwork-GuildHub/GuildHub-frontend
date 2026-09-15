## Why

`docs/WBS.md` 的 `FE-W16`：「Project Room：spawn / collision / desk layout」（W4）。

`FE-V01` 封存時把房間留成一個**空盒子**：`src/world/layout/projectRoomLayout.ts` 只有四面邊界牆、出生點在原點，
註解明寫「桌子、座位是 `FE-W16` 的事 —— 它動的是這個檔案，不動場景註冊表」。`world-scenes` 主規格也寫了
「Project Room 在 `FE-W16` 之前的配置 SHALL 只有四面邊界牆」。`FE-N08` 接上門禁之後，使用者走進去看到的就是這個空盒子。

**不做會怎樣**：房間沒有空間語意 —— 進去之後不知道出口在哪、沒有可以站的位置、沒有「誰在桌邊」可看。
`FE-J13` 座位（一人一格、`seat_index` 0–7）沒有桌子可以掛；`FE-V07` Office Presence 的「工作桌」也沒有。
而 `CONTEXT.md`〈3D 憑什麼存在〉：如果房間只是一片地板加一顆「回到 Guild Hall」按鈕，那 3D 就是一條很貴的導覽列。

## What Changes

- 新增 capability `project-room-layout`：
  - 出口：外層四面邊界維持完整（`world-layout`〈邊界由配置提供〉不動）；房間內側加一道**南牆**，中央留門洞；
    出生點在門洞內側、面向房間 —— 「從門口進來」是空間記憶，實際離開仍是既有的 DOM「回到 Guild Hall」按鈕
  - 工位：**八個**穩定的工位模板（`seat_index` 0–7，這是後端 `SeatClaim.seat_index` 的索引域），每個是既有家具
    `desk`＋`chair` 加一個「站在桌邊」的位置；排在中央旁觀通道兩側；識別字含索引，`FE-J13` 直接綁，不另寫座標
  - 渲染與碰撞吃同一份 layout（`world-layout` 的既有原則）；桌椅**不註冊互動**、不冒 E 提示（認領是 `FE-J13`）
  - 從門口用固定相機看得到近端工位與通道（構圖判準照 `FE-W11-S11`／`S12` 的寫法）
  - 每個工位有一個投影到螢幕的 DOM 錨點（今天沒有內容；`FE-J13` 放座位狀態）——它同時是真瀏覽器 e2e 的尺：
    「桌子真的畫在那裡」與「撞到桌子會停下」都用它量，不用固定毫秒
- `world-scenes`〈場景是一份封閉的註冊表…〉MODIFIED：拿掉「`FE-W16` 之前只有四面邊界牆」那段，
  房間的配置改由 `project-room-layout` 提供；`FE-V01-S02` 的斷言跟著改（外層邊界仍恰好四面，但不再是全部）；
  `S01`／`S03` 逐字不動

## Non-goals

- 不讀 `seat_count`、不依專案容量增減桌子：`GET /api/rooms` 沒有這個欄位，`GET /api/projects/{id}` 有 ——
  但房間子樹在 `wsScene` 換掉時整棵重掛、物理世界在掛載時建一次（`WorldCanvas` 的 `key`），
  「先拿資料再掛房間」會動到 `FE-V01` 的過場語意。**容量的呈現（哪幾格不開放）歸 `FE-J13`**：它本來就要讀座位。design D3 記了這個取捨。
- 不做 `FE-J13`：座位清單、認領、Occupied、409、一人一格。
- 不做 `FE-N08`：票、密碼。
- 不做 `FE-V07`：名字／狀態／名片在桌邊的呈現。
- 不做 `FE-W17`：分區；不做 `FE-W18`：鋸齒牆與全域掃描（那是 Guild Hall 的）；不做 `FE-W20`：看板。
- 不做「走到門前按 E 離開」、不做「踏進門洞自動回大廳」——返回動作已存在且隨時可按。
- 不改相機、不改世界尺寸（沿用 `PHYSICS.halfExtent` 與同一顆正交相機）。
- 不引入外部模型；家具沿用 `world-environment` 的程序式 definition。
- 不做 `FE-R10`、`FE-J14`。
