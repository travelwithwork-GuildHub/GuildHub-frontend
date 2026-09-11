'use client'

import { useEffect } from 'react'
import { useListPanel } from './ListPanelProvider'
import { serializePanelUrl } from './urlState'

// 狀態 → 網址。規格 `FE-B09`〈網址表示開著哪一層，複製它就能還原〉。
//
// 起始狀態是 provider 掛載時從網址解析的（已 canonical）。這裡負責把狀態的變化寫回網址：
// 掛載時網址不是 canonical 的（`?page=0`、`?panel=bogus`⋯⋯`S05`）就替換掉；
// 之後頁碼變了（起始頁撲空退回第 0 頁，`S04`）也替換。**網址已經是這樣了就不動** —— 那是迴圈的終止條件。
//
// ⚠️ **`history.state` 是 Next 的，不能整個蓋掉。** App Router 把自己的路由狀態放在裡面，
// 蓋掉之後按上一頁離開 `/world` 時 router 會崩（審查抓到的）。寫的時候一律展開原本的再加自己的。
//
// 只用原生 `history`，不用 `next/navigation`：`useSearchParams` 要 Suspense 邊界、`router.replace`
// 會走一趟 RSC —— 這裡要的只是「網址跟著狀態」，而且要在 jsdom 裡驗得到。

function writeUrl(search: string) {
  const { pathname, hash } = window.location
  window.history.replaceState({ ...window.history.state }, '', `${pathname}${search}${hash}`)
}

export function PanelUrlSync(): null {
  const { open, selected, page } = useListPanel()
  const search = serializePanelUrl({ panel: open, profile: selected, page })

  useEffect(() => {
    if (window.location.search === search) return
    writeUrl(search)
  }, [search])

  return null
}
