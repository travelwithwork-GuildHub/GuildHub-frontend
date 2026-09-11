import type { z } from 'zod'
import type { ValidationError } from '@/api/contract/errors'

// 把「請求哪裡不對」翻成 **Pydantic／FastAPI 的 422 形狀**。規格 `FE-O03`〈每個 handler 走同一條管線，錯誤形狀複製真後端〉。
//
// 形狀對著 `tests/contract/golden/422.json`（對真後端實錄）寫，不是假設 Zod 的 `code/path/message` 自然等價（design `D3`）：
//   body 不是 JSON                 → { type: 'json_invalid',          loc: ['body', 0] }
//   body 是字面 null               → { type: 'missing',               loc: ['body'] }
//   body 不是物件（或缺 Content-Type，FastAPI 把整段當字串）→ { type: 'model_attributes_type', loc: ['body'] }
//   欄位型別錯（給 123 要 string）  → { type: 'string_type',           loc: ['body', 'nickname'] }
//   uuid 格式錯                    → { type: 'uuid_parsing',          loc: ['body', 'resume_token'] }
//   model_validator（剛好一組）     → { type: 'value_error',           loc: ['body'], msg: 'Value error, …' }
//   query 的 int 解析失敗           → { type: 'int_parsing',           loc: ['query', 'page'] }
//   query 的 enum 不在集合裡        → { type: 'enum',                  loc: ['query', 'status'] }
// `msg` 的字句不是契約（`FE-O05` 只比 `loc[0]` 與 `type`），但能照抄的就照抄。

export class ValidationFailure extends Error {
  override name = 'ValidationFailure'
  constructor(readonly errors: ValidationError[]) {
    super('422')
  }
}

type Where = 'body' | 'query' | 'path'

/** 讀 body：不是 JSON、字面 null、不是物件 → 各自的 422。回傳解析出來的物件。 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  const contentType = request.headers.get('content-type') ?? ''
  // FastAPI 對沒有 JSON Content-Type 的 body 不解析，整段當成一個字串值 → model_attributes_type（實錄）。
  if (!/application\/json/i.test(contentType)) {
    if (text === '') throw new ValidationFailure([{ type: 'missing', loc: ['body'], msg: 'Field required', input: null }])
    throw new ValidationFailure([modelAttributesType(text)])
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new ValidationFailure([
      { type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error', input: {}, ctx: { error: 'Expecting value' } },
    ])
  }
  if (value === null) throw new ValidationFailure([{ type: 'missing', loc: ['body'], msg: 'Field required', input: null }])
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationFailure([modelAttributesType(value)])
  return value as Record<string, unknown>
}

function modelAttributesType(input: unknown): ValidationError {
  return { type: 'model_attributes_type', loc: ['body'], msg: 'Input should be a valid dictionary or object to extract fields from', input }
}

/** Zod 的 issue → Pydantic 的一筆。`where` 決定 `loc[0]`。 */
export function toValidationErrors(issues: readonly z.core.$ZodIssue[], where: Where, input: unknown): ValidationError[] {
  return issues.map((issue) => {
    const loc: Array<string | number> = [where, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))]
    const at = fieldValue(input, issue.path)
    switch (issue.code) {
      case 'invalid_type':
        return { type: `${issue.expected}_type`, loc, msg: `Input should be a valid ${issue.expected}`, input: at }
      case 'invalid_format':
        if (issue.format === 'uuid') return { type: 'uuid_parsing', loc, msg: 'Input should be a valid UUID', input: at, ctx: { error: 'invalid format' } }
        return { type: `${issue.format}_parsing`, loc, msg: issue.message, input: at }
      case 'invalid_value':
        return { type: 'enum', loc, msg: `Input should be ${issue.values.map((v) => `'${String(v)}'`).join(', ')}`, input: at, ctx: { expected: issue.values.map((v) => `'${String(v)}'`).join(', ') } }
      case 'custom':
        // model_validator：錯在整個 body，不在某個欄位（實錄 `loc: ["body"]`）。
        return { type: 'value_error', loc: [where], msg: `Value error, ${issue.message}`, input, ctx: { error: {} } }
      default:
        return { type: issue.code, loc, msg: issue.message, input: at }
    }
  })
}

function fieldValue(input: unknown, path: readonly PropertyKey[]): unknown {
  let cur: unknown = input
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<PropertyKey, unknown>)[key]
  }
  return cur
}

/** 以 schema 解析，失敗就拋 422。 */
export function parseOr422<T>(schema: z.ZodType<T>, input: unknown, where: Where): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw new ValidationFailure(toValidationErrors(result.error.issues, where, input))
}

/**
 * query 的整數：FastAPI 的 `int` 收 `"3"`、`"-1"`、`" 7 "`，拒 `"abc"`、`"1.5"`、`""`。
 * 缺席回預設值。這裡不做 Zod coerce（`Number('1.5')` 是 1.5，`parseInt('1.5')` 是 1 —— 兩個都不是 422）。
 */
export function queryInt(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key)
  if (raw === null) return fallback
  if (!/^\s*-?\d+\s*$/.test(raw)) {
    throw new ValidationFailure([
      { type: 'int_parsing', loc: ['query', key], msg: 'Input should be a valid integer, unable to parse string as an integer', input: raw },
    ])
  }
  return Number(raw)
}

/** query 的 enum。缺席回預設值。 */
export function queryEnum<const T extends readonly string[]>(params: URLSearchParams, key: string, values: T, fallback: T[number]): T[number] {
  const raw = params.get(key)
  if (raw === null) return fallback
  if (!(values as readonly string[]).includes(raw)) {
    const expected = values.map((v) => `'${v}'`).join(', ')
    throw new ValidationFailure([{ type: 'enum', loc: ['query', key], msg: `Input should be ${expected}`, input: raw, ctx: { expected } }])
  }
  return raw as T[number]
}

/**
 * Pydantic 的 uuid 解析**接受的不只標準形**（對真後端的 pydantic 實測）：`8-4-4-4-12`、32 位無連字號、`{…}`、`urn:uuid:…` 都收；
 * 少一位、多一位、亂字 → 422。這裡照它收，回 canonical 小寫 —— 自己縮窄的話 guildhub 是 404 而 internal 是 422（審查抓到的）。
 */
export function parseUuidLikePydantic(raw: string): string | null {
  let s = raw.trim()
  if (/^urn:uuid:/i.test(s)) s = s.slice(9)
  if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1)
  const hex = s.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null
  // 有連字號的話位置要對（`8-4-4-4-12`）。
  if (s.includes('-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return null
  const h = hex.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** 路徑參數的 uuid：FastAPI 對 `uuid.UUID` 的路徑參數驗證失敗回 422，`loc: ["path", "<name>"]`。 */
export function pathUuid(params: Record<string, string>, name: string): string {
  const raw = params[name] ?? ''
  const id = parseUuidLikePydantic(decodeURIComponent(raw))
  if (id === null) {
    throw new ValidationFailure([{ type: 'uuid_parsing', loc: ['path', name], msg: 'Input should be a valid UUID', input: raw, ctx: { error: 'invalid format' } }])
  }
  return id
}
