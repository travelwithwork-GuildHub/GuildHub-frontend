import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'

// 規格：openspec/changes/fe-o21-boundary-lint/specs/
//   realtime-client/spec.md  Requirement: 只有 RemoteWorld 可以 import client 的值 —— S01／S02／S03／S06
//   runtime-config/spec.md   Requirement: 設定模組不依賴資料層 —— S04
//   api-contract/spec.md     Requirement: 契約不 import 設定 —— S05
// 另外一條標 `FE-O09-S01`：design D3 順路補回的洞（`rest.ts`／`ws.ts` 讀 `process.env` 原本不報）。
//
// 用 `lintText` 帶虛擬 filePath 走 repo 的實際設定，理由照 `tests/env-lint-rule.test.ts` 的檔頭：
// 虛擬路徑讓例外的 glob 可以維持精確。**不建檔案、不連任何外部服務。**
//
// **每一條都要自己的逾時**（第一次 `lintText` 會把整份 flat config 載進來），理由同上。
//
// 斷言看的是**訊息**，不是 ruleId：三條邊界各有一則 D4 的訊息，而同一個檔案可能同時被
// 別條規則（no-unused-vars、no-fetch）報 —— 那些不是這裡要證明的事。

const ROOT = path.resolve(import.meta.dirname, '..')

async function messagesFor(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: ROOT })
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, filePath) })
  if (!result) throw new Error(`ESLint 沒有回傳 ${filePath} 的結果`)
  return result.messages
}

const blocked = (msgs: Awaited<ReturnType<typeof messagesFor>>, needle: string) =>
  msgs.filter((m) => m.message.includes(needle))

// design D4 的三則訊息，各取一段不會跟別的規則撞到的字。
const CLIENT_ONLY_VIA_REMOTE_WORLD = '即時訊息只有一條路'
const CONFIG_IS_A_LEAF = '設定模組是依賴樹的葉子'
const CONTRACT_KNOWS_NO_ADDRESS = '契約不知道後端在哪'
const ENV_ONLY_HERE = '環境變數只能在'

/** 把某個模組路徑套進規格閉集裡的每一種**值** import 寫法。 */
type Case = [label: string, code: string]
const valueImports = (from: string, name: string): Case[] => [
  [`import { ${name} } from '${from}'`, `import { ${name} } from '${from}'\nexport const a = ${name}\n`],
  [`import { ${name} as C } from '${from}'`, `import { ${name} as C } from '${from}'\nexport const a = C\n`],
  [`import C from '${from}'`, `import C from '${from}'\nexport const a = C\n`],
  [`import * as c from '${from}'`, `import * as c from '${from}'\nexport const a = c\n`],
  [`export { ${name} } from '${from}'`, `export { ${name} } from '${from}'\n`],
  [`export * from '${from}'`, `export * from '${from}'\n`],
  [`import c = require('${from}')`, `import c = require('${from}')\nexport const a = c\n`],
  [`await import('${from}')`, `export const a = await import('${from}')\n`],
  [`require('${from}')`, `const c = require('${from}')\nexport const a = c\n`],
]

/** 規格閉集裡的三種 type-only 寫法。 */
const typeImports = (from: string, name: string): Case[] => [
  [`import type { ${name} } from '${from}'`, `import type { ${name} } from '${from}'\nexport type A = ${name}\n`],
  [`import { type ${name} } from '${from}'`, `import { type ${name} } from '${from}'\nexport type A = ${name}\n`],
  [`export type { ${name} } from '${from}'`, `export type { ${name} } from '${from}'\n`],
]

const CLIENT = '@/realtime/client'
const POSITION_SYNC = 'src/world/PositionSync.tsx'
const NEW_CLIENT = `import { RealtimeClient } from '${CLIENT}'\nexport const c = new RealtimeClient({} as never)\n`

