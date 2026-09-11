// 契約測試的 `guildhub` 那一輪：**自己起**真後端、自己給它一個可拋棄的庫、跑完自己關。規格 `FE-O05`〈目標必須是自己起的、可拋棄的〉。
//
//   GUILDHUB_BACKEND_DIR=../GuildHub-backend INTERNAL_TEST_DATABASE_URL=… node scripts/contract-guildhub.mjs
//
// ⚠️ **不接受一個已經在聽的 port。** 8000 有人在聽 → 拒絕，不借用 —— 「自己起的」才是可拋棄的證明；
// 借用的那一份可能是別人正在用的（AGENTS.md〈測試環境隔離〉）。
// ⚠️ 後端的 `DATABASE_URL` 指向**我們的測試庫**（同一份 schema 複本），不碰後端自己的 `.env`。
// 這一輪**只在本機跑**，CI 沒有真後端（`S15`）。

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLoopback, reset } from './db.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export class WrapperError extends Error {
  name = 'WrapperError'
}

/** port 有人在聽？ */
export function portInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

function identity(url) {
  const u = new URL(url)
  return `${u.hostname.toLowerCase()}:${u.port || '5432'}${u.pathname}`
}

/**
 * 開跑前的三個檢查：後端 repo 在、port 沒人、測試庫合格。任何一個不過就拋，**什麼都沒起**。
 * 抽成函式是為了 `S05`／`S06` 能直接驗它。
 */
export async function preflight({ backendDir, port, testUrl, devUrl }) {
  if (!backendDir) throw new WrapperError('GUILDHUB_BACKEND_DIR 沒設（後端 repo 的路徑，例如 ../GuildHub-backend）。')
  const runSh = path.join(backendDir, 'run.sh')
  await access(runSh).catch(() => {
    throw new WrapperError(`後端 repo 不在 ${backendDir}（找不到 ${runSh}）。這一輪只在本機跑；CI 沒有真後端是刻意的。`)
  })
  if (await portInUse(port)) {
    throw new WrapperError(
      `port ${port} 已經有程序在聽 —— 不接受既有的後端。契約測試會寫入資料、清空庫，只打**自己起的**那一份。先關掉它（或換 CONTRACT_GUILDHUB_PORT）。`,
    )
  }
  if (!testUrl) throw new WrapperError('INTERNAL_TEST_DATABASE_URL 沒設 —— 真後端要指向一個可拋棄的庫。')
  assertLoopback(testUrl)
  if (devUrl && identity(devUrl) === identity(testUrl)) throw new WrapperError('INTERNAL_TEST_DATABASE_URL 跟 INTERNAL_DATABASE_URL 是同一個庫。')
  return { runSh }
}

async function waitFor401(base, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/me`)
      if (r.status === 401) return
    } catch {
      /* 還沒起來 */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new WrapperError(`真後端在 ${ms} ms 內沒有 ready（GET /api/me 沒回 401）。`)
}

/**
 * 關掉**整個 process group**：`bash -c … | bash -s` → `exec uvicorn` 是孫子，只 kill 兒子會留下一個孤兒 uvicorn
 * 繼續聽 8000（實測留過一個）。所以 spawn 時 `detached: true` 讓它自成一組，這裡對 `-pid` 送訊號。
 */
function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    const signal = (sig) => {
      try {
        process.kill(-child.pid, sig)
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

async function main() {
  const port = Number(process.env.CONTRACT_GUILDHUB_PORT ?? 8000)
  const backendDir = process.env.GUILDHUB_BACKEND_DIR ? path.resolve(process.env.GUILDHUB_BACKEND_DIR) : path.resolve(ROOT, '..', 'GuildHub-backend')
  const testUrl = process.env.INTERNAL_TEST_DATABASE_URL
  const { runSh } = await preflight({ backendDir, port, testUrl, devUrl: process.env.INTERNAL_DATABASE_URL })

  console.log(`[contract-guildhub] reset ${testUrl}`)
  await reset({ url: testUrl })

  console.log(`[contract-guildhub] 起 ${runSh} 在 ${port}`)
  // ⚠️ 後端 repo 的 `run.sh` 是 **CRLF** 提交的（`git ls-files --eol` 是 i/crlf），`bash run.sh` 會炸在 `set -e\r`。
  // 不動別人的 repo：去掉 `\r` 再餵給 `bash -s`。`$0` 會是 `bash`、`dirname` 是 `.`，cwd 仍是後端目錄，
  // 所以它的 `cd "$(dirname "$0")"` 與 `.venv/bin/python` 都還對。
  const backend = spawn('bash', ['-c', `tr -d '\\r' < ${JSON.stringify(runSh)} | bash -s`], {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
      PORT: String(port),
      SESSION_SECRET: 'contract-test-secret',
      ROOM_TOKEN_SECRET: 'contract-test-room-secret',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  })
  const base = `http://127.0.0.1:${port}`
  let code = 1
  try {
    await waitFor401(base, 60_000)
    console.log(`[contract-guildhub] ready，跑契約套件`)
    const vitest = spawn('npx', ['vitest', 'run', '--config', 'vitest.contract.mts', ...process.argv.slice(2)], {
      cwd: ROOT,
      env: { ...process.env, CONTRACT_TARGET: 'guildhub', CONTRACT_BASE_URL: base, CONTRACT_WS_URL: `ws://127.0.0.1:${port}/ws` },
      stdio: 'inherit',
    })
    code = await new Promise((resolve) => vitest.once('exit', (c) => resolve(c ?? 1)))
  } finally {
    await stop(backend)
    console.log('[contract-guildhub] 後端已關')
  }
  process.exit(code)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof WrapperError ? e.message : e)
    process.exit(1)
  })
}
