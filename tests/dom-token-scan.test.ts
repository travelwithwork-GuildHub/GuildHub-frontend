import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { domTokenScan } from '@/design/domTokenScan'

// 規格 `FE-X16-S01`：`src/**` 只從 token 取值。判定本身在 `src/design/domTokenScan.ts`（純函式），這裡是讀檔那一半（同 `world-color-scan.test.ts`）。
//
// ⚠️ **豁免的上限寫在這裡**，不在掃描器裡：新增一個 `dom-token-allow:` 就得改這個數字，改了 review 會看到。
// 今天是 0 —— 掃描器自己的樣板用字串拼接避開自己，不吃豁免。
const MAX_EXEMPTIONS = 0

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
/** token 定義檔：DOM 的在 `globals.css`（七類）、3D 的在 `design/world.ts`（`FE-W09`）。只有這兩個可以出現字面值。 */
const TOKEN_FILES = new Set(['src/app/globals.css', 'src/design/world.ts'])
/** 層級標記的定義檔：只有它可以寫 `data-tier` 的物件鍵 —— 而且只能是型別那一行加三個值各一次（下面另一條測試數）；其他類別照抓。 */
const TIER_DEFINITION = 'src/design/controls.ts'
const TIER_KEY = "'data-tier':"

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** 掃描範圍縮水（例如改回只掃 `src/world`）會在這裡紅，而不是靜默放行。 */
const MUST_INCLUDE = ['src/app/globals.css', 'src/design/controls.ts', 'src/panel/PanelShell.tsx', 'src/app/login/LoginForm.tsx', 'src/chat/SceneChatHud.tsx', 'src/world/WorldCanvas.tsx']

