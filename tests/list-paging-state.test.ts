import { describe, expect, it } from 'vitest'
import { PAGE_SIZE } from '@/api/contract/limits'
import {
  edgeState,
  opened,
  reduce,
  type PagingEvent,
  type PagingState,
  type RequestIdentity,
} from '@/list-panel/paging'

// 規格：openspec/changes/fe-b01-list-container/specs/list-panel/spec.md
//   Requirement: 「還有沒有下一頁」只能靠實際取到的資料判定 —— S07／S08／S09
//   Requirement: 請求失敗 SHALL NOT 被當成翻到底 —— S10／S11
//   Requirement: 晚到的回應不得覆蓋畫面 —— S14／S15
//
// ⚠️ **這一份不連任何東西。** 它餵給狀態機的是「某個 identity 的回應到了」這種事件，
// 回應的順序由測試決定 —— 這正是競態判準需要的：真的網路上排不出那個順序。
//
// ⚠️ **三態要分得開：確定有／確定沒有／不確定。** 下面每一組判準都在守一條邊界，
// 而每一條邊界的另一側都是一個「畫面上全是合法卡片」的 bug。

type Item = { id: string }
const page = (n: number, count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: `p${n}-${i}` }))

const P = (page: number): RequestIdentity => ({ kind: 'projects', page })

/** 依序套用事件。 */
function run(...events: PagingEvent<Item>[]): PagingState<Item> {
  return events.reduce<PagingState<Item>>(reduce, opened('projects'))
}

const resolved = (identity: RequestIdentity, items: Item[]): PagingEvent<Item> => ({
  type: 'resolved',
  identity,
  items,
})
const failed = (identity: RequestIdentity): PagingEvent<Item> => ({
  type: 'failed',
  identity,
  error: new Error('boom'),
})
const NEXT: PagingEvent<Item> = { type: 'next' }
const RETRY: PagingEvent<Item> = { type: 'retry' }

/** 一張滿頁之後，正在探測第二頁。 */
const probingSecond = () => run(resolved(P(0), page(0, PAGE_SIZE)), NEXT)

describe('「還有沒有下一頁」只能靠實際取到的資料判定', () => {
  it('[FE-B01-S07] 不滿一頁就是到底 —— 之後的「下一頁」SHALL NOT 再送出請求', () => {
    const s = run(resolved(P(0), page(0, PAGE_SIZE - 1)))
    expect(s.next).toBe('none')
    expect(edgeState(s)).toBe('exhausted')
    // 前進要變成 no-op：identity 沒動、也沒有進入 loading。
    expect(reduce(s, NEXT)).toBe(s)
  })

  it('[FE-B01-S08] 正好一頁不等於到底 —— 使用者仍然能前進', () => {
    // ⚠️ **這一條與上一條要成對。** 只有 S07 的話，「`<= PAGE_SIZE` 就是到底」
    // 也會全綠 —— 而那個實作讓任何剛好 20 筆的清單永遠翻不到第二頁。
    const s = run(resolved(P(0), page(0, PAGE_SIZE)))
    expect(s.next, '正好 20 筆被當成到底了 —— 判準應該是 `<`，不是 `<=`').toBe('maybe')
    expect(edgeState(s)).toBeNull()
    const advanced = reduce(s, NEXT)
    expect(advanced.identity).toEqual(P(1))
    expect(advanced.phase).toBe('loading')
  })

  it('[FE-B01-S09] 前進之後撲空：留在原頁，狀態是「翻到底」不是「首次無資料」', () => {
    const s = reduce(probingSecond(), resolved(P(1), []))
    expect(s.shown?.page, '撲空之後被帶到一張空白頁了 —— 應該留在原頁').toBe(0)
    expect(s.shown?.items).toHaveLength(PAGE_SIZE)
    expect(s.next).toBe('none')
    expect(edgeState(s), '撲空被畫成「首次無資料」—— 原頁明明有 20 筆').toBe('exhausted')
    // identity 也退回原頁：之後任何「同一頁」的語意都指向畫面上那一頁。
    expect(s.identity).toEqual(P(0))
    expect(s.phase).toBe('ready')
  })

  it('[FE-B01-S09] 探測期間原頁的資料 SHALL 仍然在畫面上', () => {
    // 「點下去才探測」的代價是探測要花時間；期間把列表清空的話，
    // 每一次翻頁都會閃一下空白，而撲空的時候那個空白就永遠留下來了。
    const s = probingSecond()
    expect(s.phase).toBe('loading')
    expect(s.shown?.page).toBe(0)
    expect(s.shown?.items).toHaveLength(PAGE_SIZE)
  })

  it('首次就是空陣列：那才是「首次無資料」', () => {
    // ⚠️ 與 S09 對照：同樣是空陣列，前面有沒有一張已呈現的頁決定它是哪一種。
    const s = run(resolved(P(0), []))
    expect(edgeState(s)).toBe('first-empty')
    expect(s.next).toBe('none')
    expect(reduce(s, NEXT)).toBe(s)
  })

  it('探測期間再按一次「下一頁」是 no-op —— 一次只探測一頁', () => {
    // ⚠️ 允許的話，手滑連點會從第 0 頁跳到第 2 頁，而這一列沒有「上一頁」：
    // 跳過的那一頁只能關掉面板重開才回得去。
    const s = probingSecond()
    expect(reduce(s, NEXT), '探測第 1 頁的時候又前進到第 2 頁了').toBe(s)
    expect(s.identity).toEqual(P(1))
  })
})

