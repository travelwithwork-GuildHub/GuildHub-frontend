// 「未提供」的節點。規格 `FE-B04-S02`／`S10`：`hours_per_week: null`、`bio: null` 不是 0、不是空白。
//
// **機器可辨識**（`data-missing`）—— 判準找的是這個屬性，不是那兩個字。
// 「沒填」跟「零小時」是兩件事；畫成 0 的話發案者會以為這個人一週都沒空。
//
// `label`：案件卡的空技能是「未指定」（`FE-B02-S04`）——「未提供」是「這個人沒填」，「未指定」是「發案者沒有指定技能」，
// 兩個意思不同，但形狀（屬性＋一段字）一樣，所以是同一個元件加一個 prop，不另寫一份。

export function Missing({ field, label = '未提供' }: { field: 'hours_per_week' | 'bio' | 'needed_skills'; label?: string }) {
  return (
    <span data-missing={field} className="text-ink-muted">
      {label}
    </span>
  )
}