describe('src/** 只從 token 取值', () => {
  const files = sourceFiles(SRC).map((f) => relative(ROOT, f))

  it('[FE-X16-S01] 掃描範圍涵蓋整個 src（含 css）', () => {
    for (const name of MUST_INCLUDE) expect(files, `掃描範圍少了 ${name}`).toContain(name)
  })

  it('[FE-X16-S01] token 定義檔以外零違規；豁免帶理由且不超過上限', () => {
    const problems: string[] = []
    let exemptions = 0
    for (const file of files) {
      if (TOKEN_FILES.has(file)) continue
      const scan = domTokenScan(readFileSync(join(ROOT, file), 'utf8'))
      exemptions += scan.exemptions
      for (const v of scan.violations) {
        if (file === TIER_DEFINITION && v.kind === '層級標記' && v.text === TIER_KEY) continue
        problems.push(`${file}:${v.line} ${v.kind}：${v.text}`)
      }
    }
    expect(problems, '字面值或任意值。改用 globals.css 的 token／design/controls 的常數；真的要字面值就在該行加 `dom-token-allow: <理由>` 並調高上限').toEqual([])
    expect(exemptions, `豁免 ${exemptions} 個，超過上限 ${MAX_EXEMPTIONS}`).toBeLessThanOrEqual(MAX_EXEMPTIONS)
  })

  // 三輪審查：純文字計數會被註解與沒用到的假物件騙 —— 改讀 AST：三個 export 各恰一個合法值、標成 `Control`、沒有別的物件帶這個鍵、沒有 computed 鍵。
  it('[FE-X16-S01] 定義檔：只有 PRIMARY／SECONDARY／TERTIARY 三個 export 帶層級標記、各一個值、沒有 computed 鍵', () => {
    const source = readFileSync(join(ROOT, TIER_DEFINITION), 'utf8')
    const marks = domTokenScan(source).violations.filter((v) => v.kind === '層級標記').map((v) => v.text)
    expect(marks).toEqual([TIER_KEY, TIER_KEY, TIER_KEY, TIER_KEY])
    const sf = ts.createSourceFile(TIER_DEFINITION, source, ts.ScriptTarget.Latest, true)
    const owners: Record<string, string[]> = {}
    let computed = 0
    const nameOf = (n: ts.PropertyName) => (ts.isStringLiteral(n) || ts.isIdentifier(n) ? n.text : (computed += 1, '<computed>'))
    const walk = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && nameOf(node.name) === 'data-tier') {
        const decl = node.parent.parent
        const stmt = decl.parent?.parent
        const hasExport = stmt !== undefined && ts.canHaveModifiers(stmt) && (ts.getModifiers(stmt) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        const exported = hasExport && ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.type?.getText() === 'Control' && decl.initializer === node.parent
        const owner = exported ? (decl as ts.VariableDeclaration).name.getText() : `<不是標成 Control 的 export：${node.getText()}>`
        ;(owners[owner] ??= []).push(ts.isStringLiteral(node.initializer) ? node.initializer.text : '<不是字串>')
      }
      ts.forEachChild(node, walk)
    }
    walk(sf)
    expect(owners).toEqual({ PRIMARY: ['primary'], SECONDARY: ['secondary'], TERTIARY: ['tertiary'] })
    expect(computed, '定義檔不准有 computed 鍵').toBe(0)
    const iface = sf.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'Control')
    expect(iface?.members.map((m) => `${m.name?.getText()}:${(m as ts.PropertySignature).type?.getText()}`)).toContain("'data-tier':Tier")
  })

  // 六段假輸入各要被抓 —— 判準不是恆真。每一段單獨餵，抓到的那一條要說得出是哪一類。
  it.each([
    ['background: #fff', '色碼'],
    ['const c = "rgb(0 0 0)"', '顏色函式'],
    ['<div className="rounded-[8px]" />', '任意值'],
    ['font-family: Inter', '字體堆疊'],
    ['<button data-tier="primary" />', '層級標記'],
    ['color: #fff // dom-token-allow:', '沒有理由的豁免'],
    // 審查抓到的繞法：JSX 允許 `=` 前後有空白；Tailwind 的 important 與負值前綴
    ['<button data-tier = "primary" />', '層級標記'],
    ['<div className="!bg-[red] -z-[1] hover:text-[blue]" />', '任意值'],
    ['<button {...{ "data-tier": "primary" }} />', '層級標記'],
    ["createElement('button', { 'data-text': 'caption' })", '層級標記'],
    ["const p = { ['data-tier']: 'primary' }", '層級標記'],
    // 三輪審查：豁免寫在字串裡不算註解，色碼照抓
    ["const color = '#fff', note = 'dom-token-allow: 任意理由'", '色碼'],
    // 四輪審查：字串裡假裝的 `//`；區塊註解的空理由（`*/` 不是理由）
    ["const color = '#fff', note = '// dom-token-allow: 任意理由'", '色碼'],
    ["const color = '#fff' /* dom-token-allow: */", '沒有理由的豁免'],
    // 五輪審查：前面放一個已收掉的區塊註解，標記在後面的字串裡
    ["const color = '#fff' /* 普通註解 */; const note = 'dom-token-allow: 任意理由'", '色碼'],
  ])('[FE-X16-S01] 假輸入被抓：%s', (input, kind) => {
    const scan = domTokenScan(`export const x = 1\n${input}\n`)
    expect(scan.violations.map((v) => v.kind), `沒抓到 ${kind}`).toContain(kind)
    expect(scan.violations[0]?.line).toBe(2)
  })

  it('[FE-X16-S01] 帶理由的豁免不算違規、算一個豁免；理由要在同一行', () => {
    const scan = domTokenScan('const glow = "#ffe9b0" // dom-token-allow: canvas 取樣的對照色，不是畫面上的顏色\n')
    expect(scan.violations).toEqual([])
    expect(scan.exemptions).toBe(1)
    // 沒有違規的行帶豁免註解 → 不算豁免（不然可以先囤一批）
    expect(domTokenScan('const y = 2 // dom-token-allow: 囤的\n').exemptions).toBe(0)
    // css 的區塊註解、以及註解前面有含 `//` 的字串（網址）都要認得
    expect(domTokenScan('  color: #fff; /* dom-token-allow: 印刷用的對照 */\n')).toEqual({ violations: [], exemptions: 1 })
    expect(domTokenScan("const u = 'http://x/#fff' // dom-token-allow: 網址片段\n")).toEqual({ violations: [], exemptions: 1 })
    // 跳脫的反斜線結束字串、收掉的區塊註解之後才是真的行尾註解
    expect(domTokenScan("const s = 'x\\\\'; const c = '#fff' /* 先收掉 */ // dom-token-allow: 真的在註解裡\n")).toEqual({ violations: [], exemptions: 1 })
  })

  it('[FE-X16-S01] 沒有字面值的來源是乾淨的（正向控制）', () => {
    expect(domTokenScan('const cls = "bg-accent text-white rounded-control"\nconst z = 0.5\n')).toEqual({ violations: [], exemptions: 0 })
  })
})
