// 規格 FE-W01-S06 / S07：WebGL2 能不能用，**在掛 Canvas 之前**就要知道。
//
// 為什麼不等 `<Canvas>` 拋錯再接（design.md 的 D1）：那個錯會穿到
// `FE-X01` 的重試邊界，而那個邊界會給出一顆**重試按鈕** ——
// 但 WebGL2 不可用不是暫時性失敗，重試永遠不會成功。
// 規格 S06 明文禁止那顆按鈕。
//
// 副作用是好的：這是一個純函式，所以 S06／S07 變成 component test
// 驗得到的，而不是只能靠瀏覽器。

export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false

  try {
    // ⚠️ **這裡確實會取到一個 WebGL2 context，而且沒有人明確釋放它。**
    //
    // 這個檔案原本有一段 `finally { canvas?.remove() }`，註解寫著
    // 「不釋放的話每次偵測都多一個 context」。**那句話是錯的**，而且那行是 no-op：
    // 這張 canvas 從來沒有進過 DOM，`remove()` 沒有任何對象可以移除，
    // 更不會釋放 GPU 端的 context。移掉它不改變任何行為。
    //
    // 量過（真 Chromium，SwiftShader）：
    //
    //   掛載→卸載 20 輪（每輪間隔數百毫秒，也就是真實的場景切換節奏）
    //     → console 完全沒有 `Too many active WebGL contexts`，
    //       世界的 canvas 每一輪都拿得到 context 且 `isContextLost()` 為 false
    //   同一支偵測連續呼叫 40 次、同步、中間不讓出 event loop
    //     → 25 次 `Too many active WebGL contexts. Oldest context will be lost.`
    //
    // 也就是**回收靠 GC，而真實節奏下 GC 來得及**。第二種情形是量測本身
    // 製造出來的，產品裡不存在 —— 所以這裡不加
    // `WEBGL_lose_context` 的確定性釋放：那條防禦拿掉之後測試不會紅，
    // 它會是第二個假防禦（FE-W07 討論的結論）。
    //
    // **會讓這段失效的改動**：把偵測搬到一個同步迴圈裡連續呼叫，
    // 或是讓場景切換變成同一個 tick 內連續進出。那時要回來重新量。
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    // 有些瀏覽器在停用 WebGL 時是**拋錯**而不是回 null。
    // 兩種都算「不可用」。
    return false
  }
}
