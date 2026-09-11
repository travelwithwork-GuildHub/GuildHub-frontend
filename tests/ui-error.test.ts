import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ValidationError } from '@/api/contract/errors'
import { AdapterNotImplementedError, ContractDriftError, HttpError } from '@/api/transport'
import { VOCABULARY, toUiError, type UiErrorKind } from '@/errors/uiError'

// 規格：openspec/changes/fe-x03-error-vocabulary/specs/error-vocabulary/spec.md
//   Requirement: 每一個失敗都有一個封閉種類，而且翻譯永遠不拋 —— S01–S10、S17
//   Requirement: 使用者看到的那一句話來自唯一一份語彙表，而且是安全的 —— S11–S13
//   Requirement: 結構化的細節保留給要用它的人 —— S14／S15
//   Requirement: 翻譯入口只有一個 —— S16／S18
//
// **不連任何外部服務** —— 輸入全部直接建構。

const http = (status: number, detail: HttpError['detail'] = null) => new HttpError('op', status, detail)
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** `kind` 聯集的所有成員。**從語彙表的鍵推出來**，型別上 `Record<UiErrorKind, string>` 保證它不多。 */
const KINDS = Object.keys(VOCABULARY) as UiErrorKind[]

describe('每一個失敗都有一個封閉種類', () => {
  it('[FE-X03-S01] 401 是「要登入」', () => {
    expect(toUiError(http(401)).kind).toBe('authentication-required')
  })

  it('[FE-X03-S02] 403 是「沒有權限」，跟 401 不是同一種', () => {
    // ⚠️ 只有 S01 的話，「所有 4xx 都算要登入」全綠 —— 登入了也沒用的人會被一直叫去登入。
    const forbidden = toUiError(http(403))
    const unauthorized = toUiError(http(401))
    expect(forbidden.kind).toBe('permission-denied')
    expect(forbidden.kind, '403 被併進 401 了').not.toBe(unauthorized.kind)
    expect(forbidden.message).not.toBe(unauthorized.message)
  })

  it('[FE-X03-S03] 404 是「找不到」', () => {
    expect(toUiError(http(404)).kind).toBe('not-found')
  })

  it('[FE-X03-S04] 409 是「衝突」', () => {
    expect(toUiError(http(409)).kind).toBe('conflict')
  })

  it('[FE-X03-S05] 422 與 400 是「輸入不合要求」', () => {
    expect(toUiError(http(422)).kind).toBe('validation')
    expect(toUiError(http(400)).kind).toBe('validation')
  })

  it('[FE-X03-S06] 500 到 599 全部是「伺服器出了問題」，不分原因', () => {
    for (const status of range(500, 599)) {
      expect(toUiError(http(status)).kind, `status ${status}`).toBe('server-error')
    }
  })

  it('[FE-X03-S07] 其他 4xx 全部是「請求沒有被接受」', () => {
    // ⚠️ 掃整段：只測 418 與 429 的話，一個把那兩個數字寫死、其餘落到「預期之外」的實作照樣綠。
    const named = new Set([400, 401, 403, 404, 409, 422])
    for (const status of range(400, 499)) {
      if (named.has(status)) continue
      expect(toUiError(http(status)).kind, `status ${status}`).toBe('request-rejected')
    }
  })

  it('[FE-X03-S08] fetch 拿到回應之前的 rejection 是「連不上」', () => {
    // WHATWG fetch：網路層失敗 reject 的是一個 `TypeError`。
    expect(toUiError(new TypeError('fetch failed')).kind).toBe('network-unavailable')
  })

  it('[FE-X03-S09] 契約漂移是「收到的資料不對」', () => {
    const drift = new ContractDriftError('op', [{ code: 'custom', path: ['x'], message: 'bad' }])
    expect(toUiError(drift).kind).toBe('contract-drift')
  })

  it('[FE-X03-S17] 被中止的請求是「已取消」，不是錯誤', () => {
    expect(toUiError(new DOMException('The operation was aborted.', 'AbortError')).kind).toBe('aborted')
  })

  it('[FE-X03-S10] 認不得的東西不會讓翻譯器拋錯，而且都是「預期之外」', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('不准讀')
        },
      },
    )
    const inputs: unknown[] = [
      null,
      undefined,
      42,
      '一個字串',
      // ⚠️ 形狀像 `HttpError` 的純物件**不是** 401 —— 依鴨子型別分類的話，任何帶 `status` 的東西都會被說成 HTTP 錯誤。
      { status: 401, detail: '未登入' },
      new Error('沒有 status 的一般錯誤'),
      new AdapterNotImplementedError('op', 'internal'),
      hostile,
    ]
    for (const input of inputs) {
      // 直接呼叫：拋錯的話這條 it 就紅，不需要另外包 `not.toThrow`。
      expect(toUiError(input).kind, `輸入 ${typeof input}`).toBe('unexpected')
    }
  })
})

