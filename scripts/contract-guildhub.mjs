// 契約測試的 `guildhub` 那一輪：**自己起**真後端、自己給它一個可拋棄的庫、跑完自己關。規格 `FE-O05`〈目標必須是自己起的、可拋棄的〉。
//
//   GUILDHUB_BACKEND_DIR=../GuildHub-backend INTERNAL_TEST_DATABASE_URL=… node scripts/contract-guildhub.mjs
//   … node scripts/contract-guildhub.mjs --suite rehearsal      # 切換演練（FE-O08）：同一套 preflight／起停，跑完產報告
//
// ⚠️ **不接受一個已經在聽的 port。** 8000 有人在聽 → 拒絕，不借用 —— 「自己起的」才是可拋棄的證明；
// 借用的那一份可能是別人正在用的（AGENTS.md〈測試環境隔離〉）。
// ⚠️ 後端的 `DATABASE_URL` 指向**我們的測試庫**（同一份 schema 複本），不碰後端自己的 `.env`。
// 這一輪**只在本機跑**，CI 沒有真後端（`S15`）。

import { execFile as execFileCb, spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DbScriptError, assertLoopback, reset } from './db.mjs'
import { finishRehearsal } from './rehearsal-report.mjs'

const execFile = promisify(execFileCb)

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

/** `cancelled()` 回訊號名就立刻放棄 —— 等 ready 的這 60 秒裡按 Ctrl-C 也要收得掉（審查抓到：不然會繼續等、甚至把 vitest 跑起來）。 */
async function waitFor401(base, ms, cancelled = () => null) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const sig = cancelled()
    if (sig) throw new WrapperError(`收到 ${sig}，不等後端 ready 了。`)
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
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

/** 關到 **group 裡沒人**（leader 先退、孫子還在的話 group 還活著）；等到 port 真的釋放才算關好。 */
async function stop(child, port) {
  const pgid = child.pid
  const signal = (sig) => {
    try {
      process.kill(-pgid, sig)
    } catch {
      /* 沒人了 */
    }
  }
  signal('SIGTERM')
  const deadline = Date.now() + 3_000
  while (groupAlive(pgid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  if (groupAlive(pgid)) {
    signal('SIGKILL')
    while (groupAlive(pgid)) await new Promise((r) => setTimeout(r, 50))
  }
  // uvicorn 收到 SIGTERM 後還要幾百 ms 才真的放掉 port；等它放掉，緊接著再跑一次 wrapper 才不會被自己的 preflight 擋。
  for (let i = 0; i < 25 && (await portInUse(port)); i += 1) await new Promise((r) => setTimeout(r, 200))
}

const SUITES = ['contract', 'rehearsal']
/** rehearsal 時由 wrapper 擁有的 vitest 旗標（含 `--outputFile.json=…` 這種寫法與 `-c` 縮寫）。 */
const OWNED = /^(?:--(config|reporter|outputFile)(?:[=.]|$)|-c$)/

/**
 * `--suite <v>`／`--suite=<v>` 的文法（`S01`）。純函式：只拿掉 `--suite` 那一或兩個 token，其餘一個都不動；
 * `--` 之後不看。重複、缺值、非法值都拒絕 —— 不退回預設，退回預設會讓打錯字的人以為自己跑了演練。
 */
export function parseSuite(argv) {
  const legal = `合法值只有 'contract'（預設）與 'rehearsal'`
  let suite = null
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i]
    if (tok === '--') {
      rest.push(...argv.slice(i))
      break
    }
    let value
    if (tok === '--suite') {
      value = argv[i + 1]
      if (value === undefined || value.startsWith('-')) throw new WrapperError(`--suite 缺值；${legal}。`)
      i += 1
    } else if (tok.startsWith('--suite=')) {
      value = tok.slice('--suite='.length)
    } else {
      rest.push(tok)
      continue
    }
    if (suite !== null) throw new WrapperError(`--suite 出現兩次；${legal}。`)
    if (!SUITES.includes(value)) throw new WrapperError(`--suite '${value}' 不合法；${legal}。`)
    suite = value
  }
  suite ??= 'contract'
  if (suite === 'rehearsal') {
    const end = rest.indexOf('--')
    const owned = rest.slice(0, end === -1 ? rest.length : end).find((t) => OWNED.test(t))
    if (owned) throw new WrapperError(`--suite rehearsal 時 ${owned} 由 wrapper 決定（--config／--reporter／--outputFile），不接受使用者傳的。`)
  }
  return { suite, rest }
}

