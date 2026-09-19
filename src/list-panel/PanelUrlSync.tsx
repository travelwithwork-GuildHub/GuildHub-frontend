'use client'

import { useEffect, useRef, useState } from 'react'
import { useScene } from '@/world/scenes/SceneProvider'
import { parseWorldUrl, serializeWorldUrl } from '@/world/scenes/urlState'
import { useListPanel } from './ListPanelProvider'
import { CLOSED, depthOf } from './urlState'

// 網址 ⇄ 開著哪一層、在哪個場景。規格 `FE-B09`〈網址表示開著哪一層，複製它就能還原〉、
// 〈互動寫回網址；上一頁與 Escape 等效〉；`FE-V01-S09`／`S13`／`S14`〈網址表示所在的場景，與面板參數同一個寫入者〉。
//
// ⚠️ 檔名還叫 `PanelUrlSync.tsx`：搬到 `world/scenes/` 會讓 PR 大小規則把整個檔案算成新寫的
// （改名＝刪一個加一個），超過產品碼上限 —— 搬家是下一個 `chore/`，這裡只改內容。
//
// **這是 `/world` 網址唯一的寫入者**（design D2 的 C）。場景（`room`）與面板各有自己的 codec，
// 這裡組合、canonical、寫一次。場景換了 → 依 `SceneProvider` 說的 push／replace 寫（**不走層數比較**：
// 房間不是面板的一層，從兩層深的詳情進房間也是 push，不是「退」）；場景沒換 → 面板的規則照舊。
// 身分還沒問完（`settled: false`）→ 不動網址：那時 `?room=` 還不知道進不進得去，洗掉就回不去了。
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

export function WorldUrlSync(): null {
  const { open, selected, page, restore, closePanel } = useListPanel()
  const scene = useScene()
  const { applyUrl, settleDenied } = scene
  const room = scene.scene.id === 'room' ? scene.scene.projectId : null
  // 房間裡沒有看板，也就沒有清單那一層（`FE-V01-S08`）。
  // `selected` 依面板種類落到 `profile` 或 `project`（`FE-B03`）
  const world = { room, panel: room === null ? { panel: open, profile: open === 'profiles' ? selected : null, project: open === 'projects' ? selected : null, page } : CLOSED }
  const search = serializeWorldUrl(world)
  const depth = depthOf(world.panel)
  const [session] = useState(() => Math.random().toString(36).slice(2))

  const latestRef = useRef({ search, depth, room, desiredRoom: scene.desiredRoom, settled: scene.settled, urlMode: scene.urlMode })
  useEffect(() => {
    latestRef.current = { search, depth, room, desiredRoom: scene.desiredRoom, settled: scene.settled, urlMode: scene.urlMode }
  })
  const pendingBackRef = useRef(false)

  // 進房間的那一次，面板狀態同時歸零（`FE-V01-S09`）—— 面板的 DOM 也要關，不只是網址上沒有它。
  useEffect(() => {
    if (room !== null && open !== null) closePanel()
  }, [room, open, closePanel])

  // 狀態 → 網址。用 ref 讀最新狀態：popstate 的處理也要呼叫它。
  const reconcileRef = useRef(() => {})
  useEffect(() => {
    reconcileRef.current = () => {
      const { search, depth, room, desiredRoom, settled, urlMode } = latestRef.current
      if (pendingBackRef.current) return
      if (!settled) return
      const current = window.location.search
      if (current === search) return
      const ours = lineageOf(window.history.state)
      const inherited = ours?.session === session ? ours.pushed : 0
      const urlState = parseWorldUrl(current)
      if (urlState.room !== room) {
        // 場景換了：進房間、回大廳是 push；失敗與「沒票的深連結」是 replace（`FE-V01-S06`／`S14`）。
        write(urlMode, search, { session, pushed: urlMode === 'push' ? inherited + 1 : inherited })
        // 沒票的 `?room=` 被 canonical 掉了：願望也要收斂，不然它會留在那裡等下一次推導把人送進去。
        if (room === null && desiredRoom !== null) settleDenied()
        return
      }
      const urlDepth = depthOf(urlState.panel)
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
  }, [search, depth, scene.settled])

  // 網址 → 狀態。
  useEffect(() => {
    const onPopState = () => {
      if (pendingBackRef.current) {
        // 是自己退的：網址現在應該跟狀態一樣；不一樣（退的期間又關了一層）就再退一次。
        pendingBackRef.current = false
        reconcileRef.current()
        return
      }
      // 上一頁／下一頁：網址說的跟狀態一樣就只做 canonicalize（落在別人寫的、不 canonical 的 entry 上 ——
      // 審查抓到的）；不一樣就套上（狀態變了 → 上面那支再比一次 → 一樣 → 停）。
      const parsed = parseWorldUrl(window.location.search)
      // 場景跟著網址（`FE-V01-S09`）：比的是**想去的**，不是實際的 —— 想去 A 但沒票（或身分沒問完）時實際在大廳，
      // 這時上一頁回到 `/world`，實際沒變、想去的變了；不套上的話，身分問完那一刻會把人送進一間網址早就不是的房
      // （審查抓到的）。所以這一行在 canonicalize 的早退**之前**。
      if (parsed.room !== latestRef.current.desiredRoom) applyUrl(parsed.room)
      if (serializeWorldUrl(parsed) === latestRef.current.search) {
        reconcileRef.current()
        return
      }
      // 上一頁／下一頁要求重開看板也經過協調者（`FE-X16-S17`）：被拒 → 把**目前這一筆**改回實際狀態（跟 canonical 同一招）、不 push、畫面不換
      if (!restore(parsed.panel)) {
        const ours = lineageOf(window.history.state)
        write('replace', latestRef.current.search, { session, pushed: ours?.session === session ? ours.pushed : 0 })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [restore, applyUrl, session])

  return null
}
