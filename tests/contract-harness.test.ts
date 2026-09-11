import { readdir, readFile } from 'node:fs/promises'
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
    else if (e.name.endsWith('.contract.ts')) out.push(p)
  }
  return out
}

describe('目標', () => {
  it('[FE-O05-S01] 沒有指定目標：拋錯並列出兩個合法值（globalSetup 拋 = 套件整個失敗，沒有任何測試算 pass 或 skip）', () => {
    expect(() => resolveTarget(undefined)).toThrow(/'internal' 或 'guildhub'/)
    expect(() => resolveTarget('local')).toThrow(/'local'/)
    expect(resolveTarget('internal')).toBe('internal')
    expect(resolveTarget('guildhub')).toBe('guildhub')
  })

  it('[FE-O05-S02] 測試檔裡沒有目標分支、沒有 import Route Handler 或 src/server', async () => {
    const files = await contractFiles()
    expect(files.length, '沒有任何 .contract.ts —— 掃了個空').toBeGreaterThan(0)
    for (const f of files) {
      const src = await readFile(f, 'utf8')
      expect(src, `${path.relative(CONTRACT_DIR, f)} 讀了 CONTRACT_TARGET`).not.toMatch(/CONTRACT_TARGET/)
      expect(src, `${path.relative(CONTRACT_DIR, f)} import 了 Route Handler`).not.toMatch(/from '@\/app\/api\//)
      expect(src, `${path.relative(CONTRACT_DIR, f)} import 了 src/server`).not.toMatch(/from '@\/server\//)
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

  it('[FE-O05-S05] port 已經有人在聽：拒絕借用', async () => {
    const server = net.createServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as net.AddressInfo).port
    try {
      await expect(preflight({ backendDir: path.resolve(__dirname, '..', '..', 'GuildHub-backend'), port, testUrl })).rejects.toThrow(/不接受既有的後端/)
    } finally {
      server.close()
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
