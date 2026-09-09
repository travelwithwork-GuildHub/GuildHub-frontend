import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { Material } from 'three'
import { worldColor, type WorldColorName } from '@/design/world'

// 場景元件可用的材質。規格 `FE-W09-S04`／`S06`。
//
// ⚠️ **快取的鍵是（材質類別、顏色 token、影響行為的參數），不是只有顏色。**
// 只用顏色當鍵的話，一個要 `MeshBasicMaterial` 的發光體與一個要
// `MeshStandardMaterial` 的桌子只要同色，第二個要求者就會拿到型別錯誤的實例
// —— 而那是靜默的（畫面上只是「那個東西不吃光」）。
//
// ⚠️⚠️ **回傳的實例是不可變的。** 見 `geometry.ts` 的檔頭：
// `scene.traverse` 就地改寫共用材質是 three.js 圈子的標準慣例
// （參考專案 `26-code-structuring` 的 `Environment.js` 就是那樣寫的），
// 而在共用實例之上它會無差別污染每一個使用同一組參數的物件。
//
// ⚠️ **MUST NOT 對這些實例呼叫 `dispose()`。** 理由同 `geometry.ts`。

export const MATERIAL_KINDS = ['standard', 'basic'] as const

export type MaterialKind = (typeof MATERIAL_KINDS)[number]

export interface MaterialSpec {
  /** `standard` 吃光與陰影；`basic` 不吃 —— 用在自發光或不該被打光的東西上。 */
  readonly kind: MaterialKind
  readonly color: WorldColorName
  /** 只有 `standard` 有意義。省略時用 three.js 的預設。 */
  readonly roughness?: number
  /** 只有 `standard` 有意義。 */
  readonly metalness?: number
}

function build(spec: MaterialSpec): Material {
  const color = new Color(worldColor(spec.color))
  if (spec.kind === 'basic') return new MeshBasicMaterial({ color })
  return new MeshStandardMaterial({
    color,
    ...(spec.roughness === undefined ? {} : { roughness: spec.roughness }),
    ...(spec.metalness === undefined ? {} : { metalness: spec.metalness }),
  })
}

const cache = new Map<string, Material>()

function keyOf(spec: MaterialSpec): string {
  return `${spec.kind}|${spec.color}|${spec.roughness ?? '-'}|${spec.metalness ?? '-'}`
}

/**
 * 取一個材質。同一組參數回同一個實例。
 *
 * ⚠️ **不要 `dispose()` 它，也不要改它的屬性**（見檔頭）。
 */
export function materialFor(spec: MaterialSpec): Material {
  if (!(MATERIAL_KINDS as readonly string[]).includes(spec.kind)) {
    throw new Error(
      `沒有「${String(spec.kind)}」這種材質類別。合法的有：${MATERIAL_KINDS.join('、')}。`,
    )
  }
  const key = keyOf(spec)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const made = build(spec)
  cache.set(key, made)
  return made
}
