import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type {} from '@react-three/fiber'
import { Box3, Vector3, type Mesh, type Object3D } from 'three'
import type { PartDefinition, PropDefinition } from '@/world/environment/definition'
import { footprintOf } from '@/world/environment/definition'
import * as semantic from '@/world/environment/semantic'
import { PropParts } from '@/world/environment/PropParts'

// 規格：openspec/changes/fe-w10-environment-components/specs/world-environment/spec.md
//   Requirement: 場景元件分成三類 —— FE-W10-S03
//   Requirement: 碰撞尺寸由元件擁有 —— FE-W10-S13（這五個也要落地）

/** 五種語意元件的 definition 建構函式，用**匯出的名字**收集 —— 具名清單會過期。 */
const BUILDERS = Object.entries(semantic).filter(([name]) => name.endsWith('Definition')) as [
  string,
  (arg?: number | boolean) => PropDefinition,
][]

/**
 * 把部件的**材質拿掉**之後留下的形狀指紋。
 *
 * 規格：「語意元件 MUST NOT 只靠顏色互相區分」——
 * 所以比較之前要先把顏色那一維消掉，否則兩個只差在顏色的元件會被判成不同。
 */
function shapeFingerprint(definition: PropDefinition): string {
  return definition.parts
    .map((p: PartDefinition) => `${JSON.stringify(p.geometry)}@${p.position.join(',')}:${p.rotationY ?? 0}`)
    .join('|')
}

async function boundsOf(definition: PropDefinition): Promise<Box3> {
  const renderer = await ReactThreeTestRenderer.create(<PropParts definition={definition} />)
  const scene = renderer.scene.instance as Object3D
  scene.updateMatrixWorld(true)
  return new Box3().setFromObject(scene)
}

describe('語意元件', () => {
  it('[FE-W10-S03] 語意元件彼此分得出來', () => {
    expect(BUILDERS.length, '沒有收集到五個語意元件的 definition —— 命名慣例改了？').toBe(5)
    const prints = new Map<string, string>()
    for (const [name, build] of BUILDERS) {
      prints.set(name, shapeFingerprint(build()))
    }
    // 兩兩比較。**材質已經被拿掉了**，所以只差在顏色的兩個會被抓出來。
    const seen = new Map<string, string>()
    for (const [name, print] of prints) {
      const clash = seen.get(print)
      expect(clash, `${name} 跟 ${clash} 的形狀一模一樣 —— 玩家在 3D 裡分不出誰是誰`).toBeUndefined()
      seen.set(print, name)
    }
  })

  it('[FE-W10-S13] 語意元件的阻擋物都落地', async () => {
    let checked = 0
    for (const [name, build] of BUILDERS) {
      const parts = build().parts.filter((p) => p.blocks === true)
      // `Door` 是明文的例外（`FE-W10-S14`）—— 門是牆上的一個洞。
      if (name === 'doorDefinition') {
        expect(parts.length, '門的部件不該擋路 —— 見 FE-W10-S14').toBe(0)
        continue
      }
      expect(parts.length, `${name} 一個擋路的部件都沒有 —— 它會變成穿得過去的裝飾`)
        .toBeGreaterThan(0)
      checked += 1
      const box = await boundsOf({ parts })
      expect(box.min.y, `${name} 的整組阻擋物懸在空中`).toBeCloseTo(0, 3)
    }
    expect(checked, '一個都沒走到 —— 這條驗證是空的').toBe(4)
  })

  it('公開的 props 今天就有作用', async () => {
    // ⚠️ **型別上存在但被忽略的 props 是「有 API 的外觀」。**
    // 每一個宣告出來的 prop 都要在這裡證明它改變了輸出。
    const cards = (n: number) => semantic.projectBoardDefinition(n).parts.length
    expect(cards(6) - cards(2), 'ProjectBoard 的 items 沒有改變卡片數').toBe(4)

    const badges = (n: number) => semantic.talentBoardDefinition(n).parts.length
    expect(badges(5) - badges(1), 'TalentBoard 的 items 沒有改變徽章數').toBe(4)

    const wide = await boundsOf(semantic.signDefinition(1.4))
    const narrow = await boundsOf(semantic.signDefinition(0.6))
    expect(wide.getSize(new Vector3()).x, 'Sign 的 width 沒有作用')
      .toBeGreaterThan(narrow.getSize(new Vector3()).x + 0.5)

    const tall = await boundsOf(semantic.guildBannerDefinition(3.4))
    const short = await boundsOf(semantic.guildBannerDefinition(2))
    expect(tall.max.y, 'GuildBanner 的 height 沒有作用').toBeGreaterThan(short.max.y + 1)

    // 門開起來之後**深度變大、寬度變小**（門板轉到側面）。
    const shut = (await boundsOf(semantic.doorDefinition(false))).getSize(new Vector3())
    const open = (await boundsOf(semantic.doorDefinition(true))).getSize(new Vector3())
    expect(open.z, 'Door 的 open 沒有作用').toBeGreaterThan(shut.z + 0.5)
  })

  it('[FE-W10-S14] 門走得過去', () => {
    // ⚠️ 碰撞盒是「所有擋路部件的 AABB 聯集」，所以**兩根分開的門柱**
    // 會把中間的門洞實心堵死（實測門寬 1.4、碰撞盒寬 1.58）。
    // 門是牆上的一個洞 —— 阻擋由周圍的牆提供，那是 `FE-W11` 的配置。
    for (const open of [false, true]) {
      const definition = semantic.doorDefinition(open)
      expect(footprintOf(definition), `門有碰撞盒（open=${open}）—— 門洞會被堵死`)
        .toBeUndefined()
      expect(
        definition.parts.filter((p) => p.blocks === true).length,
        `門有擋路的部件（open=${open}）`,
      ).toBe(0)
    }
  })
})

