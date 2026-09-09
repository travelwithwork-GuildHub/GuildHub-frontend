import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// 規格：openspec/changes/fe-o14-preview-deploy/specs/runtime-config/spec.md
//   Requirement: 部署設定的錯誤 SHALL 在建置時失敗 —— FE-O14-S03 / S04 / S05
//
// ⚠️ **這裡跑的是真的 `next build`，不是呼叫那個驗證函式。**
//
// design 的 V1：「函式會拋錯」證明不了「建置會失敗」—— 中間隔著
// `next.config.ts` 有沒有真的被載入、拋出的錯有沒有被 Next 吞掉。
// 唯一算數的判定是**結束碼**。
//
// 量過的耗時：失敗案例約 4 秒（在 config 載入時就結束，不進編譯），
// 成功案例第一次約 10 秒、之後有快取會更快。
//
// ⚠️ **共用 `.next` 是安全的，而且量過**：先跑一次成功的建置把 `.next` 填滿，
// 緊接著跑失敗案例，仍然 `exit=1`。原因是設定驗證發生在 config 載入時，
// **早於任何快取查詢** —— 一份舊的 `.next` 沒有機會讓失敗案例變綠。

/** 每次建置都從一組**乾淨的**環境變數開始 —— 不繼承外面的 `NEXT_PUBLIC_*`。 */
function build(vars: Record<string, string>): { code: number | null; output: string } {
  const result = spawnSync('npx', ['next', 'build'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      // Next 需要它找得到 node_modules 以外的東西；缺了會在別的地方失敗，
      // 而那種失敗看起來會像「閘門有效」——正是這裡最不想要的假綠。
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      ...vars,
    },
  })
  return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const VALID_WS = 'wss://guildhub.example/ws'

describe('部署設定的建置閘門', () => {
  it(
    '[FE-O14-S03] 缺少必要設定的部署建置會失敗，preview 與 production 都是',
    () => {
      const prod = build({ NEXT_PUBLIC_APP_ENV: 'production', NEXT_PUBLIC_REALTIME_ADAPTER: 'guildhub' })
      expect(prod.code, 'production 缺 WebSocket 位址竟然建置成功了').not.toBe(0)
      expect(prod.output).toMatch(/NEXT_PUBLIC_GUILDHUB_WS/)

      // **preview 不能被排除在外** —— preview 部署是拿給人看的，
      // 它壞掉的方式跟 production 完全一樣。
      const preview = build({ NEXT_PUBLIC_APP_ENV: 'preview', NEXT_PUBLIC_REALTIME_ADAPTER: 'guildhub' })
      expect(preview.code, 'preview 缺 WebSocket 位址竟然建置成功了').not.toBe(0)
      expect(preview.output).toMatch(/NEXT_PUBLIC_GUILDHUB_WS/)
    },
    120_000,
  )

  it(
    '[FE-O14-S04] 環境代號缺席的 production 建置會失敗',
    () => {
      // 這一條就是實測過的那個組合：以前它會建置成功、部署成功，
      // 然後線上只剩「GuildHub」四個字。
      const result = build({})
      expect(result.code, '代號缺席竟然建置成功了 —— 那個產物一載入就會炸').not.toBe(0)
      expect(result.output).toMatch(/NEXT_PUBLIC_APP_ENV/)
    },
    120_000,
  )

  it(
    '[FE-O14-S05] 設定齊全、以及本機開發，建置都要成功',
    () => {
      // **沒有這一條，上面兩條是恆真的** —— 一個「永遠讓建置失敗」的實作
      // 也會讓它們通過，而那個實作會把所有人的建置一起擋死。
      const withBackend = build({
        NEXT_PUBLIC_APP_ENV: 'production',
        NEXT_PUBLIC_REALTIME_ADAPTER: 'guildhub',
        NEXT_PUBLIC_GUILDHUB_WS: VALID_WS,
      })
      expect(withBackend.code, withBackend.output.slice(-600)).toBe(0)

      // 沒有即時後端是一個**合法的部署** —— 不必填一個假位址進去。
      const noBackend = build({
        NEXT_PUBLIC_APP_ENV: 'production',
        NEXT_PUBLIC_REALTIME_ADAPTER: 'none',
      })
      expect(noBackend.code, noBackend.output.slice(-600)).toBe(0)

      // 本機什麼都不設也不能被擋住。
      const local = build({ NEXT_PUBLIC_APP_ENV: 'local' })
      expect(local.code, local.output.slice(-600)).toBe(0)
    },
    180_000,
  )
})
