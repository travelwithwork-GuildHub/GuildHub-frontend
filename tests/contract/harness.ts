// 契約測試的 globalSetup。規格 `FE-O05`〈目標必須是自己起的、可拋棄的〉。
//
// `internal`：這裡**自己**起 `next start`（隨機 port）、先 `db:reset` 測試庫（沒有可拋棄標記就失敗）。
// `guildhub`：`scripts/contract-guildhub.mjs` 已經起好真後端，這裡只驗位址是 loopback。
//
// 目標的差異**只在這個檔案**。測試檔透過 `inject('contractBaseUrl')` 拿位址，不看 `CONTRACT_TARGET`（`S02`）。
// **不連任何團隊共用的位址；不接受任何既有的程序。**

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import net from 'node:net'
import path from 'node:path'
import type { TestProject } from 'vitest/node'
import { reset } from '../../scripts/db.mjs'
import { testDatabase } from '../support/test-db'
import { assertLoopbackBase, resolveTarget } from './target'

const ROOT = path.resolve(__dirname, '..', '..')
const execFileAsync = promisify(execFile)
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

/**
 * ready 的證據是 **`next start` 自己的 stdout 說它在這個 port 上 Ready**，不是「這個 port 有東西回 HTTP」——
 * 後者分不出是我們起的還是別人搶到 port 的程序（審查抓到的 TOCTOU）。它若因 EADDRINUSE 退出，這裡會拿到退出而不是借用。
 */
function waitUntilReady(child: ChildProcess, port: number, ms: number, log: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`next start 在 ${ms} ms 內沒有印出 Ready（port ${port}）\n${log()}`)), ms)
    const check = () => {
      const out = log()
      if (/Ready in/.test(out) && new RegExp(`:${port}\\b`).test(out)) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout?.on('data', check)
    child.stderr?.on('data', check)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`next start 在 ready 之前就退出了（code ${code}）—— port ${port} 被搶走了？\n${log()}`))
    })
  })
}

/** 誰在聽這個 port？回 pid 清單（`lsof` 不在就回 null，不假裝驗過）。 */
async function listenersOf(port: number): Promise<number[] | null> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    return stdout.split('\n').filter(Boolean).map(Number)
  } catch (e) {
    // lsof 沒東西時 exit 1；lsof 不存在時 ENOENT。
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    return []
  }
}

/** 關掉整個 process group：`npx next start` 的 Next 是孫子，只 kill `npx` 會留孤兒咬著 port（審查兩位都抓到）。 */
function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    const signal = (sig: NodeJS.Signals) => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, sig)
        else child.kill(sig)
      } catch {
        child.kill(sig)
      }
    }
    signal('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null) signal('SIGKILL')
    }, 3_000).unref()
  })
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const target = resolveTarget(process.env.CONTRACT_TARGET)

  if (target === 'guildhub') {
    const base = assertLoopbackBase(process.env.CONTRACT_BASE_URL, 'CONTRACT_BASE_URL')
    const ws = assertLoopbackBase(process.env.CONTRACT_WS_URL, 'CONTRACT_WS_URL')
    // 只接受 wrapper 起的：wrapper 會把它起的後端 process group 的 pgid 放進來，這裡確認它還活著、而且真的在聽那個 port。
    // 直接手動 `CONTRACT_TARGET=guildhub vitest` 打一個既有的 8000 → 這裡擋（審查抓到「自己起」只靠呼叫慣例）。
    const pgid = Number(process.env.CONTRACT_GUILDHUB_PGID)
    if (!Number.isInteger(pgid) || pgid <= 0) {
      throw new Error('guildhub 目標只能由 scripts/contract-guildhub.mjs 起（缺 CONTRACT_GUILDHUB_PGID）—— 不接受既有的後端。')
    }
    try {
      process.kill(-pgid, 0)
    } catch {
      throw new Error(`CONTRACT_GUILDHUB_PGID=${pgid} 的 process group 不存在 —— wrapper 起的後端不在了。`)
    }
    const port = Number(new URL(base).port || 80)
    const pids = await listenersOf(port)
    if (pids !== null) {
      const { stdout } = await execFileAsync('ps', ['-o', 'pgid=', '-p', pids.join(',')]).catch(() => ({ stdout: '' }))
      const pgids = stdout.split('\n').map((x) => Number(x.trim())).filter(Boolean)
      if (pids.length === 0 || !pgids.every((g) => g === pgid)) {
        throw new Error(`port ${port} 上聽的不是 wrapper 起的那一組（pgid ${pgid}；聽的是 ${pgids.join(',') || '沒人'}）—— 不借用別人的後端。`)
      }
    }
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
    detached: true,
  })
  // 只在啟動期間收 log（給失敗訊息用）；ready 之後就不再累積，不然整個套件期間的輸出都堆在記憶體裡。
  let log = ''
  const collect = (d: Buffer) => {
    log += d.toString()
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  try {
    await waitUntilReady(child, port, 60_000, () => log)
  } catch (e) {
    await stop(child)
    throw e
  } finally {
    child.stdout?.off('data', collect)
    child.stderr?.off('data', collect)
    child.stdout?.resume()
    child.stderr?.resume()
  }
  project.provide('contractBaseUrl', assertLoopbackBase(base, 'internal base'))
  project.provide('contractWsUrl', `ws://127.0.0.1:${port}/ws`)
  return async () => {
    await stop(child)
  }
}
