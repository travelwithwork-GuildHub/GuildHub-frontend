import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { BoxGeometry, MeshStandardMaterial, type WebGLRenderer } from 'three'
import { ChibiPlayer } from '@/world/player/ChibiPlayer'
import { geometryFor } from '@/world/primitives/geometry'
import { materialFor } from '@/world/primitives/material'

// FE-W07 洩漏偵測的量測台。規格 `openspec/specs/world-resources/`。
//
// ⚠️⚠️ **同一個 `<Canvas>`，換 `key` 重掛子樹 —— 不是每輪開一個新的 Canvas。** ⚠️⚠️
//
// 這一行是整個量測台唯一真正重要的設計。每個 `<Canvas>` 有自己的
// `WebGLRenderer`，而 `info.memory` 是**那一個 renderer** 的計數。
// 每輪開一個新的 Canvas 的話，計數每輪從零開始 ——
// **洩漏的東西跟不洩漏的東西會量出一模一樣的數字。**
//
// 寫這支的時候我第一版就是那樣寫的，而且它「通過」了。
// 抓到它的是 `FE-W07-S03`（尺要先證明自己量得到）：
// 故意洩漏的 fixture 在那個寫法下量出來是乾淨的。
// **這就是那條 Scenario 存在的理由，不要拿掉它。**

/** 進出幾輪。工作分解表的驗收值是十次，**不減**（design 的 Q3）。 */
const ROUNDS = 10

/**
 * 每一輪卸載之後等多久再讀數。
 *
 * ⚠️ **不是隨便挑的，也不是「越大越安全」。** R3F 的釋放走
 * `unstable_scheduleCallback(unstable_IdlePriority, …)`，是**延後的** ——
 * 不等的話讀到的是「還沒輪到釋放」，而那跟「沒有釋放」在數字上完全一樣。
 *
 * 量出來的（design 的 Q1）：
 *
 *     0 ms   乾淨的三個受測對象**全部**被判成洩漏，
 *            而且校正砝碼的成長變成每輪 0.375 份 —— 連尺本身都不穩
 *
 *            ⚠️ 0 毫秒時**同時壞了兩件事**，不要只記其中一件：
 *            （a）R3F 的釋放還沒輪到 → 乾淨的被判成洩漏；
 *            （b）React 來不及完成每一輪的掛載卸載，多數輪次被合併掉
 *                 → 每輪必漏一份的砝碼只長了 0.375 份。
 *            只寫（a）的話，下一個人會拿 0.375 這個數字去推錯的結論
 *            （這是外部審查抓到的）。
 *     30 ms  全部正確
 *     100 ms 全部正確
 *
 * 下限落在 0 與 30 之間。取 500 是 30 的十幾倍 ——
 * 這支不是每次都跑，慢一點無所謂，而假陽性的代價是有人去修一個不存在的洩漏。
 */
const SETTLE_MS = 500

/**
 * 等第一個 `WebGLRenderer` 出現的上限。
 *
 * ⚠️ **這個等待跟 `SETTLE_MS` 是兩件事，不可以共用一個常數。**
 * 共用的話，把 `SETTLE_MS` 調小會變成「Canvas 還沒掛好就去拿 renderer」，
 * 失敗訊息會說「WebGL2 起不來」—— 那是假的原因，而它會蓋掉真正在量的東西。
 * （這是實測踩到的：`SETTLE_MS` 0／30／60 三個值全部報 WebGL2 起不來。）
 */
const RENDERER_TIMEOUT_MS = 20_000

// ─────────────────────────────────────────────────────────────────────
// fixture：兩個形狀，差別只有一行

/**
 * **洩漏的那一個。** 元件自己 `new` 出來、用 prop 掛進 tree，卸載時不釋放 ——
 * R3F 的 `removeChild` 只釋放它自己建的 instance，prop 傳進去的不算。
 *
 * 這個 fixture 同時是 `FE-W07-S01` 的受測對象，
 * 以及 `FE-W07-S03` 用來證明「這把尺量得到東西」的那把校正砝碼。
 */
function LeakingFixture() {
  const geo = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#c86b6b' }), [])
  return <mesh geometry={geo} material={mat} />
}

/**
 * **乾淨的那一個。** 資源的所有權行為跟上面只差一段 cleanup
 *（顏色不同只是為了在有頭模式下看得出來，跟量測無關）—— 這就是規格要求的所有權。
 *
 * ⚠️ 把 `useEffect` 那一段拿掉，`FE-W07-S02` 必須變紅。
 * 那是這個 change 唯一一個「拿掉防禦就變紅」的地方（design 的 D4）。
 */
