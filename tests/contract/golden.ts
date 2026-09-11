import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

/** 一條一檔的檔名：可讀的前綴 ＋ 名稱的雜湊 —— 不同名稱不會撞同一個檔（`safeName` 不是一對一，審查抓到的）。 */
const fileNameFor = (name: string) => `${name.replace(/[^\w.-]+/g, '_').slice(0, 60)}.${createHash('sha1').update(name).digest('hex').slice(0, 8)}.json`

/** 對 golden 比（或錄）。 */
export function checkGolden(name: string, r: RawResponse): void {
  const observed = normalize(r)
  if (recording()) {
    mkdirSync(RECORDING_DIR, { recursive: true })
    writeFileSync(path.join(RECORDING_DIR, fileNameFor(name)), JSON.stringify({ name, observed }))
    return
  }
  const g = loadGolden().cases[name]
  if (g === undefined) throw new Error(`golden 沒有「${name}」—— 先用 CONTRACT_RECORD=1 對 guildhub 錄一次。`)
  // 有 detail 的每一項要先過契約的 schema；然後**整個正規化後的形狀**相等 —— golden 沒有 detail 而回應多出來，一樣紅（審查抓到的）。
  if (observed.detail !== undefined) {
    const detail = (r.json as { detail: unknown[] }).detail
    for (const item of detail) expect(ValidationError.safeParse(item).success, `${name}：${JSON.stringify(item)}`).toBe(true)
  }
  expect(observed, `${name}：形狀（status／content-type／整個 detail）`).toEqual(g)
}

/** golden 檔的 metadata 是程式內的常數：重錄**完全不讀舊檔**，舊檔壞掉也修得回來。 */
const NOTE =
  '對真後端（FastAPI）實錄；`CONTRACT_RECORD=1 npm run test:contract:guildhub` 重錄（錄製那一次 exit 非 0，整組換掉）。' +
  '比 status、contentType、整個 detail 的 type／loc；msg 不比（Pydantic 的英文訊息不是契約）。規格 FE-O05 S12／S16。'
/** 時間字串：Pydantic 微秒非 0 時 6 位＋Z，為 0 時省略小數（實錄 2026-09-11：`2026-09-11T13:00:33.281950Z`）。 */
const TIMESTAMP = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{6})?Z$'
const TIMESTAMP_EXAMPLE = '2026-09-11T13:00:33.281950Z'

/** teardown（harness）用：把 `.recording/` 組回 `422.json`，整個 `cases` 換掉；寫到暫存檔再 rename（中斷不留半份）；沒有錄到任何東西就不動檔案。 */
export function assembleRecordings(): number {
  if (!existsSync(RECORDING_DIR)) return 0
  const files = readdirSync(RECORDING_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) return 0
  const cases: Record<string, GoldenCase> = {}
  for (const f of files.sort()) {
    const { name, observed } = JSON.parse(readFileSync(path.join(RECORDING_DIR, f), 'utf8')) as { name: string; observed: GoldenCase }
    if (name in cases) throw new Error(`錄到兩條同名的 golden：「${name}」`)
    cases[name] = observed
  }
  const next: GoldenFile = { _note: NOTE, cases, timestamp: TIMESTAMP, timestamp_example: TIMESTAMP_EXAMPLE }
  const tmp = `${GOLDEN_FILE}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(tmp, GOLDEN_FILE)
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
