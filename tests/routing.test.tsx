import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import nextConfig from '../next.config'
import NotFound from '@/app/not-found'

describe('根路徑導向世界', () => {
  it('[FE-X01-S01] `/` 轉址到 `/world`，而且是暫時轉址（307）不是永久（308）', async () => {
    const redirects = await nextConfig.redirects?.()
    const root = redirects?.find((r) => r.source === '/')

    expect(root, 'next.config 沒有 `/` 的轉址規則').toBeDefined()
    expect(root?.destination).toBe('/world')
    // `permanent: false` → 307。true 會是 308，被瀏覽器永久快取且使用者清不掉。
    expect(root?.permanent).toBe(false)
  })

  // ⚠️ 上面只證明到**設定層**。「HTTP 回應真的是 307」這件事，
  // 設定寫對了也可能被 middleware 或 rewrite 蓋掉，而這個測試照樣綠。
  // 那個缺口由 design.md〈驗證方式〉的 V1 用 curl 打真的 server 補上。

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
