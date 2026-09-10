import { afterEach, describe, expect, it } from 'vitest'
import { claimTabLease, type TabLease } from '@/realtime/tabLease'

// 規格：openspec/changes/fe-r06-multi-tab/specs/multi-tab/spec.md
//   Requirement: 匿名的多分頁是合法的，登入之後不是 —— FE-R06-S02 / S03
//
// ⚠️ **用的是真的 `BroadcastChannel`（jsdom 有）。** 同一個 jsdom 裡兩個
// `BroadcastChannel` 實例互相收得到訊息、而且收不到自己送的 —— 那正是
// 兩個分頁的關係。手刻一個假的 channel 等於在測自己寫的那份。

const leases: TabLease[] = []
const open = (key = 'k') => {
  const lease = claimTabLease(key, { graceMs: 5 })
  leases.push(lease)
  return lease
}
/** 等 `BroadcastChannel` 的訊息跑完 ＋ grace 到期。 */
const settle = () => new Promise<void>((r) => setTimeout(r, 40))

afterEach(() => {
  for (const lease of leases.splice(0)) lease.release()
})

describe('同一個瀏覽器裡誰有資格連 world', () => {
  it('[FE-R06-S02] 第一個分頁拿得到資格', async () => {
    const first = open()
    await settle()
    expect(first.held()).toBe(true)
  })

  it('[FE-R06-S02] 第一個分頁還在時，第二個分頁拿不到資格', async () => {
    const first = open()
    await settle()
    const second = open()
    await settle()

    expect(first.held(), '第一個分頁被搶走了').toBe(true)
    // **這一行是這條的重點。** 第二個分頁拿到資格的話它就會連線，
    // 而連上去的那一瞬間就足以把第一個分頁的角色瞬移回原點
    expect(second.held(), '第二個分頁也拿到資格了').toBe(false)
  })

  it('[FE-R06-S02] 一開始不是「有資格」，是「還不知道」', () => {
    const first = open()
    // 還沒等 grace 到期。先假設自己有資格的話，第二個分頁會先連上去再被踢掉
    expect(first.held()).toBe(false)
  })

  it('[FE-R06-S02] 「改用這個分頁」會把資格搬過來，而且原持有者立刻失去', async () => {
    const first = open()
    await settle()
    const second = open()
    await settle()

    second.takeOver()
    await settle()

    expect(second.held()).toBe(true)
    expect(first.held(), '原持有者還握著資格 —— 兩條連線會同時存在').toBe(false)
  })

  it('[FE-R06-S03] 第一個分頁關掉之後，第二個分頁接手', async () => {
    const first = open()
    await settle()
    const second = open()
    await settle()
    expect(second.held()).toBe(false)

    first.release()
    await settle()

    expect(second.held(), '第一個分頁走了，第二個沒有接手').toBe(true)
  })

  it('[FE-R06-S03] 兩個等待中的分頁，持有者走掉之後只有一個接手', async () => {
    const first = open()
    await settle()
    const second = open()
    const third = open()
    await settle()

    first.release()
    await settle()

    const holders = [second, third].filter((l) => l.held())
    // **「不得出現兩條同身分的連線同時存在」** —— 兩個都接手的話就是兩條
    expect(holders.length, '兩個分頁同時接手了').toBe(1)
  })

  it('[FE-R06-S03] 沒有資格的分頁關掉，不會讓別人誤以為輪到自己', async () => {
    const first = open()
    await settle()
    const second = open()
    const third = open()
    await settle()

    // second 本來就沒有資格，它關掉不該影響任何人
    second.release()
    await settle()

    expect(first.held(), '持有者被一個沒有資格的分頁關頁弄丟了資格').toBe(true)
    expect(third.held(), '第三個分頁誤以為輪到自己').toBe(false)
  })

  it('[FE-R06-S01] 不同的 key 互不影響（不同的人、或不同的 scene）', async () => {
    const a = open('alice/lobby')
    const b = open('bob/lobby')
    const c = open('alice/room-7')
    await settle()

    // 匿名的兩個分頁走的是不同的 key（後端給每條匿名連線一個新的 uuid），
    // 所以它們**都**拿得到資格 —— 規格明文要求不得阻擋
    expect([a.held(), b.held(), c.held()]).toEqual([true, true, true])
  })

  it('資格變化會通知訂閱者', async () => {
    const seen: boolean[] = []
    const first = open()
    first.subscribe((held) => seen.push(held))
    await settle()
    const second = open()
    await settle()
    second.takeOver()
    await settle()

    expect(seen).toEqual([true, false])
  })
})
