// 把「關掉一棵子程序樹」從 `tests/contract/harness.ts` 抽出來，因為它需要自己的判準：
// harness 的 teardown 沒有任何測試蓋到，而它失敗的方式是**靜悄悄的** ——
// 訊號送不出去會被 catch 吞掉、活著的判準會回報「已經沒人了」，兩者合起來是「回報關乾淨了，其實漏了」。
//
// `pnpm exec next start` 的 Next 是孫子，只 kill 直接子程序會留孤兒咬著 port（審查兩位都抓到），
// 所以要關的是整棵樹，不是一個 pid。

import { execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * 這棵樹還有人活著？（group leader 退了、孫子還在也算活著 —— 只看 `exitCode` 會漏。）
 *
 * ⚠️ **不可以用 `process.kill(-pid, 0)` 當跨平台的判準。** 負數 pid 是 POSIX 的 process group 語意；
 * 在 win32 它一律丟 `ESRCH`，於是「還活著」會被讀成「已經沒人了」—— 判準反而變成恆假。
 */
export function treeAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

/** 誰在聽這個 port？回 pid 清單（查不到工具就回 null，不假裝驗過）。 */
export async function listenersOf(port: number): Promise<number[] | null> {
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
 * 關掉整棵子程序樹。
 * 「關好了」看的是 **樹裡沒人了**，不是 leader 退了（leader 先走、孫子還在的話樹還活著）。
 */
export async function stopTree(child: ChildProcess): Promise<void> {
  const pgid = child.pid
  if (pgid === undefined) return
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pgid, sig)
    } catch {
      /* 樹裡已經沒人 */
    }
  }
  signal('SIGTERM')
  const deadline = Date.now() + 3_000
  while (treeAlive(pgid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  if (treeAlive(pgid)) {
    signal('SIGKILL')
    while (treeAlive(pgid)) await new Promise((r) => setTimeout(r, 50))
  }
}
