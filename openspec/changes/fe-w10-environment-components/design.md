# 設計

四輪與 `codex gpt-5.6-sol`、`Antigravity CLI 的 Gemini 3.1 Pro` 的討論之後，
兩邊都明確寫了「我同意這份草稿可以合併」。以下記的是**取捨與被推翻的東西**，
不是結論的複述 —— 結論在 `specs/`。

## D1：元件分三類，不是統一成一種抽象

十四種元件塞進同一個抽象，或十四個各寫一份，兩邊都不對。**分歧點是「呼叫端要表達什麼」**：

| 類別 | 形狀 | 為什麼 |
|---|---|---|
| 結構 `Floor` `Wall` `Carpet` `Platform` | 獨立元件，尺寸是 props | 尺寸**必須**由呼叫端決定 —— `FE-W11` 的走廊跟大廳不會一樣寬 |
| 家具 `Desk` `Chair` `Shelf` `Plant` `Lamp` | definition table ＋ 一個泛用 renderer | 造型固定、沒有產品語意差異。十四份幾乎一樣的 `.tsx` 只會讓風格在寫的過程中散掉 |
| 語意 `Sign` `GuildBanner` `ProjectBoard` `TalentBoard` `Door` | 獨立元件，各自 typed props | 產品差異該由 TypeScript 表達。全部降級成 `<SceneProp kind="projectBoard">` 是**把型別能表達的東西換成執行期的字串約定** |

**被推翻的理由**：一開始把「語意元件要獨立」的理由寫成「`FE-W12` 要注入 ref 與 sensor」。
codex 指出那不準 —— 泛用 renderer 一樣可以包裝 ref，而且 **`FE-W10` 不該預先承諾
「`FE-W12` 的 sensor 一定封裝在視覺元件裡」**（互動層也可能由 layout 組合）。
真正的理由是上表右欄那一句。

**`400 行/PR` 沒有參與這個決定。** 它是 PR 的邊界問題，不該反過來決定架構。

## D2：碰撞尺寸歸元件，註冊歸 `FE-W11`

三個選項：元件純視覺（碰撞歸 W11）、元件導出描述、元件自己註冊 collider。

**元件純視覺一定會有兩份真相** —— 同一張桌子的尺寸在視覺與碰撞各寫一次，
而它們會漂。症狀是「看起來走得過去卻卡住」，或反過來。
**元件自己註冊**則把 React 的掛載週期、Rapier world 的生命週期、清理責任綁在一起，
而且那個元件就不能單獨用在展示或測試裡。

所以是中間那個。**但導出的東西不是 `StaticBox`。**
`physics/world.ts` 的 `StaticBox` 有 `x`／`z`，那是**世界座標** ——
`deskFootprint(): StaticBox` 不是少了 position 參數，就是偷偷假設桌子在原點。
導出的是局部描述：

```ts
interface BoxFootprint {
  offsetX: number; offsetZ: number
  halfWidth: number; halfDepth: number; halfHeight: number
}
```

`FE-W11` 套上 instance 的 position／rotation 才產生 `StaticBox`。
**這不是多餘的間接層，是局部模型與世界實例之間本來就存在的座標轉換。**

**旋轉只允許 90° 倍數。** `StaticBox` 沒有 rotation 欄位，而 `FE-W11` 在
`docs/WBS.md` 上逐字是「**簡化** Collider」。任意 yaw 有兩條路，兩條都比較差：
擴充成可旋轉的 collider（要動既有 physics 介面），或退化成 world-axis AABB
（碰撞盒比視覺大 —— 那正是「撞到空氣」）。90°／270° 時交換 `halfWidth` 與 `halfDepth` 就好。
**要斜放家具的那天再擴充介面**，不要現在先付這筆錢。

## D3：把視覺與碰撞釘在一起的那條判準

第一版是「渲染出來的 `Box3` 等於宣告的碰撞盒」。**那是錯的契約**：
盆栽的葉片本來就該伸出花盆、燈罩本來就該懸出底座、椅子為了可走性本來就該簡化。
硬要相等的話，人會為了讓測試變綠**把碰撞盒膨脹到包住葉片** —— 做出一堵隱形牆。

