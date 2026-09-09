import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  coverageProblems,
  createsGpuResources,
  listedSources,
} from '../tests/e2e/leak-harness/coverage'

// 規格：openspec/specs/world-resources/spec.md
//   Requirement: 會建立 GPU 資源的場景元件必須被偵測涵蓋
//   —— Scenario FE-W07-S06 / FE-W07-S07
//
// ⚠️ **這條檢查是這個 change 可否證的那一半**（design 的 D4）。
// 洩漏偵測本身對現有元件今天恆綠（它們全部乾淨，量過），
// 所以「拿掉防禦要變紅」不能靠它們 —— 靠的是這裡：
// 新元件沒登記要紅，清單有幽靈項目也要紅。

const ROOT = path.resolve(import.meta.dirname, '..')
const WORLD = path.join(ROOT, 'src/world')
const HARNESS = path.join(ROOT, 'tests/e2e/leak-harness/main.tsx')

const harness = () => fs.readFileSync(HARNESS, 'utf8')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

function scanWorld(): Map<string, boolean> {
  const scanned = new Map<string, boolean>()
  for (const full of walk(WORLD)) {
    const rel = path.relative(ROOT, full)
    scanned.set(rel, createsGpuResources(fs.readFileSync(full, 'utf8')))
  }
  return scanned
}

describe('洩漏偵測的涵蓋率', () => {
  it('src/world/ 底下每一個會建立 GPU 資源的模組都在受測清單裡', () => {
    const scanned = scanWorld()
    const listed = listedSources(harness())

    // **防恆真**：掃不到任何會建立 GPU 資源的檔案時，這條驗證是空的。
    // 真的發生的話代表 `createsGpuResources` 壞了，不是「專案很乾淨」。
    const creators = [...scanned].filter(([, creates]) => creates)
    expect(creators.length, 'src/world/ 底下一個會建立 GPU 資源的模組都沒掃到 —— 掃描器壞了').toBeGreaterThan(0)
    expect(listed.length, '量測台的受測清單是空的 —— 解析壞了').toBeGreaterThan(0)

    expect(coverageProblems({ scanned, listed, harnessSource: harness() })).toEqual([])
  })

  it('[FE-W07-S06] 新增會建立 GPU 資源的元件而沒有登記時，變紅', () => {
    const scanned = scanWorld()
    // 模擬「有人加了一個新的場景元件」。**不真的寫檔** —— 見 coverage.ts 的檔頭。
    scanned.set('src/world/NewProp.tsx', true)
    const listed = listedSources(harness())

    const problems = coverageProblems({ scanned, listed, harnessSource: harness() })
    expect(problems).toHaveLength(1)
    // 規格的字面要求：指出是哪一個檔案，以及要加到哪裡
    expect(problems[0]).toContain('src/world/NewProp.tsx')
    expect(problems[0]).toContain('tests/e2e/leak-harness/main.tsx')
  })

  it('[FE-W07-S07] 清單裡列了不存在的檔案時，也要紅', () => {
    const scanned = scanWorld()
    const listed = [...listedSources(harness()), 'src/world/Gone.tsx']

    const problems = coverageProblems({ scanned, listed, harnessSource: harness() })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('src/world/Gone.tsx')
  })

  // ⚠️ **這一條是外部審查指出來的洞，原本沒有擋。**
  // 路徑對得上不代表量測台真的在量它 —— 一個 subject 可以宣告
  // `source: 'src/world/X.tsx'` 卻 render 完全別的東西，
  // 那時候涵蓋率是綠的，而 X 從來沒有被量過。
  it('[FE-W07-S07] 登記了但量測台根本沒有 import 它，也要紅', () => {
    const scanned = scanWorld()
    // 這個檔案真的存在（RemotePlayer 在 src/world/player/ 底下），
    // 所以它躲得過「幽靈項目」那一關 —— 只有 import 檢查擋得住。
    const listed = [...listedSources(harness()), 'src/world/player/RemotePlayer.tsx']

    const problems = coverageProblems({ scanned, listed, harnessSource: harness() })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('沒有 import 它')
    expect(problems[0]).toContain('@/world/player/RemotePlayer')
  })

  // 掃描器自己的行為。這幾條是實測會踩到的形狀 ——
  // 少掉任何一條，規則會退化成只擋得住最天真的那一種寫法。
  it.each([
    ['JSX 的 geometry', '<mesh><boxGeometry args={[1,1,1]} /></mesh>', true],
    ['JSX 的 material', '<meshStandardMaterial color="#fff" />', true],
    ['直接 new', 'const g = new BoxGeometry(1, 1, 1)', true],
    ['帶命名空間的 new', 'const m = new THREE.MeshStandardMaterial()', true],
    ['render target', 'const t = new WebGLRenderTarget(64, 64)', true],
    ['建構子被括號包住', 'const g = new (THREE.BoxGeometry)()', true],
    ['drei 的 hook', 'const map = useTexture("/x.png")', true],
    ['useLoader', 'const gltf = useLoader(GLTFLoader, "/a.glb")', true],
    ['loader 實體', 'const l = new TextureLoader()', true],
    ['primitive', '<primitive object={scene} />', true],
    ['只在單行註解裡提到', '// 這裡本來有一個 <boxGeometry>，FE-W10 移除了\nexport const x = 1', false],
    ['只在區塊註解裡提到', '/* new MeshStandardMaterial() 的所有權見 ADR 0003 */\nexport const x = 1', false],
    ['只是型別 import', "import type { Material } from 'three'", false],
    ['完全無關', 'export const speed = 3', false],
  ])('掃描器：%s', (_name, source, expected) => {
    expect(createsGpuResources(source)).toBe(expected)
  })
})
