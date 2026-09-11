import { UNBOUNDED, type Limit } from './limits'

// 從一個 limit 算出成對的邊界值。規格 `FE-O06`〈`LIMITS` 是唯一來源，契約 schema 與邊界表都從它取值〉。
//
// `FE-O05` 的契約套件把這些值打到端點上（哪個欄位打哪裡在那邊）；**這裡只有值**，不知道端點。
// 「只送超長抓不到收緊」（WBS 的 Alarm）：上限從 20 改成 10，送 21 仍被拒 —— 所以 `max` 本身要**接受**、`max+1` 要**拒絕**，成對。
//
// 長度單位是 code point：`accept` 同時給 `max` 個 CJK 與 `max` 個 emoji（各是 2 個 UTF-16 code unit）——
// 用 `.length` 數的實作會把後者當成超長。

export interface BoundaryValues {
  /** 後端 SHALL 接受的值。 */
  accept: string[]
  /** 後端 SHALL 拒絕的值。 */
  reject: string[]
}

const CJK = '字'
const EMOJI = '😀'

export function boundaryValues(limit: Limit): BoundaryValues {
  const accept: string[] = []
  const reject: string[] = []
  if (limit.max === UNBOUNDED) {
    // 沒有上限：一個很長的值要能過；下限照舊。
    accept.push(CJK.repeat(10_000))
  } else {
    accept.push(CJK.repeat(limit.max), EMOJI.repeat(limit.max))
    reject.push(CJK.repeat(limit.max + 1))
  }
  if (limit.min > 0) {
    accept.push(CJK.repeat(limit.min))
    reject.push(CJK.repeat(limit.min - 1))
  } else {
    accept.push('')
  }
  return { accept, reject }
}