第二版是單向不等式「碰撞盒 ⊆ 視覺 `Box3`」。它便宜，但**只擋一半**：

> 桌子寬 1.6、碰撞盒誤寫成 0.2，**仍然通過包含關係**。

最後採的是**部件上的一個布林**，取代所有 policy 列舉：

```ts
interface PartDefinition {
  geometry: GeometrySpec; material: MaterialSpec
  position: [number, number, number]; rotationY?: number
  blocks?: boolean          // 這個部件擋不擋路。省略＝不擋
}
```

判準因此是**一條、雙向、對所有元件一致**：碰撞盒等於所有 `blocks` 部件
**套用各自 transform 之後**的局部 AABB 聯集；沒有這種部件時碰撞盒不存在。
過大、過小、位置偏移三種漂移都會紅，而葉片與燈罩合法地留在外面。
`collisionPolicy: 'exact' | 'contain-base' | 'custom'` 三態因此不需要。

**兩個要寫進規格、否則之後會被當成 bug 的限制：**

1. **單盒模型會填滿 `blocks` 部件之間的空隙。** 四隻桌腳的聯集 AABB 就是整張桌子的
   佔地 —— 玩家不能從桌子底下穿過去。**這是單盒碰撞的限制，不是測試誤差。**
2. **測試不得呼叫實作內部的同一個 helper 去產生 expected 值。** 那是同源的恆真測試：
   helper 算錯的時候兩邊一起錯，而測試是綠的。

**這條擋不住的**：有人把葉片誤標成 `blocks: true`。那時碰撞盒**真的**就長那樣 ——
是設計錯誤不是漂移，該由審查擋，不該假裝這條 invariant 判斷得出來。

### D3 補記：實作之後發現這條守的不是原本以為的那件事

實作第二刀時做的第一個突變是「**把桌面從 1.6 加寬到 2.4，碰撞盒不動**」——
上面那段理由說它應該要紅。**它沒有紅。**

因為碰撞盒是從同一份 definition **推導**出來的，加寬桌面會同時加寬
「量到的 `Box3`」與「算出來的碰撞盒」。**那種漂移在這個資料模型裡表達不出來** ——
它由設計消除，而那比測試好。

所以「寬 1.6 誤寫成 0.2」那個例子描述的是**目前 API 排除掉的失敗模式**，
不是這條判準可以製造的突變。兩個外部審查者各自都同意這一點，
而且都要求把 Requirement 的理由改掉 —— 「不能把綠說成測試成功」（codex 的原話）。

這條判準真正守得住的是**推導本身**。實測的證據：
把 `RoundedBox` 的半寬忘記除以 2、把部件的位置忽略掉、把碰撞盒的半寬寫死 —— 三種都紅。
而**把圓柱的半高寫成全高一開始是綠的**，因為當時的擋路部件全是方塊，
另外三個 primitive 的分支一條都沒被走過。補上之後三個分支各自的突變都紅了。

### D3 補記二：這個設計仍然少防到的

外部審查列的（兩邊獨立提到的先寫）：

- **實例層級的縮放**：`<group scale={2}>` 包住元件的話，視覺變兩倍而碰撞盒不變。
  **這條的判準不能下在這個 change** —— 在元件自己的原始碼裡掃 `scale`
  擋不住寫在別的檔案裡的祖先 group，那是一條注定漏水的規則。
  真正驗得到的地方是 `FE-W11` 註冊碰撞的那一刻（檢查實例的 world scale）
- **呼叫端拿錯 kind**：畫面 render `desk`、碰撞查 `chair`
- **凹形或分散的部件**：單盒 AABB 會把中間填滿（ㄇ 字型的拱門走不過去）
- **註冊時又改了數值**：推導對了，送進 physics 的時候位移或縮放
- **`geometryFor` 與解析式一致地犯錯**：兩邊被同一個錯誤規格影響時，
  以渲染結果當 oracle 也會一起同意錯的答案

