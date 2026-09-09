import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigError, dataAdapter } from '@/config/env'
import { AdapterNotImplementedError, buildRequest, send } from '@/api/transport'
import { ProfileOut } from '@/api/contract/rest'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 元件不知道自己連的是誰 —— Scenario FE-O02-S01 / S02 / S03
//
// 這個檔案只驗**送出去之前**的事：位址怎麼組、憑證怎麼帶、adapter 怎麼選。
// 走完整往返（契約驗證、回應解析、HTTP 錯誤）的測試在 `api-contract-io.test.ts`，
// 那裡有一個用同一份契約驗請求的測試 server。

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  vi.restoreAllMocks()
})

describe('資料存取的傳輸層', () => {
  it('[FE-O02-S01] 位址來自 restBase()，不是寫死的', () => {
    process.env.NEXT_PUBLIC_GUILDHUB_REST = 'http://127.0.0.1:9999'

    const request = buildRequest({ method: 'GET', path: '/api/profiles/me' })

    expect(request.url).toBe('http://127.0.0.1:9999/api/profiles/me')
    expect(request.method).toBe('GET')
  })

  it('[FE-O02-S01] 送出的請求以 credentials: include 建構', () => {
    // ⚠️ **不是驗「server 收到 cookie」** —— 那件事在這個環境驗不了：
    // 實測 `document.cookie` 設得進去，但 server 收到的 `req.headers.cookie`
    // 是 `null`（jsdom 的 cookie jar 跟 Node 的 fetch 沒有連通）。
    // 端到端的 cookie 是 `FE-O08`（W5）。規格的 `S01` 已經按這個結果更正過。
    const request = buildRequest({ method: 'GET', path: '/api/profiles/me' })

    expect(request.credentials).toBe('include')
    // **成對比較**：證明 'include' 不是這個環境的預設值，
    // 否則拿掉那一行這條也會通過
    expect(new Request(request.url).credentials).toBe('same-origin')
  })

  it('[FE-O02-S01] 路徑參數會被 URL 編碼', () => {
    const request = buildRequest({
      method: 'GET',
      path: '/api/profiles/{profile_id}',
      params: { profile_id: 'a/b' },
    })

    // 不編碼的話那個斜線會改變路由 —— 打到的是完全不同的端點
    expect(new URL(request.url).pathname).toBe('/api/profiles/a%2Fb')
  })

  it('[FE-O02-S01] 有 body 時帶 content-type，沒有 body 時不帶', () => {
    const withBody = buildRequest({ method: 'POST', path: '/api/login', body: { nickname: '阿福' } })
    const without = buildRequest({ method: 'GET', path: '/api/profiles/me' })

    expect(withBody.headers.get('content-type')).toBe('application/json')
    expect(without.headers.get('content-type')).toBeNull()
  })

  it('[FE-O02-S02] 選 internal 時明顯失敗，而且不送出任何請求', async () => {
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'internal'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      send('getMyProfile', { method: 'GET', path: '/api/profiles/me' }, ProfileOut),
    ).rejects.toBeInstanceOf(AdapterNotImplementedError)

    // **這一行才是重點。** 只驗「有拋錯」的話，一個「先送出去、失敗了再拋錯」
    // 的實作也會通過 —— 那會在 internal 模式下偷偷打到真後端。
    expect(fetchSpy, 'internal 模式下送出了請求').not.toHaveBeenCalled()
  })

  it('[FE-O02-S02] 錯誤訊息指出操作、adapter，以及哪一個工作項目會補上它', async () => {
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'internal'
    const call = () => send('getMyProfile', { method: 'GET', path: '/x' }, ProfileOut)

    await expect(call()).rejects.toThrow(/getMyProfile/)
    await expect(call()).rejects.toThrow(/internal/)
    // 沒有這一段的話，看到錯誤的人不知道要等什麼
    await expect(call()).rejects.toThrow(/FE-O03/)
  })

  it('[FE-O02-S03] 設定值無法辨識時拋錯，而且不退回任何一個 adapter', () => {
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'intenral'

    expect(() => dataAdapter()).toThrow(ConfigError)
    // 訊息要列出合法值，否則打錯字的人不知道正確的是什麼
    expect(() => dataAdapter()).toThrow(/guildhub/)
    expect(() => dataAdapter()).toThrow(/internal/)
  })

  it('[FE-O02-S03] 沒有設定時預設 guildhub —— 今天只有它可用', () => {
    expect(dataAdapter()).toBe('guildhub')
  })
})
