import { useEffect, useRef, type RefObject } from 'react'

// Escape 的層級：每次只關最上層。規格 `FE-X06`〈Escape 每次只關最上層〉。
//
// `ListPanel` 與 `AvatarPicker` 各自在 `window` 掛 Escape 監聽的話，同一次按鍵會各關各的。
// 這裡只有**一個**監聽，Escape 只呼叫堆疊最上層那一層的 `onEscape`。
//
// ⚠️ **卸載時依 token 移除自己，絕不是 `pop()`。** 審查抓到的：`S17` 的正常操作裡堆疊是
// `[picker, panel]`，下層的 picker 先卸載（失焦而關）—— `pop()` 拿掉的會是最上層的 panel。
//
// 層的順序 = 開啟順序（後開者在上）—— **除非一層被包在另一層的元素裡**，那被包的一定在上面。
// ⚠️ 深連結直達詳情時（`FE-B09-S11`），清單與詳情在**同一個 commit** 掛載，effect 子先父後：
// 詳情先註冊、清單後註冊，只看順序的話最上層是清單，一下 Escape 把面板連詳情一起關了。
// 所以每一層帶自己的元素；「最上層」= 最後註冊、且**不包含**任何其他層的那一層。
// 沒帶元素的層只靠順序。哪天有兩個可並存、可用滑鼠切換的非阻斷層，要加「取得焦點就提到最上層」，那時再改。

interface Layer {
  token: symbol
  onEscape: { current: () => void }
  element: RefObject<HTMLElement | null> | undefined
}

function contains(outer: Layer, inner: Layer): boolean {
  const o = outer.element?.current
  const i = inner.element?.current
  return o !== undefined && o !== null && i !== undefined && i !== null && o !== i && o.contains(i)
}

/** 最上層：從最後註冊的往前找第一個不包含別層的。 */
function topLayer(): Layer | undefined {
  for (let k = layers.length - 1; k >= 0; k -= 1) {
    const candidate = layers[k] as Layer
    if (!layers.some((other) => other !== candidate && contains(candidate, other))) return candidate
  }
  return undefined
}

const layers: Layer[] = []

function onKeyDown(e: KeyboardEvent) {
  // **是 `code` 不是 `key`**：跟世界的監聽同一把尺。
  if (e.code !== 'Escape') return
  const top = topLayer()
  if (top === undefined) return
  top.onEscape.current()
}

function register(layer: Layer): () => void {
  if (layers.length === 0) window.addEventListener('keydown', onKeyDown)
  layers.push(layer)
  return () => {
    const index = layers.indexOf(layer)
    if (index !== -1) layers.splice(index, 1)
    if (layers.length === 0) window.removeEventListener('keydown', onKeyDown)
  }
}

/** 給測試看堆疊有幾層。 */
export function escapeLayerCount(): number {
  return layers.length
}

/**
 * 把自己註冊成一層可被 Escape 關閉的 UI。掛載時進堆疊、卸載時離開。
 * `onEscape` 換了不改層序（用 ref 保存最新版）。`element` 是這一層的根元素：被包在別層裡的一定在上面。
 */
export function useEscapeLayer(onEscape: () => void, element?: RefObject<HTMLElement | null>): void {
  const latest = useRef(onEscape)
  useEffect(() => {
    latest.current = onEscape
  })
  useEffect(() => register({ token: Symbol('escape-layer'), onEscape: latest, element }), [element])
}

/** 元件版：放在條件渲染裡（`{open && <EscapeLayer …/>}`），開著才在堆疊裡。 */
export function EscapeLayer({ onEscape, element }: { onEscape: () => void; element?: RefObject<HTMLElement | null> }): null {
  useEscapeLayer(onEscape, element)
  return null
}
