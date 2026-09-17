import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as rest from '../src/api/contract/rest'
import { EXPECTATIONS, type Expectation } from './rehearsal/expectations'

// 規格：openspec/changes/fe-o08-guildhub-rehearsal/specs/switch-rehearsal/spec.md
//   Requirement: 閉環的每一步都對照期望表 —— S03（step 的 key 集合）
//   Requirement: 已知行為釘成觀測基線 —— S06（期望表的形狀）
//   Requirement: README 的差異清單跟期望表一致 —— S09
//
// 期望表是唯一來源（design D2）：README 三節各自跟它的 `(key, owner)` 集合相等，owner 寫錯也紅。
// 不連網、不寫檔；只讀 repo 裡的 README。

const README = path.resolve(__dirname, '..', 'docs', 'evidence', 'fe-o08', 'README.md')

/** 規格〈閉環的每一步都對照期望表〉那張表的十三個 key，照順序。 */
const STEP_KEYS = [
  'login-owner',
  'login-member',
  'create',
  'list-contains',
  'get',
  'form-team',
  'rooms-contains',
  'enter',
  'seats-empty',
  'seat-claim',
  'message',
  'close',
  'rooms-excludes',
]

/** 規格〈已知行為釘成觀測基線〉那張表的十條與各自的 kind，照順序（審查抓到：只鎖 step 的話，把 contract 改成 anomaly 並同步 README 仍綠）。 */
const BASELINES: [string, 'contract' | 'anomaly'][] = [
  ['create-unvalidated', 'anomaly'],
  ['list-default-recruiting', 'contract'],
  ['form-team-repeat', 'contract'],
  ['form-team-after-close', 'anomaly'],
  ['seat-409-detail', 'contract'],
  ['seat-out-of-range', 'contract'],
  ['owner-needs-enter', 'contract'],
  ['close-idempotent', 'contract'],
  ['close-clears-seats', 'contract'],
  ['close-keeps-token', 'anomaly'],
]

const KINDS = new Set(['step', 'contract', 'anomaly'])

