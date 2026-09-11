import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { WrapperError, preflight } from '../scripts/contract-guildhub.mjs'
import { assertLoopbackBase, resolveTarget } from './contract/target'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 唯一一份，兩個目標各跑一次，都走真 HTTP —— S01、S02
//   Requirement: 目標必須是自己起的、可拋棄的 —— S04、S05、S06
//
// 這些是 harness／wrapper 自己的判準，跑在 `npm test` 裡，不需要任何後端。**不連任何外部服務。**

const CONTRACT_DIR = path.resolve(__dirname, 'contract')

async function contractFiles(dir = CONTRACT_DIR): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await contractFiles(p)))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}
/** 任何形式的模組引用：`import x from`／`export … from`／裸的 side-effect `import '…'`／dynamic `import()`／`require()`，單雙引號都算。 */
const MODULE_REFS = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g
function referencedModules(src: string): string[] {
  return [...src.matchAll(MODULE_REFS)].map((m) => m[2] ?? '')
}

describe('目標', () => {
  it('[FE-O05-S01] 沒有指定目標：拋錯並列出兩個合法值（globalSetup 拋 = 套件整個失敗，沒有任何測試算 pass 或 skip）', () => {
    expect(() => resolveTarget(undefined)).toThrow(/'internal' 或 'guildhub'/)
    expect(() => resolveTarget('local')).toThrow(/'local'/)
    expect(resolveTarget('internal')).toBe('internal')
    expect(resolveTarget('guildhub')).toBe('guildhub')
  })

  it('[FE-O05-S02] 測試檔裡沒有目標分支；tests/contract 底下任何檔案都不引用 Route Handler 或 src/server（任何 import 形式）', async () => {
    const files = await contractFiles()
    const contractTests = files.filter((f) => f.endsWith('.contract.ts'))
    expect(contractTests.length, '沒有任何 .contract.ts —— 掃了個空').toBeGreaterThan(0)
    for (const f of contractTests) {
      const src = await readFile(f, 'utf8')
      expect(src, `${path.relative(CONTRACT_DIR, f)} 讀了 CONTRACT_TARGET`).not.toMatch(/CONTRACT_TARGET/)
    }
    // helper 也算：透過 client.ts 間接 import handler 一樣是繞過（審查抓到的）。
    for (const f of files) {
      const refs = referencedModules(await readFile(f, 'utf8'))
      const bad = refs.filter((r) => /(^|\/)app\/api(\/|$)/.test(r) || /(^|\/)server(\/|$)/.test(r.replace(/^@\//, 'src/')))
      expect(bad, `${path.relative(CONTRACT_DIR, f)} 引用了 ${bad.join(', ')}`).toEqual([])
    }
    // 掃描器本身不是恆真：這幾種寫法都要被抓到。
    const samples = [
      "import { GET } from '@/app/api/me/route'",
      'import x from "@/server/db"',
      "const m = await import('../../src/app/api/login/route')",
      "const { db } = require('../../../src/server/db')",
      "import '@/server/db'",
      'import "../../src/app/api/login/route"',
    ]
    for (const sample of samples) {
      const refs = referencedModules(sample)
      expect(refs.length, sample).toBe(1)
      const bad = refs.filter((r) => /(^|\/)app\/api(\/|$)/.test(r) || /(^|\/)server(\/|$)/.test(r.replace(/^@\//, 'src/')))
      expect(bad, `掃描器漏了：${sample}`).toHaveLength(1)
    }
  })

  it('[FE-O05-S04] 目標不是 loopback：拒絕，訊息說明只接受 loopback', () => {
    expect(() => assertLoopbackBase('http://api.example.com', 'CONTRACT_BASE_URL')).toThrow(/只接受 loopback/)
    expect(() => assertLoopbackBase(undefined, 'CONTRACT_BASE_URL')).toThrow(/沒設/)
    expect(assertLoopbackBase('http://127.0.0.1:3101/', 'x')).toBe('http://127.0.0.1:3101')
    expect(assertLoopbackBase('ws://localhost:8000/ws', 'x')).toBe('ws://localhost:8000/ws')
  })
})

describe('guildhub 的 wrapper', () => {
  const testUrl = 'postgresql://guildhub:guildhub@localhost:5432/guildhub_frontend_test'

  it('[FE-O05-S05] port 已經有人在聽：拒絕借用（用假的後端目錄，不需要真的 repo）', async () => {
    const fakeBackend = await mkdtemp(path.join(os.tmpdir(), 'fake-backend-'))
    await writeFile(path.join(fakeBackend, 'run.sh'), '#!/usr/bin/env bash\necho fake\n')
    const server = net.createServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as net.AddressInfo).port
    try {
      await expect(preflight({ backendDir: fakeBackend, port, testUrl })).rejects.toThrow(/不接受既有的後端/)
      // 對照：同一個假目錄、沒人聽的 port → preflight 過（證明紅的是 port 那一條）。
      server.close()
      await new Promise<void>((r) => server.once('close', () => r()))
      await expect(preflight({ backendDir: fakeBackend, port, testUrl })).resolves.toEqual({ runSh: path.join(fakeBackend, 'run.sh') })
    } finally {
      server.close()
      await rm(fakeBackend, { recursive: true })
    }
  })

  it('[FE-O05-S06] 後端 repo 不在本機：失敗並印出找過的路徑（不是 skip）', async () => {
    const missing = path.join(os.tmpdir(), 'no-such-backend')
    const err = await preflight({ backendDir: missing, port: 1, testUrl }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WrapperError)
    expect((err as Error).message).toContain(missing)
    await expect(preflight({ backendDir: undefined, port: 1, testUrl })).rejects.toThrow(/GUILDHUB_BACKEND_DIR/)
  })
})
