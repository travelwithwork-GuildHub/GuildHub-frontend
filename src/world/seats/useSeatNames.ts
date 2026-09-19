'use client'

import { useEffect, useRef, useState } from 'react'
import { getProfile } from '@/api/operations'

// 座位占用者的名字（design D2 最後一條）：每個 id 在這一次掛載期間查一次 `GET /api/profiles/{id}`，
// `null` ＝ 查不到（畫「有人」，不畫空白、不畫 id —— `FE-J13-S01`）。自己的 id 不查（身分裡有）。
// 跟收件匣的 `resolveNames` 同一個形狀，但生命週期綁在房間：`RoomSeats` 以 `projectId` 為 key 重掛，換房就從頭查。
// 一個 controller 管整次掛載：卸載才中止 —— 新占用者出現時不能把前一個人還在飛的查詢打掉。

export type SeatNames = Readonly<Record<string, string | null>>

export function useSeatNames(userIds: readonly string[], me: string): SeatNames {
  const [names, setNames] = useState<SeatNames>({})
  const asked = useRef(new Set<string>())
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    return () => controller.abort()
  }, [])
  // 只看「有哪些 id」（排序後的字串），不看陣列身分：輪詢每 30 秒回一個新陣列。
  const wanted = [...new Set(userIds.filter((id) => id !== me))].sort().join(',')
  useEffect(() => {
    const controller = controllerRef.current
    if (wanted === '' || controller === null) return
    for (const id of wanted.split(',')) {
      if (asked.current.has(id)) continue
      asked.current.add(id)
      void getProfile(id, { signal: controller.signal })
        .then((profile) => setNames((prev) => ({ ...prev, [id]: profile.display_name })))
        .catch(() => {
          if (!controller.signal.aborted) setNames((prev) => ({ ...prev, [id]: null }))
        })
    }
  }, [wanted])
  return names
}
