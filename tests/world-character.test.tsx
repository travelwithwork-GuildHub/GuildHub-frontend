import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { BackSide, Color, type Group, type Material, type Mesh, type Object3D } from 'three'
import { ChibiPlayer } from '@/world/player/ChibiPlayer'
import { avatarLook } from '@/design/avatar'
import { worldColor } from '@/design/world'

// 規格：openspec/changes/fe-w14-pixel-restyle/specs/world-visual-polish/spec.md
//   FE-W14-S06  角色主要部位都有 inverted-hull 描邊＋框臉髮型＋臉部細節
//   FE-W14-S07  avatar 值越界時角色照常渲染
//   FE-W14-S08  seated 為真時大腿往前彎、整體抬到椅面
//
// 用 `@react-three/test-renderer`（照 `remote-players-render.test.tsx` 的理由）：
// 它建的是**真的 three 場景圖**，`mesh.material`／`.geometry`／`group.rotation` 都是真的 three 物件。
// jsdom ＋ mock 掉 R3F 的話，`<mesh>` 會變成 DOM 元素、材質是字串 —— 那測到的是 mock 的形狀，不是這幾條 Scenario。

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

/** 從 ChibiPlayer 的根 group（場景第一個子節點）往下收集所有 mesh 的真 three 物件。 */
function meshesOf(renderer: Renderer): Mesh[] {
  const root = renderer.scene.children[0]!.instance as unknown as Group
  const out: Mesh[] = []
  root.traverse((obj: Object3D) => {
    if ((obj as Mesh).isMesh) out.push(obj as Mesh)
  })
  return out
}

/** three 的 `Color` 會做色彩管理；兩邊都用同一條路（`new Color(hex).getHexString()`）比較才不受影響。 */
const hexOf = (name: Parameters<typeof worldColor>[0]) => new Color(worldColor(name)).getHexString()
const matColor = (m: Mesh) => (m.material as Material & { color: Color }).color.getHexString()
const matSide = (m: Mesh) => (m.material as Material).side

async function renderChibi(props: Parameters<typeof ChibiPlayer>[0] = {}): Promise<Renderer> {
  return ReactThreeTestRenderer.create(<ChibiPlayer {...props} />)
}

/** 場景第一個子節點下、名字為 `name` 的關節 group 的 `rotation.x`。 */
function jointRotX(renderer: Renderer, name: string): number {
  const root = renderer.scene.children[0]!.instance as unknown as Group
  const joint = root.getObjectByName(name)
  if (!joint) throw new Error(`找不到關節 group「${name}」—— CHIBI_PARTS 的名字是契約`)
  return joint.rotation.x
}

/** ChibiPlayer 根 group 的整體高度。 */
function rootY(renderer: Renderer): number {
  return (renderer.scene.children[0]!.instance as unknown as Group).position.y
}

describe('角色像素外觀（描邊、髮型、臉部細節）', () => {
  it('[FE-W14-S06] 頭／軀幹／每一隻肢體都有 BackSide 深色描邊；有框臉髮型與臉部細節', async () => {
    const renderer = await renderChibi({ av: 0 })
    const meshes = meshesOf(renderer)

    // 描邊：只畫背面（`BackSide`）的 mesh。頭＋軀幹＋四隻肢體 = 6。
    const outlines = meshes.filter((m) => matSide(m) === BackSide)
    expect(outlines, '描邊要套在頭、軀幹、每一隻肢體上（共 6 個 BackSide mesh）').toHaveLength(6)
    // 每個描邊都是深色（`ink`）—— 被燈光染色的話就不是恆深的剪影了（用 basic 材質達成，這裡驗顏色）。
    for (const o of outlines) expect(matColor(o)).toBe(hexOf('ink'))

    // 框臉髮型：多於一個髮型部件（頂＋瀏海＋兩側＋後腦）。
    const hairParts = meshes.filter((m) => matColor(m) === hexOf('hair') && matSide(m) !== BackSide)
    expect(hairParts.length, '框臉髮型要多於一塊（不是一塊平板）').toBeGreaterThanOrEqual(2)

    // 臉部細節：腮紅（`blush`）＋眼與嘴（`ink`、非描邊）。
    const blush = meshes.filter((m) => matColor(m) === hexOf('blush'))
    expect(blush.length, '要有腮紅').toBeGreaterThanOrEqual(1)
    const inkDetails = meshes.filter((m) => matColor(m) === hexOf('ink') && matSide(m) !== BackSide)
    expect(inkDetails.length, '眼（兩顆）＋嘴 —— 深色非描邊細節至少 3 個').toBeGreaterThanOrEqual(3)
  })

  it('[FE-W14-S07] av 為 null 或越界時角色照常渲染，body／limb 色由 avatarLook 決定（不取模）', async () => {
    // avatarLook 對 null／越界一律回 DEFAULT_LOOK（不取模，`FE-W19-S07`）——
    // 所以 body 是 av=0 的預設色，不是 `9999 % N` 換出來的某一款。
    const expectedBody = new Color(avatarLook(null).body).getHexString()
    expect(expectedBody).toBe(hexOf('avatarBody'))

    for (const av of [null, 9999, 1.5, 'x'] as unknown[]) {
      const renderer = await renderChibi({ av })
      const meshes = meshesOf(renderer)
      // 描邊、髮型、腮紅不受 av 影響。
      expect(meshes.filter((m) => matSide(m) === BackSide), `av=${String(av)}：描邊仍在`).toHaveLength(6)
      expect(
        meshes.filter((m) => matColor(m) === hexOf('hair') && matSide(m) !== BackSide).length,
        `av=${String(av)}：髮型仍在`,
      ).toBeGreaterThanOrEqual(2)
      // body 是預設款（越界沒有被取模換成別款）。
      const hasDefaultBody = meshes.some((m) => matColor(m) === expectedBody)
      expect(hasDefaultBody, `av=${String(av)}：軀幹色是 avatarLook 的預設款`).toBe(true)
    }
  })

  it('[FE-W14-S08] seated 為真時大腿往前彎、整體抬到椅面；為假時回中性站姿', async () => {
    const sat = await renderChibi({ seated: true })
    // 大腿往前（臉的 +Z 方向）彎一個明顯角度 —— 往前是負角。
    expect(jointRotX(sat, 'leftLeg'), '坐姿：左大腿往前彎').toBeLessThan(-0.5)
    expect(jointRotX(sat, 'rightLeg'), '坐姿：右大腿往前彎').toBeLessThan(-0.5)
    // 整體比站姿高（坐上椅面）。
    expect(rootY(sat), '坐姿：整體抬高').toBeGreaterThan(0)

    const stand = await renderChibi({ seated: false })
    expect(jointRotX(stand, 'leftLeg'), '站姿：左大腿中性').toBe(0)
    expect(jointRotX(stand, 'rightLeg'), '站姿：右大腿中性').toBe(0)
    expect(rootY(stand), '站姿：整體落地').toBe(0)
  })
})
