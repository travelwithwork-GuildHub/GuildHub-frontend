import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import nextConfig from '../next.config'
import NotFound from '@/app/not-found'

describe('根路徑是網站的入口', () => {
  it('[FE-X01-S01] `/` 不再被轉址走 —— 它自己是一個頁面', async () => {
    // ⚠️ **這一條原本要求 `/` 以 307 轉到 `/world`，而 `FE-A06` 把它改了。**
    // 原文自己就寫著那個轉址是暫時的：「根路徑之後會改為其他入口，
    // 永久轉址會被瀏覽器快取且使用者無法自行清除」。`FE-A06` 就是那個「之後」。
    //
    // ⚠️⚠️ **這一條是負向的，而它非有不可**：`redirects()` 的優先序
    // **在路由之前**。把那條轉址留著的話，新的首頁做好了也永遠看不到 ——
    // 而**畫面上看不出任何異狀**（打開 `/` 就是跳到世界，跟以前一模一樣）。
    const redirects = (await nextConfig.redirects?.()) ?? []

    expect(
      redirects.find((r) => r.source === '/'),
      '`/` 還有轉址規則 —— 首次進入的頁面會被它蓋掉，而且看不出來',
    ).toBeUndefined()
  })

  it('[FE-X01-S02] 未定義的路徑得到可辨識的 404，不會被轉址規則吃掉', async () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: '找不到這個頁面' })).toBeInTheDocument()

    // 防的是**萬用比對**：`/:path*` 之類的 source 會把所有 404 吃掉變成轉址。
    //
    // 不寫成「只准有 `/` 這一條」—— 那會擋到之後任何一條正常的新增轉址，
    // 而那不是這條 Scenario 要保護的東西。
    const redirects = (await nextConfig.redirects?.()) ?? []
    for (const r of redirects) {
      expect(r.source, `轉址 source 含路徑參數或萬用字元：${r.source}`).not.toMatch(/[:*]/)
    }
  })
})
