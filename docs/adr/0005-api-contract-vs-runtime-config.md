# 0005. 後端的「位址」與「形狀」是兩個 capability

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: 實作 `FE-O01`／`FE-O09` 的那個 session；2026-09-12 事後審查確認
- **邊界狀態**: 僅約定
- **證據**: openspec/specs/api-contract/spec.md、openspec/specs/runtime-config/spec.md、src/config/env.ts、src/api/transport.ts:2

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

原規劃把「後端在哪」與「後端長什麼樣」放在同一個「資料層」工作項目裡。
實作的時候拆成兩個 capability：`runtime-config`（位址、環境代號、缺席時怎麼辦）
與 `api-contract`（REST／WS 訊息的形狀、限制、哨兵型別）。這個決定寫在 `FE-O01`／`FE-O09`
的 proposal 裡、走過 `spec/` PR，**不是**偷跑；跟不上的是 WBS 的原規劃與 ADR ——
這份是事後補的紀錄，不是假裝當時就有。

## 選項

### A. 一個「資料層」capability
- 好：少一份規格。
- 壞：換一份後端（只動位址）跟後端改形狀（只動契約）會共用一個變更理由，
  而它們的生命週期不同 —— 前者每個環境都在變，後者跟著後端版本走。

### B. 兩個 capability，彼此不相依
- 好：`src/config/env.ts` 一個 import 都沒有；`src/api/contract/` 對外只 import `zod`。
  同時需要兩邊的是**兩個傳輸層**：`src/api/transport.ts:2`（REST，#150 加的）與
  `src/realtime/client.ts`（WS）—— 各自把「在哪」接到「長什麼樣」上。依賴圖上真的是兩件事，
  而且兩條通道長得一樣，說明這個切法不是 WS 專用的巧合。
  （2026-09-08 的審查量到的只有 `realtime/client.ts`，那天是對的；`transport.ts` 隔天
  才進（#150，2026-09-09）。這份 ADR 2026-09-12 第一版照抄審查那句，寫的當天就已經錯。
  **證據要寫的那天量，不抄舊審查。**）
- 壞：多一份規格；而且「彼此不相依」目前**只是現況**，沒有東西擋。

## 決定

選 B。

**理由**：零耦合是量出來的，不是論述出來的。

## 代價

**這條邊界目前是「僅約定」。** 誰在 `src/config/env.ts` 加一行
`import { … } from '@/api/contract/…'`，不會有任何東西變紅。
要升到「已強制」，最便宜的路是這個 repo 已經在用的做法：`eslint.config.js` 加一段
`no-restricted-imports`（`src/config/env.ts` 不得 import `@/api/*`；`src/api/contract/**`
不得 import `@/config/*`），配一條 `tests/env-lint-rule.test.ts` 那種 `lintText` 虛擬檔案的測試。
不動任何正式碼。加了之後把這份 ADR 的狀態改掉、證據改指到那條測試。
同一段規則可以順便把 `docs/adr/0006` 收掉，見那份的〈補上的方向〉第 3 條。

## 什麼情況下要重新考慮

- 出現第三個同時 import 兩邊、**而且不是傳輸通道**的模組（現在兩個都是：REST 的
  `api/transport.ts`、WS 的 `realtime/client.ts`）—— 那可能表示邊界切錯了，
  或有人在傳輸層以外的地方自己組位址。
