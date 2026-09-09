// FE-W07 的涵蓋率檢查。規格 `openspec/specs/world-resources/` 的
// Requirement「會建立 GPU 資源的場景元件必須被偵測涵蓋」。
//
// ⚠️ **這裡是純函式，沒有檔案系統。** 讀檔在 `tests/leak-coverage.test.ts`。
// 分開的理由：涵蓋率規則的兩個方向都要有負向驗證，而負向驗證需要餵它
// **假的輸入**（少一個檔案、多一個幽靈項目）。碰檔案系統的函式做不到這件事，
// 只能靠真的去新增檔案 —— 那樣的測試會在失敗時留下垃圾。

/** 會建立 GPU 資源的 JSX intrinsic：`<boxGeometry>`、`<meshStandardMaterial>`⋯⋯ */
const JSX_INTRINSIC = /<[a-z][A-Za-z0-9]*(Geometry|Material|Texture)\b/
/** 用 `new` 建的：`new BoxGeometry()`、`new THREE.MeshStandardMaterial()`⋯⋯ */
const IMPERATIVE = /\bnew\s+(?:[A-Za-z0-9_$]+\.)?[A-Z][A-Za-z0-9]*(?:Geometry|Material|Texture|RenderTarget)\s*\(/

/**
 * 把註解拿掉。
 *
 * ⚠️ **不拿掉的話這個檢查會被自己的說明文件觸發。** 這個 repo 的註解密度很高，
 * 而「`<boxGeometry>`」這種字串在解釋為什麼要有這條規則的段落裡一定會出現 ——
 * 於是一個完全沒有 GPU 資源的檔案會被要求登記進受測清單，
 * 而**沒有人看得出為什麼**。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 這個模組的原始碼會不會建立 GPU 資源。 */
export function createsGpuResources(source: string): boolean {
  const code = stripComments(source)
  return JSX_INTRINSIC.test(code) || IMPERATIVE.test(code)
}

/**
 * 量測台受測清單裡登記的正式碼路徑。
 *
 * 從 `main.tsx` 的 `source: '…'` 欄位抓。**刻意不維護第二份清單** ——
 * 兩份清單一定會漂，而漂掉的那一份會讓這個檢查對著空氣通過。
 */
export function listedSources(harnessSource: string): string[] {
  return [...harnessSource.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1] as string)
}

export interface CoverageInput {
  /** `src/world/` 底下掃到的：相對於 repo 根的路徑 → 會不會建立 GPU 資源 */
  scanned: ReadonlyMap<string, boolean>
  /** 量測台受測清單裡登記的路徑 */
  listed: readonly string[]
}

/**
 * 涵蓋率的問題清單。空陣列代表沒問題。
 *
 * **兩個方向都擋**（規格 S06／S07）。只擋一邊的話，元件被刪掉或改名之後
 * 清單會留下一個永遠不會被執行的項目，而測試照樣全綠。
 */
export function coverageProblems({ scanned, listed }: CoverageInput): string[] {
  const problems: string[] = []
  const listedSet = new Set(listed)

  for (const [file, creates] of scanned) {
    if (creates && !listedSet.has(file)) {
      problems.push(
        `${file} 會建立 GPU 資源，但沒有登記在 tests/e2e/leak-harness/main.tsx 的 SUBJECTS 裡 ` +
          `—— 洩漏偵測看不到它`,
      )
    }
  }
  for (const file of listed) {
    if (!scanned.has(file)) {
      problems.push(`受測清單裡的 ${file} 在 src/world/ 底下找不到 —— 幽靈項目，永遠不會被執行`)
    }
  }
  return problems
}
