import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// 規格：openspec/specs/api-contract/spec.md
//   Requirement: 後端形狀改變時 typecheck 要變紅 —— Scenario FE-O01-S10 / FE-O01-S11
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。S10 與 S11 各有一個正向與一個負向子句，兩個都在
// 同一條 `it` 裡 —— 拆成兩條各自掛 ID 的話，其中一條通過報告就說涵蓋了，
// 而那正是這條 Scenario 要防的（理由見 `contract-limits.test.ts` 的檔頭）。
//
// 驗的是「後端形狀改了，typecheck 會不會紅」。要驗它就得讓形狀真的改掉，
// 所以每一次都：把 `src/api/contract/` **原封不動複製一份**、在複本上改、
// 對複本跑真的 tsc。
//
// ⚠️ **不能改原地的檔案。** 第一版是那樣寫的，結果 `typecheck-negative.test.ts`
// 的陽性對照紅了 —— 它跑的是整個專案的 `npm run typecheck`，而 vitest
// 的測試檔是並行的，兩邊撞在一起。
//
// 複製**不是**在測試裡重刻一份斷言：複本是執行當下從真檔案讀出來的，
// 有人把 `drift.ts` 的斷言刪掉，複本裡也就沒有那些斷言，
// 於是「改壞形狀」不再讓 tsc 變紅 —— 測試會紅。這正是要保護的東西。

const ROOT = path.resolve(import.meta.dirname, '..')
const CONTRACT = path.join(ROOT, 'src', 'api', 'contract')
// `tests/drift-scope` 在主 tsconfig 的 exclude 裡 ——
// 複本存在的那段時間，專案的 typecheck 不會看到它。
const TMP_ROOT = path.join(ROOT, 'tests', 'drift-scope')

const TSCONFIG = JSON.stringify(
  {
    extends: '../../../tsconfig.json',
    compilerOptions: { noEmit: true, incremental: false },
    include: ['./**/*.ts', './**/*.d.ts'],
    // 繼承來的 exclude 會排除掉這個目錄自己 —— 不覆寫的話 tsc 回 TS18003
    //「找不到輸入檔案」，而測試看到的非零退出碼跟「抓到漂移」長得一模一樣。
    exclude: [],
  },
  null,
  2,
)

const dirs = new Set<string>()

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.clear()
})

interface Run {
  code: number
  output: string
  /** 複本裡的 `drift.ts`，斷言的行號要從它算。 */
  drift: string
  /** 改寫有沒有真的發生。沒發生的話這次執行不算數。 */
  changed: boolean
}

/** 把契約複製一份、套用改寫、對複本跑 tsc。`edit` 回傳原文代表不改。 */
function typecheckCopy(edit: (file: string, src: string) => string): Run {
  const dir = path.join(TMP_ROOT, `__tmp_${process.pid}_${Math.random().toString(36).slice(2, 8)}`)
  dirs.add(dir)
  mkdirSync(dir, { recursive: true })
  cpSync(CONTRACT, dir, { recursive: true })
  writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG, 'utf8')

  let changed = false
  for (const file of ['drift.ts', 'schema.d.ts']) {
    const target = path.join(dir, file)
    const original = readFileSync(target, 'utf8')
    const edited = edit(file, original)
    if (edited !== original) {
      writeFileSync(target, edited, 'utf8')
      changed = true
    }
  }

  const drift = readFileSync(path.join(dir, 'drift.ts'), 'utf8')

  try {
    const out = execFileSync('npx', ['tsc', '-p', path.join(dir, 'tsconfig.json')], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { code: 0, output: out, drift, changed }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, output: (err.stdout ?? '') + (err.stderr ?? ''), drift, changed }
  }
}

/**
 * `drift.ts` 裡某一條斷言的行號（1-based）。
 *
 * **不要寫死行號** —— tsc 的錯誤訊息只有 `drift.ts(94,28)` 這種位置，沒有
 * 型別別名的名字。而且要從**改寫後**的內容算：一個「刪掉一行」的改寫會讓
 * 底下每一條斷言上移一行，從原文算的話永遠對不上（實測踩過）。
 */