/** 這五個也要吃到目錄層級的兩條掃描（`FE-W10-S08`／`S12`）—— 那在 world-environment-rules 裡。 */
function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = []
  root.traverse((o) => {
    if ((o as Mesh).isMesh) found.push(o as Mesh)
  })
  return found
}

describe('props 的邊界值', () => {
  // codex 在封存前的驗證裡指出的：`items = 0 / 1 / 很多`、極小的尺寸，
  // 至少要確認不會產生 NaN、負尺寸，或讓碰撞與視覺脫鉤。
  it('極端的 items 不會做出壞掉的幾何', async () => {
    for (const items of [0, 1, 12]) {
      for (const build of [semantic.projectBoardDefinition, semantic.talentBoardDefinition]) {
        const definition = build(items)
        const box = await boundsOf(definition)
        const size = box.getSize(new Vector3())
        expect(Number.isFinite(size.x) && Number.isFinite(size.y) && Number.isFinite(size.z)).toBe(true)
        expect(size.x, `items=${items} 做出了零寬度的看板`).toBeGreaterThan(0)
        // 板面本身還在 —— `items = 0` 不該讓整個看板消失。
        expect(size.y).toBeGreaterThan(1)
      }
    }
  })

  it('極小的尺寸不會做出退化的幾何', async () => {
    // `geometryFor` 會把圓角夾到最短邊的 0.49 倍；夾錯的話 bbox 會塌成 0
    // （`FE-W09` 實測過 `(4, 0.2, 4)` r=0.1 的高度是 0）。
    const tiny = await boundsOf(semantic.signDefinition(0.05))
    expect(tiny.getSize(new Vector3()).y, '招牌塌成零高度').toBeGreaterThan(1)
  })
})

describe('語意元件的渲染', () => {
  it('每一個元件都渲染出它 definition 裡的每一個部件', async () => {
    for (const [name, build] of BUILDERS) {
      const definition = build()
      const renderer = await ReactThreeTestRenderer.create(<PropParts definition={definition} />)
      expect(meshes(renderer.scene.instance as Object3D).length, `${name} 少渲染了部件`)
        .toBe(definition.parts.length)
    }
  })
})
