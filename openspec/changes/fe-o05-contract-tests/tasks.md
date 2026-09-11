# `FE-O05` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o05-contract-tests`）；`FE-O04` 已實作

## 2. harness、client、目標守門

對應 Requirement〈唯一一份，兩個目標各跑一次，都走真 HTTP〉、〈目標必須是自己起的、可拋棄的〉

- [x] 2.1 `vitest.contract.mts`、`tests/contract/harness.ts`（internal：reset → `next start` → port）、`tests/contract/client.ts`（jar、raw）
- [x] 2.2 `scripts/contract-guildhub.mjs`（design `D3`）；`package.json` 的 `test:contract:internal`／`test:contract:guildhub`
- [x] 2.3 判準：`S01`～`S06`（`S03` 在這一片對 guildhub 驗；internal 那一輪等 `FE-O03` 的 login／me 進來）
- [x] 2.4 **突變**：jar 拿掉 → `S03` 紅；loopback 檢查拿掉 → `S04` 紅；借用既有 8000 → `S05` 紅
- [x] 2.5 **這一片先合併，再做 `FE-O03`**

## 3. 邊界、形狀、golden

對應 Requirement〈成對邊界從 `limits.ts` 產生〉、〈形狀與型別：兩邊一字不差〉

- [x] 3.1 `tests/contract/boundaries.ts`（欄位 → 端點；值用 `FE-O06` 的 `boundaryValues`，含 pending）
- [x] 3.2 對 guildhub 錄 `golden/422.json` 與時間字串 regex（`CONTRACT_RECORD=1`，錄製那一次 exit 非 0）
- [x] 3.3 判準：`S07`～`S12`、`S16`（`internal` 與 `guildhub` 各跑一次，兩邊的輸出貼進 PR）
- [x] 3.4 **突變**：`S09`（`bio.max` 改 200）；邊界表寫死數字 → `FE-O06-S01` 紅

## 4. WS

對應 Requirement〈WS 契約對兩邊各跑一次〉

- [x] 4.1 `tests/contract/ws/*.contract.ts`；harness 起替身（internal）／wrapper 給 `CONTRACT_WS_URL`（guildhub）
- [x] 4.2 判準：`S13`、`S14`（兩邊各跑一次）

## 5. CI

對應 Requirement〈CI 只跑 internal；guildhub 在本機〉

- [x] 5.1 `governance/`：ci.yml 加 job（service container Postgres、`next build` 產物、`test:contract:internal`）＋ `check-contract-ci.py`（解析 YAML）
- [x] 5.2 判準：`S15`

## 6. 收尾

- [x] 6.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠；`test:contract:internal` 在 CI 綠；`test:contract:guildhub` 本機綠（輸出貼進 PR）
- [x] 6.2 封存（`archive/fe-o05-contract-tests`，下一個 PR）