describe('realtime-client：只有 RemoteWorld 可以 import client 的值', () => {
  it.each([
    ...valueImports(CLIENT, 'RealtimeClient'),
    ["import { RealtimeClient } from '../realtime/client'", `import { RealtimeClient } from '../realtime/client'\nexport const a = RealtimeClient\n`],
    ["import { RealtimeClient } from '../realtime/client.ts'", `import { RealtimeClient } from '../realtime/client.ts'\nexport const a = RealtimeClient\n`],
  ] satisfies Case[])(
    '[FE-O21-S01] PositionSync 寫 %s → 擋，訊息說只有 RemoteWorld 那條路',
    async (_label, code) => {
      const msgs = await messagesFor(POSITION_SYNC, code)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD), code).not.toHaveLength(0)
      expect(blocked(msgs, 'RemoteWorld'), code).not.toHaveLength(0)
      expect(blocked(msgs, 'realtime-protocol'), code).not.toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S01] 相對路徑不限深度：src/world/deep/x.tsx 的 ../../realtime/client 也擋',
    async () => {
      const msgs = await messagesFor(
        'src/world/deep/x.tsx',
        `import { RealtimeClient } from '../../realtime/client'\nexport const a = RealtimeClient\n`,
      )
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD)).not.toHaveLength(0)
    },
    120_000,
  )

  it.each(['src/api/operations.ts', 'src/api/transport.ts', 'src/api/contract/rest.ts', 'src/server/realtime.ts'])(
    '[FE-O21-S01] no-fetch 的例外區不是這條的例外：%s import client 的值 → 擋',
    async (file) => {
      const msgs = await messagesFor(file, `import { RealtimeClient } from '${CLIENT}'\nexport const a = RealtimeClient\n`)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD), file).not.toHaveLength(0)
    },
    120_000,
  )

  it.each(typeImports(CLIENT, 'RealtimeClient'))(
    '[FE-O21-S02] PositionSync 寫 %s → 不報 —— 型別收不到訊息',
    async (_label, code) => {
      const msgs = await messagesFor(POSITION_SYNC, code)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD), code).toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S02] 閉集只有 @/ 別名與相對路徑：裸套件路徑 some-package/realtime/client 不報',
    async () => {
      // 審查抓到的：`(^|/)` 開頭會把第三方套件裡剛好叫這個名字的路徑一起誤擋。
      const msgs = await messagesFor(POSITION_SYNC, `import c from 'some-package/realtime/client'\nexport const a = c\n`)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD)).toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S02] RemoteWorld 本身 new 它不報；tests/ 底下不報',
    async () => {
      const remoteWorld = await messagesFor('src/world/RemoteWorld.tsx', NEW_CLIENT)
      expect(blocked(remoteWorld, CLIENT_ONLY_VIA_REMOTE_WORLD), 'RemoteWorld 自己竟然被擋').toHaveLength(0)
      const inTests = await messagesFor('tests/realtime-client.test.ts', NEW_CLIENT)
      expect(blocked(inTests, CLIENT_ONLY_VIA_REMOTE_WORLD), 'tests/ 竟然被擋').toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S03] 例外是完整路徑：src/components/world/RemoteWorld.tsx 照樣擋',
    async () => {
      const msgs = await messagesFor('src/components/world/RemoteWorld.tsx', NEW_CLIENT)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD), '多一層目錄的同名檔案竟然被當成例外').not.toHaveLength(0)
    },
    120_000,
  )

  it.each([
    ['src/realtime/index.ts', "export { RealtimeClient } from './client'", `export { RealtimeClient } from './client'\n`],
    ['src/realtime/protocol.ts', "import { RealtimeClient } from './client'", `import { RealtimeClient } from './client'\nexport const a = RealtimeClient\n`],
    ['src/realtime/protocol.ts', "await import('./client')", `export const a = await import('./client')\n`],
    ['src/realtime/protocol.ts', "require('./client')", `const c = require('./client')\nexport const a = c\n`],
    // 審查抓到的：子目錄往上一層拿同一個檔案。閉集「相對路徑不限深度」在 src/realtime/ 內部一樣適用。
    ['src/realtime/sub/index.ts', "export { RealtimeClient } from '../client'", `export { RealtimeClient } from '../client'\n`],
    ['src/realtime/sub/deep/x.ts', "await import('../../client')", `export const a = await import('../../client')\n`],
  ])(
    '[FE-O21-S06] barrel 擋在源頭：%s 寫 %s → 擋',
    async (file, _label, code) => {
      const msgs = await messagesFor(file, code)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD), code).not.toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S06] src/realtime/index.ts 的 export type { … } from ./client 不報',
    async () => {
      const msgs = await messagesFor('src/realtime/index.ts', `export type { ConnectionState } from './client'\n`)
      expect(blocked(msgs, CLIENT_ONLY_VIA_REMOTE_WORLD)).toHaveLength(0)
    },
    120_000,
  )
})

const ENV = 'src/config/env.ts'

