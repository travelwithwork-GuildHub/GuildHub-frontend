// 3D 世界的視覺常數。規格 `FE-W09-S01`。
//
// ⚠️ **未知的名稱要拋錯，不能回 `undefined`。**
// three.js 的 `color` 收到 `undefined` 會**靜默使用白色** ——
// 症狀是「有一個東西顏色不對」，不是「有人打錯字」。
//
// **這比 `src/design/layers.ts` 嚴一級，而那是有理由的。**
// `layer()` 取不到會回 `undefined`，z-index 拿到 `undefined` 的元件會沉到最底層
// —— 那看得到。顏色拿到 `undefined` 只是變白，混在其他白色物件裡看不出來。
//
// ⚠️ **不跟 DOM 的 `@theme` 共用**（`globals.css` 的 `--color-*`）。
// 那邊是 CSS 自訂屬性、用 `oklch`，three.js 這邊要的是模組載入時就存在的
// sRGB 值。共用需要在執行期 `getComputedStyle` 轉換一次，而那在
// 伺服器端渲染與測試環境裡都取不到（回空字串）——
// 於是顏色會**靜默**變成預設值，正好是這個檔案要防的那件事。
// 兩份色票各自維護，是刻意的取捨，不是漏做。
//
// ⚠️ **這個集合是可增長的。** `FE-W10 EnvironmentComponents` 需要新的語意色
// 直接加，**不需要改規格** —— 規格保證的是「只有一個地方可以加」。
//
// ⚠️ **每個 token 的「值」是 FE-W14 VisualPolish（W5）的範圍。**
// 這裡的值是從遷移前的硬寫顏色原樣搬過來的，**沒有經過視覺調校**。
// 要調就在這一個檔案調。

export const WORLD_COLORS = {
  /** 角色皮膚。原本是 `ChibiPlayer` 的 `SKIN`。 */
  skin: '#f2c9a0',
  /** 角色軀幹。原本是 `ChibiPlayer` 的 `BODY`。 */
  avatarBody: '#4d5bb0',
  /** 角色四肢。原本是 `ChibiPlayer` 的 `LIMB`。 */
  avatarLimb: '#3b4794',
  /** 深色細節（眼睛、輪廓）。 */
  ink: '#20232e',
  /** 地面。原本是 `DebugShadowScene` 的平面。 */
  ground: '#cfd4e4',
  /** 強調色，用在要被看見的物件上。原本是 `DebugShadowScene` 的方塊。 */
  accent: '#6b7fd7',
  /** 牆面。比地面深一階，讓邊界在俯視角下看得出來。 */
  wall: '#aeb6cf',
  /** 地毯。分區用的暖色，跟地面的冷灰藍拉開。 */
  carpet: '#d8bda6',
  /** 平台／台階。介於地面與牆之間。 */
  platform: '#bfc6da',
  /** 木頭（桌面、層板）。 */
  wood: '#b08968',
  /** 深一階的木頭（桌腳、側板）。 */
  woodDark: '#8c6a4f',
} as const

export type WorldColorName = keyof typeof WORLD_COLORS

const NAMES = Object.keys(WORLD_COLORS) as WorldColorName[]

/**
 * 取一個 3D 世界的顏色。
 *
 * **參數型別是名稱的聯集**（規格：`取用函式的參數型別 SHALL 是 token 名稱的聯集`）,
 * 但**型別限制不取代執行期驗證** —— 型別可以被 `as any` 繞過，這裡的 `throw` 不行。
 */
export function worldColor(name: WorldColorName): string {
  const value = WORLD_COLORS[name]
  if (value === undefined) {
    throw new Error(
      `世界的顏色 token 沒有「${String(name)}」這個名字。合法的有：${NAMES.join('、')}。` +
        '（回傳 undefined 的話 three.js 會靜默用白色，那會變成「有個東西顏色不對」而不是「有人打錯字」）',
    )
  }
  return value
}
