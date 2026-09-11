import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigError, dataAdapter } from '@/config/env'
import { ContractDriftError, NetworkError, buildRequest, send } from '@/api/transport'
import { ProfileOut } from '@/api/contract/rest'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 元件不知道自己連的是誰 —— Scenario FE-O02-S01 / S02 / S03
//
// ⚠️ **這個檔案本來也在用 `GET /api/profiles/me`** —— 跟 `operations.ts`
// 與 `api-operations-coverage.test.ts` 抄了同一個不存在的端點，
// 三個地方一起錯，所以三個地方互相印證。`FE-A01-S14` 把 `path` 綁進型別之後
// 它們同時紅了。這裡改用 `/api/me`：它是真的存在的那一個。
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

    const request = buildRequest({ method: 'GET', path: '/api/me' })

    expect(request.url).toBe('http://127.0.0.1:9999/api/me')
    expect(request.method).toBe('GET')
  })

  it('[FE-O02-S01] 送出的請求以 credentials: include 建構', () => {
    // ⚠️ **不是驗「server 收到 cookie」** —— 那件事在這個環境驗不了：
    // 實測 `document.cookie` 設得進去，但 server 收到的 `req.headers.cookie`
    // 是 `null`（jsdom 的 cookie jar 跟 Node 的 fetch 沒有連通）。
    // 端到端的 cookie 是 `FE-O08`（W5）。規格的 `S01` 已經按這個結果更正過。
    const request = buildRequest({ method: 'GET', path: '/api/me' })

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
    const without = buildRequest({ method: 'GET', path: '/api/me' })

    expect(withBody.headers.get('content-type')).toBe('application/json')
    expect(without.headers.get('content-type')).toBeNull()
  })

  it('[FE-O02-S02] 選 internal 時，請求打同源的 /api，不帶真後端的主機名；回應仍走同一份契約', async () => {
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'internal'
    process.env.NEXT_PUBLIC_GUILDHUB_REST = 'http://real-backend.example:8000'
    const request = buildRequest({ method: 'GET', path: '/api/me' })
    const url = new URL(request.url)
    expect(url.pathname).toBe('/api/me')
    expect(url.host, '內部 adapter 打到了真後端的主機').not.toBe('real-backend.example:8000')
    expect(url.origin, '同源：jsdom 裡是 location.origin').toBe(window.location.origin)

    // 送出去也是同源；回來的東西一樣過契約（回應少欄位在邊界炸）。
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await expect(send('getMyProfile', { method: 'GET', path: '/api/me' }, ProfileOut)).rejects.toBeInstanceOf(ContractDriftError)
    const sent = fetchSpy.mock.calls[0]?.[0] as Request
    expect(new URL(sent.url).origin).toBe(window.location.origin)
    expect(new URL(sent.url).pathname).toBe('/api/me')

    // 對照：guildhub 打的是設定的主機。
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
    expect(new URL(buildRequest({ method: 'GET', path: '/api/me' }).url).host).toBe('real-backend.example:8000')
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

// 規格：openspec/changes/fe-x03-error-vocabulary/specs/error-vocabulary/spec.md
//   Requirement: 每一個失敗都有一個封閉種類 —— S08 的來源端：`send()` 是唯一呼叫 `fetch` 的地方，
//   它把「拿到回應之前失敗」包成 `NetworkError`，而且**只包那一種**。
describe('fetch 的失敗在 send() 變成 NetworkError', () => {
  const spec = { method: 'GET', path: '/api/me' } as const

  it('[FE-X03-S08] 連線被拒 → NetworkError，原因留在 cause', async () => {
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
    // port 9 是 discard，沒有人在聽 —— 不連任何外部服務。
    process.env.NEXT_PUBLIC_GUILDHUB_REST = 'http://127.0.0.1:9'
    const error = await send('getMyProfile', spec, ProfileOut).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).cause).toBeInstanceOf(TypeError)
  })

  it('[FE-X03-S17] 被中止的請求原樣往上丟，不包成 NetworkError', async () => {
    // 包了的話，每一次換頁的中止都會被翻成「連不上伺服器」（實作審查第二輪抓到的）。
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
    process.env.NEXT_PUBLIC_GUILDHUB_REST = 'http://127.0.0.1:9'
    const controller = new AbortController()
    controller.abort()
    const error = await send('getMyProfile', { ...spec, signal: controller.signal }, ProfileOut).catch(
      (e: unknown) => e,
    )
    expect(error).not.toBeInstanceOf(NetworkError)
    expect((error as { name?: string }).name).toBe('AbortError')
  })

  it('[FE-X03-S19] 位址沒設是設定錯誤，不是 NetworkError', async () => {
    // `buildRequest` 要在 try 外面：設定錯誤包成 NetworkError 就是把「位址沒設」說成「檢查一下網路」。
    process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
    process.env.NEXT_PUBLIC_APP_ENV = 'production'
    delete process.env.NEXT_PUBLIC_GUILDHUB_REST
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const error = await send('getMyProfile', spec, ProfileOut).catch((e: unknown) => e)
    delete process.env.NEXT_PUBLIC_APP_ENV
    expect(error).toBeInstanceOf(ConfigError)
    expect(error).not.toBeInstanceOf(NetworkError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
