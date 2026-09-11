import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, inject } from 'vitest'
import { ValidationError } from '@/api/contract/errors'
import type { RawResponse } from './client'

// golden：兩個目標共同的裁判。規格 `FE-O05`〈形狀與型別：兩邊一字不差〉（design `D5`）。
//
// compare 模式（預設）：拿回應的 `{status, contentType, loc[0], type, loc}` 跟 `golden/422.json` 比；**不寫檔**。
// record 模式（harness 提供 `contractRecord`，來自 `CONTRACT_RECORD=1`）：把觀察到的形狀寫進去、**不斷言**；
// harness 的 teardown 會以非 0 的 exit code 結束並印「已錄製，不算通過」—— 同一次執行既寫又比是把輸出跟自己比。

const FILE = path.join(__dirname, 'golden', '422.json')

export interface GoldenCase {
  status: number
  contentType?: string
  loc0?: string
  type?: string
  loc?: Array<string | number>
}
interface GoldenFile {
  _note: string
  cases: Record<string, GoldenCase>
  timestamp: string
  timestamp_example: string
}

function load(): GoldenFile {
  return JSON.parse(readFileSync(FILE, 'utf8')) as GoldenFile
}

function observe(r: RawResponse): GoldenCase {
  const contentType = r.contentType.split(';')[0]?.trim()
  const detail = (r.json as { detail?: unknown } | undefined)?.detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: Array<string | number>; type?: string }
    return { status: r.status, contentType, loc0: first.loc?.[0] as string | undefined, type: first.type, loc: first.loc }
  }
  return { status: r.status, contentType }
}

/**
 * 對 golden 比（或錄）。比的是 status、contentType、`loc[0]`、`type`；有 `loc` 的話整個比。
 * `msg` 不比（Pydantic 的英文訊息不是契約）。
 */
export function checkGolden(name: string, r: RawResponse): void {
  const observed = observe(r)
  if (inject('contractRecord')) {
    const file = load()
    file.cases[name] = observed
    writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`)
    return
  }
  const g = load().cases[name]
  if (g === undefined) throw new Error(`golden 沒有「${name}」—— 先用 CONTRACT_RECORD=1 對 guildhub 錄一次。`)
  expect(observed.status, `${name}：status`).toBe(g.status)
  if (g.contentType) expect(observed.contentType, `${name}：content-type`).toBe(g.contentType)
  if (g.status === 422) {
    const detail = (r.json as { detail: unknown[] }).detail
    expect(Array.isArray(detail), `${name}：detail 要是陣列`).toBe(true)
    expect(ValidationError.safeParse(detail[0]).success, `${name}：${JSON.stringify(detail[0])}`).toBe(true)
    expect(observed.loc0, `${name}：loc[0]`).toBe(g.loc0)
    expect(observed.type, `${name}：type`).toBe(g.type)
    if (g.loc) expect(observed.loc, `${name}：loc`).toEqual(g.loc)
  }
}

/** 時間字串的形狀（golden 記的 regex）。 */
export function timestampPattern(): RegExp {
  return new RegExp(load().timestamp)
}

declare module 'vitest' {
  export interface ProvidedContext {
    contractRecord: boolean
  }
}
