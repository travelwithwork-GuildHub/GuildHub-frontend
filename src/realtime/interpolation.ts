// 從 10 Hz 的位置樣本重建 60 FPS 的連續移動。規格 FE-R08。
//
// **這個檔案不知道 React、three、WebSocket 的存在。** 它吃樣本與時間，
// 吐位置與朝向。所有時間都是毫秒，而且**一律由外面傳進來**（見下面的警告）。
//
// ─────────────────────────────────────────────────────────────
// 這些數字是量出來的，不是估的（design.md 的〈Context〉）
//
//   到達間隔  中位 100.0ms   p90 102.0ms   p99 202.6ms   max 205.5ms
//   分佈      100ms × 262    200ms × 18
//   每則位移  中位 14px      max 14px
//
// **零掉包，仍有 6% 的間隔是 200 毫秒。** 那是結構性的：客戶端約 10 Hz 送、
// 伺服器固定 10 Hz tick，兩者相位獨立，所以每隔十幾個 tick 就有一個 tick
// 裡這個人沒有更新。**完美網路上也會發生。**
//
// 而且**那 200 毫秒空檔的位移仍然是 14px，不是 28px** —— 那段時間內
// 客戶端只送了一次。所以那不是「兩倍距離塞進一段」，是「同樣的距離、
// 真實時間是兩倍」。**任何用距離推速度的方案在這裡都會提早走完然後停住。**
// ─────────────────────────────────────────────────────────────

/**
 * 畫面比真實狀態慢多久。
 *
 * **150 會餓死**（已知的 200 毫秒結構性空檔就超過它），
 * **200 在 loopback 上就不夠**（p99 是 203、max 是 208）。
 * 250 涵蓋量到的 max，留約 40 毫秒給真實網路的抖動。
 *
 * ⚠️ **這個數字只在 loopback 上驗過。** 真實網路的驗證是 `FE-R09` 的工作。
 * 量出來要改的話**回去重開 spec PR**，不要就地改（design.md 的〈待答問題〉）。
 */
export const RENDER_DELAY_MS = 250

/** 一筆位置樣本。**世界座標**，`t` 是寫入時的注入時間。 */
export interface Sample {
  x: number
  z: number
  /** 協定的離散朝向 0–3。**不是角度。** */
  f: number
  /** 寫入這一筆時的時間（毫秒）。**單調不減。** */
  t: number
}

/** 求值的結果。 */
export interface Pose {
  x: number
  z: number
  f: number
}

/** 一個人的樣本歷史。**只被就地改寫，身分穩定。** */
export interface Track {
  /** 依時間遞增。舊的會被清掉（見 `prune`）。 */
  samples: Sample[]
}

export function createTrack(): Track {
  return { samples: [] }
}

/**
 * 丟掉已經不可能再被求值到的樣本。
 *
 * **沒有這件事就是記憶體洩漏**：一條連線每秒為每個人追加 10 筆，
 * 40 個人跑一小時是 144 萬筆。**它不會有錯誤訊息，只會愈跑愈慢。**
 *
 * 保留條件：求值只需要「游標所在那一段的兩個端點」以及它之後的。
 * 所以只要 `samples[1]` 也已經在游標之前，`samples[0]` 就再也用不到了。
 * **不能連 `samples[0]` 一起丟** —— 那是目前這一段的起點，丟掉畫面會直接跳到終點。
 */
function prune(track: Track, cursor: number): void {
  const s = track.samples
  let drop = 0
  while (drop + 1 < s.length && s[drop + 1]!.t <= cursor) drop++
  if (drop > 0) s.splice(0, drop)
}

/**
 * 追加一筆樣本。`now` 由呼叫端傳入。
 *
 * ⚠️ **這裡做了兩件看起來多餘、但少一件就會壞的事。**
 *
 * **一、時間夾成單調。** 傳進來的 `now` 比最後一筆還早時，用最後一筆的時間。
 * 時間來源是注入的，而測試、暫停、重新掛載都可能讓它不單調 ——
 * 樣本時間一旦倒退，區間時長會是負的，內插比例會跑到區間外，
 * **而算出來的位置看起來只是「怪」，不會拋錯**。
 *
 * **二、單段插值時長不得超過 `RENDER_DELAY_MS`。**
 * 把前一筆的有效時間往前推到最多 `RENDER_DELAY_MS` 之前。
 *
 * 上限與 render delay **必須是同一個數，那是恆等式不是參數**：
 * 新樣本到達的瞬間游標是 `now − D`，被壓縮那一段的起點也是 `now − D`，
 * 兩者相等 → 起始的插值比例恆為 0 → **不跳，也不卡**。
 * 上限大於 D 會在到達的瞬間跳掉一段比例；小於 D 會先卡住 `D − 上限` 毫秒。
 *
 * **少了第二件事會怎樣**：一個靜止 10 秒的人重新走第一步，
 * `t_new − t_prev = 10.1 秒`，游標落在那一段的 **97.5%** ——
 * 畫面在收到的瞬間跳掉幾乎整格。**症狀只在「真人停下來再走」時出現**，
 * 而那正是最常發生、也最容易被當成「網路不好」的情況。
 *
 * ⚠️ **這一條無法區分「靜止 10 秒後走了一步」與「中間一直在走但封包全丟」** ——
 * 兩者送進來的資料完全相同。要區分只能改協定（加時間戳或序號）。
 * 真的掉了 1 秒封包時那段位移會被壓進 250 毫秒播完（約四倍速）——
 * **這是刻意選的降級**：至多落後 250 毫秒並且收斂，而不是背著時間債愈拖愈遠。
 */
