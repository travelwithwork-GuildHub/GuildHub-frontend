# `FE-X04` 設計：難逆轉的決定與代價

## D1｜一張表＋一個無狀態的薄元件，放在功能模組不放 `src/design/`

```ts
type EmptyStateKind = 'first-empty' | 'filtered-empty' | 'exhausted' | 'load-failed' | 'permission-blocked'

type EmptyStateProps =
  | { kind: 'first-empty' | 'filtered-empty' | 'exhausted' }
  | { kind: 'failure'; error: UiError; retry: () => void; action?: ReactNode }

/** 從 FE-X03 的種類選失敗的呈現。**整個前端只有這一處在決定。** */
function failureKind(error: UiError): 'load-failed' | 'permission-blocked'
```

呼叫端只能說「失敗」，**不能自己指定是載入失敗還是權限阻擋** —— 那由 `error.kind` 決定，
DOM 上的種類標記才是最後的答案。規格審查指出：讓呼叫端傳 `kind: 'permission-blocked'` 又傳一個
`server-error` 的 `UiError`，元件會自相矛盾，而「整個前端只有一處決定」就不成立了。

**靜態約束（不是 Requirement）**：這個模組 SHALL NOT 從 `src/api/` import 任何東西，也不讀
`status`／`detail`。`FE-X03` 的 lint 規則擋住 `HttpError`／`NetworkError` 的 import；其餘靠 review。

`FE-X13` 說設計層「不要長出帶 API、狀態與變體的元件」—— 所以它不在 `src/design/`。
它是無狀態的：哪一種由 `FE-B01` 的 `edgeState()` 決定，它只裝幀。

**代價**：每個要畫這些狀態的地方都要 import 它。那正是「唯一一份」的意思。

## D2｜前三種的字句在這裡，後兩種的字句在 `FE-X03`

| kind | 那一句話來自 |
|---|---|
| 首次無資料／篩選無結果／翻到底 | **這一列的表** |
| 載入失敗／權限阻擋 | `UiError.message`（`FE-X03`） |

載入失敗與權限阻擋**沒有自己的一句話**，只有版型（種類標記、重試、動作插槽）。
兩份語彙各自唯一，不互相抄。

## D3｜`ListPanel` 的錯誤插槽多傳出原始失敗，翻譯在呼叫端

今天 `error?: (retry) => ReactNode` 拿不到失敗本身，呼叫端翻譯不了。改成物件參數
`error?: (slot: { retry: () => void; cause: unknown }) => ReactNode`（第二個 positional
引數不清楚，之後要加上下文也方便）。

**`ListPanel` 不呼叫 `toUiError`。** 它是通用的狀態容器，塞進 `FE-X03` 的應用語彙會讓
之後每一個消費者都被迫接受同一套翻譯。翻譯在知道自己打哪支 API 的接線層（`BoardPanel`）：

```
ListPanel 的 cause → BoardPanel 呼叫 toUiError(cause) → EmptyState 依 UiError.kind 決定版型
```

動到 `FE-B01` 已封存的實作一處，既有判準只改呼叫形狀。

## D4｜「唯一消費入口」是 lint 規則，而且義務只寫到它擋得住的範圍

`ListPanel` 的 `empty`／`exhausted`／`error` 三個 JSX 屬性裡**直接寫的** JSX 元素只能是
`EmptyState`。字串掃描找不到「語意相同但字面不同的第二份」；lint 從結構擋。
擋不住的：先把節點存進變數再傳（`const node = <p>…</p>`）—— 那要靠 review。
規格審查要求 Requirement 不能宣稱比 lint 擋得住的更多，所以那條寫的是「直接寫的」。
負向判準要走 repo 實際的 lint 設定（`lintText` 帶虛擬路徑），不是直接呼叫規則實作 ——
否則從設定裡拿掉規則，判準照樣綠。

## D5｜載入失敗只有一種版型，不分「無快取」與「有快取」

工作分解表寫的是「載入失敗**且無快取**」。有快取（續頁失敗）時 `FE-B01` 把舊卡片留著、
錯誤節點放在列表下方；無快取時列表是空的、同一個節點在同一個位置。
兩種情況用同一個節點 —— 差別在容器，不在這一列。

## 待答問題

1. **要不要有「載入中」的空狀態？** `ListPanel` 用 `aria-busy` 表達，沒有字。
   首次載入時面板是空的 —— 要不要一個 skeleton，是 `FE-X05`／視覺那邊的事，這裡不決定。
2. **權限阻擋的動作預設要不要是「建立你的身分」？** 等 `FE-A08` 之後看真的入口在哪。

## 這一份怎麼驗

- `S01`–`S03`、`S09`、`S10`：直接掛載元件。
- `S04`–`S06`、`S08`、`S11`：`BoardPanel` ＋ `contract-server`（真的 operation、真的 HTTP）。
- `S12`：lint 規則＋負向測試，走 repo 實際的設定（`tests/no-fetch-rule.test.ts` 的形狀）。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：把 `failureKind` 改成一律載入失敗 → `S04`／`S05` 紅；
  一律權限阻擋 → `S06` 紅；權限阻擋加上重試 → `S09`／`S10` 紅；
  `BoardPanel` 少接一個插槽 → `S11` 紅；lint 規則拿掉 → `S12` 紅。
