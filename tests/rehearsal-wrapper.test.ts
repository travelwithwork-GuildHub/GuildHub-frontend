import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseSuite, preflight, run } from '../scripts/contract-guildhub.mjs'

// 規格：openspec/changes/fe-o08-guildhub-rehearsal/specs/switch-rehearsal/spec.md
//   Requirement: 演練只對自起的、loopback 的真後端跑 —— S01、S02
//
// 跑在 `pnpm test` 裡，**不連任何外部服務**：`S02` 的「port 有人在聽」用本機臨時 socket，
// `reset`／`spawn` 是假的 —— 要證明的正是它們**沒被叫到**。

describe('--suite 的文法（parseSuite）', () => {
  it('[FE-O08-S01] 兩種寫法都認，rest 只拿掉 --suite 那一或兩個 token', () => {
    expect(parseSuite(['--suite', 'rehearsal', '-t', 'seat'])).toEqual({ suite: 'rehearsal', rest: ['-t', 'seat'] })
    expect(parseSuite(['--suite=rehearsal', '-t', 'seat'])).toEqual({ suite: 'rehearsal', rest: ['-t', 'seat'] })
    expect(parseSuite(['-t', 'seat', '--suite', 'contract'])).toEqual({ suite: 'contract', rest: ['-t', 'seat'] })
    // contract 時 --config 是使用者的：原樣轉傳（對照 rehearsal 那一條）。
    expect(parseSuite(['--config', 'x.mts'])).toEqual({ suite: 'contract', rest: ['--config', 'x.mts'] })
  })

  it('[FE-O08-S01] 缺席就是 contract，rest 是原 argv', () => {
    expect(parseSuite(['-t', 'seat'])).toEqual({ suite: 'contract', rest: ['-t', 'seat'] })
    expect(parseSuite([])).toEqual({ suite: 'contract', rest: [] })
  })

  it('[FE-O08-S01] `--` 之後不解析、原樣轉傳', () => {
    expect(parseSuite(['--', '--suite', 'rehearsal'])).toEqual({ suite: 'contract', rest: ['--', '--suite', 'rehearsal'] })
    expect(parseSuite(['--suite', 'rehearsal', '--', '--suite=foo'])).toEqual({ suite: 'rehearsal', rest: ['--', '--suite=foo'] })
  })

  it('[FE-O08-S01] 出現兩次、缺值、非法值：拒絕（不是退回預設），訊息含兩個合法值或被拒的旗標', () => {
    expect(() => parseSuite(['--suite', 'rehearsal', '--suite', 'rehearsal'])).toThrow(/--suite.*兩次/)
    expect(() => parseSuite(['--suite=contract', '--suite', 'rehearsal'])).toThrow(/--suite.*兩次/)
    expect(() => parseSuite(['--suite'])).toThrow(/'contract'.*'rehearsal'/)
    expect(() => parseSuite(['--suite', '-t'])).toThrow(/'contract'.*'rehearsal'/)
    expect(() => parseSuite(['--suite='])).toThrow(/'contract'.*'rehearsal'/)
    expect(() => parseSuite(['--suite', 'foo'])).toThrow(/'foo'.*'contract'.*'rehearsal'/)
    expect(() => parseSuite(['--suite=Rehearsal'])).toThrow(/'Rehearsal'/)
  })

  it('[FE-O08-S01] rehearsal 時 --config／--reporter／--outputFile 歸 wrapper：使用者傳了就拒絕', () => {
    for (const flag of ['--config', '--reporter', '--outputFile']) {
      const name = flag.replace(/^--/, '')
      expect(() => parseSuite(['--suite', 'rehearsal', flag, 'x']), flag).toThrow(new RegExp(name))
      expect(() => parseSuite(['--suite=rehearsal', `${flag}=x`]), `${flag}=x`).toThrow(new RegExp(name))
    }
    // vitest 的 `--outputFile.json=…` 是同一個旗標的另一種寫法、`-c` 是 `--config` 的縮寫。
    expect(() => parseSuite(['--suite', 'rehearsal', '--outputFile.json=x'])).toThrow(/outputFile/)
    expect(() => parseSuite(['--suite', 'rehearsal', '-c', 'x'])).toThrow(/config/)
    // `--` 之後的同名 token 不是給 wrapper 看的。
    expect(parseSuite(['--suite', 'rehearsal', '--', '--config'])).toEqual({ suite: 'rehearsal', rest: ['--', '--config'] })
  })
})

