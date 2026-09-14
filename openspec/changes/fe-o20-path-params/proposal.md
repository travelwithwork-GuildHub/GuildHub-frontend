# `FE-O20` 路徑參數的型別約束

## Why

`RequestSpec.path` 已經是跟 method 綁在一起的字面值聯集（`api-contract` 的 `FE-A01-S13`～`S15`：打一個不存在的端點 typecheck 就紅）。
但 `params` 是 `Record<string, string>`，**收任何鍵**：把 `profile_id` 打成 `id`，`path.replace('{id}', …)` 找不到樣板，
客戶端會送出字面值 `/api/profiles/{profile_id}` 然後靜靜吃 404 —— 跟那個 `GET /api/profiles/me` 的 bug 是同一個缺陷類別
（`FE-A01` 的兩位審查者各自指到；WBS 那一列寫的是「`path` 已經綁進型別了，`params` 沒有」）。
今天 `operations.ts` 有七個帶路徑參數的操作（`getProfile`、`getProject`、`formTeam`、`closeProject`、`enterProject`、`listSeats`、`claimSeat`），
每一個都是靠人眼對的。

不做會怎樣：W3 起帶路徑參數的功能（房間、座位、案件詳情）每加一個都多一次「鍵名打錯、畫面靜默 404」的機會，
而且沒有任何測試會紅。WBS 給的期限是「W3 第一個帶路徑參數的功能開工之前」。

## What Changes

- `api-contract` 加一條 Requirement：`RequestSpec` 對每一條路徑用 template literal type 萃取 `{param}`；
  有參數的路徑 `params` **必填**且鍵**完全相等**（少一個、拼錯、多一個都是 typecheck 錯），沒有參數的路徑**不收** `params`；
  多參數路徑今天契約裡沒有，用型別哨兵守萃取本身。
- 判準走既有的 `tests/type-fixtures/`（故意違規的檔案、單獨一份 tsconfig、測試對它跑 tsc 並**按檔名比對診斷碼**——只看檔名的話，fixture 自己少寫一個 import 也算「紅」，約束拿掉照樣綠）。
- `buildRequest` 的執行期行為不變；既有七個操作不用改 —— 它們本來就對。
- 產品碼只動 `src/api/transport.ts` 的型別（預估 < 20 行）。

放在 `api-contract` 而不是 `data-access`：`(method, path)` 那條約束就在 `api-contract`，這是它的另一半。

## ⚠️ 不做什麼

- **不做執行期的檢查**（例如送出前掃 `{`）：型別層擋得住的事不在執行期再擋一次。
- **不改 `path` 的型別**（`FE-A01` 的那一套不動）、**不改 `query`**（沒有樣板可萃取）。
- **不改 `params` 的值型別**（維持 `string`）：後端 id 全是字串；要放寬時另開 spec。
- **不開 `exactOptionalPropertyTypes`**：那是全 repo 的事；無參數路徑寫 `params: undefined` 放行，規格明寫。
- **不宣稱擋得住存進變數再傳的超集**：那是 TS 多餘屬性檢查的邊界，量過，寫進 Requirement。
- **不動 `tests/design-tokens.test.ts` 裡那個 `npx tsc`**：它是別的 change 的判準，改它是 `chore/` 的事。