describe('期望表的形狀', () => {
  it('[FE-O08-S06] 每一條有 kind／report 布林／FE- 開頭的 owner', () => {
    const problems: string[] = []
    for (const e of EXPECTATIONS as readonly Partial<Expectation>[]) {
      if (typeof e.key !== 'string' || !e.key) problems.push(`有一條沒有 key：${JSON.stringify(e)}`)
      if (!KINDS.has(e.kind as string)) problems.push(`\`${e.key}\` 的 kind 是 ${JSON.stringify(e.kind)}`)
      if (typeof e.report !== 'boolean') problems.push(`\`${e.key}\` 的 report 不是布林：${JSON.stringify(e.report)}`)
      if (typeof e.owner !== 'string' || !/^FE-[A-Z]\d{2}$/.test(e.owner)) problems.push(`\`${e.key}\` 的 owner 不是 FE- 開頭的工作項目 ID：${JSON.stringify(e.owner)}`)
      // step 的回應要通過的 schema 必須真的是 rest.ts 匯出的、而且是能 parse 的 zod schema（打錯名字、指到別的匯出，在這裡紅，不是在 --flow 的 undefined.parse）。
      const name = e.schema?.replace(/\[\]$/, '') ?? ''
      const candidate = (rest as Record<string, unknown>)[name]
      if (e.kind === 'step' && typeof (candidate as { parse?: unknown } | undefined)?.parse !== 'function') problems.push(`\`${e.key}\` 的 schema ${JSON.stringify(e.schema)} 不是 src/api/contract/rest.ts 匯出的 zod schema`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('[FE-O08-S06] 所有 anomaly 的 report 都是 true', () => {
    const wrong = EXPECTATIONS.filter((e) => e.kind === 'anomaly' && e.report !== true).map((e) => e.key)
    expect(wrong, `anomaly 而 report 不是 true：${wrong.join('、')}`).toEqual([])
  })

  it('[FE-O08-S06] key 不重複', () => {
    const seen = new Set<string>()
    const dup = EXPECTATIONS.map((e) => e.key).filter((k) => (seen.has(k) ? true : (seen.add(k), false)))
    expect(dup, `重複的 key：${dup.join('、')}`).toEqual([])
  })
})

describe('閉環十三步', () => {
  it('[FE-O08-S03] 標為 step 的 key 恰好是規格那張表的十三個、照順序', () => {
    const steps = EXPECTATIONS.filter((e) => e.kind === 'step').map((e) => e.key)
    expect(steps).toEqual(STEP_KEYS)
  })

  it('[FE-O08-S06] 其餘的 key 恰好是規格那張表的十條基線、kind 各自對上', () => {
    const baselines = EXPECTATIONS.filter((e) => e.kind !== 'step').map((e) => [e.key, e.kind])
    expect(baselines).toEqual(BASELINES)
  })
})

/** README 裡 `## <heading>` 到下一個 `## ` 之間的內容；沒有那一節就拋錯（訊息含節名）。 */
function section(md: string, heading: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`)
  if (start < 0) throw new Error(`README 沒有〈${heading}〉這一節`)
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}

/**
 * 一節裡表格列的 `(key, owner)`：`| \`key\` | FE-Xnn | …`。凡是含 `|` 的行都當表格列（GFM 允許省掉首尾的 `|`、
 * 前面加 1–3 個空白 —— 審查抓到：只認 `|` 開頭的話，這種列會從比對裡消失）；只略過表格**開頭**的 header（第一格是 `key`）
 * 與緊接的分隔列 —— 進到資料列之後再出現這兩種內容也拋（審查抓到：任何位置都略過的話，`| --- | FE-J01 |` 是一列看不見的幽靈）；
 * 其他解析不出 `(key, owner)` 的列直接拋（沒反引號的幽靈列、少一格的列），訊息含節名與那一列。
 * 同一節列兩次同一個 key 也拋（`Map.set` 會靜默蓋掉，集合大小照樣相等）。
 */
function listed(heading: string, body: string): Map<string, string> {
  const out = new Map<string, string>()
  let at: 'header' | 'separator' | 'rows' = 'header'
  for (const line of body.split('\n')) {
    if (!line.includes('|')) continue
    const [first = '', second = ''] = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    if (at === 'header' && first === 'key') { at = 'separator'; continue }
    if (at === 'separator' && /^:?-+:?$/.test(first)) { at = 'rows'; continue }
    if (at !== 'rows') throw new Error(`〈${heading}〉的表格開頭不是 header ＋ 分隔列：${line}`)
    const key = /^`([^`]+)`$/.exec(first)?.[1]
    const owner = /^FE-[A-Z]\d{2}$/.test(second) ? second : undefined
    if (!key || !owner) throw new Error(`〈${heading}〉有一列解析不出 (key, owner)：${line}`)
    if (out.has(key)) throw new Error(`〈${heading}〉把 \`${key}\` 列了兩次`)
    out.set(key, owner)
  }
  return out
}

/** 兩邊比對；每一條問題都寫明節名與 key。 */
function diff(heading: string, want: readonly Expectation[], got: Map<string, string>): string[] {
  const problems: string[] = []
  const wantMap = new Map(want.map((e) => [e.key, e.owner]))
  for (const [key, owner] of wantMap) {
    const listedOwner = got.get(key)
    if (listedOwner === undefined) problems.push(`〈${heading}〉少了 \`${key}\`（期望表 owner ${owner}）`)
    else if (listedOwner !== owner) problems.push(`〈${heading}〉的 \`${key}\` owner 寫成 ${listedOwner}，期望表是 ${owner}`)
  }
  for (const key of got.keys()) {
    if (!wantMap.has(key)) problems.push(`〈${heading}〉多了 \`${key}\` —— 期望表這一類裡沒有它`)
  }
  return problems
}

describe('README 三節跟期望表一致', () => {
  const SECTIONS: [string, (e: Expectation) => boolean][] = [
    ['前端要相容的契約', (e) => e.kind === 'contract'],
    ['送回後端裁定的異常', (e) => e.kind === 'anomaly'],
    ['送回後端', (e) => e.report === true],
  ]

  it.each(SECTIONS)('[FE-O08-S09] 〈%s〉的 (key, owner) 集合跟期望表相等', async (heading, pick) => {
    const md = await readFile(README, 'utf8')
    const problems = diff(heading, EXPECTATIONS.filter(pick), listed(heading, section(md, heading)))
    expect(problems, problems.join('\n')).toEqual([])
  })
})