**量過的前提**：`Box3.setFromObject` 在 `@react-three/test-renderer` 上是精確的。
一個 `RoundedBox(2, 1, 0.8)` 掛在 `position=[1,0,0]` 的 group 底下、
mesh 自己在 `[0,0.5,0]`，量到 `size = [2, 1, 0.8000000417]`、`center = [1, 0.5, 1.49e-8]`。
**誤差量級 `4e-8`（float32 的頂點座標），所以判準要用容差，不能用相等。**

## D4：World Shell —— 地面與牆不是「配置」

`DebugShadowScene` 一刪，`WorldCanvas` 裡就沒有地板。而 `/world` 已經對外公開，
世界會變成一片虛無 —— 比現在還糟。四個選項裡：

- **再做一個「最小示範佈置」**：那又是一個鷹架，退場條件一樣模糊。重蹈覆轍。
- **把 `FE-W11` 的佈置提前**：桌子放哪裡是 W11 的範圍，提前會破壞 change 邊界。
- **不刪，往後押**：違反既有規格明文寫的退場責任。
- **永久的 World Shell** ← 採這個。

```
WorldCanvas
├─ 相機／燈光／物理
├─ WorldShell        ← FE-W10：地面 ＋ 與物理邊界對齊的可見牆
└─ GuildHallLayout   ← FE-W11：家具、區域、走廊、spawn
```

**牆為什麼在這裡**：物理世界現在有 ±10 的**隱形**邊界（`PHYSICS.halfExtent`）。
玩家走到邊緣被看不見的東西擋住 —— 那是今天就存在的缺陷。
把它畫出來的產品理由是**消除那個缺陷**，不是為了讓陰影可驗。

⚠️ **視覺牆不建立任何 collider。** 邊界 collider 已經由 `createPhysicsWorld` 的
`addBounds` 建好了，那裡是單一權威來源。再疊一組是第二份真相。

**不需要為了陰影加任何東西。** `ChibiPlayer` 已經有三個 `castShadow` 的 mesh，
而 `WorldCanvas` 是無條件渲染 `<LocalPlayer>` 的 —— **caster 是玩家，而且是永久的**。
（討論中一度提議加一面「備援 caster 牆」，量到這件事之後撤回了。）

## D5：3D 裡沒有字，而且這個 change 不解決它

`package.json` 的 dependencies 只有 `@react-three/fiber`、`@react-three/rapier`、
`next`、`react`、`react-dom`、`three`、`zod`。**沒有 drei（所以沒有 `<Text>`）、
沒有 troika-three-text。** `src/world/` 底下 grep 不到任何文字渲染。

而 `Sign`／`GuildBanner`／`ProjectBoard`／`TalentBoard` 的名字本身就是「上面有字的東西」。

在 3D 裡畫字有兩條路，**兩條都直接違反這個 change 自己訂的資源限制**：
加 troika／drei 會建立 GPU texture 與 material；`CanvasTexture` 一樣，而且中文字型是另一坑。

所以 `FE-W10` 交**沒有字**的板子，名稱與在線數由既有的 React DOM 呈現
（`CONTEXT.md` 已經是這樣定的：「提示是 DOM 元素，不是 3D text」）。

**但這個 change 不宣告「文字永遠只能在 DOM」。** 那是 `FE-W12` 的待答問題 ——
它才是要顯示名稱與在線數的那一項。要在 3D 畫字的話**必須另外修改資源所有權契約**，
不得偷渡進來。

**沒有字的板子不能只是一塊換了顏色的牆。** 那樣的話玩家在 3D 裡分不出哪塊是什麼，
而 `CONTEXT.md`〈3D 憑什麼存在〉那一節說得很直接：分不出來的話 3D 就是一條很貴的導覽列。
所以五種語意元件靠**幾何語彙**區分，顏色只能輔助。

## D6：`world-canvas` 那條 Requirement 怎麼改

它現在逐字是「場景 SHALL 包含一個接收陰影的平面與一個投射陰影的物件，
**其唯一目的是讓上述設定可被驗證**。這兩個物件是臨時的，由 `FE-W10` 移除。」

**`FE-W01-S03` 的 ID 與 WHEN/THEN 都不動** —— 對使用者可見的行為沒有改變
（世界渲染完成後，有實體在地面上留下陰影）。把 THEN 改成「玩家留下陰影」
會把當下的實作鎖進一個穩定鍵裡：換 avatar renderer、加旁觀模式都會變成規格變更。
同理，Requirement 本體也**不寫「玩家角色滿足這一條」**。