function OwnedFixture() {
  const geo = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#6b7fd7' }), [])
  useEffect(() => {
    return () => {
      geo.dispose()
      mat.dispose()
    }
  }, [geo, mat])
  return <mesh geometry={geo} material={mat} />
}

/**
 * **FE-W09 的共用快取。** `geometryFor`／`materialFor` 是模組層級的 cache，
 * 規格明文寫著使用者 MUST NOT 對它們 `dispose()`。
 *
 * 它們被 `FE-W07-S06` 的涵蓋率檢查抓到（用 `new` 建 GPU 資源），
 * 而**正確的處置是登記進來、不是把它們排除**：登記之後這把尺會真的證明
 * 「快取在重複進出下不成長」，那比一句「相信它不會」強。
 *
 * ⚠️ **`dispose={null}` 不能省。** 沒有它就是在依賴
 * 「prop 傳進去的資源目前碰巧不會被 R3F 釋放」這個實作細節 ——
 * 而共用實例被釋放的症狀是**看不出來的**（three.js 下一幀會重新上傳）。
 *
 * ⚠️⚠️ **這個 subject 只證明得了 geometry 那一半。**
 * `renderer.info.memory` 只有 `geometries` 與 `textures` 兩個欄位，
 * 而 `MeshStandardMaterial` 本身不增加這兩項 ——
 * 所以把 material 的 cache 拿掉，這裡**仍然會是 clean**。
 * material 的共用由 `tests/world-design-system.test.ts` 的 `toBe` 斷言守，
 * 不是這裡。寫出來免得有人以為這條涵蓋了兩邊。
 */
