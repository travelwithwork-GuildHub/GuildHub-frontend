# `FE-W19 角色外觀吃得到 av`

## Why

**`FE-A05 Avatar`（角色選擇，8 點）今天做不了，而卡住它的不是它自己。**

WBS 上的理由逐字：

> `FE-A05` 卡住的不是 `avatar_id` 的語意裁決，是「**選擇根本沒有可觀察結果**」。
> 在那之前做出來的選擇器，使用者選完之後自己的外觀不變、別人看到的他也不變，
> 那是製造錯誤期待不是 MVP。

Gemini 在 `FE-A06` 審查時的說法更直接：

> 前端給使用者選了顏色，進去卻是一坨預設的灰塊⋯⋯這不叫 MVP，這叫欺騙。

### 協定早就送得到，只是沒有人讀

`av` 在 WebSocket snapshot 裡（`{"id","name","av","x","y","f","st"}`），
也已經進了前端的 `RemoteIdentity`。**沒有任何地方讀它來渲染。**

`ChibiPlayer` 的顏色是四個模組層級常數：

```tsx
const SKIN = worldColor('skin')
const BODY = worldColor('avatarBody')
const LIMB = worldColor('avatarLimb')
const INK  = worldColor('ink')
```

元件**完全沒有 avatar 參數**。所以今天不管 `av` 是多少，畫出來都是同一隻。

### 後端不驗證 `av`，而錯值不會報錯

後端的定義（原始碼，不是文件）：

```python
# app/realtime/presence.py
def join(self, user_id: str, name: str, scene: str, avatar_id: int = 0) -> Player:
# app/main.py:101
return user_id, session.get("name") or "訪客", session.get("avatar_id") or 0
```

`avatar_id: int`，**沒有上界、沒有下界、沒有任何驗證**。

而拿不到對應顏色時 three.js **不會報錯**。實測（`three` 套件本體，node）：

```
color: undefined      → #ffffff  （只印一行 THREE.Material: parameter 'color' has value of undefined.）
color: null           → #ffffff
new Color(undefined)  → #ffffff
```

**不崩潰、不全黑、不丟例外 —— 角色會靜默變成一隻白色的方塊人。**
開發者只看 console 不會發現，因為 console 沒有紅字。

## What Changes

- 新增能力 `avatar-appearance`：**一份 `av` → 外觀的映射**，本地與遠端共用同一份。
- `av` 支援兩種外觀（`0` 與 `1`）。
- 值域外的 `av`（負數、超出上界、非整數、缺值）**一律回到 `av=0`**。
- 兩款 avatar 之間的差異**必須落在大面積部位**，不得只靠眼睛之類的細節。

### 明確不做

- **不做角色選擇 UI** —— 那是 `FE-A05`。這一項只讓「選擇」有可觀察的結果。
- **不做 `FE-W08 ProceduralAvatar`**（Head / Hair / Body / Arms / Legs 模組化，10 點）。
  這一項是**最小可見閉環**，3 點。
- **不改 `CHIBI_PARTS` 那四個名字**，也不改 mesh 結構 ——
  逐幀動畫靠 `getObjectByName` 查它們，改名字會讓動畫靜默停止。
- **不宣稱「其他人會看到你的選擇」** —— 那要等 `FE-A05` 讓人改得動 `avatar_id`。
  這一項只保證：**如果**遠端玩家的 `av` 是 1，畫面上就看得出來。

## Impact

- 新增 capability：`avatar-appearance`
- 受影響的既有能力：`world-player`（本地角色）、`remote-players`（遠端角色）——
  兩者都改成把 `av` 傳給角色元件，**行為契約不變**。
- 解除 `FE-A05` 的前置阻塞。
