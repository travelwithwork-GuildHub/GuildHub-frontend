import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { colorLiterals } from '@/design/colorScan'

// 規格 `FE-W09-S02`／`S03` 的讀檔那一半。判定本身在 `src/design/colorScan.ts`。
//
// ⚠️ **正向控制不是「至少掃到 N 個檔案」。** 那太弱 ——
// 把路徑誤改成只匹配一個檔案時，檔案數仍然大於零，
// 而其他每一個檔案都可以寫死顏色。
// 這裡的正向控制是**逐一包含一組具名的檔案**，外加**巢狀新增的檔案要自動出現**。

const ROOT = join(import.meta.dirname, '..')
const WORLD = join(ROOT, 'src', 'world')

/** 遞迴列出一個目錄底下的原始碼檔案。 */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** 這幾個檔案一定要在掃描範圍裡。**名單縮水或路徑打錯都會紅。** */
const MUST_INCLUDE = [
  'WorldCanvas.tsx',
  'DebugShadowScene.tsx',
  'RemoteWorld.tsx',
  join('player', 'ChibiPlayer.tsx'),
  join('player', 'LocalPlayer.tsx'),
  join('interaction', 'InteractionPrompt.tsx'),
]

describe('src/world 不得寫死顏色', () => {
  it('[FE-W09-S03] 掃描範圍涵蓋每一個具名的檔案', () => {
    const scanned = sourceFiles(WORLD).map((f) => relative(WORLD, f))
    for (const name of MUST_INCLUDE) {
      expect(scanned, `掃描範圍少了 ${name} —— 這是**掃描範圍**的問題，不是原始碼的問題`).toContain(
        name,
      )
    }
  })

  it('[FE-W09-S02] 每一個檔案都沒有顏色字面值', () => {
    const problems: string[] = []
    for (const file of sourceFiles(WORLD)) {
      const found = colorLiterals(readFileSync(file, 'utf8'))
      if (found.length > 0) problems.push(`${relative(ROOT, file)}：${found.join('、')}`)
    }
    expect(
      problems,
      `寫死了顏色。改用 worldColor('…')，值在 src/design/world.ts：\n${problems.join('\n')}`,
    ).toEqual([])
  })
})

// 新增與巢狀的檔案要自動納入。**「具名檔案」只擋得住既有範圍縮水**，
// 擋不住「未來新增的檔案根本沒被掃到」——例如把遞迴改成只掃第一層。
const TEMP = join(tmpdir(), `guildhub-scan-${process.pid}`)

afterAll(() => {
  rmSync(TEMP, { recursive: true, force: true })
})

describe('掃描會自動納入新檔案', () => {
  it('[FE-W09-S03] 巢狀子目錄裡新增的檔案會出現在掃描集合裡', () => {
    mkdirSync(join(TEMP, 'a', 'b'), { recursive: true })
    writeFileSync(join(TEMP, 'top.tsx'), 'export const x = 1\n')
    writeFileSync(join(TEMP, 'a', 'b', 'deep.tsx'), 'export const y = 2\n')

    const scanned = sourceFiles(TEMP).map((f) => relative(TEMP, f))
    expect(scanned).toContain('top.tsx')
    expect(scanned, '巢狀子目錄沒有被掃到 —— 遞迴壞了').toContain(join('a', 'b', 'deep.tsx'))
  })
})
