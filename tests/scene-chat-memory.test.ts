import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIMITS, LIMIT_SOURCES, UNBOUNDED } from '@/api/contract/limits'
import { ChatIn, ChatOut } from '@/api/contract/ws'
import { CHAT_BODY_BUDGET, CHAT_KEEP, EMPTY_CHAT, appendChat } from '@/realtime/sceneChat'

// 規格：openspec/changes/fe-r11-realtime-chat/specs/scene-chat-transport/spec.md
//   Requirement: 目前場景最多留 100 筆、每則最多保留 2000 code point；不用 Web Storage、不呼叫 REST —— S04、S05（靜態邊界那段；列表的可觀察形式在 K04 的 e2e）
//   Requirement: `LIMITS` 如實記錄 chat body 沒有後端限制；契約 schema 不加任何長度檢查 —— S09
//
// **不連任何外部服務。** reducer 是純函式；靜態邊界直接讀 `src/` 的原始碼走 import 圖。

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

/** 走 `src/` 的靜態 import 圖（`@/` 別名與相對路徑；`.ts`／`.tsx`；含 `export … from` 與 `import type`）。 */
function importGraph(entry: string): Set<string> {
  const root = path.resolve(import.meta.dirname, '..')
  const resolveFrom = (from: string, spec: string): string | null => {
    let base: string
    if (spec.startsWith('@/')) base = path.join(root, 'src', spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
    else return null // 套件
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
      if (existsSync(candidate) && !readdirSafe(candidate)) return candidate
    }
    return null
  }
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (spec === undefined) continue
      const target = resolveFrom(file, spec)
      if (target !== null) queue.push(target)
    }
  }
  return seen
}
const readdirSafe = (p: string): boolean => {
  try {
    readdirSync(p)
    return true
  } catch {
    return false
  }
}

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
        const source = readFileSync(file, 'utf8')
        for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) expect(source.includes(word), `${path.relative(root, file)} 出現了 ${word}`).toBe(false)
      }
    }
  })

  it('靜態邊界的尺本身不是恆真：一個真的碰 REST 的模組會被抓到（對照組）', () => {
    const graph = [...importGraph(path.join(root, 'src/api/operations.ts'))].map((f) => path.relative(root, f))
    expect(graph.some((f) => f.startsWith('src/api/transport'))).toBe(true)
  })
})

describe('chat body 沒有後端限制', () => {
  it('[FE-R11-S09] LIMITS.chatBody 是 {0, UNBOUNDED}、來源指向 protocol.py::ChatIn.body；ChatIn／ChatOut 的 body 沒有長度 checks；2001 字與空字串都通過', () => {
    expect(LIMITS.chatBody).toEqual({ min: 0, max: UNBOUNDED })
    expect(LIMIT_SOURCES.chatBody.source).toContain('protocol.py')
    expect(LIMIT_SOURCES.chatBody.source).toContain('ChatIn.body')
    // 自省：Zod 的長度 checks 是空的（不是拿一個有限樣本猜「無上限」）
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
    expect(ChatIn.safeParse({ t: 'chat', body: '字'.repeat(2001) }).success).toBe(true)
    expect(ChatIn.safeParse({ t: 'chat', body: '' }).success).toBe(true)
    expect(ChatOut.safeParse({ t: 'chat', id: 'x', name: '', body: '' }).success).toBe(true)
  })
})
