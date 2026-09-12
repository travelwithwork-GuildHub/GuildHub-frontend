# 0005. 後端的「位址」與「形狀」是兩個 capability

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: 實作 `FE-O01`／`FE-O09` 的那個 session；2026-09-12 事後審查確認
- **邊界狀態**: 僅約定
- **證據**: openspec/specs/api-contract/spec.md、openspec/specs/runtime-config/spec.md、src/config/env.ts

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

原規劃把「後端在哪」與「後端長什麼樣」放在同一個「資料層」工作項目裡。
實作的時候拆成兩個 capability：`runtime-config`（位址、環境代號、缺席時怎麼辦）
與 `api-contract`（REST／WS 訊息的形狀、限制、哨兵型別）。這個決定是實作中做的，
沒有回 spec PR；這份 ADR 是事後補的紀錄，**不是**假裝當時已經談定。

## 選項

### A. 一個「資料層」capability
- 好：少一份規格。
- 壞：換一份後端（只動位址）跟後端改形狀（只動契約）會共用一個變更理由，
  而它們的生命週期不同 —— 前者每個環境都在變，後者跟著後端版本走。

### B. 兩個 capability，彼此不相依
- 好：`src/config/env.ts` 一個 import 都沒有；`src/api/contract/` 也不 import 它。
  同時需要兩邊的只有 `src/realtime/client.ts`。依賴圖上真的是兩件事。
- 壞：多一份規格；而且「彼此不相依」目前**只是現況**，沒有東西擋。

## 決定

選 B。

**理由**：零耦合是量出來的，不是論述出來的。

## 代價

**這條邊界目前是「僅約定」。** 誰在 `src/config/env.ts` 加一行
`import { … } from '@/api/contract/…'`，不會有任何東西變紅。
要升到「已強制」，需要一條 import 邊界測試（或 ESLint `no-restricted-imports`
的一條規則）—— 加了之後把這份 ADR 的狀態改掉、證據改指到那條測試。

## 什麼情況下要重新考慮

- 有第二個模組需要同時 import 兩邊（現在只有 `realtime/client.ts`）——
  那可能表示邊界切錯了，或需要一個組合層。
