# `schema.d.ts` 是產出來的，不要手改

```
產生指令    npm run contract:generate
產生器      openapi-typescript@7.13.0
來源        http://localhost:8000/openapi.json
後端 commit 27c3077（GuildHub-backend）
產生時間    2026-09-08
```

## 它是哨兵，不是型別來源

型別的來源是 `rest.ts` 的 Zod schema。這個檔案唯一的用途是讓 `drift.ts`
對它做相等斷言 —— 後端形狀改了、重產之後 `npm run typecheck` 會紅。

**所以不要 import 它來當型別用。** 那樣就變成兩份定義，而
`FE-O01` 那一列的 Alarm 是「這份被複製到第二個地方的那天，整套就開始漂」。

## ⚠️ 這個哨兵會過期，而且不會有人告訴你

它比對的是**上面那個 commit 當時**的後端形狀。**沒有人重新產生的話，它永遠是綠的** ——
後端今天改了欄位，CI 明天照樣全過。

沒有把重產做成 CI 的一步是刻意的：那需要 CI 連得到一份後端，而
`AGENTS.md`〈測試環境隔離〉寫著 CI 不提供任何服務。重產是人為動作，
排程在 `FE-O08` 切換演練（W5 起定期跑一次）。

重產之前要先起後端：

```bash
cd ~/Desktop/workshop/fergus/GuildHub-backend
bash run.sh        # ./run.sh 沒有執行權限
```

REST 的型別不需要資料庫 —— OpenAPI 是從程式碼標註產的，
DB 沒接上時後端仍然會回 `/openapi.json`。

## 為什麼是 `npx` 而不是 devDependency

`openapi-typescript@7.13.0` 的 peer 是 `typescript@^5.x`，而本 repo 釘死
`typescript@6.0.3`（理由見 `eslint.config.mjs` 檔頭：TS 7 會讓
typescript-eslint 拒絕啟動）。`npm install` 直接 ERESOLVE 失敗。

版本因此釘在 `package.json` 的 script 字串裡。**要升級產生器的話，
script 裡的版本與這份檔案的紀錄要一起改，然後重產。**

## 它驗不到什麼

- **長度限制。** 後端的 OpenAPI 整份沒有任何 `maxLength`／`minimum`，
  所以 `limits.ts` 的每一個數字都是人工從 `sql/001_schema.sql` 抄的，
  **沒有任何機器在對它們**。抓得到那種漂移的是 `FE-O05` 對真後端的成對邊界測試（W2）。
- **錯誤面。** OpenAPI 只宣告 `200`／`201`／`422`，但後端實際會丟
  400／401／403／404／409。產出的型別裡那五個碼完全不存在。