function spawnBackend(spawnFn, { runSh, backendDir, port, testUrl, env }) {
  // ⚠️ 後端 repo 的 `run.sh` 是 **CRLF** 提交的（`git ls-files --eol` 是 i/crlf），`bash run.sh` 會炸在 `set -e\r`。
  // 不動別人的 repo：去掉 `\r` 再餵給 `bash -s`。`$0` 會是 `bash`、`dirname` 是 `.`，cwd 仍是後端目錄，
  // 所以它的 `cd "$(dirname "$0")"` 與 `.venv/bin/python` 都還對。
  return spawnFn('bash', ['-c', `tr -d '\\r' < ${JSON.stringify(runSh)} | bash -s`], {
    cwd: backendDir,
    env: { ...env, DATABASE_URL: testUrl, PORT: String(port), SESSION_SECRET: 'contract-test-secret', ROOM_TOKEN_SECRET: 'contract-test-room-secret' },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  })
}

/** 拿不到就回空字串 —— `finishRehearsal` 把空 SHA 視同 JSON 缺席，不產報告。 */
async function git(args, cwd) {
  const { stdout } = await execFile('git', args, { cwd }).catch(() => ({ stdout: '' }))
  return stdout.trim()
}

/**
 * 整個流程。`deps` 注入 `preflight`／`reset`／`spawn`／`finish`（`mkdtemp` 選配，測試用來在那個 await 裡送訊號），回傳結束碼、不自己 `process.exit` ——
 * `S02` 要驗的是「四條 preflight 任一不過，`reset` 與 `spawn` 都沒被叫到」，只單測 `preflight()` 證明不了。
 */