function SharedPrimitiveFixture() {
  return (
    <mesh
      geometry={geometryFor({ shape: 'RoundedBox', width: 1, height: 1, depth: 1, radius: 0.12 })}
      material={materialFor({ kind: 'standard', color: 'accent' })}
      dispose={null}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────
// 受測清單
//
// ⚠️ **`src/world/` 底下每一個會建立 GPU 資源的模組都要在這裡**
// （`FE-W07-S06`／`S07`，機械檢查在 `tests/leak-coverage.test.ts`）。
// 少了一個，洩漏偵測就會在它沒有看的地方通過。

/** 受測對象。`expect` 是**這個 fixture 應該被判成什麼** —— 尺的自我校正靠它。 */
interface Subject {
  id: string
  /**
   * 這個 subject 對應的正式碼檔案；fixture 是 `null`。給涵蓋率檢查對照。
   *
   * ⚠️ **這個欄位是宣告，不是保證。** 涵蓋率檢查只驗到「這個路徑存在」
   * 與「量測台真的 import 了它」；`render()` 有沒有真的 render 它，
   * 沒有任何機制擋得住。要擋住需要型別資訊，成本遠高於它防的東西。
   */
  source: string | null
  expect: 'leaks' | 'clean'
  render: () => ReactNode
}

const SUBJECTS: readonly Subject[] = [
  // 校正砝碼永遠排第一：尺量不到它的話，後面的結果全部沒有意義
  { id: 'fixture:leaking', source: null, expect: 'leaks', render: () => <LeakingFixture /> },
  { id: 'fixture:owned', source: null, expect: 'clean', render: () => <OwnedFixture /> },
  {
    id: 'ChibiPlayer',
    source: 'src/world/player/ChibiPlayer.tsx',
    expect: 'clean',
    render: () => <ChibiPlayer />,
  },
  // FE-W09 的共用快取。**一個 subject 登記兩個檔案是刻意的** ——
  // 它們是同一個機制的兩半，分開 render 只會多一個一模一樣的量測。
  {
    id: 'primitives:geometry',
    source: 'src/world/primitives/geometry.ts',
    expect: 'clean',
    render: () => <SharedPrimitiveFixture />,
  },
  {
    id: 'primitives:material',
    source: 'src/world/primitives/material.ts',
    expect: 'clean',
    render: () => <SharedPrimitiveFixture />,
  },
]

// ─────────────────────────────────────────────────────────────────────

export interface RoundSample {
  round: number
  geometries: number
  textures: number
}

export interface SubjectResult {
  id: string
  source: string | null
  expect: 'leaks' | 'clean'
  rounds: RoundSample[]
}

/**
 * 量測台的兩個把手：換子樹用的 `setCell`，以及讀 `info.memory` 用的 renderer。
 *
 * ⚠️ **在 `onCreated` 裡交出去，不是在 render 期間指派給模組變數。**
 * `react-hooks/globals` 會擋掉後者，而**那條規則是對的** ——
 * 在 render 期間寫外部變數，concurrent render 下會寫到不該寫的時機。
 * `onCreated` 是 R3F 建好 renderer 之後才呼叫的 callback，不在 render 期間。
 */
interface Controls {
  setCell: (cell: { key: number; node: ReactNode } | null) => void
  renderer: WebGLRenderer
}

let handOver: ((controls: Controls) => void) | null = null
const controlsReady = new Promise<Controls>((resolve) => {
  handOver = resolve
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function Harness() {
  const [cell, setCell] = useState<{ key: number; node: ReactNode } | null>(null)
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      onCreated={(state) => handOver?.({ setCell, renderer: state.gl as WebGLRenderer })}
    >
      <ambientLight intensity={0.6} />
      {cell === null ? null : <group key={cell.key}>{cell.node}</group>}
    </Canvas>
  )
}

async function run(): Promise<SubjectResult[]> {
  const host = document.getElementById('root')
  if (host === null) throw new Error('量測台找不到 #root')
  // **刻意不包 `<StrictMode>`。**
  //
  // ⚠️ 理由不是「包了就量不到」—— 判準看的是同一個 subject 十輪之間的**增量**，
  // 而 StrictMode 只會讓洩漏的斜率變成兩倍、乾淨的照樣平坦，兩種都還是判得出來
  //（這一點原本的註解寫錯了，是外部審查指出的）。
  //
  // 真正的理由是**輪次與掛載次數的對應**：包了之後「第 3 輪」代表的是
  // 第 5 與第 6 次掛載，而失敗訊息裡的「每輪多 1 份」就不再等於
  // 「每次進出多 1 份」。這支的輸出是要拿去查產品的，對應關係要是一比一。
  createRoot(host).render(<Harness />)
  // **等 renderer 真的建好，不是睡固定時間** —— 見 `RENDERER_TIMEOUT_MS` 的說明
  const controls = await Promise.race([
    controlsReady,
    sleep(RENDERER_TIMEOUT_MS).then(() => null),
  ])
  if (controls === null) {
    throw new Error(
      `${RENDERER_TIMEOUT_MS}ms 內拿不到 WebGLRenderer。` +
        `可能是 WebGL2 起不來、React render 失敗、import 錯誤，或 onCreated 沒被呼叫 ——` +
        `打開 LEAK_HEADED=1 看 console 才分得出是哪一個`,
    )
  }
  const { setCell, renderer } = controls

  const swap = async (cell: { key: number; node: ReactNode } | null) => {
    setCell(cell)
    await sleep(SETTLE_MS)
  }

  const results: SubjectResult[] = []
  for (const subject of SUBJECTS) {
    const rounds: RoundSample[] = []
    for (let round = 0; round < ROUNDS; round++) {
      // 換 key = 上一輪整棵卸載、這一輪重新掛載。**同一個 renderer。**
      await swap({ key: round, node: subject.render() })
      const mem = renderer.info.memory
      rounds.push({ round, geometries: mem.geometries, textures: mem.textures })
    }
    // 收尾：把子樹拿掉。
    //
    // ⚠️ **這不會讓下一個 subject 從「乾淨」的狀態開始**（原本的註解是錯的，
    // 外部審查指出）—— 校正砝碼故意不釋放，它漏掉的東西會一直留在
    // 這個 renderer 的計數裡。下一個 subject 的基準線因此是墊高的。
    //
    // 那不影響判定：`verdict` 看的是**同一個 subject 十輪之間的增量**，
    // 不是絕對值。這一行的作用只是讓每個 subject 的第一輪都從
    // 「子樹剛掛上去」開始，而不是從「上一個 subject 還掛著」開始。
    await swap(null)
    results.push({ id: subject.id, source: subject.source, expect: subject.expect, rounds })
  }
  return results
}

declare global {
  interface Window {
    __LEAK_RESULT__?: { ok: true; subjects: SubjectResult[] } | { ok: false; error: string }
    __LEAK_CONSTANTS__: { rounds: number; settleMs: number }
  }
}

window.__LEAK_CONSTANTS__ = { rounds: ROUNDS, settleMs: SETTLE_MS }

void run().then(
  (subjects) => {
    window.__LEAK_RESULT__ = { ok: true, subjects }
  },
  (error: unknown) => {
    // **失敗要送出去，不要讓 driver 等到逾時。** 逾時的訊息是「等不到結果」，
    // 而真正的原因（例如 WebGL2 起不來）會被蓋掉。
    window.__LEAK_RESULT__ = { ok: false, error: String(error) }
  },
)
