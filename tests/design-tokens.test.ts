import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { LAYER_ORDER, layer } from '@/design/layers'

const ROOT = path.resolve(import.meta.dirname, '..')

describe('DOM design token 的單一事實來源', () => {
  it('[FE-X01-S06] 五個具名層的數值嚴格遞增', () => {
    expect(LAYER_ORDER).toEqual(['canvas', 'hud', 'panel', 'modal', 'toast'])

    const values = LAYER_ORDER.map(layer)
    expect(values).toHaveLength(5)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!, `${LAYER_ORDER[i]} 沒有大於 ${LAYER_ORDER[i - 1]}`).toBeGreaterThan(values[i - 1]!)
    }
  })

  it('[FE-X01-S07] 未定義的層名讓型別檢查以非零結束，不是回傳 undefined', () => {
    // 這條只有編譯期證明得了。fixture 有自己的 tsconfig，
    // 並被主 tsconfig 的 exclude 排除 —— 否則 `npm run typecheck` 會因為它永遠紅。
    let code = 0
    let output = ''
    try {
      execFileSync('npx', ['tsc', '-p', 'tests/type-fixtures/tsconfig.json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (e) {
      const err = e as { status?: number; stdout?: string }
      code = err.status ?? 0
      output = err.stdout ?? ''
    }

    expect(code, 'fixture 竟然通過了型別檢查 —— 那代表層名沒有被型別約束').not.toBe(0)
    expect(output).toContain('undefined-layer.ts')
    expect(output).toContain('tooltip')
  }, 60_000)

  it('[FE-X01-S14] 堆疊層級沒有被複製到樣式層', () => {
    const css = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')
    const theme = css.slice(css.indexOf('@theme'))

    for (const name of LAYER_ORDER) {
      expect(theme, `@theme 裡出現了 ${name} —— 同一個值定義在兩個地方就會開始漂`).not.toMatch(
        new RegExp(`--[a-z-]*z[a-z-]*-${name}\\b`),
      )
    }
    expect(theme).not.toContain('z-index')
  })
})