export async function run({ argv, env, deps, io = console }) {
  let parsed
  try {
    parsed = parseSuite(argv)
  } catch (e) {
    io.error(e instanceof WrapperError ? e.message : e)
    return 2
  }
  const { suite, rest } = parsed
  const tag = `[contract-guildhub${suite === 'rehearsal' ? ' rehearsal' : ''}]`
  const port = Number(env.CONTRACT_GUILDHUB_PORT ?? 8000)
  const backendDir = env.GUILDHUB_BACKEND_DIR ? path.resolve(env.GUILDHUB_BACKEND_DIR) : path.resolve(ROOT, '..', 'GuildHub-backend')
  const testUrl = env.INTERNAL_TEST_DATABASE_URL
  let backend = null
  let vitest = null
  let signalled = null
  /** vitest 退出當下的訊號快照；`settled` 之後一律看它，不看之後才變的 `signalled`。 */
  let settled = false
  let cancelled = null
  let tmpDir = null
  // Ctrl-C／被工作管理員砍：一樣要把後端那一組收掉，不然留一個孤兒 uvicorn 咬著 8000（審查抓到的）。
  // 不在這裡 process.exit：記下訊號，讓正在等的那一步（reset 之後的檢查、waitFor401 或 vitest）自己退出，收尾一律走 finally。
  // `on` 不是 `once`、註冊在 preflight 之前、finally 最後才拆：stop() 等 port 釋放的那幾秒再按一次 Ctrl-C 也不會退回 Node 的
  // 預設行為把 wrapper 秒殺、留下孤兒（審查抓到的）。
  const onSignal = (sig) => {
    io.log(`${tag} 收到 ${sig}，收拾中`)
    signalled = sig
    // vitest 也是一組（worker 是它的子程序）：detached 起的，對 -pid 送；它退了之後 finally 會關後端。
    if (vitest && vitest.exitCode === null) {
      try {
        process.kill(-vitest.pid, 'SIGTERM')
      } catch {
        vitest.kill('SIGTERM')
      }
    }
  }
  const bail = () => new WrapperError(`收到 ${signalled}，不往下走了。`)
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    const { runSh } = await deps.preflight({ backendDir, port, testUrl, devUrl: env.INTERNAL_DATABASE_URL })
    if (signalled) throw bail()
    io.log(`${tag} reset ${testUrl}`)
    await deps.reset({ url: testUrl })
    if (signalled) throw bail()

    io.log(`${tag} 起 ${runSh} 在 ${port}`)
    backend = spawnBackend(deps.spawn, { runSh, backendDir, port, testUrl, env })
    const base = `http://127.0.0.1:${port}`
    await waitFor401(base, 60_000, () => signalled)
    if (backend.exitCode !== null) throw new WrapperError(`真後端在 ready 之前就退出了（code ${backend.exitCode}）。`)
    if (signalled) throw bail()

    let args = ['run', '--config', 'vitest.contract.mts', ...rest]
    if (suite === 'rehearsal') {
      // 報告從 JSON reporter 產：唯一的暫存檔，finally 清；default reporter 留著給人看。
      tmpDir = await (deps.mkdtemp ?? mkdtemp)(path.join(os.tmpdir(), 'rehearsal-'))
      args = ['run', '--config', 'vitest.rehearsal.mts', '--reporter=default', '--reporter=json', `--outputFile.json=${path.join(tmpDir, 'result.json')}`, ...rest]
    }
    // 起 vitest 之前是最後一個 await（mkdtemp）之後：訊號若剛好落在那裡，不能還把套件跑起來（審查抓到的）。
    if (signalled) throw bail()
    io.log(`${tag} ready，跑 ${suite} 套件`)
    vitest = deps.spawn('npx', ['vitest', ...args], {
      cwd: ROOT,
      env: {
        ...env,
        CONTRACT_TARGET: 'guildhub',
        CONTRACT_BASE_URL: base,
        CONTRACT_WS_URL: `ws://127.0.0.1:${port}/ws`,
        // harness 用它確認「port 上聽的就是我起的那一組」（detached → pgid 等於 pid）。
        CONTRACT_GUILDHUB_PGID: String(backend.pid),
      },
      stdio: 'inherit',
      detached: true,
    })
    const [code, signal] = await new Promise((resolve) => vitest.once('exit', (c, sig) => resolve([c, sig])))
    // vitest 退了之後這一輪就是完整的：訊號從這裡起再到（取 SHA、寫報告那幾十 ms）不改結果 —— 報告照產、結束碼沿用 vitest 的；
    // 用退出當下的快照，不看之後才變的 `signalled`（審查抓到：不然會寫了報告卻回 130，或反過來）。
    settled = true
    cancelled = signalled
    if (suite !== 'rehearsal') return cancelled ? 130 : (code ?? 1)

    const [backendSha, frontendSha, porcelain] = await Promise.all([git(['rev-parse', 'HEAD'], backendDir), git(['rev-parse', 'HEAD'], ROOT), git(['status', '--porcelain'], ROOT)])
    const result = await deps.finish({
      jsonPath: path.join(tmpDir, 'result.json'),
      exitCode: code,
      signal: cancelled ?? signal,
      shas: { backend: backendSha, frontend: frontendSha },
      dirty: porcelain !== '',
    })
    ;(result.code === 0 ? io.log : io.error)(`${tag} ${result.message}`)
    return cancelled ? 130 : result.code
  } catch (e) {
    io.error(e instanceof WrapperError || e instanceof DbScriptError ? e.message : e)
    // finish 期間才到的訊號不能把「報告產不出來」掩蓋成 130（審查抓到）。
    return (settled ? cancelled : signalled) ? 130 : 1
  } finally {
    try {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
    } finally {
      try {
        // 暫存目錄刪不掉也要關後端 —— 留孤兒比留暫存檔嚴重得多。
        if (backend) {
          await stop(backend, port)
          io.log(`${tag} 後端已關`)
        }
      } finally {
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run({ argv: process.argv.slice(2), env: process.env, deps: { preflight, reset, spawn, finish: finishRehearsal } }).then((code) => process.exit(code))
}
