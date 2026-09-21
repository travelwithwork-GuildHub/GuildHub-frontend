import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIMITS, LIMIT_SOURCES } from '@/api/contract/limits'
import { ChatIn, ChatOut } from '@/api/contract/ws'
import { CHAT_BODY_BUDGET, CHAT_KEEP, EMPTY_CHAT, appendChat } from '@/realtime/sceneChat'
import { importGraph, importSpecifiers, stripComments } from './lib/importGraph'

// 規格：openspec/changes/fe-r11-realtime-chat/specs/scene-chat-transport/spec.md
//   Requirement: 目前場景最多留 100 筆、每則最多保留 2000 code point；不用 Web Storage、不呼叫 REST —— S04、S05（靜態邊界那段；列表的可觀察形式在 K04 的 e2e）
//   Requirement: `LIMITS` 如實記錄 chat body 沒有後端限制；契約 schema 不加任何長度檢查 —— S09
//
// **不連任何外部服務。** reducer 是純函式；靜態邊界用 TypeScript 的 AST 走 `src/` 的 import 圖（`tests/lib/importGraph.ts`）。

const chat = (n: number, body = `訊息 ${n}`): ChatOut => ({ t: 'chat', id: `u-${n}`, name: `人 ${n}`, body })

describe('記憶體', () => {
  it('[FE-R11-S04] 第 101 筆淘汰最舊的：恰好 100 筆、第一筆是 2、最後一筆是 101', () => {
    let log = EMPTY_CHAT
    for (let n = 1; n <= 101; n += 1) log = appendChat(log, chat(n))
    expect(log).toHaveLength(CHAT_KEEP)
    expect(log).toHaveLength(100)
    expect(log[0]?.body).toBe('訊息 2')
    expect(log.at(-1)?.body).toBe('訊息 101')
    // 順序＝接收順序，中間沒有被動過
    expect(log.map((r) => r.body)).toEqual(Array.from({ length: 100 }, (_, i) => `訊息 ${i + 2}`))
  })

  it('[FE-R11-S04] 2001 個 code point（含 emoji）只留前 2000、標 truncated；剛好 2000 原值、不標', () => {
    // 交錯的 emoji 讓 `.length`（UTF-16 code unit）與 code point 數不同：用 .length 截會切到半個 emoji，或多留／少留。
    const unit = '😀字'
    const long = unit.repeat(1000) + '尾' // 2001 code point
    const exact = unit.repeat(1000) // 2000 code point
    expect([...long]).toHaveLength(2001)
    expect(long.length, 'emoji 讓 .length 跟 code point 數不同').not.toBe(2001)
    const log = appendChat(appendChat(EMPTY_CHAT, chat(1, long)), chat(2, exact))
    expect(log[0]?.truncated).toBe(true)
    expect([...(log[0]?.body ?? '')]).toHaveLength(CHAT_BODY_BUDGET)
    expect(log[0]?.body).toBe(unit.repeat(1000))
    expect(log[1]?.truncated).toBe(false)
    expect(log[1]?.body).toBe(exact)
    // 那一則仍是一筆紀錄（不丟）；name／id 沒有預算、原值
    expect(log).toHaveLength(2)
    expect(log[0]?.name).toBe('人 1')
    expect(log[0]?.id).toBe('u-1')
  })
})

