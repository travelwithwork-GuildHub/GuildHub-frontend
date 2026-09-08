import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_ENVS, ConfigError, REST_CREDENTIALS, appEnv, restBase, wsUrl } from '@/config/env'

// 規格：openspec/changes/fe-o09-env/specs/runtime-config/spec.md
//   Requirement: 本機預設指向開發者自己起的那一份後端 —— FE-O09-S02
//   Requirement: 部署出去的版本缺少設定時要立刻失敗 —— FE-O09-S03 / S04 / S07
//   Requirement: 位址的協定寫錯要在讀設定時就失敗 —— FE-O09-S05
//   Requirement: 憑證模式是單一來源 —— FE-O09-S06
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過（`FE-O01` 踩過：寫在 `describe` 上等於沒寫）。
//
// 設定模組匯出的是**函式**不是常數，所以這裡改環境變數再呼叫就好，
// 不必 `vi.resetModules()` ＋ 動態 import —— 那種測試寫錯時會安靜地測到快取。

// 用 `vi.stubEnv` 而不是直接指派：`process.env.NODE_ENV` 在 Next 的型別裡是
// **唯讀的**，直接指派 vitest 跑得過（它不做型別檢查）但 `tsc` 會紅 ——
// 而且那會連帶弄紅 `typecheck-negative.test.ts` 的陽性對照（實測踩過）。
const set = (name: string, value: string | undefined) => vi.stubEnv(name, value)

afterEach(() => {
  vi.unstubAllEnvs()
})

/** 把環境設成部署目標。 */
const deployAs = (env: 'preview' | 'production') => set('NEXT_PUBLIC_APP_ENV', env)

describe('執行期設定', () => {
  it('[FE-O09-S02] 什麼都沒設定時拿到本機位址', () => {
    expect(restBase()).toBe('http://localhost:8000')
    expect(wsUrl()).toBe('ws://localhost:8000/ws')
  })

  it('[FE-O09-S03] 部署環境缺任一個位址都要拋錯並指出是哪一個', () => {
    deployAs('production')
    set('NEXT_PUBLIC_GUILDHUB_WS', 'wss://guildhub.example/ws')
    // 只驗一個變數的話，另一個沒被當成必填也會過（審查者抓到的）。
    expect(() => restBase()).toThrow(/NEXT_PUBLIC_GUILDHUB_REST/)

    set('NEXT_PUBLIC_GUILDHUB_WS', undefined)
    set('NEXT_PUBLIC_GUILDHUB_REST', 'https://guildhub.example')
    expect(() => wsUrl()).toThrow(/NEXT_PUBLIC_GUILDHUB_WS/)

    // 「MUST NOT 回傳任何 localhost 位址」
    set('NEXT_PUBLIC_GUILDHUB_REST', undefined)
    for (const read of [restBase, wsUrl]) {
      let returned: string | null = null
      try {
        returned = read()
      } catch {
        /* 預期會拋 */
      }
      expect(returned, '部署環境竟然安靜地退回了 localhost').toBeNull()
    }
  })

  it('[FE-O09-S04] 同一組缺席在本機是可以的', () => {
    // **沒有這一條，上一條是恆真的** —— 一個永遠拋錯的實作也會讓它通過。
    expect(() => restBase()).not.toThrow()
    expect(() => wsUrl()).not.toThrow()
  })

  it('[FE-O09-S07] 環境代號無法辨識，或部署版根本沒給，都要拋錯', () => {
    set('NEXT_PUBLIC_APP_ENV', 'prod')
    expect(() => appEnv(), 'production 打成 prod 應該拋錯').toThrow(ConfigError)
    // 「MUST NOT 當成本機處理」—— 退回本機的話它會安靜地連到 localhost
    expect(() => restBase()).toThrow(/prod/)

    set('NEXT_PUBLIC_APP_ENV', undefined)
    set('NODE_ENV', 'production')
    expect(() => appEnv(), '代號缺席而建置模式是 production，應該拋錯').toThrow(
      /NEXT_PUBLIC_APP_ENV/,
    )

    set('NODE_ENV', 'development')
    expect(appEnv(), '代號缺席而不是 production 建置，應該視為本機').toBe('local')
  })

  it('[FE-O09-S05] 協定寫錯在讀設定時就拋錯', () => {
    set('NEXT_PUBLIC_GUILDHUB_WS', 'http://localhost:8000/ws')
    expect(() => wsUrl(), 'WS 變數填了 http:// 應該拋錯').toThrow(/http:/)

    set('NEXT_PUBLIC_GUILDHUB_WS', 'ws://localhost:8000/ws')
    set('NEXT_PUBLIC_GUILDHUB_REST', 'ws://localhost:8000')
    expect(() => restBase(), 'REST 變數填了 ws:// 應該拋錯').toThrow(/ws:/)

    set('NEXT_PUBLIC_GUILDHUB_REST', 'https://guildhub.example')
    expect(() => restBase()).not.toThrow()
    expect(() => wsUrl()).not.toThrow()
  })

  it('[FE-O09-S06] 憑證模式的值是 include', () => {
    // 這一條**只保證有單一來源、值是 include**。
    // 「每個 adapter 的請求真的帶上它」是 FE-O02 的驗收 ——
    // 這一刀沒有任何資料存取存在，證明不了那件事。
    expect(REST_CREDENTIALS).toBe('include')
  })

  it('空字串跟沒設定是同一件事', () => {
    // 漏掉 NEXT_PUBLIC_ 前綴的變數在 client bundle 裡是**空字串**，不是 undefined。
    // 用 `=== undefined` 判缺席會讓它一路通過，然後在 new URL('') 才炸。
    set('NEXT_PUBLIC_GUILDHUB_REST', '')
    expect(restBase(), '空字串應該被當成缺席，退回本機預設').toBe('http://localhost:8000')

    deployAs('production')
    expect(() => restBase(), '部署環境下空字串應該跟缺席一樣拋錯').toThrow(
      /NEXT_PUBLIC_GUILDHUB_REST/,
    )
  })

  it('環境代號的列舉就是那三個', () => {
    expect([...APP_ENVS]).toEqual(['local', 'preview', 'production'])
    for (const env of APP_ENVS) {
      set('NEXT_PUBLIC_APP_ENV', env)
      expect(appEnv()).toBe(env)
    }
  })
})
