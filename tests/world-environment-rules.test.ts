import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createsGpuResources } from './e2e/leak-harness/coverage'
import { createsColliders } from '@/world/environment-scan'

// 規格：openspec/changes/fe-w10-environment-components/specs/world-environment/spec.md
//   Requirement: 場景元件不得自行建立 GPU 資源 —— FE-W10-S08 / S09
//   Requirement: 世界有永久的地面與可見的邊界 —— FE-W10-S12
//
// ⚠️ **`createsGpuResources` 是 FE-W07 的判定，這裡是反向用它。**
// FE-W07 的方向是「會建立資源的模組要登記進洩漏偵測清單」；
// 這裡的方向是「這個目錄底下一個都不准建立」。同一支尺，兩個方向。

const ROOT = path.resolve(import.meta.dirname, '..')
const ENV = path.join(ROOT, 'src/world/environment')

/** 遞迴走整棵子樹。**新增的巢狀檔案要自動納入** —— 具名清單的規避方式
 *  是「開一個新的子目錄」，那等於沒有規則。 */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

const modules = walk(ENV).map((full) => ({
  rel: path.relative(ROOT, full),
  source: fs.readFileSync(full, 'utf8'),
}))

describe('場景元件的來源碼規則', () => {
  it('[FE-W10-S08] 場景元件裡沒有建立 GPU 資源的寫法', () => {
    // **防恆真**：一個檔案都沒掃到的話這條驗證是空的。
    expect(modules.length, '場景元件目錄底下一個模組都沒掃到 —— 路徑錯了').toBeGreaterThan(0)
    const offenders = modules.filter((m) => createsGpuResources(m.source)).map((m) => m.rel)
    expect(offenders, '這些模組自己建立了 GPU 資源，應該改用 geometryFor／materialFor').toEqual([])
  })

  it('[FE-W10-S12] 場景元件不建立碰撞體', () => {
    expect(modules.length).toBeGreaterThan(0)
    const offenders = modules.filter((m) => createsColliders(m.source)).map((m) => m.rel)
    expect(offenders, '這些模組建立了碰撞體 —— 邊界的碰撞體由 addBounds 產生，那裡是單一權威來源').toEqual([])
  })

  it('[FE-W10-S09] 混進自建資源的寫法會被擋下', () => {
    // 四種寫法各一。**沒有這一條的話，上面兩條在掃描器壞掉時仍然是綠的。**
    expect(createsGpuResources('const a = <boxGeometry args={[1,1,1]} />')).toBe(true)
    expect(createsGpuResources('const m = new MeshStandardMaterial({})')).toBe(true)
    expect(createsGpuResources('const t = useTexture("/a.png")')).toBe(true)
    expect(createsGpuResources('const p = <primitive object={obj} />')).toBe(true)
    // 反方向：只用共用 factory 的寫法不該被判成建立資源。
    expect(createsGpuResources('const g = geometryFor({ shape: "Sphere", radius: 1 })')).toBe(false)
  })

  it('建立碰撞體的判定本身量得到東西', () => {
    expect(createsColliders('world.createCollider(desc, body)')).toBe(true)
    expect(createsColliders('rapier.ColliderDesc.cuboid(1, 1, 1)')).toBe(true)
    expect(createsColliders('world.createRigidBody(desc)')).toBe(true)
    // 註解裡提到它不算 —— 這個 repo 的註解密度很高，不拿掉會讓說明文件觸發規則。
    expect(createsColliders('// 這裡不呼叫 createCollider\nconst a = 1')).toBe(false)
    expect(createsColliders('const half = PHYSICS.halfExtent')).toBe(false)
  })
})