describe('run() 的 preflight 四條，各自擋在 reset／spawn 之前', () => {
  const testUrl = 'postgresql://guildhub:guildhub@127.0.0.1:5432/guildhub_frontend_test'

  async function freePort(): Promise<number> {
    const s = net.createServer()
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
    const { port } = s.address() as net.AddressInfo
    await new Promise<void>((r) => s.close(() => r()))
    return port
  }
  async function fakeBackend(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'fake-backend-'))
    await writeFile(path.join(dir, 'run.sh'), '#!/usr/bin/env bash\necho fake\n')
    return dir
  }
  /** 真的 preflight、假的其他三個：要證明的是「真的四條」擋住了「假的兩個」。 */
  async function runWith(env: Record<string, string | undefined>, argv: string[] = []) {
    const deps = { preflight, reset: vi.fn(), spawn: vi.fn(), finish: vi.fn() }
    const errors: string[] = []
    const code = await run({ argv, env, deps, io: { log: () => {}, error: (m: unknown) => errors.push(String(m)) } })
    return { code, deps, text: errors.join('\n') }
  }

  it('[FE-O08-S02] 後端目錄沒有 run.sh：非零、訊息含那個路徑、reset／spawn 都是 0 次', async () => {
    const missing = path.join(os.tmpdir(), 'no-such-backend')
    const { code, deps, text } = await runWith({ GUILDHUB_BACKEND_DIR: missing, INTERNAL_TEST_DATABASE_URL: testUrl, CONTRACT_GUILDHUB_PORT: '1' })
    expect(code).not.toBe(0)
    expect(text).toContain(missing)
    expect(deps.reset).toHaveBeenCalledTimes(0)
    expect(deps.spawn).toHaveBeenCalledTimes(0)
  })

  it('[FE-O08-S02] port 已有人在聽：非零、訊息說不接受既有的後端、reset／spawn 都是 0 次', async () => {
    const dir = await fakeBackend()
    const server = net.createServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as net.AddressInfo
    try {
      const { code, deps, text } = await runWith({ GUILDHUB_BACKEND_DIR: dir, INTERNAL_TEST_DATABASE_URL: testUrl, CONTRACT_GUILDHUB_PORT: String(port) })
      expect(code).not.toBe(0)
      expect(text).toMatch(/不接受既有的後端/)
      expect(deps.reset).toHaveBeenCalledTimes(0)
      expect(deps.spawn).toHaveBeenCalledTimes(0)
    } finally {
      server.close()
      await rm(dir, { recursive: true })
    }
  })

  it('[FE-O08-S02] INTERNAL_TEST_DATABASE_URL 缺席、或主機不是 loopback：非零、訊息說明、reset／spawn 都是 0 次', async () => {
    const dir = await fakeBackend()
    const port = String(await freePort())
    try {
      const missing = await runWith({ GUILDHUB_BACKEND_DIR: dir, CONTRACT_GUILDHUB_PORT: port })
      expect(missing.code).not.toBe(0)
      expect(missing.text).toMatch(/INTERNAL_TEST_DATABASE_URL 沒設/)
      const remote = await runWith({
        GUILDHUB_BACKEND_DIR: dir,
        CONTRACT_GUILDHUB_PORT: port,
        INTERNAL_TEST_DATABASE_URL: 'postgresql://u:p@db.example.com:5432/guildhub_frontend_test',
      })
      expect(remote.code).not.toBe(0)
      expect(remote.text).toMatch(/只接受 loopback.*db\.example\.com/)
      for (const r of [missing, remote]) {
        expect(r.deps.reset).toHaveBeenCalledTimes(0)
        expect(r.deps.spawn).toHaveBeenCalledTimes(0)
      }
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('[FE-O08-S02] 跟 INTERNAL_DATABASE_URL 是同一個庫：非零、訊息說明、reset／spawn 都是 0 次', async () => {
    const dir = await fakeBackend()
    try {
      const { code, deps, text } = await runWith({
        GUILDHUB_BACKEND_DIR: dir,
        CONTRACT_GUILDHUB_PORT: String(await freePort()),
        INTERNAL_TEST_DATABASE_URL: testUrl,
        // 省略 :5432、密碼不同：identity 只看 host:port/db，這樣寫仍是同一個庫。
        INTERNAL_DATABASE_URL: 'postgresql://dev:other@127.0.0.1/guildhub_frontend_test',
      })
      expect(code).not.toBe(0)
      expect(text).toMatch(/同一個庫/)
      expect(deps.reset).toHaveBeenCalledTimes(0)
      expect(deps.spawn).toHaveBeenCalledTimes(0)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('[FE-O08-S02] 對照：四條都過就走到 reset（reset 拋錯 → 非零、reset 1 次、spawn 0 次）—— 證明上面擋的是 preflight，不是 run() 什麼都不做', async () => {
    const dir = await fakeBackend()
    try {
      const deps = { preflight, reset: vi.fn(async () => { throw new Error('reset-sentinel') }), spawn: vi.fn(), finish: vi.fn() }
      const errors: string[] = []
      const code = await run({
        argv: [],
        env: { GUILDHUB_BACKEND_DIR: dir, CONTRACT_GUILDHUB_PORT: String(await freePort()), INTERNAL_TEST_DATABASE_URL: testUrl },
        deps,
        io: { log: () => {}, error: (m: unknown) => errors.push(String(m)) },
      })
      expect(code).not.toBe(0)
      expect(errors.join('\n')).toContain('reset-sentinel')
      expect(deps.reset).toHaveBeenCalledTimes(1)
      expect(deps.spawn).toHaveBeenCalledTimes(0)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('[FE-O08-S02] argv 不合法（S01 的拒絕）也擋在 preflight 之前：非零、reset／spawn 都是 0 次', async () => {
    const { code, deps, text } = await runWith({ INTERNAL_TEST_DATABASE_URL: testUrl }, ['--suite', 'foo'])
    expect(code).not.toBe(0)
    expect(text).toMatch(/'foo'/)
    expect(deps.reset).toHaveBeenCalledTimes(0)
    expect(deps.spawn).toHaveBeenCalledTimes(0)
  })
})

describe('run() 的訊號處理（沿用 contract 那一輪的契約：Ctrl-C 要收得掉後端、不得留孤兒）', () => {
  it('等後端 ready 期間收到 SIGINT：不起 vitest、走 finally 關後端、回 130（審查抓到：重構後這段會繼續等 60 秒）', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'fake-backend-'))
    await writeFile(path.join(dir, 'run.sh'), '#!/usr/bin/env bash\necho fake\n')
    const s = net.createServer()
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
    const port = (s.address() as net.AddressInfo).port
    await new Promise<void>((r) => s.close(() => r()))
    // 假的後端子程序：pid 不存在，stop() 對它送訊號會被 try/catch 吃掉、groupAlive 立刻 false。
    const spawn = vi.fn(() => ({ pid: 2_147_483_000, exitCode: null }))
    const logs: string[] = []
    try {
      const pending = run({
        argv: [],
        env: { GUILDHUB_BACKEND_DIR: dir, CONTRACT_GUILDHUB_PORT: String(port), INTERNAL_TEST_DATABASE_URL: 'postgresql://guildhub:guildhub@127.0.0.1:5432/guildhub_frontend_test' },
        deps: { preflight, reset: vi.fn(async () => []), spawn, finish: vi.fn() },
        io: { log: (m: unknown) => logs.push(String(m)), error: (m: unknown) => logs.push(String(m)) },
      })
      // 等到後端被「起」了（進入 waitFor401）再送訊號。
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
      // Node 真的送訊號時 handler 會拿到訊號名當參數；用 emit 模擬要自己帶。
      process.emit('SIGINT' as never, 'SIGINT' as never)
      const code = await pending
      expect(code).toBe(130)
      expect(spawn, 'vitest 不該被起').toHaveBeenCalledTimes(1)
      expect(logs.join('\n')).toMatch(/後端已關/)
    } finally {
      await rm(dir, { recursive: true })
    }
  }, 15_000)

  it('後端 ready 之後、起 vitest 之前的 await（rehearsal 的 mkdtemp）期間收到 SIGINT：不起 vitest、回 130（審查抓到的 race）', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'fake-backend-'))
    await writeFile(path.join(dir, 'run.sh'), '#!/usr/bin/env bash\necho fake\n')
    // 真的在 port 上回 401 的迷你後端：讓 waitFor401 立刻過；preflight 用假的放行（它的「port 沒人聽」那條會擋住這個 server）。
    const server = http.createServer((_req, res) => {
      res.statusCode = 401
      res.end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as net.AddressInfo).port
    const spawn = vi.fn(() => ({ pid: 2_147_483_000, exitCode: null }))
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'rehearsal-'))
    try {
      const code = await run({
        argv: ['--suite', 'rehearsal'],
        env: { GUILDHUB_BACKEND_DIR: dir, CONTRACT_GUILDHUB_PORT: String(port), INTERNAL_TEST_DATABASE_URL: 'postgresql://guildhub:guildhub@127.0.0.1:5432/guildhub_frontend_test' },
        deps: {
          preflight: vi.fn(async () => ({ runSh: path.join(dir, 'run.sh') })),
          reset: vi.fn(async () => []),
          spawn,
          finish: vi.fn(),
          // 訊號正好落在 ready 之後、起 vitest 之前的那個 await 裡。
          mkdtemp: vi.fn(async () => {
            // ready 已經量到了：先把迷你 server 關掉，stop() 等 port 釋放才不會等滿 5 秒。
            await new Promise<void>((r) => server.close(() => r()))
            process.emit('SIGINT' as never, 'SIGINT' as never)
            return tmp
          }),
        },
        io: { log: () => {}, error: () => {} },
      })
      expect(code).toBe(130)
      expect(spawn, '只有後端那一次，vitest 不該被起').toHaveBeenCalledTimes(1)
    } finally {
      server.close()
      await rm(dir, { recursive: true })
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('vitest 退了之後（finish 期間）才收到 SIGINT：這一輪已完整 —— finish 拿到的 signal 是 null、回傳沿用 finish 的結束碼', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'fake-backend-'))
    await writeFile(path.join(dir, 'run.sh'), '#!/usr/bin/env bash\necho fake\n')
    const server = http.createServer((_req, res) => {
      res.statusCode = 401
      res.end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as net.AddressInfo).port
    // 第一次 spawn 是後端（假 pid）、第二次是 vitest：一個會自己「退出」的假子程序，exit code 0。
    const fakeVitest = Object.assign(new EventEmitter(), { pid: 2_147_483_001, exitCode: null as number | null })
    const spawn = vi.fn<(...args: unknown[]) => unknown>().mockImplementationOnce(() => ({ pid: 2_147_483_000, exitCode: null })).mockImplementationOnce(() => {
      setTimeout(() => {
        fakeVitest.exitCode = 0
        fakeVitest.emit('exit', 0, null)
      }, 10)
      return fakeVitest
    })
    const finish = vi.fn(async () => {
      await new Promise<void>((r) => server.close(() => r()))
      process.emit('SIGINT' as never, 'SIGINT' as never)
      return { code: 0, path: '/x', message: 'ok' }
    })
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'rehearsal-'))
    try {
      const code = await run({
        argv: ['--suite', 'rehearsal'],
        env: { GUILDHUB_BACKEND_DIR: dir, CONTRACT_GUILDHUB_PORT: String(port), INTERNAL_TEST_DATABASE_URL: 'postgresql://guildhub:guildhub@127.0.0.1:5432/guildhub_frontend_test' },
        deps: { preflight: vi.fn(async () => ({ runSh: path.join(dir, 'run.sh') })), reset: vi.fn(async () => []), spawn, finish, mkdtemp: vi.fn(async () => tmp) },
        io: { log: () => {}, error: () => {} },
      })
      expect(finish).toHaveBeenCalledTimes(1)
      expect((finish.mock.calls[0] as unknown as [{ signal: string | null; exitCode: number | null }])[0]).toMatchObject({ signal: null, exitCode: 0 })
      expect(code).toBe(0)
    } finally {
      server.close()
      await rm(dir, { recursive: true })
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('reset 期間收到 SIGINT：不起後端也不起 vitest、回 130（handler 要在 preflight 之前就掛上）', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'fake-backend-'))
    await writeFile(path.join(dir, 'run.sh'), '#!/usr/bin/env bash\necho fake\n')
    const spawn = vi.fn()
    try {
      const code = await run({
        argv: [],
        env: { GUILDHUB_BACKEND_DIR: dir, CONTRACT_GUILDHUB_PORT: '1', INTERNAL_TEST_DATABASE_URL: 'postgresql://guildhub:guildhub@127.0.0.1:5432/guildhub_frontend_test' },
        deps: {
          preflight,
          reset: vi.fn(async () => {
            process.emit('SIGINT' as never, 'SIGINT' as never)
            return []
          }),
          spawn,
          finish: vi.fn(),
        },
        io: { log: () => {}, error: () => {} },
      })
      expect(code).toBe(130)
      expect(spawn).toHaveBeenCalledTimes(0)
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
