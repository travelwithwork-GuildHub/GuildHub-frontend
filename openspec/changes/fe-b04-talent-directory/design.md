# `FE-B04` 設計：難逆轉的決定與代價

## D1｜詳情蓋在列表上，列表不卸載

「返回保留頁碼與捲動位置」最便宜的做法是**根本不動列表**：`ListPanel` 多一個 `overlay`
插槽，有東西時蓋在列表區上方（同一個 `section` 內、絕對定位），列表的那一段標成 `inert`
（不可聚焦、不可點）。`useListPage` 的狀態與 `<ul>` 的 `scrollTop` 都留在原地。

被否決的：
- **卸載列表、返回時重掛** —— 頁碼回 0（狀態機重開）、捲動歸零；要保留就得把狀態提到外面，
  等於重做 `FE-B01`。
- **`display: none`** —— 瀏覽器對 `display: none` 的元素**不保證**保留 `scrollTop`。
- **第二個面板並排** —— 26rem 的面板在窄螢幕已經佔滿；兩個面板誰持有焦點、誰先關是新問題。

**代價**：詳情的高度受限於面板；`bio` 長的話詳情自己捲。

## D2｜詳情的載入 hook 照 `FE-B01` 的 identity 紀律

```ts
useProfileDetail(id: string, preview: ProfileOut | undefined)
  → { phase: 'loading' | 'ready' | 'error', profile: ProfileOut | undefined, error: unknown, retry }
```

identity 是 `id`。回應只在捕捉的 `id` 仍等於目前的 `id` 時提交（`S09`）；
`id` 改變時中止前一個請求；`signal.aborted` 的 rejection 不進狀態。
**不重用 `paging.ts`**：那是翻頁的狀態機，硬套會多出一堆用不到的欄位。

`phase: 'loading'` 時 `profile` 是 `preview`（列表那一筆）；`'ready'` 時是回應；
`'error'` 時是 `preview`（讓失敗狀態旁邊還看得到是誰）。**畫面上的載入中／失敗標記看 `phase`，
不看 `profile` 有沒有值** —— 這是「預覽不得冒充成功」的實作形狀。

## D3｜失敗狀態直接用 `FE-X04` 的 `EmptyState`

詳情載入失敗 → `<EmptyState kind="failure" error={toUiError(cause)} retry={retry} />`。
權限阻擋（401）走同一條，畫成權限阻擋。**不另寫一句「載入失敗」** —— 那是第二份語彙。

## D4｜卡片是 `<button>`

可聚焦、Enter／Space 原生就會觸發 `click`、螢幕閱讀器認得。**不是** `div role="button"` 加
自己處理 keydown —— 那是重造一個瀏覽器已經給的東西，而且一定會漏掉 Space。

代價：`<button>` 的預設樣式要靠 `FE-X13` 的 `SECONDARY`／自己的 class 蓋掉；`display: block`
與文字對齊要自己設。

## D5｜`updated_at` 的標籤

規格只要求「以機器可讀的時間呈現」（`<time dateTime=…>`），標籤的字句不寫進 Requirement
（非契約文案）。設計上它叫「名片更新於」—— **不叫「最後上線」「最近活躍」**，
那兩個字會讓人以為那是 presence。

## 待答問題

1. **技能太多時卡片怎麼截。** `skills` 沒有上限（`LIMITS.skillCount.max === UNBOUNDED`）。
   先全部顯示、讓卡片變高；`FE-X05` 訂上限之後再說。
2. **詳情要不要有「上一個／下一個」。** 連續看人的任務流會需要；等真的有人用再說。

## 這一份怎麼驗

- `S01`–`S03`、`S10`：直接掛載元件。
- `S04`–`S09`、`S11`、`S12`：`BoardPanel` ＋ `contract-server`（真的 operation、真的 HTTP，`replyFor` 分端點）。
- `S13`、`S14`：`InteractionProvider` ＋ `ListPanelProvider` ＋ 真的 `LocalPlayer`（`list-panel-input-lock.test.tsx` 的形狀）。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：卡片改成 `div` → `S05` 紅；詳情用列表那一筆不打 id → `S06`／`S04` 紅；
  identity 檢查拿掉 → `S09` 紅；返回時卸載列表 → `S11`／`S12` 紅；`null` 畫成 0 → `S02`／`S10` 紅。
