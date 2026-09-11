// 契約測試的 globalSetup。規格 `FE-O05`〈目標必須是自己起的、可拋棄的〉。
//
// `internal`：這裡**自己**起 `next start`（隨機 port）、先 `db:reset` 測試庫（沒有可拋棄標記就失敗）。
// `guildhub`：`scripts/contract-guildhub.mjs` 已經起好真後端，這裡只驗位址是 loopback。
//
// 目標的差異**只在這個檔案**。測試檔透過 `inject('contractBaseUrl')` 拿位址，不看 `CONTRACT_TARGET`（`S02`）。
// **不連任何團隊共用的位址；不接受任何既有的程序。**

import { spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import type { TestProject } from 'vitest/node'
import { reset } from '../../scripts/db.mjs'
import { testDatabase } from '../support/test-db'
import { assertLoopbackBase, resolveTarget } from './target'

const ROOT = path.resolve(__dirname, '..', '..')
/** 本地後端的 session secret：測試用固定值，WS 替身也用同一把。 */
export const CONTRACT_SESSION_SECRET = 'contract-test-secret'

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo
      s.close(() => resolve(port))
    })
  })
}

async function waitUntilUp(url: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  let last: unknown = null
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: 'manual' })
      return
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`${url} 在 ${ms} ms 內沒有起來：${String(last)}`)
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 3_000).unref()
  })
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const target = resolveTarget(process.env.CONTRACT_TARGET)

  if (target === 'guildhub') {
    const base = assertLoopbackBase(process.env.CONTRACT_BASE_URL, 'CONTRACT_BASE_URL')
    const ws = assertLoopbackBase(process.env.CONTRACT_WS_URL, 'CONTRACT_WS_URL')
    project.provide('contractBaseUrl', base)
    project.provide('contractWsUrl', ws)
    return async () => {}
  }

  // ── internal ──
  const db = testDatabase()
  if ('skip' in db) {
    // 契約測試不 skip：沒有測試庫就是沒有 internal 目標，要明說。
    throw new Error(`internal 目標需要 INTERNAL_TEST_DATABASE_URL：${db.skip}`)
  }
  await access(path.join(ROOT, '.next', 'BUILD_ID')).catch(() => {
    throw new Error('沒有 .next/BUILD_ID —— 契約測試打的是 `next start`，先 `npm run build`。（不用 `next dev`：第一次請求會編譯，timeout 判準會亂。）')
  })
  await reset({ url: db.url })

  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const child = spawn('npx', ['next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: {
      ...process.env,
      INTERNAL_DATABASE_URL: db.url,
      INTERNAL_SESSION_SECRET: CONTRACT_SESSION_SECRET,
      NEXT_PUBLIC_APP_ENV: 'local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout?.on('data', (d: Buffer) => {
    log += d.toString()
  })
  child.stderr?.on('data', (d: Buffer) => {
    log += d.toString()
  })
  try {
    await waitUntilUp(`${base}/api/me`, 60_000)
  } catch (e) {
    await stop(child)
    throw new Error(`${String(e)}\n--- next start 的輸出 ---\n${log}`)
  }
  project.provide('contractBaseUrl', assertLoopbackBase(base, 'internal base'))
  project.provide('contractWsUrl', `ws://127.0.0.1:${port}/ws`)
  return async () => {
    await stop(child)
  }
}
