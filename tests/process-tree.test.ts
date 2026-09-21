import { spawn, type ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { stopTree, treeAlive } from './support/process-tree'

// `tests/contract/harness.ts` 的 teardown 的判準。**不連任何服務、不需要 build、不碰資料庫。**
//
// 為什麼要有這一組：2026-09-21 在這台 Windows 機器上清出 57 個 `next start` 孤兒，
// 全部還 LISTEN 在各自的隨機 port、父行程全不在了，時間集中在 09-18 23:59 到 09-19 02:23 的一輪測試裡。
// 成因是 teardown 整段走 POSIX 的 process group 語意（`process.kill(-pgid, …)`），
// 在 win32 一律丟 `ESRCH`：訊號被 catch 吞掉、「還活著嗎」回 false，
// **於是每跑一次漏一個，而且回報自己關乾淨了。** 三道檢查沒有一道會叫。
//
// 所以這裡量的不是「有沒有呼叫 kill」，是**子程序與孫子事後是不是真的不在了** ——
// 前者在壞掉的實作上也會綠。

/** 孫子要不要自己一組 —— 見 `spawnTree()` 的說明，兩個平台的理由相反。 */
const DETACHED_GRANDCHILD = process.platform === 'win32'

/** 這個 pid 還在嗎？正數 pid，兩個平台都有效（負數 pid 就是上面那個 bug 本身）。 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitGone(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!alive(pid)) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return !alive(pid)
}

/**
 * 起一個 detached 的子程序，它自己再起一個孫子，並把孫子的 pid 印到 stdout。
 *
 * ⚠️ **孫子只在 win32 也 detached**，兩個平台的理由剛好相反，而且都是實測出來的：
 *
 * - win32：不 detached 的孫子**本來就會**跟父程序一起死。那條性質是作業系統給的，
 *   不是 `taskkill /T` 給的 —— 孫子不 detached 的話，拿掉 `/T` 的突變不會紅（判準恆綠）。
 * - POSIX：`detached` 就是 `setsid()`，孫子會**自己成為一個 process group**。
 *   `stopTree()` 殺的是 `-child.pid` 那一組，殺不到它 —— 正確的實作也會紅。
 *   WSL 實測：detached 的孫子 pgid 與 child 不同，`kill -TERM -<childPgid>` 之後仍然 ALIVE；
 *   不 detached 的孫子與 child 同一組，同一個 kill 就會一起死。
 */
function spawnTree(): Promise<{ child: ChildProcess; grandchild: number }> {
  const src =
    "const {spawn} = require('child_process');" +
    `const DETACHED_GRANDCHILD = ${DETACHED_GRANDCHILD};` +
    "const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: DETACHED_GRANDCHILD });" +
    'console.log(g.pid);' +
    'setInterval(() => {}, 1000);'
  const child = spawn(process.execPath, ['-e', src], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('子程序 10 秒內沒有印出孫子的 pid')), 10_000)
    let out = ''
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
      const line = out.split('\n')[0]?.trim()
      if (line && /^\d+$/.test(line)) {
        clearTimeout(timer)
        resolve({ child, grandchild: Number(line) })
      }
    })
    child.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

const started: { child: ChildProcess; grandchild: number }[] = []

afterEach(() => {
  // 這組測試自己不能變成孤兒的來源：不管判準紅不紅，都用平台原生的方式收乾淨。
  for (const { child, grandchild } of started.splice(0)) {
    for (const pid of [child.pid, grandchild]) {
      if (pid === undefined || !alive(pid)) continue
      try {
        if (process.platform === 'win32') spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        else process.kill(pid, 'SIGKILL')
      } catch {
        /* 已經不在了 */
      }
    }
  }
})

describe('contract harness 的 teardown', () => {
  it('子程序還活著的時候，treeAlive() 要說它活著（回 false 就是「回報關乾淨了」的來源）', async () => {
    const tree = await spawnTree()
    started.push(tree)
    expect(alive(tree.child.pid as number), '前提：子程序本來就該活著').toBe(true)
    expect(treeAlive(tree.child.pid as number)).toBe(true)
  }, 20_000)

  it('stopTree() 之後，子程序真的不在了', async () => {
    const tree = await spawnTree()
    started.push(tree)
    await stopTree(tree.child)
    expect(await waitGone(tree.child.pid as number, 5_000), `pid ${tree.child.pid} 還活著 —— 這就是咬著 port 的孤兒`).toBe(true)
  }, 20_000)

  it('stopTree() 之後，孫子也不在了（只關直接子程序會留孤兒；next 日後再生工作程序就是這一條）', async () => {
    const tree = await spawnTree()
    started.push(tree)
    await stopTree(tree.child)
    expect(await waitGone(tree.grandchild, 5_000), `孫子 pid ${tree.grandchild} 還活著`).toBe(true)
  }, 20_000)
})
