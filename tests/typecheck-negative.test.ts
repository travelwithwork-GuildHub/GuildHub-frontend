import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// `FE-X01-S11`：原始碼裡有一個型別錯誤時，`typecheck` 要以非零結束並指出檔案。
//
// `fe-x01-appshell` 的 tasks.md 2.6 做過一次，但那是**一次性的人工驗證** ——
// 沒有東西會回歸。把 `strict` 關掉、或把 `typecheck` 換成 `tsc --noEmit
// --skipLibCheck` 之類的東西，不會有任何測試變紅。
//
// 這裡直接照 Scenario 的字面做：把一個帶型別錯誤的檔案放進 `src/`
// （主 tsconfig 涵蓋的範圍），跑真正的 `npm run typecheck`，再移除。
//
// 跟 `tests/type-fixtures/` 那個常駐 fixture 的差別：那一份驗的是
// **design token 的層名**有沒有被型別約束（`FE-X01-S07`），用的是自己的
// tsconfig；這一份驗的是**專案的 `typecheck` 指令本身**擋不擋得住錯誤。

const ROOT = path.resolve(import.meta.dirname, '..')
// **檔名要每次不同，而且不可以覆寫既有檔案。**
//
// 固定檔名有三個問題（外部審查實測）：兩個並行的 vitest run 會互相覆寫與
// 刪除；使用者剛好有同名檔案的話會被覆寫、事後還被無條件刪掉；
// 程序被 SIGKILL 時殘留的檔案會讓整個專案的 typecheck 永久紅。
//
// 加上 PID 與亂數之後，並行不會撞名；`wx` 旗標讓「已經存在」直接丟錯，
// 而不是覆寫別人的東西。
const PROBE = path.join(
  ROOT,
  'src',
  `__typecheck_probe_${process.pid}_${Math.random().toString(36).slice(2, 8)}__.ts`,
)

afterEach(() => {
  rmSync(PROBE, { force: true })
})

describe('typecheck 真的會擋', () => {
  it('[FE-X01-S11] 原始碼裡有型別錯誤時 typecheck 以非零結束並指出檔案', () => {
    // `wx`：已經存在就丟錯，**不覆寫**。
    writeFileSync(
      PROBE,
      '// 暫時的探針，由 tests/typecheck-negative.test.ts 產生與刪除。\n' +
        'export const probe: number = "這不是數字"\n',
      { encoding: 'utf8', flag: 'wx' },
    )

    let code = 0
    let output = ''
    try {
      execFileSync('npm', ['run', 'typecheck'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string }
      code = err.status ?? 0
      output = (err.stdout ?? '') + (err.stderr ?? '')
    }

    expect(code, 'typecheck 竟然通過了 —— 那代表它沒有在檢查 src/').not.toBe(0)
    // **要指出是哪一個檔案。** 只看退出碼的話，「typecheck 因為別的原因紅」
    // 跟「它抓到了這個錯誤」長得一模一樣。
    expect(output, 'typecheck 紅了，但沒有指出是哪一個檔案').toContain(path.basename(PROBE))
  }, 120_000)

  it('[FE-X01-S11] 沒有那個檔案的時候 typecheck 是綠的（陽性對照）', () => {
    // **沒有這一條，上一條是恆真的** —— 一個永遠失敗的 typecheck
    // 也會讓上面那條通過。
    rmSync(PROBE, { force: true })
    const out = execFileSync('npm', ['run', 'typecheck'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    expect(out).toBeDefined()
  }, 120_000)
})