function lineOf(source: string, assertion: string): number {
  const index = source.split('\n').findIndex((l) => l.startsWith(`type ${assertion} `))
  expect(index, `drift.ts 裡找不到 \`type ${assertion}\` —— 它可能被改名或刪掉了`).toBeGreaterThan(-1)
  return index + 1
}

/** tsc 的錯誤有沒有落在 `drift.ts` 的那一行。 */
const redAt = (output: string, line: number) => output.includes(`drift.ts(${line},`)

/** 把 `schema.d.ts` 裡 `RoomDoorOut.online_count` 換掉。 */
const editSchema = (replacement: string) => (file: string, src: string) =>
  file === 'schema.d.ts'
    ? src.replace('            online_count: number;', `            ${replacement}`)
    : src

describe('後端漂移哨兵', () => {
  it('[FE-O01-S10] 少涵蓋一個實體就會紅，剛好對上就是綠的', () => {
    // 負向：從登錄表移掉一個項目（模擬「有人忘了替新實體寫契約」）
    const broken = typecheckCopy((file, src) =>
      file === 'drift.ts' ? src.replace('  RoomDoorOut: rest.RoomDoorOut,\n', '') : src,
    )
    // 取代沒發生的話，這條測試會驗到一份沒改過的複本然後恆真。
    expect(broken.changed, '對 drift.ts 的改寫沒有生效 —— 登錄表的寫法可能變了').toBe(true)
    expect(broken.code, '從登錄表移掉一個實體之後 typecheck 竟然還是綠的').not.toBe(0)
    // 只看退出碼不夠：**紅的原因可能跟涵蓋率一點關係也沒有**。
    const coverage = lineOf(broken.drift, '_coverage')
    expect(
      redAt(broken.output, coverage),
      `紅了，但不在涵蓋率那一行（${coverage}）：\n${broken.output}`,
    ).toBe(true)

    // 正向：**沒有這一半，上面那一半是恆真的** —— 一條永遠 false 的斷言
    // 會讓負向測試通過，而且它會讓 CI 永遠紅到被人註解掉。
    const clean = typecheckCopy((_f, src) => src)
    expect(clean.changed, '這一半不該改動任何東西').toBe(false)
    expect(clean.code, `契約本來就是紅的：\n${clean.output}`).toBe(0)
  }, 90_000)

  it('[FE-O01-S11] 欄位變成可為 null 會紅，新增一個欄位也會紅', () => {
    const nullable = typecheckCopy(editSchema('online_count: number | null;'))
    expect(nullable.changed, '對 schema.d.ts 的改寫沒有生效 —— 產出的格式可能變了').toBe(true)
    expect(nullable.code, '欄位變成可為 null 之後 typecheck 竟然還是綠的').not.toBe(0)
    const roomDoor = lineOf(nullable.drift, '_RoomDoorOut')
    expect(
      redAt(nullable.output, roomDoor),
      `紅了，但不在 RoomDoorOut 那一行（${roomDoor}）：\n${nullable.output}`,
    ).toBe(true)

    // 新增欄位：**單向的 `extends` 會讓這一半靜靜通過**。用雙向 `Equal`
    // 就是為了這個 —— 新欄位是契約變更，要被看到，不是被吞掉。
    const added = typecheckCopy(editSchema('online_count: number;\n            banner_url: string;'))
    expect(added.changed).toBe(true)
    expect(added.code, '產出的型別多一個欄位之後 typecheck 竟然還是綠的').not.toBe(0)
    expect(
      redAt(added.output, lineOf(added.drift, '_RoomDoorOut')),
      `新增欄位紅了，但不在 RoomDoorOut 那一行：\n${added.output}`,
    ).toBe(true)
  }, 90_000)
})
