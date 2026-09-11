import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, inject } from 'vitest'
import { ValidationError } from '@/api/contract/errors'
import type { RawResponse } from './client'

// golden：兩個目標共同的裁判。規格 `FE-O05`〈形狀與型別：兩邊一字不差〉（design `D5`）。
//
// compare 模式（預設）：拿回應正規化後的形狀跟 `golden/422.json` 比；**不寫檔**。
// record 模式（harness 提供 `contractRecord`，來自 `CONTRACT_RECORD=1`、只准對 guildhub）：每一條寫成 `.recording/<name>.json`
// （一條一檔，沒有 read-modify-write，跨檔並行也不會互相覆蓋）、**不斷言**；harness 的 teardown 把整組組回 `422.json`
// （整個 `cases` 換掉 —— 改名、刪掉的案例不會殘留）、再以非 0 的 exit code 結束。record 模式不讀舊檔，冷啟動也行。
//
// 比的是**整個** `detail`（每一項的 `type` 與 `loc`）—— 只比 `detail[0]` 的話後端多回一項也過（審查抓到的）。`msg` 不比。

export const GOLDEN_FILE = path.join(__dirname, 'golden', '422.json')
export const RECORDING_DIR = path.join(__dirname, 'golden', '.recording')

export interface GoldenCase {
  status: number
  contentType: string
  /** 422 才有：每一項的 type 與 loc，順序照後端回的。 */
  detail?: Array<{ type: string; loc: Array<string | number> }>
}
export interface GoldenFile {
  _note: string
  cases: Record<string, GoldenCase>
  timestamp: string
  timestamp_example: string
}

export function loadGolden(): GoldenFile {
  return JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as GoldenFile
}

function normalize(r: RawResponse): GoldenCase {
  const contentType = r.contentType.split(';')[0]?.trim() ?? ''
  const detail = (r.json as { detail?: unknown } | undefined)?.detail
  if (Array.isArray(detail)) {
    return {
      status: r.status,
      contentType,
      detail: detail.map((d) => {
        const item = d as { type?: string; loc?: Array<string | number> }
        return { type: item.type ?? '', loc: item.loc ?? [] }
      }),
    }
  }
  return { status: r.status, contentType }
}

/** record 模式下為 true：測試檔裡「錄製時不該斷言」的部分用它跳過。 */
export function recording(): boolean {
  return inject('contractRecord')
}

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_')

/** 對 golden 比（或錄）。 */
export function checkGolden(name: string, r: RawResponse): void {
  const observed = normalize(r)
  if (recording()) {
    mkdirSync(RECORDING_DIR, { recursive: true })
    writeFileSync(path.join(RECORDING_DIR, `${safeName(name)}.json`), JSON.stringify({ name, observed }))
    return
  }
  const g = loadGolden().cases[name]
  if (g === undefined) throw new Error(`golden 沒有「${name}」—— 先用 CONTRACT_RECORD=1 對 guildhub 錄一次。`)
  expect(observed.status, `${name}：status`).toBe(g.status)
  expect(observed.contentType, `${name}：content-type`).toBe(g.contentType)
  if (g.detail !== undefined) {
    const detail = (r.json as { detail: unknown[] }).detail
    for (const item of detail) expect(ValidationError.safeParse(item).success, `${name}：${JSON.stringify(item)}`).toBe(true)
    expect(observed.detail, `${name}：detail 的 type／loc（整個陣列）`).toEqual(g.detail)
  }
}

/** teardown（harness）用：把 `.recording/` 組回 `422.json`，整個 `cases` 換掉；沒有錄到任何東西就不動檔案。 */
export function assembleRecordings(): number {
  if (!existsSync(RECORDING_DIR)) return 0
  const files = readdirSync(RECORDING_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) return 0
  const cases: Record<string, GoldenCase> = {}
  for (const f of files.sort()) {
    const { name, observed } = JSON.parse(readFileSync(path.join(RECORDING_DIR, f), 'utf8')) as { name: string; observed: GoldenCase }
    cases[name] = observed
  }
  const previous = existsSync(GOLDEN_FILE) ? loadGolden() : null
  const next: GoldenFile = {
    _note: previous?._note ?? '對真後端（FastAPI）實錄；`CONTRACT_RECORD=1 npm run test:contract:guildhub` 重錄（錄製那一次 exit 非 0）。比 status、contentType、整個 detail 的 type／loc；msg 不比。規格 FE-O05 S12／S16。',
    cases,
    timestamp: previous?.timestamp ?? '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{6})?Z$',
    timestamp_example: previous?.timestamp_example ?? '',
  }
  writeFileSync(GOLDEN_FILE, `${JSON.stringify(next, null, 2)}\n`)
  rmSync(RECORDING_DIR, { recursive: true, force: true })
  return files.length
}

/** 時間字串的形狀（golden 記的 regex）。 */
export function timestampPattern(): RegExp {
  return new RegExp(loadGolden().timestamp)
}

declare module 'vitest' {
  export interface ProvidedContext {
    contractRecord: boolean
  }
}
