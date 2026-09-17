import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIRTY_DIR, REPORT_DIR, finishRehearsal, renderReport } from '../scripts/rehearsal-report.mjs'

// 規格：openspec/changes/fe-o08-guildhub-rehearsal/specs/switch-rehearsal/spec.md
//   Requirement: 每次演練產一份不可變的報告 —— S07、S08
//
// 檔案系統只用 `mkdtemp` 出來的暫存目錄（`outDir`／`dirtyDir` 都指過去），不碰 repo 裡的證據目錄。

const BACKEND_SHA = 'c6f39280000000000000000000000000000000be'
const FRONTEND_SHA = '6a03dbb0000000000000000000000000000000fe'
const NOW = new Date('2026-09-17T01:02:03.456Z')
const RANDOM = () => 'abcdef'
const EXPECTED_NAME = '20260917T010203Z-c6f3928-6a03dbb-abcdef.md'

type Leaf = { key: string; status: 'passed' | 'failed'; report?: boolean; failureMessages?: string[] }
/** vitest `--reporter=json` 的形狀（只放報告會讀的欄位）；`meta` 是演練測試從期望表抄過來的。 */
function vitestJson(leaves: Leaf[]) {
  return {
    numTotalTests: leaves.length,
    numPassedTests: leaves.filter((l) => l.status === 'passed').length,
    numFailedTests: leaves.filter((l) => l.status === 'failed').length,
    success: leaves.every((l) => l.status === 'passed'),
    testResults: [
      {
        name: 'tests/rehearsal/closure.rehearsal.ts',
        status: 'failed',
        assertionResults: leaves.map((l) => ({
          ancestorTitles: ['閉環'],
          fullName: `閉環 [FE-O08-S03] ${l.key}`,
          title: `[FE-O08-S03] ${l.key}`,
          status: l.status,
          failureMessages: l.failureMessages ?? [],
          meta: { key: l.key, report: l.report ?? false },
        })),
      },
    ],
  }
}
const SAMPLE: Leaf[] = [
  { key: 'create', status: 'passed' },
  { key: 'form-team', status: 'failed', failureMessages: ['AssertionError: form-team 期望 201，實測 200\n    at closure.rehearsal.ts:40:5'] },
  // vitest 把 `e.stack` 放進 failureMessages：`Error: blocked: …` 開頭，不是裸的 `blocked:`。
  { key: 'enter', status: 'failed', failureMessages: ['Error: blocked: form-team\n    at closure.rehearsal.ts:60:11'] },
  { key: 'seat-claim', status: 'failed', failureMessages: ['blocked: form-team'] },
  { key: 'create-unvalidated', status: 'passed', report: true },
  { key: 'close-keeps-token', status: 'failed', report: true, failureMessages: ['AssertionError: close-keeps-token 期望 201，實測 403'] },
]

function line(out: string, key: string): string {
  const hit = out.split('\n').find((l) => l.includes(`\`${key}\``))
  expect(hit, `報告裡沒有 ${key} 那一行`).toBeDefined()
  return hit as string
}

describe('renderReport()', () => {
  const base = { json: vitestJson(SAMPLE), shas: { backend: BACKEND_SHA, frontend: FRONTEND_SHA }, now: NOW }

  it('[FE-O08-S07] 含兩個 SHA；每個 key 一行標 passed／failed／blocked；失敗那行含錯誤訊息', () => {
    const out = renderReport({ ...base, dirty: false })
    expect(out).toContain(BACKEND_SHA)
    expect(out).toContain(FRONTEND_SHA)
    expect(line(out, 'create')).toMatch(/passed/)
    expect(line(out, 'create')).not.toMatch(/failed|blocked/)
    expect(line(out, 'form-team')).toMatch(/failed/)
    expect(line(out, 'form-team')).toContain('form-team 期望 201，實測 200')
    expect(line(out, 'form-team')).not.toMatch(/blocked/)
    expect(line(out, 'enter')).toMatch(/blocked/)
    expect(line(out, 'enter')).not.toMatch(/\bfailed\b/)
    expect(line(out, 'seat-claim')).toMatch(/blocked/)
    expect(line(out, 'close-keeps-token')).toMatch(/failed/)
    expect(out).toMatch(/passed 2 .*failed 2 .*blocked 2/)
  })

  it('[FE-O08-S07] 〈送回後端〉列 report: true 的 key，其他不列', () => {
    const out = renderReport({ ...base, dirty: false })
    const section = out.slice(out.indexOf('## 送回後端'))
    expect(section.length, '沒有〈送回後端〉節').toBeGreaterThan(0)
    expect(section).toContain('`create-unvalidated`')
    expect(section).toContain('`close-keeps-token`')
    for (const key of ['create', 'form-team', 'enter', 'seat-claim']) expect(section, key).not.toContain(`\`${key}\``)
  })

  it('[FE-O08-S07] dirty 時首行寫明；乾淨時首行不提 dirty', () => {
    const dirty = renderReport({ ...base, dirty: true })
    expect(dirty.split('\n')[0]).toMatch(/dirty/)
    const clean = renderReport({ ...base, dirty: false })
    expect(clean.split('\n')[0]).not.toMatch(/dirty/)
  })
})