describe('runtime-config：設定模組不依賴資料層', () => {
  it.each([
    ...valueImports('@/api/contract/ws', 'Hello').filter(([label]) => !/require|await/.test(label)),
    ...typeImports('@/api/contract/ws', 'Hello'),
    ["import t = require('@/api/transport')", `import t = require('@/api/transport')\nexport const a = t\n`],
    ["await import('@/api/transport')", `export const a = await import('@/api/transport')\n`],
    ["require('@/api/transport')", `const t = require('@/api/transport')\nexport const a = t\n`],
    ["import { restBase } from '../api/transport'", `import { restBase } from '../api/transport'\nexport const a = restBase\n`],
    // 審查抓到的：目錄本身（會落到 index.ts）也算，不然開一個 barrel 就繞過去。
    ["import { x } from '@/api'", `import { x } from '@/api'\nexport const a = x\n`],
    ["import { x } from '../api'", `import { x } from '../api'\nexport const a = x\n`],
  ] satisfies Case[])(
    '[FE-O21-S04] env.ts 寫 %s → 擋（含 type），訊息說設定模組是葉子',
    async (_label, code) => {
      const msgs = await messagesFor(ENV, code)
      expect(blocked(msgs, CONFIG_IS_A_LEAF), code).not.toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S04] 零 import、只讀字面的 process.env → 這條不報，FE-O09-S01 那條也不報',
    async () => {
      const msgs = await messagesFor(ENV, 'export const a = process.env.NEXT_PUBLIC_GUILDHUB_REST\n')
      expect(blocked(msgs, CONFIG_IS_A_LEAF)).toHaveLength(0)
      expect(blocked(msgs, ENV_ONLY_HERE)).toHaveLength(0)
    },
    120_000,
  )
})

const REST = 'src/api/contract/rest.ts'

describe('api-contract：契約不 import 設定', () => {
  it.each([
    ...valueImports('@/config/env', 'restBase').filter(([label]) => !/require|await/.test(label)),
    ...typeImports('@/config/env', 'AppEnv'),
    ["import e = require('@/config/env')", `import e = require('@/config/env')\nexport const a = e\n`],
    ["await import('@/config/env')", `export const a = await import('@/config/env')\n`],
    ["require('@/config/env')", `const e = require('@/config/env')\nexport const a = e\n`],
    ["import { restBase } from '../../config/env'", `import { restBase } from '../../config/env'\nexport const a = restBase\n`],
    // 審查抓到的：目錄本身（會落到 index.ts）也算。
    ["import { x } from '@/config'", `import { x } from '@/config'\nexport const a = x\n`],
    ["import { x } from '../../config'", `import { x } from '../../config'\nexport const a = x\n`],
  ] satisfies Case[])(
    '[FE-O21-S05] rest.ts 寫 %s → 擋（含 type），訊息說接兩邊的是傳輸層',
    async (_label, code) => {
      const msgs = await messagesFor(REST, code)
      expect(blocked(msgs, CONTRACT_KNOWS_NO_ADDRESS), code).not.toHaveLength(0)
      expect(blocked(msgs, 'transport'), code).not.toHaveLength(0)
    },
    120_000,
  )

  it.each(['src/api/contract/limits.ts', 'src/api/contract/sub/x.ts'])(
    '[FE-O21-S05] 限制是整個目錄含子目錄：%s 也擋',
    async (file) => {
      const msgs = await messagesFor(file, `import { restBase } from '@/config/env'\nexport const a = restBase\n`)
      expect(blocked(msgs, CONTRACT_KNOWS_NO_ADDRESS), file).not.toHaveLength(0)
    },
    120_000,
  )

  it(
    '[FE-O21-S05] transport.ts 同時 import 設定與契約的值 → 不報（它就是接兩邊的地方）',
    async () => {
      const msgs = await messagesFor(
        'src/api/transport.ts',
        `import { restBase } from '@/config/env'\nimport { ProfileOut } from '@/api/contract/rest'\nexport const a = [restBase, ProfileOut]\n`,
      )
      expect(blocked(msgs, CONTRACT_KNOWS_NO_ADDRESS)).toHaveLength(0)
      expect(blocked(msgs, CONFIG_IS_A_LEAF)).toHaveLength(0)
    },
    120_000,
  )

  // design D3：FE-O06 那個區塊整條覆蓋了 FE-O09 的 selector，`rest.ts`／`ws.ts` 讀 `process.env` 原本不報。
  // 對應的是**既有** Requirement（fe-o09-env 的 S01：「`src/` 底下該模組以外的任何檔案」）；
  // 這條斷言釘的是本 change 補回它，不是重寫它。
  it.each(['src/api/contract/rest.ts', 'src/api/contract/ws.ts'])(
    '[FE-O09-S01] %s 讀 process.env → 擋（design D3 補回的洞）',
    async (file) => {
      const msgs = await messagesFor(file, 'export const a = process.env.NEXT_PUBLIC_GUILDHUB_REST\n')
      expect(blocked(msgs, ENV_ONLY_HERE), `${file} 讀 process.env 竟然沒被擋`).not.toHaveLength(0)
    },
    120_000,
  )
})