describe('使用者看到的那一句話來自唯一一份語彙表', () => {
  it('[FE-X03-S11] 語彙表不多不少：每一種 kind 恰好一句', () => {
    // 型別上 `Record<UiErrorKind, string>` 已經擋「少一鍵」；這裡守「多一鍵」與「空句」。
    // 用翻譯器實際產出的每一種 kind 去對語彙表 —— 產得出來的一定有句子，有句子的一定產得出來。
    const produced = new Set<UiErrorKind>([
      toUiError(http(401)).kind,
      toUiError(http(403)).kind,
      toUiError(http(404)).kind,
      toUiError(http(409)).kind,
      toUiError(http(422)).kind,
      toUiError(http(418)).kind,
      toUiError(http(500)).kind,
      toUiError(new TypeError('x')).kind,
      toUiError(new ContractDriftError('op', [])).kind,
      toUiError(new DOMException('x', 'AbortError')).kind,
      toUiError(null).kind,
    ])
    expect([...produced].sort()).toEqual([...KINDS].sort())
    for (const kind of KINDS) expect(VOCABULARY[kind].trim(), `${kind} 的句子是空的`).not.toBe('')
  })

  it('[FE-X03-S12] 帶哨兵的內臟不會漏進 message', () => {
    const SENTINEL = 'SENTINEL-內臟-9f3a'
    const inputs: unknown[] = [
      new Error(`Unhandled ${SENTINEL} at line 3`),
      new ContractDriftError('op', [{ code: 'custom', path: ['field'], message: SENTINEL }]),
      http(500, `Internal Server Error ${SENTINEL}`),
      new TypeError(`fetch failed: ${SENTINEL}`),
    ]
    for (const input of inputs) {
      expect(toUiError(input).message, '原始錯誤的內容漏進了使用者看得到的句子').not.toContain(SENTINEL)
    }
  })

  it('[FE-X03-S13] 每一種的 message 互不相同', () => {
    const messages = KINDS.map((k) => VOCABULARY[k])
    expect(new Set(messages).size, '有兩種 kind 寫成了同一句話 —— 那是把兩種情況合併了').toBe(KINDS.length)
  })
})

describe('結構化的細節保留給要用它的人', () => {
  const issues: ValidationError[] = [
    { loc: ['body', 'display_name'], msg: '太長', type: 'string_too_long' },
    { loc: ['body', 'bio'], msg: '太長', type: 'string_too_long' },
  ]

  it('[FE-X03-S14] 欄位錯誤原樣可取得，不論 status', () => {
    for (const status of [422, 400]) {
      const out = toUiError(http(status, issues))
      expect(out.issues, `status ${status} 的 issues 被壓平或丟掉了`).toEqual(issues)
      expect(out.kind).toBe('validation')
    }
  })

  it('[FE-X03-S15] 後端的中文 detail 拿得到，但不是 message', () => {
    const cases: Array<[number, string, UiErrorKind]> = [
      [409, '這個座位已經有人了', 'conflict'],
      [422, '未知欄位：["x"]', 'validation'],
    ]
    for (const [status, detail, kind] of cases) {
      const out = toUiError(http(status, detail))
      expect(out.detail).toBe(detail)
      expect(out.message).toBe(VOCABULARY[kind])
      expect(out.message, '後端的句子取代了語彙表').not.toBe(detail)
    }
  })
})

describe('翻譯入口只有一個', () => {
  /** `src/` 底下所有 .ts／.tsx 檔。 */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(name) ? [full] : []
    })
  }
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('[FE-X03-S16] HttpError 只被 src/api/ 與 src/errors/ 引用', () => {
    const offenders = sourceFiles('src').filter((file) => {
      if (file.startsWith('src/api/') || file.startsWith('src/errors/')) return false
      return /\bHttpError\b/.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(offenders, '有人在翻譯入口之外自己認 HttpError —— 第二張對照表就是這樣長出來的').toEqual([])
  })

  it('[FE-X03-S18] 身分層依 kind 分辨訪客，原始碼不含 .status', () => {
    // 行為那一半（401 → 訪客）由 `identity-resolve.test.ts` 的 FE-A01 判準守著，這裡守形式。
    const source = stripComments(readFileSync('src/identity/session.ts', 'utf8'))
    expect(source, 'session.ts 又自己讀 status 了').not.toMatch(/\.status\b/)
    expect(source).toMatch(/toUiError/)
  })
})
