// 規格 FE-X01-S06 / S07 / S14：堆疊層級的單一事實來源。
//
// **為什麼不放進 Tailwind 的 `@theme`**（見 design.md 的 D5）：
// CSS 自訂屬性取不到時是空字串，`z-index: var(--z-tooltip)` 會靜默退化成
// 沒有 z-index —— 元件沉到最底層，而且沒有任何東西會告訴你。
// 這裡改用型別受限的存取，層名打錯在 `npm run typecheck` 就紅。
//
// 實際的整數是任意的，從外部觀察不出差別（design.md 的待答問題）。
// **有意義的是順序**，而順序有測試釘住。

export const LAYER_ORDER = ['canvas', 'hud', 'panel', 'modal', 'toast'] as const

export type LayerName = (typeof LAYER_ORDER)[number]

const Z_INDEX: Record<LayerName, number> = {
  canvas: 0, //   3D 世界。永遠在最底層
  hud: 10, //     疊在世界上的提示（互動範圍、狀態）
  panel: 20, //   DOM 面板（案件詳情、Profile⋯⋯）
  modal: 30, //   對話框。蓋住面板
  toast: 40, //   通知。蓋住所有東西
}

/** 取一個具名層的堆疊值。層名不在 `LAYER_ORDER` 裡的話**無法通過型別檢查**。 */
export function layer(name: LayerName): number {
  return Z_INDEX[name]
}
