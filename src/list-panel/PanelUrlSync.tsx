'use client'

import { useEffect, useRef, useState } from 'react'
import { useListPanel } from './ListPanelProvider'
import { depthOf, parsePanelUrl, serializePanelUrl } from './urlState'

// 網址 ⇄ 開著哪一層。規格 `FE-B09`〈網址表示開著哪一層，複製它就能還原〉、
// 〈互動寫回網址；上一頁與 Escape 等效〉。
//
// 起始狀態是 provider 掛載時從網址解析的（已 canonical）。這裡負責兩個方向：
//
// 狀態 → 網址（design `D2`）：層數變多（開清單、開詳情）→ `pushState`；不變（翻頁、canonicalize）→ `replaceState`；
// 變少（Escape、關閉）→ **不寫網址，改成「退」**：本站有上一層就 `history.go(-n)`，沒有就 `replaceState` 成上一層。
// **網址已經是這樣了就不動** —— 那是迴圈的終止條件。
//
// 網址 → 狀態：popstate（上一頁／下一頁）→ 解析 → `restore`。
//
// ⚠️ **`history.state` 是 Next 的，不能整個蓋掉。** App Router 把自己的路由狀態放在裡面，
// 蓋掉之後按上一頁離開 `/world` 時 router 會崩（審查抓到的）。寫的時候一律展開原本的再加自己的。
//
// ⚠️ **「本站有沒有上一層」不能只看層數。** 深連結直達詳情的人，網址是兩層、瀏覽紀錄裡卻沒有本站的清單那一層 ——
// `back()` 會把他退出本站（`S11`）。所以每個自己寫的 entry 都標 `{ session, pushed }`：`session` 是這次掛載的識別，
// `pushed` 是「從這個 entry 往回，有幾層是這次掛載 push 的」。退 n 層只在 `pushed >= n` 時用 `go(-n)`。
//
// ⚠️ **Escape 照舊同步改狀態**（`FE-X06-S01` 是同步斷言）。退網址的事在這裡、晚一個 tick（design `D3`）。
// 退的期間 `pendingBack` 擋住狀態 → 網址那一支，不然它會在 popstate 之前把短網址 push 回去。
//
// 只用原生 `history`，不用 `next/navigation`：`useSearchParams` 要 Suspense 邊界、`router.replace`
// 會走一趟 RSC —— 這裡要的只是「網址跟著狀態」，而且要在 jsdom 裡驗得到。

const KEY = 'guildhubPanel'

interface Lineage {
  session: string
  pushed: number
}

function lineageOf(state: unknown): Lineage | null {
  if (typeof state !== 'object' || state === null) return null
  const mark = (state as Record<string, unknown>)[KEY]
  if (typeof mark !== 'object' || mark === null) return null
  const { session, pushed } = mark as Record<string, unknown>
  return typeof session === 'string' && typeof pushed === 'number' ? { session, pushed } : null
}

function write(mode: 'push' | 'replace', search: string, lineage: Lineage) {
  const { pathname, hash } = window.location
  const url = `${pathname}${search}${hash}`
  const state = { ...(window.history.state as Record<string, unknown> | null), [KEY]: lineage }
  if (mode === 'push') window.history.pushState(state, '', url)
  else window.history.replaceState(state, '', url)
}

export function PanelUrlSync(): null {
  const { open, selected, page, restore } = useListPanel()
  const route = { panel: open, profile: selected, page }
  const search = serializePanelUrl(route)
  const depth = depthOf(route)
  const [session] = useState(() => Math.random().toString(36).slice(2))

  const latestRef = useRef({ search, depth })
  useEffect(() => {
    latestRef.current = { search, depth }
  })
  const pendingBackRef = useRef(false)

  // 狀態 → 網址。用 ref 讀最新狀態：popstate 的處理也要呼叫它。
  const reconcileRef = useRef(() => {})
  useEffect(() => {
    reconcileRef.current = () => {
      const { search, depth } = latestRef.current
      if (pendingBackRef.current) return
      const current = window.location.search
      if (current === search) return
      const ours = lineageOf(window.history.state)
      const inherited = ours?.session === session ? ours.pushed : 0
      const urlDepth = depthOf(parsePanelUrl(current))
      if (depth > urlDepth) {
        write('push', search, { session, pushed: inherited + 1 })
        return
      }
      if (depth === urlDepth) {
        write('replace', search, { session, pushed: inherited })
        return
      }
      const delta = urlDepth - depth
      if (inherited >= delta) {
        pendingBackRef.current = true
        window.history.go(-delta)
        return
      }
      // 深連結直達（或先去了別的路由再回來）：本站沒有上一層，替換成上一層的網址，不離站（`S11`）。
      write('replace', search, { session, pushed: 0 })
    }
  })
  useEffect(() => {
    reconcileRef.current()
  }, [search, depth])

  // 網址 → 狀態。
  useEffect(() => {
    const onPopState = () => {
      if (pendingBackRef.current) {
        // 是自己退的：網址現在應該跟狀態一樣；不一樣（退的期間又關了一層）就再退一次。
        pendingBackRef.current = false
        reconcileRef.current()
        return
      }
      // 上一頁／下一頁：網址說的跟狀態一樣就不動；不一樣就套上（狀態變了 → 上面那支再比一次 → 一樣 → 停）。
      const parsed = parsePanelUrl(window.location.search)
      if (serializePanelUrl(parsed) === latestRef.current.search) return
      restore(parsed)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [restore])

  return null
}