export function appendSample(track: Track, pose: Pose, now: number): void {
  const s = track.samples
  const last = s[s.length - 1]

  if (last === undefined) {
    s.push({ x: pose.x, z: pose.z, f: pose.f, t: now })
    return
  }

  // 一、單調
  const t = Math.max(now, last.t)
  // 二、單段上限。`t - RENDER_DELAY_MS` 一定 ≤ `t`，所以不會把 last 推到 t 之後；
  // 也一定 ≥ 原本的 last.t（取 max），所以前面那一筆的順序不受影響。
  last.t = Math.max(last.t, t - RENDER_DELAY_MS)

  s.push({ x: pose.x, z: pose.z, f: pose.f, t })
  prune(track, now - RENDER_DELAY_MS)
}

/**
 * 把整段歷史換成一筆。**`snapshot` 與 `presence.join` 用這個。**
 *
 * 它們是權威狀態的重建，不是一段連續軌跡上的一點 ——
 * 留著舊樣本的話，畫面會把**上一個 session 的位置**與新位置連成一段插值。
 *
 * ⚠️ **teleport 是語義的，不是幾何的。** 這個函式是唯一的 snap 入口；
 * 一般的 `pos` **永遠不因為「距離很遠」而 snap**。理由：從觀察端看，
 * 「掉了 1 秒封包、人真的走了 128px」與「有人被瞬移 128px」
 * **送進來的資料完全一樣**，用猜出來的距離常數去分辨只會同時製造誤判與漏判。
 */
export function resetTrack(track: Track, pose: Pose, now: number): void {
  track.samples.length = 0
  track.samples.push({ x: pose.x, z: pose.z, f: pose.f, t: now })
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha
}

/**
 * 求 `now` 這一刻畫面上該畫的位置與朝向。沒有任何樣本時回 `null`。
 *
 * ⚠️ **這是純函式：同樣的樣本加同樣的 `now`，一定得到同樣的結果。**
 * 它**不看上一幀畫在哪裡**。這是這一層唯一的正確性錨點 ——
 * 「分頁切到背景再回來」「連續掉幀」「測試裡跳著推進時間」走的是**同一條路徑**，
 * 不需要任何「偵測剛從背景回來」的補救邏輯。少一種狀態就少一種
 * 只在特定時序下才出現、而且沒有錯誤訊息的 bug。
 *
 * ⚠️ **`now` 必須跟 `appendSample` 用的是同一個時間來源。**
 * 一邊 `performance.now()`、一邊 render loop 自己的時鐘的話，
 * 兩者原點與暫停行為都不同，相減得到的數字沒有意義 ——
 * 而症狀是「插值瞬間完成」或「永遠不開始」，**沒有任何錯誤訊息**。
 */
export function evaluate(track: Track, now: number): Pose | null {
  const cursor = now - RENDER_DELAY_MS
  prune(track, cursor)

  const s = track.samples
  if (s.length === 0) return null

  const first = s[0]!
  // 游標比第一筆還早 —— 剛 `join` 之後的 250 毫秒**一定**會發生
  // （只有一筆樣本，時間就是現在，而游標永遠比現在早 250 毫秒）。
  if (cursor <= first.t) return { x: first.x, z: first.z, f: first.f }

  const last = s[s.length - 1]!
  // 樣本用完就**停住，不外插**。協定裡停下來的人直接從 `pos` 消失，
  // 沒有任何「我停了」的訊息 —— 所以「沒有新樣本」的唯一可靠解讀是
  // 「他停在最後一筆」。外插等於在沒有證據下假設他還在走，
  // 而每一次真的停下來都會過衝然後被拉回去。
  if (cursor >= last.t) return { x: last.x, z: last.z, f: last.f }

  // 找出游標落在哪一段。樣本數有上界（`prune`），所以線性掃描就夠。
  let i = 0
  while (i + 1 < s.length && s[i + 1]!.t <= cursor) i++
  const a = s[i]!
  const b = s[i + 1]!

  // `b.t > a.t` **恆成立**，所以這裡不需要除以零的守衛。兩件事保證它：
  //
  //   1. `appendSample` 把時間夾成單調（`Math.max(now, last.t)`）
  //   2. `prune` 之後 `s[1].t > cursor`，而走到這裡代表 `s[0].t <= cursor`
  //
  // 合起來就是 `b.t > cursor >= a.t`。
  //
  // ⚠️ **原本這裡有一個 `if (duration <= 0)` 的守衛，拿掉了。**
  // 不是因為它沒有價值，是因為**它到不了** —— 負向驗證時把它整條刪掉，
  // 15 條測試全綠。一個無法被測紅的守衛不是防禦，是一段假裝有在防禦的死碼，
  // 而它會讓下一個人以為除以零這件事已經被處理過了。
  //
  // 真正在擋這件事的是上面第 1 點，而**那一條有測試釘住**（FE-R08-S15）——
  // 把單調的夾拿掉，S15 就會紅。斷線恢復後一批樣本擠在同一瞬間的情況
  // 由 FE-R08-S05 驗，它走的是上面兩個夾住的分支，不會走到這裡。
  const duration = b.t - a.t
  const alpha = (cursor - a.t) / duration
  return {
    x: lerp(a.x, b.x, alpha),
    z: lerp(a.z, b.z, alpha),
    // **朝向取這一段終點的 `f`，而且不做角度插值。**
    // `f` 是「抵達該樣本時的朝向」，而抵達 B 時的朝向反映的正是
    // A→B 這一段的行進方向；用 `a.f` 會讓角色**用上一段的方向走這一段**。
    // 插值會產生協定沒有定義的斜向朝向。
    f: b.f,
  }
}
