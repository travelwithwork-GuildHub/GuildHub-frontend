// 「未提供」的節點。規格 `FE-B04-S02`／`S10`：`hours_per_week: null`、`bio: null` 不是 0、不是空白。
//
// **機器可辨識**（`data-missing`）—— 判準找的是這個屬性，不是那兩個字。
// 「沒填」跟「零小時」是兩件事；畫成 0 的話發案者會以為這個人一週都沒空。

export function Missing({ field }: { field: 'hours_per_week' | 'bio' }) {
  return (
    <span data-missing={field} className="text-ink-muted">
      未提供
    </span>
  )
}
