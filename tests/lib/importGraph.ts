import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// 走 `src/` 的靜態 import 圖 —— 給「這個模組的 import 圖不得到達 X」那種判準用（`FE-R11-S05`／`S01`）。
// 用 TypeScript 的 AST，不用 regex：註解與字串裡的 `import` 範例不算、`require()`／`import x = require()`／`import()` 都算。
// **型別 import 不留邊**（`import type … from`、`export type … from`）：編譯後就沒有它，runtime 的依賴圖上不存在；
// `import { type A, b }` 這種混合的算（`b` 是值）。

const ROOT = path.resolve(import.meta.dirname, '../..')

/** 一個檔案裡所有會留下 runtime 邊的 module specifier。 */
export function importSpecifiers(source: string, fileName = 'x.ts'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const literal = (n: ts.Node | undefined): string | null => (n !== undefined && ts.isStringLiteralLike(n) ? n.text : null)
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      if (!(node.importClause?.isTypeOnly ?? false)) {
        const spec = literal(node.moduleSpecifier)
        if (spec !== null) out.push(spec)
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly) {
        const spec = literal(node.moduleSpecifier)
        if (spec !== null) out.push(spec)
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
        const spec = literal(node.moduleReference.expression)
        if (spec !== null) out.push(spec)
      }
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      if (isRequire || isDynamicImport) {
        const spec = literal(node.arguments[0])
        if (spec !== null) out.push(spec)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function resolveFrom(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
  if (base === null) return null // 套件
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** 從 `entry` 出發、遞迴到達的所有 `src/` 檔案（絕對路徑，含 entry 自己）。套件不追。 */
export function importGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of importSpecifiers(readFileSync(file, 'utf8'), file)) {
      const target = resolveFrom(file, spec)
      if (target !== null) queue.push(target)
    }
  }
  return seen
}

/** 拿掉註解之後的原始碼（給「原始碼不得出現某個字」那種掃描用：註解裡提到它不算）。 */
export function stripComments(source: string, fileName = 'x.ts'): string {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const ranges: Array<[number, number]> = []
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, source)
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) ranges.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    token = scanner.scan()
  }
  let out = ''
  let cursor = 0
  for (const [start, end] of ranges) {
    out += source.slice(cursor, start)
    cursor = end
  }
  return out + source.slice(cursor)
}
