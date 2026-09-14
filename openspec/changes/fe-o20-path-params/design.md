# `FE-O20` 設計

## D1｜從路徑字面值萃取參數名，`params` 的型別依路徑而定

```ts
type ParamsOf<P extends string> = P extends `${string}{${infer K}}${infer R}` ? K | ParamsOf<R> : never
type WithParams<P extends string> =
  [ParamsOf<P>] extends [never] ? { params?: never } : { params: Record<ParamsOf<P>, string> }
export type RequestSpec = {
  [M in keyof METHODS]: {
    [P in PathsWith<METHODS[M]>]: Omit<RequestBase, 'params'> & { method: M; path: P } & WithParams<P>
  }[PathsWith<METHODS[M]>]
}[keyof METHODS]
```

- `[ParamsOf<P>] extends [never]` 是為了不讓 `never` 在條件型別裡分配掉（分配掉的話無參數路徑那一格會整個消失）。
- `P` 分配到每一條路徑再取聯集，所以 `spec.path` 仍然是那個字面值聯集，`buildRequest` 裡
  `let path: string = spec.path` 那行的型別標註與註解都不用動。
- 少鍵是 TS2345（`params` 缺、或 `Record<'profile_id', string>` 少了 `profile_id`）；
  拼錯與多鍵靠**物件字面值的多餘屬性檢查**（TS2353）—— `operations.ts` 全是字面值，
  所以這條成立；把 `params` 先存進變數再傳的話多餘屬性檢查不會觸發，這是 TS 本身的邊界，
  Scenario 不宣稱擋得住（跟 `FE-O21` 對「路徑存進變數再 `import(p)`」的處置一樣）。

**已經對著真的 `schema.d.ts` 量過**（規格階段的原型，不進版控）：拼錯、少給、無參數路徑多給、正確鍵之外再多一個 → 四個 fixture 各紅一條、行號指到 `buildRequest` 那一行；
既有七個操作＋兩個無參數的照舊綠；`WithParams` 改回 `{ params?: Record<string, string> }` → 四個全部能編譯（0 錯）。

## D2｜判準是型別 fixture，不是 `expectTypeOf`

`tests/type-fixtures/` 已經有一套：單獨的 tsconfig（`exclude` 覆寫成空的，理由寫在那份 tsconfig 裡）、
故意違規的檔案、測試對它跑 tsc（`tests/design-tokens.test.ts` 的做法）。

`expectTypeOf`／`@ts-expect-error` 證明不了「拿掉約束會變綠」——`@ts-expect-error` 在沒有錯誤時自己會紅，
但那跟產品碼在同一次 tsc 裡：拿掉約束的那一刻 `pnpm run typecheck` 就紅，沒有人會把它當成「判準紅了」。
fixture 的紅是獨立的。

兩個跟 `design-tokens` 不同的地方：

- **斷言檔名，不斷言退出碼**：目錄是共用的，`undefined-layer.ts` 已經讓 tsc 非零結束；只看退出碼的話，
  把這條約束拿掉測試照樣綠。每個 Scenario 一個 fixture 檔、斷言錯誤輸出含它的檔名。
- **tsc 用 `process.execPath` 跑 `typescript/bin/tsc`**，不經過 `npx`／`pnpm exec`：測試不該依賴哪個套件管理器在 PATH 上。

## 這一份怎麼驗

- `S01`～`S04`：四個 fixture 檔，一次 tsc，斷言每個檔名都出現在錯誤輸出裡；`S05`：`pnpm run typecheck` 綠、
  `tests/api-operations-coverage.test.ts` 綠（既有七個操作照舊）。
- 驗收不是全綠：`WithParams` 改回 `{ params?: Record<string, string> }` → `S01`～`S04` 全紅（fixture 變成能編譯）；
  `S05` 仍綠（那是它該有的樣子——它守的是「不破壞既有」，不是「有約束」）。
