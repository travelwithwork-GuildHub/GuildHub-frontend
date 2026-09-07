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

  let canvas: HTMLCanvasElement | null = null
  try {
    canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    // 有些瀏覽器在停用 WebGL 時是**拋錯**而不是回 null。
    // 兩種都算「不可用」。
    return false
  } finally {
    // 偵測用的 canvas 不需要留著。不釋放的話每次偵測都多一個 context，
    // 而瀏覽器對同時存在的 WebGL context 數量有上限。
    canvas?.remove()
  }
}