describe('請求失敗 SHALL NOT 被當成翻到底', () => {
  it('[FE-B01-S10] 網路失敗不是資料結束', () => {
    const s = reduce(probingSecond(), failed(P(1)))
    expect(s.phase).toBe('error')
    expect(edgeState(s)).toBe('error')
    expect(s.next, '失敗被畫成「已無更多」—— 使用者會以為自己看完了').toBe('maybe')
    // 原頁的資料還在，失敗不清空畫面。
    expect(s.shown?.page).toBe(0)
    expect(s.shown?.items).toHaveLength(PAGE_SIZE)
  })

  it('[FE-B01-S11] 失敗之後重試的是同一頁', () => {
    const s = reduce(reduce(probingSecond(), failed(P(1))), RETRY)
    expect(s.phase).toBe('loading')
    expect(s.identity, '重試跳頁了 —— 失敗的是第 1 頁，重試就該問第 1 頁').toEqual(P(1))
    expect(s.error).toBeNull()
    // 重試的回應正常提交。
    const done = reduce(s, resolved(P(1), page(1, 3)))
    expect(done.shown?.page).toBe(1)
    expect(done.next).toBe('none')
  })

  it('[FE-B01-S11] 錯誤狀態下「下一頁」是 no-op —— 不能拿失敗的那一頁當跳板', () => {
    const s = reduce(probingSecond(), failed(P(1)))
    expect(reduce(s, NEXT)).toBe(s)
  })

  it('沒有在錯誤狀態時，重試是 no-op', () => {
    const s = run(resolved(P(0), page(0, 5)))
    expect(reduce(s, RETRY)).toBe(s)
  })
})

describe('晚到的回應不得覆蓋畫面', () => {
  it('[FE-B01-S14] 探測第 2 頁時灌入一個 identity 已失效的第 1 頁回應：頁次與列表 SHALL 不為所動', () => {
    // ⚠️ **誠實地說，這一條測的是 invariant，不是規格 WHEN 裡的使用者操作。**
    // 「連續前進兩頁」由 UI 到不了 —— 探測期間 `next` 是 no-op（見上面那條）——
    // 所以「較早那一頁的回應較晚到達」在真實網路上排不出來。這裡灌的是一個合法事件：
    // 第 1 頁已經提交過、identity 已經走到第 2 頁，第 1 頁的回應又到了一次。
    // 它守的是 Requirement 本文那一句：只有 identity 仍然有效的回應才能提交。
    // 這個 bug 的畫面上全是合法卡片：頁碼 2、內容第 1 頁。
    const probingThird = run(
      resolved(P(0), page(0, PAGE_SIZE)),
      NEXT,
      resolved(P(1), page(1, PAGE_SIZE)),
      NEXT,
    )
    expect(probingThird.identity).toEqual(P(2))
    const s = reduce(probingThird, resolved(P(1), page(1, 5)))
    expect(s, '第 1 頁的回應改了狀態 —— 回應提交前沒有比對 identity').toBe(probingThird)
    expect(s.shown?.page).toBe(1)
    expect(s.identity).toEqual(P(2))
    expect(s.phase).toBe('loading')
    // 對照：第 2 頁的回應正常提交。
    expect(reduce(s, resolved(P(2), page(2, 4))).shown?.items[0]?.id).toBe('p2-0')
  })

  it('[FE-B01-S15] 換一種資料之後，前一種的回應 SHALL NOT 混進來', () => {
    // 案件還在載入 → 改開人才 → 案件的回應才到。
    // ⚠️⚠️ identity 只比 `page` 的話這一條才會紅 —— 人才流程本身完全正常，
    // 這正是它難發現的原因（tasks 4.3 的突變）。
    const afterSwitch = reduce(opened<Item>('projects'), { type: 'open', kind: 'profiles' })
    const s = reduce(afterSwitch, resolved(P(0), page(0, 7)))
    expect(s.shown, '案件的回應混進了人才清單 —— identity 有沒有把資料種類算進去？').toBeNull()
    expect(s.phase).toBe('loading')
    expect(s.identity).toEqual({ kind: 'profiles', page: 0 })
  })

  it('[FE-B01-S15] 對照：同一種資料的回應正常提交', () => {
    // 沒有這一條，「所有回應一律丟掉」也會讓上一條全綠。
    const s = reduce(opened<Item>('profiles'), {
      type: 'resolved',
      identity: { kind: 'profiles', page: 0 },
      items: page(0, 7),
    })
    expect(s.shown?.items).toHaveLength(7)
  })

  it('identity 已失效的失敗也 SHALL NOT 提交', () => {
    // 驅動層會在 identity 改變時中止前一個請求；那個中止的 rejection 帶著舊 identity。
    const afterSwitch = reduce(probingSecond(), { type: 'open', kind: 'profiles' })
    const s = reduce(afterSwitch, failed(P(1)))
    expect(s.phase).toBe('loading')
    expect(s.error).toBeNull()
  })
})