**但 `VERIFY-BY` 的證據要重新取得。** 舊的人工瀏覽器紀錄驗的是那個 debug 方塊的陰影，
方塊移除之後**那份證據不能證明新的實作仍然通過**。失效的原因是受測的實作被換掉了，
不是 Scenario 被改了。

## D7：`FE-W07` 的掃描器擋不到這些元件，所以要反向用它

`FE-W07` 有一條 CI 閘門：`src/world/` 底下會建立 GPU 資源的模組必須登記進洩漏偵測清單。
判定是正則（`<xxxGeometry>`、`new XxxMaterial()`、loader hook、`<primitive>`）。

只用 `geometryFor()`／`materialFor()` 的元件**一個都不會命中** —— 這是對的
（資源是 `FE-W09` 的 cache 建的，不是它們建的），但同時代表
**「元件不得自建 GPU 資源」今天沒有任何東西在擋**。有人在 `Desk.tsx` 寫
`<boxGeometry args={[1,1,1]}/>`，CI 只會要求他登記進洩漏清單，
**不會告訴他「這裡不准這樣寫」**。

所以把同一個掃描器**反向**用：`src/world/environment/` 底下每個模組
`createsGpuResources === false`。掃描範圍要寫成「該目錄與其所有子目錄」，
**新增的巢狀檔案要自動納入** —— 寫成一份具名清單的話，
規避方式就是「開一個新子目錄」。

這**不是預防性規則**，是 `FE-W09`／`FE-W10` 已經選定的資源所有權邊界的另一半：
W09 的 cache 建立並擁有資源，W10 的元件只消費。繞過 cache 的元件會同時繞過共用與釋放契約。

## 待答問題

- **3D 文字**（`FE-W12`）：名稱與在線數在 3D 裡呈現，還是只在 DOM？
  要在 3D 呈現的話，資源所有權契約要怎麼改
- **語意元件的 props**：這個 change 只宣告**今天就有作用**的 props。
  `title`／`onlineCount` 這類今天沒有輸出的欄位不寫進來 ——
  型別上存在但被忽略的 props 是「有 API 的外觀」。`FE-W12` 加上去的時候一起加語意
- **`FE-W11` 怎麼區分世界邊界與內牆**：`wallDefinition` 標了 `blocks: true`
  （牆本來就擋人，那是部件的語意），但 `WorldShell` 那四面的碰撞由
  `createPhysicsWorld` 的 `addBounds` 負責。`FE-W11` 蓋內牆時如果做一條
  「看到 `blocks` 就註冊」的管道，**那四面會被重複註冊**。
  **今天不加欄位去防它** —— 兩個外部審查者都同意：註冊管道還不存在，
  而一個還不存在的管道不會被誤用；現在加 `collision: {kind}` 是替一個
  還沒寫的規格先做決定，而且它今天沒有任何讀取者
  （那正是第一輪一起否決掉的「沒有呼叫端的抽象」）。
  `FE-W11` 要加的測試：同一面邊界不得同時出現在 `addBounds` 與推導出來的註冊結果裡
- **懸空的擋路物**：碰撞是貼地的 2.5D 模型（`FE-W10-S13` 把它釘住）。
  掛在牆上的壁櫥要能擋人的話，`BoxFootprint` 與 `StaticBox` 兩邊都要有垂直資訊
  —— 那是 `FE-W04` 的契約，不是這個 change 動得了的。
  而且在動型別之前要先回答**遊戲規則**：角色是零重力的平面移動，
  「懸空的家具擋不擋人」首先是產品問題
- **實例的縮放**：見 D3 補記二。判準在 `FE-W11` 的註冊邊界
- **`Floor` 的碰撞**：地面不是水平移動的障礙物，不用 `BoxFootprint` 表達。
  角色今天是零重力的平面移動（`createPhysicsWorld` 的重力是 `0`），
  所以地面根本沒有 collider。**要不要有** ground collider 是 `FE-W11` 的問題
