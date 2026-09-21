// 把「關掉一棵子程序樹」從 `tests/contract/harness.ts` 抽出來，因為它需要自己的判準：
// harness 的 teardown 沒有任何測試蓋到，而它失敗的方式是**靜悄悄的** ——
// 訊號送不出去會被 catch 吞掉、活著的判準會回報「已經沒人了」，兩者合起來是「回報關乾淨了，其實漏了」。
//
// 關的是整棵樹，不是一個 pid。harness 今天是直接起 `node node_modules/next/dist/bin/next`
// （`tests/contract/harness.ts:181`），所以 Next 自己就是 leader —— 但只要有一層包裝
// （`pnpm exec`）或 Next 日後自己再生工作程序，只 kill 直接子程序就會留孤兒咬著 port。
//
// **兩個平台關樹的機制不一樣，而且沒有共用的寫法：**
//
// | | POSIX | win32 |
// |---|---|---|
// | 樹是什麼 | process group（`detached: true` 讓子程序當 leader） | 沒有這個東西；要靠 `taskkill /T` 走父子關係 |
// | 怎麼關 | `process.kill(-pgid, SIGTERM)` 再 `SIGKILL` | `taskkill /PID <pid> /T /F` |
// | 還活著嗎 | `process.kill(-pgid, 0)` | `process.kill(pid, 0)`（正數 pid） |
//
// ⚠️ **負數 pid 在 win32 不是「無效」，是「永遠丟 ESRCH」** —— 它不會拋給你看，
// 它會讓「還活著嗎」變成恆假。2026-09-21 就是這樣在本機累積出 57 個 `next start` 孤兒，
// 每個都還 LISTEN 在自己的隨機 port，而 harness 每一次都回報關乾淨了。

import { execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const isWindows = process.platform === 'win32'

/**
 * 這棵樹還有人活著？（group leader 退了、孫子還在也算活著 —— 只看 `exitCode` 會漏。）
 *
 * win32 沒有 process group，問的是**這個 pid 本身**還在不在；孫子由 `taskkill /T` 一起收，
 * 判準在 `tests/process-tree.test.ts` 裡分開量。
 */
export function treeAlive(pid: number): boolean {
  try {
    process.kill(isWindows ? pid : -pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 誰在聽這個 port？回 pid 清單（查不到工具就回 null，不假裝驗過）。
 *
 * **只有 POSIX 用得到**：唯一的呼叫點是 `guildhub` 目標，而那個目標靠 `CONTRACT_GUILDHUB_PGID`
 * 認人（pgid 是 POSIX 概念），在 win32 早一步就擋掉了。這裡不補 `netstat` 分支 ——
 * 補了就是一段沒有判準蓋到、也沒有人會跑到的程式。
 */
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
 * win32：`taskkill /T` 連孫子一起收。找不到那個 pid（已經自己退了）不算失敗，
 * 其餘的失敗（PATH 裡沒有 taskkill、權限不足）**回傳出去**，讓它進最後那個錯誤訊息 ——
 * 吞掉的話，「leader 剛好自己退了、後代還活著」會看起來像成功。
 */
async function taskkillTree(pid: number): Promise<Error | null> {
  try {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    return null
  } catch (e) {
    // 128 = 找不到這個 pid（已經退了）。
    if ((e as { code?: number }).code === 128) return null
    return e as Error
  }
}

/**
 * 關掉整棵子程序樹。
 * 「關好了」看的是 **樹裡沒人了**，不是 leader 退了（leader 先走、孫子還在的話樹還活著）。
 *
 * 關不掉就**丟例外**，不默默 return —— 原本這裡是一個沒有上界的 `while`，
 * 關不掉的話會從「漏一個孤兒」變成「整個套件掛在 teardown 上」，兩種都看不出原因。
 */
export async function stopTree(child: ChildProcess): Promise<void> {
  const pid = child.pid
  if (pid === undefined) return
  const until = async (deadline: number) => {
    while (treeAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  }

  let taskkillError: Error | null = null
  if (isWindows) {
    taskkillError = await taskkillTree(pid)
    await until(Date.now() + 5_000)
  } else {
    const signal = (sig: NodeJS.Signals) => {
      try {
        process.kill(-pid, sig)
      } catch {
        /* 樹裡已經沒人 */
      }
    }
    signal('SIGTERM')
    await until(Date.now() + 3_000)
    if (treeAlive(pid)) {
      signal('SIGKILL')
      await until(Date.now() + 5_000)
    }
  }

  if (treeAlive(pid)) {
    const why = taskkillError ? `；taskkill 失敗：${taskkillError.message}` : ''
    throw new Error(`關不掉 pid ${pid} 這棵樹 —— 它會變成咬著 port 的孤兒（platform ${process.platform}${why}）`)
  }
}

/**
 * 關掉好幾棵樹，**每一棵都會被試過**，再一起回報失敗。
 *
 * 呼叫端原本是 `await stopTree(a); await stopTree(b)` —— 第一棵丟錯的話第二棵根本不會被清，
 * 於是「關不掉就叫出來」這個改動反而會**多留一個孤兒**（審查抓到）。
 *
 * ⚠️ 這個性質沒有自動判準：要造一棵殺不死的樹就得拿系統行程當測試素材，不做。
 * 它是 3 行，審查看得到。
 */
export async function stopAll(...children: ChildProcess[]): Promise<Error[]> {
  const results = await Promise.allSettled(children.map((c) => stopTree(c)))
  return results.flatMap((r) => (r.status === 'rejected' ? [r.reason as Error] : []))
}

/** `stopAll()` 的結果沒有全過就丟 —— 帶上原始的失敗原因，不要只說「teardown 失敗」。 */
export function throwIfAnyLeft(errors: Error[], context: string): void {
  if (errors.length > 0) throw new AggregateError(errors, `${context}：有程序沒被關掉，它們會變成咬著 port 的孤兒`)
}
