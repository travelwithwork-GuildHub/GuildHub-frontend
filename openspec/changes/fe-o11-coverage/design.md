# 設計：驗證方式寫在 Scenario 裡，不另外開一份清單

## 為什麼豁免要寫在 Scenario 底下

外部審查（gpt-5.6-sol）與 Gemini 3.1 Pro 在這一點上分歧。Gemini 主張放一份
獨立的治理檔案，理由是「不要讓實作者自己發免死金牌」。採用 codex 的做法，
因為那個顧慮**已經被現有的分支閘門解掉了**：

```
feat/<id>--<slice>   不得回改任何已批准的 proposal / design / specs
```

所以豁免只能在 **spec PR 階段**加，寫的時候就會被人看到 ——
實作者沒辦法寫到一半才給自己補一張免死金牌。

而放在 Scenario 底下多了三個好處：

- 規格與豁免不會分居兩份檔案（**同一件事寫在兩個地方一定會漂**）
- Scenario 改名或刪掉時，豁免跟著走，不會留下孤兒
- archive 之後註記跟著 Scenario 一起進 `openspec/specs/`

## 種類是封閉列舉

```
vitest              有通過的 vitest 測試（預設，不用寫）
playwright          有通過的 Playwright 測試
command-negative    一個在 CI 裡會跑的指令，而且有負向 fixture
manual-browser      人在瀏覽器裡看，附不可變的證據連結
ci-job              CI 的 job 本身就是這條 Scenario 的執行
```

**不認得的種類直接紅。** 打錯字的豁免等於沒有豁免，而它看起來跟真的一模一樣。

## 四條為什麼不能用單元測試

| Scenario | 為什麼 |
|---|---|
| `FE-W01-S01` | jsdom 沒有 WebGL2，canvas 的**實際像素尺寸**永遠是 0。測得到的是「有沒有掛上 canvas 元素」，那不是這條在講的事 |
| `FE-W01-S02` | 有效 DPR 是 renderer 實際套用的值，jsdom 裡 `WebGLRenderer` 不會真的設定它 |
| `FE-W01-S03` | 陰影是 GPU 算出來的畫面內容。**能被程式檢查的只有「有沒有設定陰影參數」，而參數設對了畫面上仍然可能沒有陰影** |
| `FE-X01-S10` | 「四個指令都以 0 結束」在測試裡遞迴跑 `npm run build` 是沒有意義的。**CI 的 job 本身就是這條的執行** |

前三條走 `manual-browser`，最後一條走 `ci-job`。
`FE-O11` 之後導入 Playwright 時，前三條要改成 `playwright` 並拿掉人工證據 ——
**閘門會逼這件事發生**：測試補上之後豁免就過期，同時有通過的測試與豁免會紅。

## 四條可以測的怎麼測

| Scenario | 測法 |
|---|---|
| `FE-W03-S13` | 用 Testing Library 渲染，改角色位置多次，斷言相機讀到的 target 是新位置、而元件的渲染次數不增加 |
| `FE-W04-S08` | 同上，位置由 rigid body 持有 |
| `FE-W05-S08` | 同上，target 在 ref 上改多次 |
| `FE-X01-S11` | 沿用 `tests/type-fixtures/` 既有的模式：fixture 有自己的 tsconfig、被主 tsconfig 排除，跑 `tsc -p` 斷言非零且訊息指出檔案 |

**渲染次數怎麼數**：元件裡放一個 `useRef` 計數器，每次 render 加一，
用 `data-render-count` 曝露出來。不用 `React.Profiler` —— 它量的是 commit，
而這三條要證明的是「根本沒有觸發 render」。

## 驗證方式

- V1 `bash .github/scripts/check-scenario-coverage.sh` rc=0
- V2 把新加的四條測試各自弄啞一次（把斷言改成恆真），該條 Scenario 要從
  「有通過的測試」變成「缺」—— 證明它們真的指到被測的事
- V3 把任一條 `VERIFY-BY` 的種類改成不認得的字，閘門要紅
- V4 `npm run lint && npm run typecheck && npm test && npm run build` 全綠