describe('靜態邊界', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const entries = readdirSync(path.join(root, 'src/realtime')).filter((f) => f.startsWith('sceneChat')).map((f) => path.join(root, 'src/realtime', f))

  it('[FE-R11-S05] src/realtime/sceneChat* 的 import 圖不到 operations／transport／recoveryKey／roomTokens；原始碼沒有 storage 字樣', () => {
    expect(entries.length, '要有 sceneChat 模組').toBeGreaterThan(0)
    const forbidden = ['src/api/operations', 'src/api/transport', 'src/identity/recoveryKey', 'src/world/scenes/roomTokens']
    for (const entry of entries) {
      const graph = [...importGraph(entry)].map((f) => path.relative(root, f))
      expect(graph, `${path.relative(root, entry)} 的 import 圖`).toContain(path.relative(root, entry))
      for (const bad of forbidden) expect(graph.some((f) => f.startsWith(bad)), `${path.relative(root, entry)} 的 import 圖到達了 ${bad}`).toBe(false)
      for (const file of importGraph(entry)) {
        // 註解不算（規格說的是原始碼；一句「不用 localStorage」的註解不該讓它紅）。
        const code = stripComments(readFileSync(file, 'utf8'), file)
        for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) expect(code.includes(word), `${path.relative(root, file)} 出現了 ${word}`).toBe(false)
      }
    }
  })

  it('靜態邊界的尺本身不是恆真：一個真的碰 REST 的模組會被抓到；require／import = require／import() 都算、import type 與註解不算（對照組）', () => {
    const graph = [...importGraph(path.join(root, 'src/api/operations.ts'))].map((f) => path.relative(root, f))
    expect(graph.some((f) => f.startsWith('src/api/transport'))).toBe(true)
    const specs = importSpecifiers(
      [
        "import { a } from '@/api/operations'",
        "import type { T } from '@/only-type'",
        "import { type U, v } from '@/mixed'",
        "export * from './re-export'",
        "export type { W } from './type-re-export'",
        "import eq = require('./import-equals')",
        "const r = require('./cjs')",
        "const d = await import('./dynamic')",
        "// import { z } from '@/in-comment'",
        "const s = \"import { y } from '@/in-string'\"",
      ].join('\n'),
    )
    expect(specs).toEqual(['@/api/operations', '@/mixed', './re-export', './import-equals', './cjs', './dynamic'])
    expect(stripComments("const a = 1 // sessionStorage\n/* localStorage */ const b = 2")).not.toMatch(/sessionStorage|localStorage/)
    expect(stripComments("const k = 'sessionStorage'")).toContain('sessionStorage')
  })
})

describe('chat body 的送出上限是 relay 的 500，不是 parse 約束', () => {
  it('[FE-R11-S11] LIMITS.chatBody 是 {0, 500}、來源是閘道 relay 實測；ChatIn／ChatOut 的 body 沒有長度 checks；501 字與空字串仍通過 safeParse', () => {
    expect(LIMITS.chatBody).toEqual({ min: 0, max: 500 })
    // 來源是「閘道 relay 實測 len>500 靜默丟棄」—— 不是把 500 冒充成 wire schema / parse 的限制
    expect(LIMIT_SOURCES.chatBody.source).toContain('relay')
    expect(LIMIT_SOURCES.chatBody.source).toContain('500')
    // 自省：Zod 的長度 checks 仍是空的（丟棄是 relay 政策、不是 parse 拒絕；不拿有限樣本猜）
    const checksOf = (schema: unknown) => {
      const def = (schema as { _def?: { checks?: Array<{ _zod?: { def?: { check?: string } }; kind?: string; check?: string }> } })._def
      return (def?.checks ?? []).map((c) => c._zod?.def?.check ?? c.kind ?? c.check ?? 'unknown')
    }
    for (const [label, schema] of [
      ['ChatIn.body', ChatIn.shape.body],
      ['ChatOut.body', ChatOut.shape.body],
    ] as const) {
      const checks = checksOf(schema)
      expect(checks.filter((c) => /min|max|length/i.test(String(c))), `${label} 不得有長度 checks`).toEqual([])
    }
    // 對照：自省的尺認得出 checks —— 一個有 max 的 schema 要被列出來
    expect(checksOf(ChatIn.shape.body.max(5)).some((c) => /max|length/i.test(String(c)))).toBe(true)
    // 501 code point（超過送出上限 500）仍 SHALL 通過 parse —— 長度擋在 composer 送出守門，不在 wire schema
    expect(ChatIn.safeParse({ t: 'chat', body: '字'.repeat(501) }).success).toBe(true)
    expect(ChatIn.safeParse({ t: 'chat', body: '' }).success).toBe(true)
    expect(ChatOut.safeParse({ t: 'chat', id: 'x', name: '', body: '' }).success).toBe(true)
  })
})
