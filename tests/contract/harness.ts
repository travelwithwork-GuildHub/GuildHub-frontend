// 契約測試的 globalSetup。規格 `FE-O05`〈目標必須是自己起的、可拋棄的〉。
//
// `internal`：這裡**自己**起 `next start`（隨機 port）、先 `db:reset` 測試庫（沒有可拋棄標記就失敗）。
// `guildhub`：`scripts/contract-guildhub.mjs` 已經起好真後端，這裡只驗位址是 loopback。
//
// 目標的差異**只在這個檔案**。測試檔透過 `inject('contractBaseUrl')` 拿位址，不看 `CONTRACT_TARGET`（`S02`）。
// **不連任何團隊共用的位址；不接受任何既有的程序。**

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { rmSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import net from 'node:net'
import path from 'node:path'
import type { TestProject } from 'vitest/node'
import { reset } from '../../scripts/db.mjs'
import { testDatabase } from '../support/test-db'
import { RECORDING_DIR, assembleRecordings } from './golden'
import { assertLoopbackBase, resolveTarget } from './target'

const ROOT = path.resolve(__dirname, '..', '..')

function assertLoopbackDb(url: string | undefined): string {
  const decision = testDatabase({ INTERNAL_TEST_DATABASE_URL: url, INTERNAL_DATABASE_URL: process.env.INTERNAL_DATABASE_URL })
  if ('skip' in decision) throw new Error(`guildhub 目標也需要 INTERNAL_TEST_DATABASE_URL（真後端指向它）：${decision.skip}`)
  return decision.url
}
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
 * ready 的證據是 **`next start` 自己的輸出**，不是「這個 port 有東西回 HTTP」—— 後者分不出是我們起的還是
 * 別人搶到 port 的程序（審查抓到的 TOCTOU）。它若因 EADDRINUSE 退出，這裡會拿到退出而不是借用。
 *
 * Next 的啟動輸出是分行的（`- Local: http://127.0.0.1:PORT` 一行、`✓ Ready in Xms` 另一行），而且兩者哪個進 stdout
 * 哪個進 stderr 隨版本變 —— 所以這裡合併兩個 stream、在累積的輸出裡找**兩段各自出現**：`Local:` 那一行含我們的 port、
 * 以及 `Ready in`。這證明的是「這個子程序宣稱自己在這個 port 上 ready」，不是別的。
 * 監聯在 resolve／reject 時都拆掉，不留在 child 上整個套件期間亂叫。
 */
function waitUntilReady(child: ChildProcess, port: number, ms: number, log: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const localLine = new RegExp(`Local:\\s+https?://[^\\s]*:${port}(?:\\s|$)`)
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout?.off('data', check)
      child.stderr?.off('data', check)
      child.off('exit', onExit)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`next start 在 ${ms} ms 內沒有印出 Ready（port ${port}）\n${log()}`))
    }, ms)
    const check = () => {
      const out = log()
      if (/Ready in/.test(out) && localLine.test(out)) {
        cleanup()
        resolve()
      }
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`next start 在 ready 之前就退出了（code ${code}）—— port ${port} 被搶走了？\n${log()}`))
    }
    child.stdout?.on('data', check)
    child.stderr?.on('data', check)
    child.once('exit', onExit)
  })
}

/** 這個 process group 還有人活著？（group leader 退了、孫子還在也算活著 —— 只看 `exitCode` 會漏。） */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
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

/**
 * 關掉整個 process group：`npx next start` 的 Next 是孫子，只 kill `npx` 會留孤兒咬著 port（審查兩位都抓到）。
 * 「關好了」看的是 **group 裡沒人了**，不是 leader 退了（leader 先走、孫子還在的話 group 還活著）。
 */
