# `FE-X06` 設計：難逆轉的決定與代價

## D1｜鎖：token 式的持有者集合，`inputLockRef.current` 是推導值

```ts
interface InteractionValue {
  /** 取得鎖；回傳釋放函式。每次呼叫是獨立的一次，釋放冪等。`reason` 只給除錯看。 */
  holdInputLock: (reason: string) => () => void
  /** 推導值：有任何持有者就 true。LocalPlayer／SpatialInteraction 每幀讀，不重繪。 */
  inputLockRef: RefObject<boolean>
}
```

`ListPanelProvider` 從「直接寫 true/false」改成「開面板時 hold、關面板時 release」。
持有者集合放在 provider 的 ref 裡（不是 state：每幀讀、不重繪）。
provider 卸載時清空。

**代價**：呼叫端要記得釋放。React 的形狀是 `useEffect(() => holdInputLock('x'), [])`
—— 回傳值就是 cleanup，StrictMode 的 mount → cleanup → remount 剛好各自一個 token。

## D2｜世界命令 = 移動 ＋ E；鎖著時不 `preventDefault`

`LocalPlayer` 今天已經這樣。`SpatialInteraction` 的 E 監聽補一行「鎖著就 return」。
之後任何世界熱鍵都要走同一個判斷 —— 規格說的「世界命令」就是這幾個監聽。

## D3｜文字輸入焦點的持有者：一個掛在世界層的元件

`<EditableFocusLock />`：`focusin`／`focusout` 掛在 `document`；每次事件之後**在下一個 microtask**
依 `document.activeElement` 重算「是不是能接受文字的控制」——
是就確保持有一個 token，不是就釋放。`focusout` 當下 `activeElement` 是 `body`（焦點還在轉移），
所以不能在那一刻決定。

「能接受文字的控制」：`textarea`、`contenteditable`（元素或祖先）、以及 `input` 的
`text`／`search`／`url`／`tel`／`email`／`password`／`number`（沒有 `type` 也算 text）。
`checkbox`／`radio`／`button`／`submit`／`range` 不算。

## D4｜Escape 的層級：一個註冊表，最上層先

`ListPanel` 與 `AvatarPicker` 各自在 `window` 掛 Escape 監聽，會在同一次按鍵裡各關各的。
改成一個 `useEscapeLayer(onEscape)`：掛載時把自己 push 進一個層堆疊，Escape 只呼叫**最上層**的
`onEscape`，並把事件標成已處理。詳情（overlay）是 `ListPanel` 之上的一層 —— 它掛載時 push，
卸載時 pop；`ListPanel` 自己是底下那一層。

**代價**：層的順序 = 掛載順序。同時開兩個不相干的層（picker ＋面板）時，後開的在上面 ——
這剛好是 `S17` 要的：面板開了、picker 因為失焦而關，堆疊裡只剩面板。

## D5｜focus trap 只在持有鎖的面板；用 `Tab` 的 keydown 手動循環

不引入第三方 focus-trap 套件（5 點）。`ListPanel` 在自己的 `section` 上處理 `keydown`：
Tab／Shift+Tab 到邊界時把焦點繞回去。可聚焦元素的清單每次按鍵時現算（列表會翻頁、詳情會蓋上）。
overlay 開著時 `inert` 已經把列表區拿出 Tab 順序，所以循環的範圍自然變成詳情。

**代價**：jsdom 不實作 Tab 的焦點移動 —— trap 只能在 Playwright 驗（`S11`）。

## D6｜世界焦點錨

`WorldCanvas` 的容器（`data-testid="world-canvas-container"`）加 `tabIndex={-1}` 與
`data-focus-anchor="world"`。面板關閉時 `ListPanelProvider.closePanel` 把焦點放到它上面。
判準用 `[data-focus-anchor="world"]` 找，**不用** `canvas`。

**代價**：`tabIndex=-1` 的容器被點到時會取得焦點 —— 那正好是「點世界就回世界」的直覺。

## D7｜`AvatarPicker`

- `useEscapeLayer(close)`（在堆疊裡；面板開著時它在下面 —— 但 `S17` 說它會先因失焦而關）
- `onBlur` 在容器上：`relatedTarget` 不在容器內就 `close()`（用 `focusout` 冒泡，不是每個按鈕各掛一個）
- `close()` 之後 `focus()` 回「更換角色」按鈕
- **不 hold 鎖**

## 待答問題

1. **「更換角色」的 popover 開著時按 E 開面板 → 草稿被丟**。這是 `S17` 定義的行為。
   如果之後使用者反映「我選到一半按 E 就沒了」，改的是 `AvatarPicker` 要不要在失焦時保留草稿，
   不是鎖。
2. **世界焦點錨要不要有可見的 focus ring**。`tabIndex=-1` 的元素被 `focus()` 時瀏覽器通常不畫 ring
   （不是鍵盤觸發的）。`FE-X07` 再看。

## 這一份怎麼驗

- `S03`、`S04`（鎖的合成）：直接呼叫 `holdInputLock` ＋ 真的 `LocalPlayer`（three renderer）。
- `S05`、`S06`（E 與 preventDefault）：`SpatialInteraction` ＋ 一個 `Interactable`，`inputLockRef` 鎖著。
- `S07`–`S10`（輸入框）：jsdom 的 `<input>.focus()` ＋ `EditableFocusLock` ＋ `LocalPlayer`。
- `S01`、`S02`、`S12`、`S14`–`S17`：DOM 接線（`BoardPanel`、`AvatarPicker`）。
- `S11`（Tab 循環）、`S13`（世界焦點錨）：Playwright，真的 Tab 與 Escape。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：鎖改回單一 boolean → `S03`／`S10` 紅；E 不看鎖 → `S05`／`S07` 紅；
  Escape 兩層各關各的 → `S01` 紅；`focusout` 當下就釋放 → `S08` 紅；
  picker 拿掉 Tab 走離即關 → `S16`／`S17` 紅。
