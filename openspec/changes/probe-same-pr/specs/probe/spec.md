## Purpose

驗證目前的 required status check 能不能擋住「規格與產品程式碼在同一個 Pull Request」
這種情況。這是實測用的臨時 capability，驗證完成後會連同整個 change 一起刪除。

## ADDED Requirements

### Requirement: 探針函式回傳固定字串

系統 SHALL 提供一個回傳固定字串的函式，僅供本次實測使用。

#### Scenario: 呼叫探針函式

- **WHEN** 呼叫 `probe()`
- **THEN** 回傳字串 `"probe"`