async function stop(child: ChildProcess): Promise<void> {
  const pgid = child.pid
  if (pgid === undefined) return
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pgid, sig)
    } catch {
      /* group 已經沒人 */
    }
  }
  signal('SIGTERM')
  const deadline = Date.now() + 3_000
  while (groupAlive(pgid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  if (groupAlive(pgid)) {
    signal('SIGKILL')
    while (groupAlive(pgid)) await new Promise((r) => setTimeout(r, 50))
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const target = resolveTarget(process.env.CONTRACT_TARGET)
  // 錄製 golden：只對 guildhub 有意義（golden 是真後端的形狀）；錄製那一次**不算通過**（teardown exit 非 0）。
  const record = process.env.CONTRACT_RECORD === '1'
  if (record && target !== 'guildhub') throw new Error('CONTRACT_RECORD=1 只能對 guildhub 錄 —— golden 是真後端的形狀，不是替身的。')
  project.provide('contractRecord', record)
  if (record) rmSync(RECORDING_DIR, { recursive: true, force: true })
  const recorded = async () => {
    if (!record) return
    const n = assembleRecordings()
    console.log(`\n[contract] 已錄製 ${n} 條 golden（tests/contract/golden/422.json，整組換掉），這一次不算通過 —— 再不帶 CONTRACT_RECORD 跑一次 compare。`)
    process.exitCode = 1
  }

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
      if (pids.length === 0) throw new Error(`port ${port} 上沒有人在聽 —— wrapper 起的後端不在了。`)
      // `ps` 失敗就失敗，不吞成空清單（空清單的 every 是 true —— 審查抓到的放行通道）。
      const { stdout } = await execFileAsync('ps', ['-o', 'pgid=', '-p', pids.join(',')])
      const pgids = stdout.split('\n').map((x) => x.trim()).filter(Boolean).map(Number)
      if (pgids.length !== pids.length || !pgids.every((g) => Number.isInteger(g) && g === pgid)) {
        throw new Error(`port ${port} 上聽的不是 wrapper 起的那一組（pgid ${pgid}；聽的是 ${pgids.join(',') || '解析不到'}）—— 不借用別人的後端。`)
      }
    }
    project.provide('contractBaseUrl', base)
    project.provide('contractWsUrl', ws)
    // 兩個目標讀的是同一個測試庫（wrapper 把真後端的 DATABASE_URL 指過來）：測試要「刪一張名片」「塞一筆過期專案」直接動它。
    project.provide('contractDatabaseUrl', assertLoopbackDb(process.env.INTERNAL_TEST_DATABASE_URL))
    // 真後端 17 個端點都在。
    project.provide('contractUnimplemented', [])
    // 真後端沒有 `/online`，room token 由 `enter` 簽發（W4）：這兩個能力在這一輪不存在。
    project.provide('contractOnlineUrl', null)
    project.provide('contractRoomToken', null)
    return recorded
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

  // 即時層替身：另一個程序、另一個 port；`GET /api/rooms` 透過 INTERNAL_REALTIME_PORT 找到它。
  const stubPort = await freePort()
  const stub = spawn('npx', ['tsx', 'scripts/realtime-stub.ts'], {
    cwd: ROOT,
    env: { ...process.env, INTERNAL_DATABASE_URL: db.url, INTERNAL_SESSION_SECRET: CONTRACT_SESSION_SECRET, INTERNAL_REALTIME_PORT: String(stubPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let stubLog = ''
  const collectStub = (d: Buffer) => {
    stubLog += d.toString()
  }
  stub.stdout?.on('data', collectStub)
  stub.stderr?.on('data', collectStub)
  try {
    await waitForLine(stub, () => stubLog, new RegExp(`ws://127\\.0\\.0\\.1:${stubPort}/ws`), 30_000)
  } catch (e) {
    await stop(stub)
    throw e
  } finally {
    stub.stdout?.off('data', collectStub)
    stub.stderr?.off('data', collectStub)
    stub.stdout?.resume()
    stub.stderr?.resume()
  }

  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const child = spawn('npx', ['next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: {
      ...process.env,
      INTERNAL_DATABASE_URL: db.url,
      INTERNAL_SESSION_SECRET: CONTRACT_SESSION_SECRET,
      INTERNAL_REALTIME_PORT: String(stubPort),
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
    await stop(stub)
    throw e
  } finally {
    child.stdout?.off('data', collect)
    child.stderr?.off('data', collect)
    child.stdout?.resume()
    child.stderr?.resume()
  }
  project.provide('contractBaseUrl', assertLoopbackBase(base, 'internal base'))
  project.provide('contractWsUrl', `ws://127.0.0.1:${stubPort}/ws`)
  project.provide('contractDatabaseUrl', db.url)
  project.provide('contractOnlineUrl', `http://127.0.0.1:${stubPort}/online`)
  // seed 第一間 active 專案的房間 token（`HMAC(secret, scene)`，跟替身同一把）—— 給 S22 用。
  const sign = (scene: string) => createHmac('sha256', CONTRACT_SESSION_SECRET).update(scene).digest('base64url')
  project.provide('contractRoomToken', {
    scene: 'room:22222222-0000-4000-8000-0000000000f1',
    token: sign('room:22222222-0000-4000-8000-0000000000f1'),
    // 一個 uuid 不合法、但 token 算對的 scene：替身要因為「不是 uuid」拒絕，不是因為 token（只擋 token 的實作會放它進去）。
    malformed: { scene: 'room:------------------------------------', token: sign('room:------------------------------------') },
  })
  // 本地版 W2 刻意沒做的端點（`FE-O03-S05`）：測試對這些要求 Next 自己的 404／405、不是本地版假造的 detail。
  // 這是目標的**能力**，不是目標的名字 —— 測試檔仍然不知道自己在打誰。
  // `FE-K01` 把 messages 做出來了，從這張表拿掉。
  project.provide('contractUnimplemented', ['POST /api/projects', 'GET /api/projects/{id}/seats'])
  return async () => {
    await stop(child)
    await stop(stub)
    await recorded()
  }
}

/** 等某個子程序的輸出出現某段字（替身印出它聽的位址）；先退出就失敗。 */
function waitForLine(child: ChildProcess, log: () => string, pattern: RegExp, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout?.off('data', check)
      child.stderr?.off('data', check)
      child.off('exit', onExit)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${ms} ms 內沒有看到 ${pattern}\n${log()}`))
    }, ms)
    const check = () => {
      if (pattern.test(log())) {
        cleanup()
        resolve()
      }
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`程序在 ready 之前就退出了（code ${code}）\n${log()}`))
    }
    child.stdout?.on('data', check)
    child.stderr?.on('data', check)
    child.once('exit', onExit)
  })
}