describe('finishRehearsal()', () => {
  async function dirs() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rehearsal-'))
    const outDir = path.join(root, 'evidence')
    const dirtyDir = path.join(root, 'dirty')
    const jsonPath = path.join(root, 'result.json')
    return { root, outDir, dirtyDir, jsonPath }
  }
  async function files(dir: string): Promise<string[]> {
    return readdir(dir).catch(() => [])
  }
  const ok: { exitCode: number | null; signal: string | null; shas: { backend: string; frontend: string }; dirty: boolean; now: Date; random: () => string } =
    { exitCode: 0, signal: null, shas: { backend: BACKEND_SHA, frontend: FRONTEND_SHA }, dirty: false, now: NOW, random: RANDOM }

  it('[FE-O08-S08] JSON 缺席、不是合法 JSON、不是 vitest 的形狀、後端 SHA 空、被訊號終止：不寫任何檔、回非零', async () => {
    const d = await dirs()
    const cases: Array<[string, () => Promise<void>, Partial<typeof ok>]> = [
      ['JSON 缺席', async () => {}, {}],
      ['不是合法 JSON', () => writeFile(d.jsonPath, '{ not json'), {}],
      ['不是 vitest 的形狀', () => writeFile(d.jsonPath, JSON.stringify({ hello: 1 })), {}],
      ['後端 SHA 空', () => writeFile(d.jsonPath, JSON.stringify(vitestJson(SAMPLE))), { shas: { backend: '', frontend: FRONTEND_SHA } }],
      ['被訊號終止', () => writeFile(d.jsonPath, JSON.stringify(vitestJson(SAMPLE))), { exitCode: null, signal: 'SIGTERM' }],
    ]
    for (const [name, prepare, override] of cases) {
      await prepare()
      const r = await finishRehearsal({ ...ok, ...override, jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
      expect(r.code, name).not.toBe(0)
      expect(await files(d.outDir), name).toEqual([])
      expect(await files(d.dirtyDir), name).toEqual([])
    }
  })

  it('[FE-O08-S08] JSON 完整但 vitest 結束碼是 1：報告照樣寫出、內含失敗的 key、回傳 1', async () => {
    const d = await dirs()
    await writeFile(d.jsonPath, JSON.stringify(vitestJson(SAMPLE)))
    const r = await finishRehearsal({ ...ok, exitCode: 1, jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
    expect(r.code).toBe(1)
    expect(await files(d.outDir)).toEqual([EXPECTED_NAME])
    const body = await readFile(path.join(d.outDir, EXPECTED_NAME), 'utf8')
    expect(line(body, 'form-team')).toMatch(/failed/)
    expect(line(body, 'enter')).toMatch(/blocked/)
    expect(await files(d.dirtyDir)).toEqual([])
  })

  it('[FE-O08-S08] 全綠：寫出、回 0；檔名是 <UTC 秒>-<後端 7>-<前端 7>-<隨機 6>.md', async () => {
    const d = await dirs()
    await writeFile(d.jsonPath, JSON.stringify(vitestJson(SAMPLE.filter((l) => l.status === 'passed'))))
    const r = await finishRehearsal({ ...ok, jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
    expect(r.code).toBe(0)
    expect(r.path).toBe(path.join(d.outDir, EXPECTED_NAME))
    expect(await files(d.outDir)).toEqual([EXPECTED_NAME])
    // 不同的 random 就是不同的檔：同一秒跑兩次也各自留證據。
    const again = await finishRehearsal({ ...ok, random: () => '012345', jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
    expect(again.code).toBe(0)
    expect((await files(d.outDir)).sort()).toEqual(['20260917T010203Z-c6f3928-6a03dbb-012345.md', EXPECTED_NAME].sort())
  })

  it('[FE-O08-S08] 目標檔已存在：內容不變、回非零、訊息含路徑', async () => {
    const d = await dirs()
    await writeFile(d.jsonPath, JSON.stringify(vitestJson(SAMPLE)))
    const first = await finishRehearsal({ ...ok, jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
    expect(first.code).toBe(0)
    const target = path.join(d.outDir, EXPECTED_NAME)
    const original = await readFile(target, 'utf8')
    const second = await finishRehearsal({ ...ok, jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
    expect(second.code).not.toBe(0)
    expect(second.message).toContain(target)
    expect(await readFile(target, 'utf8')).toBe(original)
    expect(await files(d.outDir)).toEqual([EXPECTED_NAME])
  })

  it('[FE-O08-S08] dirty：寫到 dirtyDir、首行寫明，outDir 裡沒有新檔', async () => {
    const d = await dirs()
    await writeFile(d.jsonPath, JSON.stringify(vitestJson(SAMPLE)))
    const r = await finishRehearsal({ ...ok, dirty: true, jsonPath: d.jsonPath, outDir: d.outDir, dirtyDir: d.dirtyDir })
    expect(r.code).toBe(0)
    expect(await files(d.outDir)).toEqual([])
    expect(await files(d.dirtyDir)).toEqual([EXPECTED_NAME])
    const body = await readFile(path.join(d.dirtyDir, EXPECTED_NAME), 'utf8')
    expect(body.split('\n')[0]).toMatch(/dirty/)
  })

  it('[FE-O08-S08] 預設的 dirtyDir 是 /.local/rehearsal/ 且已 gitignore；預設的 outDir 是 docs/evidence/fe-o08', async () => {
    const root = path.resolve(__dirname, '..')
    expect(path.relative(root, DIRTY_DIR)).toBe(path.join('.local', 'rehearsal'))
    expect(path.relative(root, REPORT_DIR)).toBe(path.join('docs', 'evidence', 'fe-o08'))
    const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8')
    expect(gitignore.split('\n')).toContain('/.local/rehearsal/')
  })
})
