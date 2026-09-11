import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import type { ValidationError } from '@/api/contract/errors'
import { AdapterNotImplementedError, ContractDriftError, HttpError, NetworkError } from '@/api/transport'
import { VOCABULARY, toUiError, type UiErrorKind } from '@/errors/uiError'

// 規格：openspec/changes/fe-x03-error-vocabulary/specs/error-vocabulary/spec.md
//   Requirement: 每一個失敗都有一個封閉種類，而且翻譯永遠不拋 —— S01–S10、S17、S19、S20
//   Requirement: 使用者看到的那一句話來自唯一一份語彙表，而且是安全的 —— S11–S13
//   Requirement: 結構化的細節保留給要用它的人 —— S14／S15
//   Requirement: 翻譯入口只有一個 —— S16／S18
//
// **不連任何外部服務** —— 輸入全部直接建構。

const http = (status: number, detail: HttpError['detail'] = null) => new HttpError('op', status, detail)
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/**
 * 規格裡的 11 種，**逐字獨立列出** —— 不從語彙表推。
 * 從受測物推出來的預期值是循環的：語彙表少一種、翻譯器也少一種，那樣的判準照樣綠。
 * `satisfies` 讓這張表跟型別對不上時 typecheck 先紅。
 */
const EXPECTED_KINDS = [
  'authentication-required',
  'permission-denied',
  'not-found',
  'conflict',
  'validation',
  'request-rejected',
  'server-error',
  'network-unavailable',
  'contract-drift',
  'aborted',
  'unexpected',
] as const satisfies readonly UiErrorKind[]

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

  it('[FE-X03-S08] fetch 拿到回應之前的失敗（send() 包成 NetworkError）是「連不上」', () => {
    expect(toUiError(new NetworkError('op', new TypeError('fetch failed'))).kind).toBe('network-unavailable')
  })

  it('[FE-X03-S19] 程式自己的 TypeError 不是「連不上」', () => {
    // ⚠️ `fetch` 自己 reject 的也是 `TypeError`。用 `instanceof TypeError` 分的話，
    // 每一個屬性讀取錯誤都會被說成「檢查一下網路」—— 實作審查兩邊都擋在這一點。
    expect(toUiError(new TypeError("Cannot read properties of undefined (reading 'x')")).kind).toBe('unexpected')
  })

  it('[FE-X03-S20] 不在 400–599 的 status 是「預期之外」', () => {
    for (const status of [200, 399, 600, Number.NaN]) {
      expect(toUiError(http(status)).kind, `status ${status}`).toBe('unexpected')
    }
  })

  it('[FE-X03-S09] 契約漂移是「收到的資料不對」', () => {
    const drift = new ContractDriftError('op', [{ code: 'custom', path: ['x'], message: 'bad' }])
    expect(toUiError(drift).kind).toBe('contract-drift')
  })

  it('[FE-X03-S17] 被中止的請求是「已取消」，不是錯誤；同名的純物件不是', () => {
    expect(toUiError(new DOMException('The operation was aborted.', 'AbortError')).kind).toBe('aborted')
    // 認名字是因為 `DOMException` 在 jsdom 與瀏覽器裡不是同一個 class —— 但要是一個 `Error`。
    expect(toUiError({ name: 'AbortError' }).kind, '純物件被當成了取消').toBe('unexpected')
  })

  it('[FE-X03-S10] 認不得的東西不會讓翻譯器拋錯，而且都是「預期之外」', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('不准讀')
        },
        // `instanceof` 走的是這一個 —— 只包 getter 擋不住它（design D8）。
        getPrototypeOf() {
          throw new Error('不准看原型')
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
      toUiError(new NetworkError('op', null)).kind,
      toUiError(new ContractDriftError('op', [])).kind,
      toUiError(new DOMException('x', 'AbortError')).kind,
      toUiError(null).kind,
    ])
    // 兩邊各自對規格那張表：語彙表的鍵、翻譯器產得出來的種類。
    expect(Object.keys(VOCABULARY).sort()).toEqual([...EXPECTED_KINDS].sort())
    expect([...produced].sort()).toEqual([...EXPECTED_KINDS].sort())
    for (const kind of EXPECTED_KINDS) expect(VOCABULARY[kind].trim(), `${kind} 的句子是空的`).not.toBe('')
  })

  it('[FE-X03-S12] 帶哨兵的內臟不會漏進 message', () => {
    const SENTINEL = 'SENTINEL-內臟-9f3a'
    const inputs: unknown[] = [
      new Error(`Unhandled ${SENTINEL} at line 3`),
      new ContractDriftError('op', [{ code: 'custom', path: ['field'], message: SENTINEL }]),
      http(500, `Internal Server Error ${SENTINEL}`),
      new NetworkError('op', new TypeError(`fetch failed: ${SENTINEL}`)),
    ]
    for (const input of inputs) {
      expect(toUiError(input).message, '原始錯誤的內容漏進了使用者看得到的句子').not.toContain(SENTINEL)
    }
  })

  it('[FE-X03-S13] 每一種的 message 互不相同', () => {
    const messages = EXPECTED_KINDS.map((k) => VOCABULARY[k])
    expect(new Set(messages).size, '有兩種 kind 寫成了同一句話 —— 那是把兩種情況合併了').toBe(
      EXPECTED_KINDS.length,
    )
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
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  // 用 `lintText` 帶虛擬路徑，理由同 `no-fetch-rule.test.ts`。第一次載 config 會超過 5 秒。
  const ROOT = path.resolve(import.meta.dirname, '..')
  const LINT_TIMEOUT = 60_000
  async function boundaryHits(filePath: string, code: string) {
    const eslint = new ESLint({ cwd: ROOT })
    const [result] = await eslint.lintText(code, { filePath })
    if (!result) throw new Error(`ESLint 沒有回傳 ${filePath} 的結果`)
    return result.messages.filter((m) => m.message.includes('只能在 src/api/ 與 src/errors/ 引用'))
  }

  it.each([
    ['具名 import', "import { HttpError } from '@/api/transport'\nexport const x = HttpError\n"],
    ['改名', "import { HttpError as H } from '@/api/transport'\nexport const x = H\n"],
    ['NetworkError 也一樣', "import { NetworkError } from '@/api/transport'\nexport const x = NetworkError\n"],
    ['整個模組', "import * as t from '@/api/transport'\nexport const x = t.HttpError\n"],
    ['再匯出', "export { HttpError } from '@/api/transport'\n"],
    ['全部再匯出', "export * from '@/api/transport'\n"],
  ])('[FE-X03-S16] src/api/ 與 src/errors/ 以外 import HttpError（%s）會讓 lint 紅', async (_label, code) => {
    const hits = await boundaryHits('src/world/rooms/Sneaky.tsx', code)
    expect(hits.length, '這種寫法躲過了 import 邊界').toBeGreaterThan(0)
    expect(hits[0]?.severity).toBe(2)
  }, LINT_TIMEOUT)

  it('[FE-X03-S16] 同一段程式碼放在 src/errors/ 或 src/api/ 底下就通過 —— 差別只在路徑', async () => {
    // 成對：只斷言「這裡沒報錯」的話，規則整個沒載入時也綠。
    const code = "import { HttpError } from '@/api/transport'\nexport const x = HttpError\n"
    expect((await boundaryHits('src/world/rooms/Sneaky.tsx', code)).length).toBeGreaterThan(0)
    expect(await boundaryHits('src/errors/other.ts', code)).toHaveLength(0)
    expect(await boundaryHits('src/api/other.ts', code)).toHaveLength(0)
  }, LINT_TIMEOUT)

  it('[FE-X03-S16] 假的 src/errors 目錄不算', async () => {
    const code = "import { HttpError } from '@/api/transport'\nexport const x = HttpError\n"
    expect((await boundaryHits('src/world/src/errors/sneaky.ts', code)).length).toBeGreaterThan(0)
  }, LINT_TIMEOUT)

  it('[FE-X03-S16] 那個 src/** 的區塊沒有把 process.env 的守衛丟掉', async () => {
    // flat config 是整條覆蓋：這個區塊帶著自己的 selector 清單，少帶 env 那三個的話，
    // src/api/ 與 src/errors/ 以外的檔案就沒有人擋 `process.env` 了（`FE-O09`）。
    const eslint = new ESLint({ cwd: ROOT })
    const [result] = await eslint.lintText('export const x = process.env.NEXT_PUBLIC_X\n', {
      filePath: 'src/world/rooms/Env.tsx',
    })
    expect(result?.messages.some((m) => m.message.includes('環境變數只能在'))).toBe(true)
  }, LINT_TIMEOUT)

  it('[FE-X03-S18] 身分層依 kind 分辨訪客，原始碼不含 .status', () => {
    // 行為那一半（401 → 訪客）由 `identity-resolve.test.ts` 的 FE-A01 判準守著，這裡守形式。
    const source = stripComments(readFileSync('src/identity/session.ts', 'utf8'))
    expect(source, 'session.ts 又自己讀 status 了').not.toMatch(/\.status\b/)
    expect(source).toMatch(/toUiError/)
  })
})
