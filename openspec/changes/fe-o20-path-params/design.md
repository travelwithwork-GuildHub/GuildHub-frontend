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
  拼錯與多鍵靠**物件字面值的多餘屬性檢查**（TS2353）。這個邊界（存進變數再傳的超集不紅）
  寫在 Requirement 裡，不只在這裡。
- 同名參數出現兩次（`/{id}/c/{id}`）萃取成同一個鍵；`{` 後面到下一個 `}` 之間的字就是名字，
  不做其他語法的判定 —— 產出契約的樣板只有這一種寫法。

**已經對著真的 `schema.d.ts` 量過**（規格階段的原型，不進版控）：
拼錯、少給、無參數路徑多給、正確鍵之外再多一個 → 四個 fixture 各恰好一則診斷（TS2353／TS2345／TS2353／TS2353），行號指到 `buildRequest` 那一行；
既有七個操作＋兩個無參數的照舊綠；`params: undefined` 在無參數路徑上過；存進變數的超集過（所以那是邊界，不是判準）；
`WithParams` 改回 `{ params?: Record<string, string> }` → 四個 fixture 全部能編譯；
`ParamsOf` 改成只取第一個 → 雙參數哨兵紅（TS2344）。

## D2｜判準是型別 fixture ＋ 診斷碼比對，不是 `expectTypeOf`

`tests/type-fixtures/` 已經有一套：單獨的 tsconfig（`exclude` 覆寫成空的，理由寫在那份 tsconfig 裡）、
故意違規的檔案、測試對它跑 tsc（`tests/design-tokens.test.ts` 的做法）。

`expectTypeOf`／`@ts-expect-error` 證明不了「拿掉約束會變綠」——`@ts-expect-error` 在沒有錯誤時自己會紅，
但那跟產品碼在同一次 tsc 裡：拿掉約束的那一刻 `pnpm run typecheck` 就紅，沒有人會把它當成「判準紅了」。
fixture 的紅是獨立的。

三個跟 `design-tokens` 不同的地方（前兩個是兩位審查者各自指出的）：

- **按檔名比對診斷碼，不看退出碼、也不只看檔名**：目錄是共用的，`undefined-layer.ts` 已經讓 tsc 非零結束；
  而檔名出現只證明「有某個錯」——fixture 自己少寫 `method` 也算。測試把 tsc 輸出的
  `<檔名>(<行>,<欄>): error TS<碼>` 行解析成 `{ 檔名 → [碼] }`，每條 `it` 斷言自己那個檔恰好 `['TS2353']`
  或 `['TS2345']`；正向 fixture 斷言 `[]`。這樣約束拿掉時是「診斷從一則變零則」，fixture 多了別的錯是「一則變兩則」，兩種都紅。
- **一次 tsc、多個檔**：解析後按檔分組，就不需要每個 fixture 各跑一次（tsc 冷啟動約 3 秒）。
- **tsc 用 `process.execPath` 跑 `typescript/bin/tsc`**，不經過 `npx`／`pnpm exec`：測試不該依賴哪個套件管理器在 PATH 上。

## D3｜多參數路徑用哨兵，不用 fixture

`RequestSpec` 的 `path` 只收契約裡有的路徑，而今天沒有任何雙參數路徑，所以「第二個參數漏給」寫不成 fixture。
改在 `transport.ts` 對 `ParamsOf` 放三條 `Expect<Eq<…>>` 哨兵（寫法同 `PathsWith` 那三條），跟產品碼同一次 tsc。
它守的是萃取本身；第一條雙參數路徑進契約那天，`S01`～`S04` 的形狀自然涵蓋它。

## 這一份怎麼驗

- `S01`～`S04`：四個違規 fixture，一次 tsc，各斷言診斷碼；`S06` 的正向 fixture 同一次、斷言零診斷。
- `S05`：哨兵在 `pnpm run typecheck` 裡；`S06`：`pnpm run typecheck` 綠、`tests/api-operations-coverage.test.ts` 綠。
- 驗收不是全綠（一次性的突變，做完改回來，是當次證據不是長期判準——長期判準是上面那些 fixture）：
  `WithParams` 改回 `{ params?: Record<string, string> }` → `tests/path-params.test.ts` 的 `S01`～`S04` 四條 `it` 失敗
  （fixture 變成能編譯，診斷從一則變零則），`S06` 那條仍過；
  `ParamsOf` 改成 `? K : never` → `pnpm run typecheck` 紅在雙參數哨兵。
