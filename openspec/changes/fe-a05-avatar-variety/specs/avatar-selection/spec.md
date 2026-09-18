## Purpose

角色選擇的兩個補強：首次建立身分的人不再一律是第一款 —— 系統隨機指派一款並存起來，進世界時就已經跟別人不一樣；
選擇器列出全部八款。回來的人（金鑰、帳號密碼）維持自己選過的。

## Applicability

權限：不適用 —— 只改自己的名片（既有的 `PATCH /api/profiles/me`）
併發：適用 —— 隨機指派的儲存與「進入世界」的導向同時在飛：導向 SHALL 等儲存結束（成功或失敗）才發生，讓第一次 WebSocket 連線帶的是指派後的值
持久資料相容性：適用 —— 已存在的名片 SHALL NOT 被改（只有剛建立的才指派）
失敗路徑：適用 —— 儲存失敗（網路、5xx）不擋進入、不顯示錯誤視窗；值域外的隨機值 SHALL NOT 送出（沿用 `S10`）
測試連到什麼：jsdom 判準用注入的亂數與偽造的 API；真瀏覽器判準連本機自起的 `next start`，`/api/*` 用 `page.route` 偽造並記錄 `PATCH` 的 body。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 首次建立身分時隨機指派一款外觀

使用者用暱稱建立身分、或註冊帳號成功之後，系統 SHALL 在 `0`～`7` 之間**均勻隨機**挑一款外觀並儲存
（走 `PATCH /api/profiles/me` 的 `avatar_id`），**然後**才把使用者帶進世界。
用恢復金鑰或帳號密碼登入既有名片時，系統 SHALL NOT 改動 `avatar_id`。

儲存失敗時系統 SHALL 照常帶使用者進世界（外觀是後端回的那一款），SHALL NOT 顯示錯誤視窗、SHALL NOT 重試 ——
換角色的入口一直在（`S11`），使用者隨時可以自己選。
隨機值 SHALL 由映射的款數決定（款數改變時範圍跟著變），SHALL NOT 寫死 8。

#### Scenario: [FE-A05-S17] 暱稱建立身分：進世界前存了一個 0～7 的隨機外觀

- **WHEN** 使用者在首次進入流程（或 `/login`）用暱稱建立身分
- **THEN** 進入世界之前 SHALL 恰好送出一次 `PATCH /api/profiles/me`，body 只含 `avatar_id`，值是 `0`～`7` 的整數
- **AND** 進入世界後畫面上自己的外觀 SHALL 是那一款
- **AND** 重複建立十二個身分，送出的 `avatar_id` SHALL 至少有兩種不同的值（不是每次都同一款）

#### Scenario: [FE-A05-S18] 註冊帳號也一樣

- **WHEN** 使用者用帳號密碼註冊成功
- **THEN** 同 `S17`：進世界前恰好一次 `PATCH`、值在範圍內

#### Scenario: [FE-A05-S19] 回來的人不被改

- **WHEN** 使用者用恢復金鑰、或用帳號密碼登入一張既有的名片
- **THEN** 進入世界的整個過程 SHALL NOT 送出任何 `PATCH /api/profiles/me`
- **AND** 畫面上自己的外觀是名片上原本的那一款

#### Scenario: [FE-A05-S20] 儲存失敗不擋進入

- **GIVEN** `PATCH /api/profiles/me` 回 500
- **WHEN** 使用者用暱稱建立身分
- **THEN** 使用者 SHALL 仍然進入世界
- **AND** 畫面上 SHALL NOT 出現錯誤視窗或阻斷式訊息
- **AND** SHALL NOT 再送第二次 `PATCH`

#### Scenario: [FE-A05-S21] 亂數只在範圍內、款數是映射說了算

- **GIVEN** 注入的亂數來源依序回 `0`、`0.999`、`0.5`
- **WHEN** 各建立一次身分
- **THEN** 送出的 `avatar_id` 依序是 `0`、`7`、`4`（`Math.floor(r × 款數)`，款數讀映射的常數）
- **AND** 把款數改成 `3` 時同一組亂數得到 `0`、`2`、`1`

### Requirement: 選擇器列出每一款

換角色的選擇器 SHALL 列出映射支援的**每一款**（今天是八款），每一款帶一個從映射取色的色票，
選項 SHALL 能換行、SHALL NOT 讓選擇器超出視窗寬度（1280 與 1024 寬都要）。

#### Scenario: [FE-A05-S22] 八款都在、都選得到

- **WHEN** 打開換角色的選擇器
- **THEN** 選項數 SHALL 等於映射的款數（八）
- **AND** 每一個選項的色票顏色 SHALL 等於映射給那一款的軀幹顏色
- **AND** 選第八款並儲存後，送出的 `avatar_id` 是 `7`

#### Scenario: [FE-A05-S23] 選擇器在 1024 寬的視窗裡不超出畫面

- **WHEN** 視窗寬 1024，打開選擇器
- **THEN** 選擇器的矩形 SHALL 完整落在視窗內
- **AND** 八個選項都看得見（每一個的矩形都在視窗內）
