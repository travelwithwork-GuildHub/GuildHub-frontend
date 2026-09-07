// FIXTURE —— 故意違規（規格 FE-X01-S07）。
//
// `tooltip` 不在 LAYER_ORDER 裡，所以型別檢查必須擋下來並以非零結束。
// 這正是這條 Scenario 唯一能被證明的方式：CSS 自訂屬性取不到只會回空字串，
// 只有型別系統擋得住打錯的層名。
//
// 這個目錄被主 tsconfig 的 exclude 排除，所以不會讓 `npm run typecheck` 永遠紅。
// tests/design-tokens.test.ts 用旁邊那份 tsconfig 對它單獨跑一次 tsc。
import { layer } from '../../src/design/layers'

export const bad = layer('tooltip')
